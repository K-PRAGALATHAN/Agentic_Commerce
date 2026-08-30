import { query, withTransaction } from '../adapters/db/pool.js';
import * as razorpay from '../adapters/razorpay/razorpay.js';
import type { CartItem, Order, OrderStatus } from '../domain/types.js';
import type { Paise } from '../domain/money.js';
import { writeAudit } from './audit.js';
import { writeIntentLedger, writeCheckoutLedger } from './ledger.js';
import { getCart, clearCart } from './cart.js';
import { checkSpendLimit, type LimitCheck } from './guardrail.js';
import { resolveDiscount, recordDiscountUse, type AppliedDiscount } from './discounts.js';
import { HttpError } from './auth.js';
import { settleOrder } from './payouts.js';

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
  | { gated: true; guard: LimitCheck; discount?: AppliedDiscount | null }
  | { gated: false; order: Order; razorpayOrderId: string; guard: LimitCheck; discount?: AppliedDiscount | null };

// Create an order from the user's cart.
// INVARIANTS:
//  1. BOUNDED — the guardrail checks the total against the effective limit FIRST.
//     If over limit (and not explicitly confirmed), we block and route to conversational.
//  2. GATED — an intent-ledger entry is written BEFORE the Razorpay order is created.
export async function checkout(
  userId: string,
  opts: { sessionLimitPaise?: number; confirmOverLimit?: boolean; discountCode?: string; cartId?: string } = {},
): Promise<CheckoutResult> {
  // One cart is bought at a time; the customer's other carts are untouched.
  const cart = await getCart(userId, opts.cartId);
  if (!cart.items.length) throw new HttpError(400, 'cart is empty');

  // 0. Discount FIRST, so the guardrail below judges the amount actually charged.
  //    Checking the limit against the pre-discount total would block purchases
  //    the customer can in fact afford.
  const subtotalPaise = cart.totalPaise;
  const discount = await resolveDiscount(subtotalPaise, opts.discountCode);
  const totalPaise = subtotalPaise - (discount?.amountPaise ?? 0);

  // 1. BOUNDED — guardrail before anything.
  const guard = await checkSpendLimit(userId, totalPaise, opts.sessionLimitPaise);
  if (!guard.allowed && !opts.confirmOverLimit) {
    await writeAudit({
      actor: 'system',
      action: 'guardrail_block',
      target: userId,
      amountPaise: totalPaise,
      reason: `blocked: ${guard.reason} — routed to conversational confirmation`,
      verified: false,
    });
    return { gated: true, guard, discount };
  }

  // 2. GATED — write intent (with the limit snapshot) to the hash-chained ledger first.
  await writeIntentLedger(
    userId,
    {
      intent: 'buy',
      items: cart.items,
      subtotal_paise: subtotalPaise,
      discount_paise: discount?.amountPaise ?? 0,
      total_paise: totalPaise,
      over_limit_confirmed: !!opts.confirmOverLimit,
    },
    guard,
  );

  const rzp = await razorpay.createOrder(totalPaise, `rcpt_${Date.now()}`);

  const order = await withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO orders(user_id, total_paise, status, razorpay_order_id, items,
                          discount_id, discount_paise, subtotal_paise, cart_id)
       VALUES ($1,$2,'created',$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, totalPaise, rzp.id, JSON.stringify(cart.items),
       discount?.discount.id ?? null, discount?.amountPaise ?? 0, subtotalPaise, cart.id],
    );
    return ins.rows[0];
  });
  if (discount) await recordDiscountUse(discount.discount.id);

  // Checkout ledger (Cart Mandate): records the checkout step for this order.
  await writeCheckoutLedger(userId, {
    event: 'checkout', order_id: order.id, total_paise: totalPaise,
    discount_paise: discount?.amountPaise ?? 0, razorpay_order_id: rzp.id,
  });

  await writeAudit({
    actor: 'user',
    action: 'create_order',
    target: order.id,
    amountPaise: totalPaise,
    reason: `checkout of ${cart.items.length} item(s)${discount ? ` — ${discount.reason}` : ''} — ${guard.reason}`,
    verified: false,
  });

  return { gated: false, order: mapOrder(order), razorpayOrderId: rzp.id, guard, discount };
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

  if (verified) {
    await clearCart(userId, order.cart_id ?? undefined);
    // Split the captured payment to the merchants who own the goods. Never let a
    // payout problem fail a payment the customer already made — the money is in,
    // and settlement is reconcilable afterwards from the transfers table.
    try {
      await settleOrder(orderId, razorpayPaymentId);
    } catch (err) {
      console.error('settlement failed for order', orderId, err);
    }
  }
  return { verified, order: mapOrder(order) };
}

// A payment that never reached us (declined card, closed modal) is still a money
// EVENT and belongs in the audit trail — otherwise the graceful failure is only a
// toast the user sees once. The cart is deliberately NOT cleared: keeping it is
// what makes the failure recoverable.
export async function recordPaymentFailure(
  userId: string,
  orderId: string,
  reason: string,
  razorpayPaymentId?: string,
): Promise<{ ok: true }> {
  const order = await withTransaction(async (client) => {
    // Never downgrade an order the webhook already reconciled as paid.
    const upd = await client.query(
      `UPDATE orders SET status='failed' WHERE id=$1 AND user_id=$2 AND status <> 'paid' RETURNING *`,
      [orderId, userId],
    );
    if (!upd.rowCount) throw new HttpError(404, 'order not found, or already paid');
    await client.query(
      `INSERT INTO payments(order_id, razorpay_payment_id, status, verified, amount_paise)
       VALUES ($1,$2,'failed',false,$3)`,
      [orderId, razorpayPaymentId ?? null, upd.rows[0].total_paise],
    );
    return upd.rows[0];
  });

  await writeAudit({
    actor: 'user',
    action: 'payment_failed',
    target: orderId,
    amountPaise: Number(order.total_paise),
    reason: `payment declined: ${reason} — cart preserved for retry`,
    verified: false,
  });

  return { ok: true };
}

export async function listOrders(userId: string): Promise<Order[]> {
  const { rows } = await query('SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
  return rows.map(mapOrder);
}

// A merchant's SALES — orders containing their products. Deliberately different
// from listOrders(), which is "what I bought".
//
// Only this merchant's line items and their own subtotal are returned. An order
// may span several merchants, so exposing orders.total_paise here would leak
// another merchant's revenue.
export interface MerchantOrder {
  id: string;
  buyerEmail: string;
  status: OrderStatus;
  createdAt: string;
  items: CartItem[];
  myTotalPaise: Paise;
}

export async function listMerchantOrders(merchantId: string, limit = 100): Promise<MerchantOrder[]> {
  const { rows } = await query<any>(
    `SELECT o.id, o.status, o.created_at, u.email AS buyer_email,
            COALESCE(jsonb_agg(item) FILTER (WHERE p.merchant_id = $1), '[]'::jsonb) AS my_items,
            COALESCE(SUM(((item->>'pricePaise')::bigint) * ((item->>'qty')::int))
                     FILTER (WHERE p.merchant_id = $1), 0) AS my_total_paise
       FROM orders o
       JOIN users u ON u.id = o.user_id
       CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
       -- guard the cast: older rows may hold a non-uuid productId
       LEFT JOIN products p
         ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                        THEN (item->>'productId')::uuid END
      GROUP BY o.id, o.status, o.created_at, u.email
     HAVING COUNT(*) FILTER (WHERE p.merchant_id = $1) > 0
      ORDER BY o.created_at DESC
      LIMIT $2`,
    [merchantId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    buyerEmail: r.buyer_email,
    status: r.status,
    createdAt: r.created_at,
    items: r.my_items,
    myTotalPaise: Number(r.my_total_paise),
  }));
}
