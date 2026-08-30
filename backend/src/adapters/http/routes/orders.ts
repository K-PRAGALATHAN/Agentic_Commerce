import { Router } from 'express';
import { z } from 'zod';
import { checkout, confirmPayment, listOrders, recordPaymentFailure } from '../../../application/orders.js';
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
    const { sessionLimitPaise, confirmOverLimit, discountCode, cartId } = z
      .object({
        sessionLimitPaise: z.number().int().positive().optional(),
        confirmOverLimit: z.boolean().optional(),
        discountCode: z.string().max(40).optional(),
        cartId: z.string().uuid().optional(),
      })
      .parse(req.body ?? {});
    const result = await checkout(req.user!.sub, { sessionLimitPaise, confirmOverLimit, discountCode, cartId });
    if (result.gated) {
      // BOUNDED: over-limit — no order, no money. Frontend/agent routes to confirmation.
      res.json({ gated: true, guard: result.guard, discount: result.discount ?? null });
      return;
    }
    // key_id is public and needed by the frontend Razorpay widget; key_secret never leaves the server.
    res.json({ gated: false, order: result.order, razorpayOrderId: result.razorpayOrderId, guard: result.guard, discount: result.discount ?? null, razorpayKeyId: config.razorpay.keyId });
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

// The client reports a decline / cancellation so it lands in the audit trail.
// The order is marked failed and the cart is left intact for a retry.
ordersRouter.post(
  '/orders/:id/payment-failed',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { reason, paymentId } = z
      .object({ reason: z.string().max(300).optional(), paymentId: z.string().optional() })
      .parse(req.body ?? {});
    res.json(await recordPaymentFailure(req.user!.sub, req.params.id, reason ?? 'declined', paymentId));
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
