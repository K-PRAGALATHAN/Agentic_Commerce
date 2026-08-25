import { Router } from 'express';
import { z } from 'zod';
import { checkout, confirmPayment, listOrders } from '../../../application/orders.js';
import { config } from '../../../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// Per-route auth (routers share the '/' mount; router-level middleware would leak).
export const ordersRouter = Router();

ordersRouter.post(
  '/orders/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { order, razorpayOrderId } = await checkout(req.user!.sub, { source: 'web' });
    // key_id is public and needed by the frontend Razorpay widget; key_secret never leaves the server.
    res.json({ order, razorpayOrderId, razorpayKeyId: config.razorpay.keyId });
  }),
);

ordersRouter.post(
  '/orders/:id/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        razorpay_order_id: z.string(),
        razorpay_payment_id: z.string(),
        razorpay_signature: z.string(),
      })
      .parse(req.body);
    const result = await confirmPayment(
      req.user!.sub,
      req.params.id,
      body.razorpay_order_id,
      body.razorpay_payment_id,
      body.razorpay_signature,
    );
    // A failed verification is a graceful, expected outcome — not an HTTP error.
    res.json(result);
  }),
);

ordersRouter.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ orders: await listOrders(req.user!.sub) });
  }),
);
