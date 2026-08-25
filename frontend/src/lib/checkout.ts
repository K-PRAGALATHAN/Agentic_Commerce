import { api } from './api.js';
import { loadRazorpay } from './razorpay.js';

export interface Guard { totalPaise: number; effectiveLimitPaise: number; reason: string; }
type Notify = (text: string, kind: 'ok' | 'bad' | '') => void;

// Shared checkout: create order → open Razorpay test widget → verify server-side.
// Returns { gated } when the guardrail blocks (caller offers confirm-override).
export async function runCheckout(confirmOverLimit: boolean, notify: Notify, onPaid?: () => void): Promise<{ gated?: Guard }> {
  const res = await api.post<any>('/orders/checkout', confirmOverLimit ? { confirmOverLimit: true } : {});
  if (res.gated) { notify(`Over your limit — ${res.guard.reason}.`, 'bad'); return { gated: res.guard }; }
  if (!res.razorpayKeyId) { notify('Razorpay test keys not configured on the server.', 'bad'); return {}; }

  const Razorpay = await loadRazorpay();
  const rzp = new Razorpay({
    key: res.razorpayKeyId,
    order_id: res.razorpayOrderId,
    amount: res.order.totalPaise,
    currency: 'INR',
    name: 'Agentic Commerce',
    description: `Order ${String(res.order.id).slice(0, 8)}`,
    handler: async (r: any) => {
      try {
        const v = await api.post<any>(`/orders/${res.order.id}/confirm`, {
          razorpay_order_id: r.razorpay_order_id,
          razorpay_payment_id: r.razorpay_payment_id,
          razorpay_signature: r.razorpay_signature,
        });
        if (v.verified) { notify('✅ Payment verified and captured.', 'ok'); onPaid?.(); }
        else notify('Payment could not be verified — not charged.', 'bad');
      } catch (e: any) { notify(e.message, 'bad'); }
    },
    modal: { ondismiss: () => notify('Payment cancelled — your cart is safe.', '') },
    theme: { color: '#7aa2ff' },
  });
  rzp.on('payment.failed', (resp: any) =>
    notify(`❌ Payment failed (${resp.error?.description ?? 'declined'}). Your cart is intact — try again.`, 'bad'));
  rzp.open();
  return {};
}
