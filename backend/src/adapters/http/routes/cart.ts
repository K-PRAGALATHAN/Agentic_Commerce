import { Router } from 'express';
import { z } from 'zod';
import { getCart, addItem, removeItem, listCarts, createCart, renameCart, deleteCart, moveItem } from '../../../application/cart.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// NOTE: middleware is applied PER-ROUTE (not via router.use), because every router
// here is mounted at '/', and router-level middleware would leak to later routers.
export const cartRouter = Router();

// All carts, with counts and totals. The universal one sorts first.
cartRouter.get(
  '/carts',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ carts: await listCarts(req.user!.sub) });
  }),
);

cartRouter.post(
  '/carts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1).max(60) }).parse(req.body);
    res.status(201).json({ cart: await createCart(req.user!.sub, name) });
  }),
);

cartRouter.put(
  '/carts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name } = z.object({ name: z.string().min(1).max(60) }).parse(req.body);
    await renameCart(req.user!.sub, req.params.id, name);
    res.json({ ok: true });
  }),
);

cartRouter.delete(
  '/carts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    await deleteCart(req.user!.sub, req.params.id);
    res.status(204).end();
  }),
);

// Omitting cartId means the universal cart, so older callers are unchanged.
cartRouter.get(
  '/cart',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ cart: await getCart(req.user!.sub, req.query.cartId as string | undefined) });
  }),
);

cartRouter.post(
  '/cart/move',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { variantId, fromCartId, toCartId } = z.object({
      variantId: z.string().uuid(),
      fromCartId: z.string().uuid().optional(),
      toCartId: z.string().uuid(),
    }).parse(req.body);
    res.json({ cart: await moveItem(req.user!.sub, variantId, fromCartId, toCartId) });
  }),
);

// Accepts either a variantId (precise) or a productId (uses the default
// variant), so existing callers keep working unchanged.
cartRouter.post(
  '/cart/items',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { productId, variantId, cartId, qty } = z
      .object({
        productId: z.string().uuid().optional(),
        variantId: z.string().uuid().optional(),
        cartId: z.string().uuid().optional(),
        qty: z.number().int().positive().default(1),
      })
      .refine((b) => b.productId || b.variantId, { message: 'productId or variantId is required' })
      .parse(req.body);
    res.json({ cart: await addItem(req.user!.sub, { productId, variantId, cartId }, qty) });
  }),
);

cartRouter.delete(
  '/cart/items/:variantId',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ cart: await removeItem(req.user!.sub, req.params.variantId, req.query.cartId as string | undefined) });
  }),
);
