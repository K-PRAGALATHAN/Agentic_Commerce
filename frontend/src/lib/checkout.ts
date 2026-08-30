import { api } from './api.js';
import { loadRazorpay } from './razorpay.js';

export interface Guard { totalPaise: number; effectiveLimitPaise: number; reason: string; }
type Notify = (text: string, kind: 'ok' | 'bad' | '') => void;

interface OrderRef { id: string; totalPaise: number }

// Reporting a failure must never replace the message the user actually needs.
async function reportFailure(orderId: string, reason: string, paymentId?: string) {
  try {
    await api.post(`/orders/${orderId}/payment-failed`, { reason, paymentId });
  } catch {
    /* audit write is best-effort; the user has already been told what happened */
  }
}

// One widget configuration for both entry points, so the verify + failure paths
// can't drift apart. Every outcome — captured, unverified, declined, dismissed —
// is reported to the backend so it appears in the audit trail.
async function openWidget(
  order: OrderRef,
  razorpayOrderId: string,
  keyId: string,
  notify: Notify,
  onPaid?: () => void,
): Promise<void> {
  const Razorpay = await loadRazorpay();
  const rzp = new Razorpay({
    key: keyId,
    order_id: razorpayOrderId,
    amount: order.totalPaise,
    currency: 'INR',
    name: 'Agentic Commerce',
    description: `Order ${String(order.id).slice(0, 8)}`,
    handler: async (r: any) => {
      try {
        const v = await api.post<any>(`/orders/${order.id}/confirm`, {
          razorpay_order_id: r.razorpay_order_id,
          razorpay_payment_id: r.razorpay_payment_id,
          razorpay_signature: r.razorpay_signature,
        });
        if (v.verified) { notify('✅ Payment verified and captured.', 'ok'); onPaid?.(); }
        else notify('Payment could not be verified — not charged.', 'bad');
      } catch (e: any) { notify(e.message, 'bad'); }
    },
    modal: {
      ondismiss: () => {
        notify('Payment cancelled — your cart is safe.', '');
        reportFailure(order.id, 'cancelled by user');
      },
    },
    theme: { color: '#303030' },
  });
  rzp.on('payment.failed', (resp: any) => {
    const why = resp?.error?.description ?? 'declined';
    notify(`❌ Payment failed (${why}). Your cart is intact — try again.`, 'bad');
    reportFailure(order.id, why, resp?.error?.metadata?.payment_id);
  });
  rzp.open();
}

// Create an order, then pay it. Used where no order exists yet (Cart page, and the
// assistant's "Check out" card). Returns { gated } when the guardrail blocks.
export async function runCheckout(
  confirmOverLimit: boolean,
  notify: Notify,
  onPaid?: () => void,
  cartId?: string,
): Promise<{ gated?: Guard }> {
  // Omitting cartId buys the universal cart, so existing callers are unchanged.
  const res = await api.post<any>('/orders/checkout', {
    ...(confirmOverLimit ? { confirmOverLimit: true } : {}),
    ...(cartId ? { cartId } : {}),
  });
  if (res.gated) { notify(`Over your limit — ${res.guard.reason}.`, 'bad'); return { gated: res.guard }; }
  if (!res.razorpayKeyId) { notify('Razorpay test keys not configured on the server.', 'bad'); return {}; }

  await openWidget(res.order, res.razorpayOrderId, res.razorpayKeyId, notify, onPaid);
  return {};
}

// Pay an order the agent ALREADY created (after "confirm"). Reusing that order is
// what stops a second one being created for the same cart.
export async function payExistingOrder(
  order: OrderRef,
  razorpayOrderId: string,
  keyId: string,
  notify: Notify,
  onPaid?: () => void,
): Promise<void> {
  if (!keyId) { notify('Razorpay test keys not configured on the server.', 'bad'); return; }
  await openWidget(order, razorpayOrderId, keyId, notify, onPaid);
}
