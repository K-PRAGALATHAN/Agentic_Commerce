import { Router } from 'express';
import { z } from 'zod';
import { getCart, addItem, removeItem } from '../../../application/cart.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// NOTE: middleware is applied PER-ROUTE (not via router.use), because every router
// here is mounted at '/', and router-level middleware would leak to later routers.
export const cartRouter = Router();

cartRouter.get(
  '/cart',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ cart: await getCart(req.user!.sub) });
  }),
);

cartRouter.post(
  '/cart/items',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { productId, qty } = z
      .object({ productId: z.string().uuid(), qty: z.number().int().positive().default(1) })
      .parse(req.body);
    res.json({ cart: await addItem(req.user!.sub, productId, qty) });
  }),
);

cartRouter.delete(
  '/cart/items/:productId',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ cart: await removeItem(req.user!.sub, req.params.productId) });
  }),
);
