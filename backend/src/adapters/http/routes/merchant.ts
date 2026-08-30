import { Router } from 'express';
import { myStore, upsertStore } from '../../../application/merchants.js';
import { z } from 'zod';
import { createProduct, updateProduct, deleteProduct, listOwnProducts, listInventory, adjustInventory } from '../../../application/catalog.js';
import { listRefundRequests, approveRefund, rejectRefund } from '../../../application/refunds.js';
import { listMerchantOrders } from '../../../application/orders.js';
import { listCollections, upsertCollection, deleteCollection, collectionProductIds } from '../../../application/collections.js';
import { listCustomers, listSegments } from '../../../application/customers.js';
import { summary, salesOverTime, topProducts, lowStock } from '../../../application/analytics.js';
import { listDiscounts, createDiscount, deleteDiscount, toggleDiscount } from '../../../application/discounts.js';
import { getLinkedAccount, linkAccount, payoutBalance } from '../../../application/payouts.js';
import { getCatalog } from '../../../application/catalog.js';
import { config } from '../../../config/env.js';
import { me } from '../../../application/auth.js';
import { summarizeModelCost } from '../../../application/modelCost.js';
import { upsertWiki, deleteWiki } from '../../../application/wiki.js';
import { materializeKG } from '../../../application/kg.js';
import { writeAudit } from '../../../application/audit.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { HttpError } from '../../../application/auth.js';

// Merchant admin CRUD. Each route gated by auth + the 'merchant' role.
// (Applied per-route: routers share the '/' mount, so router.use would leak the
//  role check onto every router registered after this one.)
export const merchantRouter = Router();

const merchantOnly = [requireAuth, requireRole('merchant', 'admin')] as const;

// The merchant's own shopfront. This is the name customers see on every card
// they sell, so it is edited here rather than buried in settings.
merchantRouter.get('/merchant/store', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ store: await myStore(req.user!.sub) });
}));
merchantRouter.put('/merchant/store', ...merchantOnly, asyncHandler(async (req, res) => {
  await upsertStore(req.user!.sub, req.body ?? {});
  res.json({ store: await myStore(req.user!.sub) });
}));


const variantInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  optionValues: z.record(z.string()).optional(),
  priceRupees: z.number().nonnegative(),
  compareAtRupees: z.number().nonnegative().nullable().optional(),
  sku: z.string().max(60).optional(),
  barcode: z.string().max(60).optional(),
  stock: z.number().int().nonnegative(),
  weightGrams: z.number().int().nonnegative().optional(),
  imageUrl: z.string().optional(),
});

// A product is either simple (priceRupees + stock) or has an explicit variant
// list. Exactly one of those must be present, so a half-filled form is rejected
// at the boundary rather than producing a product nobody can buy.
const productInput = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    status: z.enum(['active', 'draft']).optional(),
    productType: z.string().max(80).optional(),
    vendor: z.string().max(80).optional(),
    tags: z.array(z.string().max(40)).max(30).optional(),
    costRupees: z.number().nonnegative().nullable().optional(),
    trackInventory: z.boolean().optional(),
    sellWhenOutOfStock: z.boolean().optional(),
    physical: z.boolean().optional(),
    weightGrams: z.number().int().nonnegative().optional(),
    countryOfOrigin: z.string().max(60).optional(),
    hsCode: z.string().max(20).optional(),
    seoTitle: z.string().max(120).optional(),
    seoDescription: z.string().max(320).optional(),
    options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).max(3).optional(),
    images: z.array(z.string()).max(10).optional(),
    variants: z.array(variantInput).min(1).max(50).optional(),
    // simple single-variant shape
    priceRupees: z.number().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
    image: z.string().optional(),
  })
  .refine((b) => b.variants?.length || (b.priceRupees !== undefined && b.stock !== undefined), {
    message: 'provide variants, or priceRupees and stock',
  });

merchantRouter.get(
  '/merchant/products',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    res.json({ products: await listOwnProducts(req.user!.sub) });
  }),
);

merchantRouter.post(
  '/merchant/products',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    const product = await createProduct(req.user!.sub, productInput.parse(req.body));
    await writeAudit({ actor: 'merchant', action: 'create_product', target: product.id, reason: `added "${product.name}"` });
    res.status(201).json({ product });
  }),
);

merchantRouter.put(
  '/merchant/products/:id',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    const product = await updateProduct(req.user!.sub, req.params.id, productInput.parse(req.body));
    await writeAudit({ actor: 'merchant', action: 'update_product', target: product.id, reason: `edited "${product.name}"` });
    res.json({ product });
  }),
);

merchantRouter.delete(
  '/merchant/products/:id',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    await deleteProduct(req.user!.sub, req.params.id);
    await writeAudit({ actor: 'merchant', action: 'delete_product', target: req.params.id, reason: 'removed product' });
    res.status(204).end();
  }),
);

// Sales — orders containing THIS merchant's products, scoped to their own
// line items and subtotal. Not the same as GET /orders, which is "what I bought".
merchantRouter.get(
  '/merchant/orders',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    res.json({ orders: await listMerchantOrders(req.user!.sub) });
  }),
);

// --- Description autofill -------------------------------------------------
// Gathers the house style from the merchant's OWN catalogue, then asks the agent
// service to draft copy. Explicitly opt-in: this returns a suggestion and writes
// nothing, because auto-editing a live listing is not the tool's call to make.
merchantRouter.post(
  '/merchant/draft-description',
  ...merchantOnly,
  rateLimit({ windowMs: 60_000, max: 20 }),
  asyncHandler(async (req, res) => {
    const input = z.object({
      name: z.string().min(1).max(200),
      category: z.string().max(80).optional(),
      vendor: z.string().max(80).optional(),
      tags: z.array(z.string()).max(20).optional(),
    }).parse(req.body);

    // Nearest neighbours in the same category — the house-style examples.
    const similar = (await getCatalog({ category: input.category, limit: 6 }))
      .filter((p) => p.description && p.name !== input.name)
      .slice(0, 4)
      .map((p) => ({ name: p.name, category: p.category, description: p.description }));

    const r = await fetch(`${config.agent.url}/draft-description`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: req.headers.authorization ?? '' },
      body: JSON.stringify({ ...input, tags: input.tags ?? [], similar }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status === 503 ? 503 : 502, (body as any).detail ?? 'could not draft a description');
    res.json(body);
  }),
);

// --- Payouts (Razorpay Route, with a ledger fallback) ---
merchantRouter.get('/merchant/payouts', ...merchantOnly, asyncHandler(async (req, res) => {
  const [account, balance] = await Promise.all([
    getLinkedAccount(req.user!.sub),
    payoutBalance(req.user!.sub),
  ]);
  res.json({ account, balance });
}));

merchantRouter.post('/merchant/payouts/link', ...merchantOnly, asyncHandler(async (req, res) => {
  const { businessName } = z.object({ businessName: z.string().min(2).max(120) }).parse(req.body);
  const user = await me(req.user!.sub);
  res.json({ account: await linkAccount(req.user!.sub, user.email, businessName) });
}));

// --- Collections ---
merchantRouter.get('/merchant/collections', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ collections: await listCollections(req.user!.sub) });
}));

merchantRouter.get('/merchant/collections/:id/products', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ productIds: await collectionProductIds(req.params.id) });
}));

const collectionInput = z.object({
  title: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  image: z.string().optional(),
  productIds: z.array(z.string().uuid()).max(500).optional(),
});

merchantRouter.post('/merchant/collections', ...merchantOnly, asyncHandler(async (req, res) => {
  res.status(201).json({ collection: await upsertCollection(req.user!.sub, collectionInput.parse(req.body)) });
}));

merchantRouter.put('/merchant/collections/:id', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ collection: await upsertCollection(req.user!.sub, collectionInput.parse(req.body), req.params.id) });
}));

merchantRouter.delete('/merchant/collections/:id', ...merchantOnly, asyncHandler(async (req, res) => {
  await deleteCollection(req.user!.sub, req.params.id);
  res.status(204).end();
}));

// --- Customers + segments (derived from orders, no new tracking) ---
merchantRouter.get('/merchant/customers', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ customers: await listCustomers(req.user!.sub, req.query.segment as string | undefined) });
}));

merchantRouter.get('/merchant/segments', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ segments: await listSegments(req.user!.sub) });
}));

// --- Analytics ---
merchantRouter.get('/merchant/analytics', ...merchantOnly, asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days ?? 30) || 30, 365);
  const [s, series, top, low] = await Promise.all([
    summary(req.user!.sub, days),
    salesOverTime(req.user!.sub, days),
    topProducts(req.user!.sub),
    lowStock(req.user!.sub),
  ]);
  res.json({ summary: s, salesOverTime: series, topProducts: top, lowStock: low, days });
}));

// --- Discounts ---
merchantRouter.get('/merchant/discounts', ...merchantOnly, asyncHandler(async (req, res) => {
  res.json({ discounts: await listDiscounts(req.user!.sub) });
}));

merchantRouter.post('/merchant/discounts', ...merchantOnly, asyncHandler(async (req, res) => {
  const input = z.object({
    code: z.string().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, 'letters, digits, - and _ only'),
    kind: z.enum(['percent', 'fixed']),
    value: z.number().positive(),
    active: z.boolean().optional(),
    automatic: z.boolean().optional(),
    minOrderRupees: z.number().nonnegative().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
  }).refine((d) => d.kind !== 'percent' || d.value <= 100, { message: 'a percent discount cannot exceed 100' })
    .parse(req.body);
  const discount = await createDiscount(req.user!.sub, input);
  await writeAudit({ actor: 'merchant', action: 'create_discount', target: discount.id, reason: `created ${discount.code}` });
  res.status(201).json({ discount });
}));

merchantRouter.post('/merchant/discounts/:id/toggle', ...merchantOnly, asyncHandler(async (req, res) => {
  const { active } = z.object({ active: z.boolean() }).parse(req.body);
  await toggleDiscount(req.user!.sub, req.params.id, active);
  res.json({ ok: true });
}));

merchantRouter.delete('/merchant/discounts/:id', ...merchantOnly, asyncHandler(async (req, res) => {
  await deleteDiscount(req.user!.sub, req.params.id);
  res.status(204).end();
}));

// --- Inventory (flat variant list) ---
merchantRouter.get(
  '/merchant/inventory',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    res.json({ inventory: await listInventory(req.user!.sub) });
  }),
);

merchantRouter.post(
  '/merchant/inventory/:variantId',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    const { stock } = z.object({ stock: z.number().int().nonnegative() }).parse(req.body);
    await adjustInventory(req.user!.sub, req.params.variantId, stock);
    res.json({ ok: true });
  }),
);

// --- Refund approval (the GATE for money-out) ---
merchantRouter.get(
  '/merchant/refunds',
  ...merchantOnly,
  asyncHandler(async (_req, res) => {
    res.json({ requests: await listRefundRequests('pending') });
  }),
);

merchantRouter.post(
  '/merchant/refunds/:id/approve',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    res.json(await approveRefund(req.user!.sub, req.params.id));
  }),
);

merchantRouter.post(
  '/merchant/refunds/:id/reject',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    res.json(await rejectRefund(req.user!.sub, req.params.id));
  }),
);

// Merchant LLM-cost summary.
merchantRouter.get(
  '/merchant/model-cost',
  ...merchantOnly,
  asyncHandler(async (_req, res) => {
    res.json(await summarizeModelCost());
  }),
);

// Rebuild the knowledge graph from order history (BOUGHT_WITH edges).
merchantRouter.post(
  '/admin/materialize-kg',
  ...merchantOnly,
  asyncHandler(async (_req, res) => {
    res.json(await materializeKG());
  }),
);

// --- Documentation wiki (agent-consistency knowledge) ---
// Keys are URL path segments AND end up in the agent's prompt, so constrain them.
const wikiKey = z.string().regex(/^[a-z0-9-]{1,40}$/, 'key must be lowercase letters, digits or hyphens');

// Create or edit an entry. NOTE: this content is injected verbatim into the
// agent's system prompt (agent.py::_general), so it is merchant-authored text
// reaching the model — treat it as data, never as instructions.
merchantRouter.put(
  '/merchant/wiki/:key',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    const key = wikiKey.parse(req.params.key);
    const { title, content } = z.object({ title: z.string().min(1), content: z.string().min(1) }).parse(req.body);
    await upsertWiki(key, title, content);
    await writeAudit({ actor: 'merchant', action: 'update_wiki', target: key, reason: `edited wiki entry "${title}"` });
    res.json({ ok: true });
  }),
);

merchantRouter.delete(
  '/merchant/wiki/:key',
  ...merchantOnly,
  asyncHandler(async (req, res) => {
    const key = wikiKey.parse(req.params.key);
    await deleteWiki(key);
    await writeAudit({ actor: 'merchant', action: 'delete_wiki', target: key, reason: 'removed wiki entry' });
    res.json({ ok: true });
  }),
);
