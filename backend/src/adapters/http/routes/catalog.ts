import { Router } from 'express';
import { getCatalog, getProduct } from '../../../application/catalog.js';
import { listWiki } from '../../../application/wiki.js';
import { listCollections } from '../../../application/collections.js';
import { personalisedRows, recordView } from '../../../application/storefront.js';
import { requireAuth } from '../middleware/auth.js';
import { clusters } from '../../../application/kg.js';
import { listStores, getStore } from '../../../application/merchants.js';
import { asyncHandler } from '../middleware/errors.js';

export const catalogRouter = Router();

// Public shared knowledge (agent consistency) + product clusters.
catalogRouter.get('/wiki', asyncHandler(async (_req, res) => res.json({ wiki: await listWiki() })));
// The storefront, organised around this customer's own activity.
catalogRouter.get(
  '/storefront',
  requireAuth,
  asyncHandler(async (req, res) => res.json({ rows: await personalisedRows(req.user!.sub) })),
);

// Fire-and-forget from the product page; feeds the "Continue browsing" row.
catalogRouter.post(
  '/catalog/:id/view',
  requireAuth,
  asyncHandler(async (req, res) => {
    await recordView(req.user!.sub, req.params.id);
    res.json({ ok: true });
  }),
);

// Who sells here. Public on purpose: a customer should be able to look a shop
// up before buying from it, and the assistant reads the same endpoint.
catalogRouter.get('/stores', asyncHandler(async (_req, res) => res.json({ stores: await listStores() })));
catalogRouter.get(
  '/stores/:slug',
  asyncHandler(async (req, res) => {
    const store = await getStore(req.params.slug);
    const products = await getCatalog({ merchantId: store.merchantId, limit: 200 });
    res.json({ store, products });
  }),
);

catalogRouter.get('/collections', asyncHandler(async (_req, res) => res.json({ collections: await listCollections() })));
catalogRouter.get('/kg/clusters', asyncHandler(async (_req, res) => res.json({ clusters: await clusters() })));

// ACP-style agent-readable catalog feed: a clean, machine-consumable product feed
// an AI buyer can read (Agentic Commerce Protocol shape). See PROTOCOLS.md.
catalogRouter.get(
  '/acp/catalog',
  asyncHandler(async (req, res) => {
    const products = await getCatalog({ limit: req.query.limit ? Number(req.query.limit) : 100 });
    res.json({
      protocol: 'acp',
      version: '0.1',
      currency: 'INR',
      items: products.map((p) => ({
        id: p.id,
        title: p.name,
        description: p.description,
        price: { amount_paise: p.pricePaise, display: `₹${(p.pricePaise / 100).toFixed(2)}` },
        availability: p.stock > 0 ? 'in_stock' : 'out_of_stock',
        category: p.category,
        rating: p.rating,
      })),
    });
  }),
);

// Public read — the single catalog read path.
catalogRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const catsParam = req.query.categories as string | undefined;
    const products = await getCatalog({
      q: req.query.q as string | undefined,
      name: req.query.name as string | undefined,
      category: req.query.category as string | undefined,
      collectionId: req.query.collectionId as string | undefined,
      categories: catsParam ? catsParam.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
      maxPaise: req.query.maxPaise ? Number(req.query.maxPaise) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ products });
  }),
);

catalogRouter.get(
  '/catalog/:id',
  asyncHandler(async (req, res) => {
    res.json({ product: await getProduct(req.params.id) });
  }),
);
