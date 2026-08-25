import { Router } from 'express';
import { getCatalog, getProduct, syncCatalog } from '../../../application/catalog.js';
import { listWiki } from '../../../application/wiki.js';
import { clusters } from '../../../application/kg.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

export const catalogRouter = Router();

// Public shared knowledge (agent consistency) + product clusters.
catalogRouter.get('/wiki', asyncHandler(async (_req, res) => res.json({ wiki: await listWiki() })));
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
