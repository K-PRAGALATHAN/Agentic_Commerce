import { Router } from 'express';
import { z } from 'zod';
import { createProduct, updateProduct, deleteProduct, listOwnProducts } from '../../../application/catalog.js';
import { writeAudit } from '../../../application/audit.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// Door 2 — merchant admin CRUD. Each route gated by auth + the 'merchant' role.
// (Applied per-route: routers share the '/' mount, so router.use would leak the
//  role check onto every router registered after this one.)
export const merchantRouter = Router();
const merchantOnly = [requireAuth, requireRole('merchant', 'admin')] as const;

const productInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceRupees: z.number().nonnegative(),
  stock: z.number().int().nonnegative(),
  category: z.string().optional(),
  image: z.string().optional(),
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
