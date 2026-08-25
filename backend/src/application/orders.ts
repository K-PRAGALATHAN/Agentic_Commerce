import { query, withTransaction } from '../adapters/db/pool.js';
import * as razorpay from '../adapters/razorpay/razorpay.js';
import type { Order } from '../domain/types.js';
import { writeAudit } from './audit.js';
import { writeIntentLedger, writeCheckoutLedger } from './ledger.js';
import { getCart, clearCart } from './cart.js';
import { checkSpendLimit, type LimitCheck } from './guardrail.js';
import { HttpError } from './auth.js';

function mapOrder(r: any): Order {
  return {
    id: r.id,
    userId: r.user_id,
    items: r.items,
    totalPaise: Number(r.total_paise),
    status: r.status,
    razorpayOrderId: r.razorpay_order_id,
    createdAt: r.created_at,
  };
}

export type CheckoutResult =
  | { gated: true; guard: LimitCheck }
  | { gated: false; order: Order; razorpayOrderId: string; guard: LimitCheck };

// Create an order from the user's cart.
// INVARIANTS:
//  1. BOUNDED — the guardrail checks the total against the effective limit FIRST.
//     If over limit (and not explicitly confirmed), we block and route to conversational.
//  2. GATED — an intent-ledger entry is written BEFORE the Razorpay order is created.
export async function checkout(
  userId: string,
  opts: { sessionLimitPaise?: number; confirmOverLimit?: boolean } = {},
): Promise<CheckoutResult> {
  const cart = await getCart(userId);
  if (!cart.items.length) throw new HttpError(400, 'cart is empty');

  // 1. BOUNDED — guardrail before anything.
  const guard = await checkSpendLimit(userId, cart.totalPaise, opts.sessionLimitPaise);
  if (!guard.allowed && !opts.confirmOverLimit) {
    await writeAudit({
      actor: 'system',
      action: 'guardrail_block',
      target: userId,
      amountPaise: cart.totalPaise,
      reason: `blocked: ${guard.reason} — routed to conversational confirmation`,
      verified: false,
    });
    return { gated: true, guard };
  }

  // 2. GATED — write intent (with the limit snapshot) to the hash-chained ledger first.
  await writeIntentLedger(
    userId,
    { intent: 'buy', items: cart.items, total_paise: cart.totalPaise, over_limit_confirmed: !!opts.confirmOverLimit },
    guard,
  );

  const rzp = await razorpay.createOrder(cart.totalPaise, `rcpt_${Date.now()}`);

  const order = await withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO orders(user_id, total_paise, status, razorpay_order_id, items)
       VALUES ($1,$2,'created',$3,$4) RETURNING *`,
      [userId, cart.totalPaise, rzp.id, JSON.stringify(cart.items)],
    );
    return ins.rows[0];
  });

  // Checkout ledger (Cart Mandate): records the checkout step for this order.
  await writeCheckoutLedger(userId, { event: 'checkout', order_id: order.id, total_paise: cart.totalPaise, razorpay_order_id: rzp.id });

  await writeAudit({
    actor: 'user',
    action: 'create_order',
    target: order.id,
    amountPaise: cart.totalPaise,
    reason: `checkout of ${cart.items.length} item(s) — ${guard.reason}`,
    verified: false,
  });

  return { gated: false, order: mapOrder(order), razorpayOrderId: rzp.id, guard };
}

// Confirm a payment. Verifies the signature SERVER-SIDE before marking paid.
export async function confirmPayment(
  userId: string,
  orderId: string,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): Promise<{ verified: boolean; order: Order }> {
  const verified = razorpay.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature);

  const order = await withTransaction(async (client) => {
    const status = verified ? 'paid' : 'failed';
    const upd = await client.query(
      `UPDATE orders SET status=$1 WHERE id=$2 AND user_id=$3 RETURNING *`,
      [status, orderId, userId],
    );
    if (!upd.rowCount) throw new HttpError(404, 'order not found');
    await client.query(
      `INSERT INTO payments(order_id, razorpay_payment_id, status, verified, amount_paise)
       VALUES ($1,$2,$3,$4,$5)`,
      [orderId, razorpayPaymentId, verified ? 'captured' : 'failed', verified, upd.rows[0].total_paise],
    );
    return upd.rows[0];
  });

  await writeAudit({
    actor: 'system',
    action: verified ? 'payment_captured' : 'payment_failed',
    target: orderId,
    amountPaise: Number(order.total_paise),
    reason: verified ? 'signature verified server-side' : 'signature verification FAILED — graceful decline',
    verified,
  });

  if (verified) await clearCart(userId);
  return { verified, order: mapOrder(order) };
}

export async function listOrders(userId: string): Promise<Order[]> {
  const { rows } = await query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
  return rows.map(mapOrder);
}
