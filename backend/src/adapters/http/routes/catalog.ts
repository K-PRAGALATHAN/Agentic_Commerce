import { Router } from 'express';
import { getCatalog, getProduct, syncCatalog } from '../../../application/catalog.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

export const catalogRouter = Router();

// Public read — the single catalog read path (Door 1 + Door 2 products both appear here).
catalogRouter.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const products = await getCatalog({
      q: req.query.q as string | undefined,
      category: req.query.category as string | undefined,
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

// Door 1 — trigger the internet-fetch seed. Restricted to merchant/admin.
catalogRouter.post(
  '/admin/sync-catalog',
  requireAuth,
  requireRole('merchant', 'admin'),
  asyncHandler(async (_req, res) => {
    res.json(await syncCatalog());
  }),
);
