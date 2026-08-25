import { Router } from 'express';
import { z } from 'zod';
import { checkout, confirmPayment, listOrders } from '../../../application/orders.js';
import { requestRefund } from '../../../application/refunds.js';
import { config } from '../../../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// Per-route auth (routers share the '/' mount; router-level middleware would leak).
export const ordersRouter = Router();

ordersRouter.post(
  '/orders/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionLimitPaise, confirmOverLimit } = z
      .object({ sessionLimitPaise: z.number().int().positive().optional(), confirmOverLimit: z.boolean().optional() })
      .parse(req.body ?? {});
    const result = await checkout(req.user!.sub, { sessionLimitPaise, confirmOverLimit });
    if (result.gated) {
      // BOUNDED: over-limit — no order, no money. Frontend/agent routes to confirmation.
      res.json({ gated: true, guard: result.guard });
      return;
    }
    // key_id is public and needed by the frontend Razorpay widget; key_secret never leaves the server.
    res.json({ gated: false, order: result.order, razorpayOrderId: result.razorpayOrderId, guard: result.guard, razorpayKeyId: config.razorpay.keyId });
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

// Customer REQUESTS a refund (money-out is gated → needs merchant approval).
ordersRouter.post(
  '/orders/:id/refund/request',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const request = await requestRefund(req.user!.sub, req.params.id, reason ?? '');
    res.status(201).json({ request });
  }),
);
