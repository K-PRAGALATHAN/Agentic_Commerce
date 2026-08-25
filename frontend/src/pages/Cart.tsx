import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';
import { loadRazorpay } from '../lib/razorpay.js';

interface CartItem { productId: string; name: string; qty: number; pricePaise: number; }
interface CartData { items: CartItem[]; totalPaise: number; }
interface Guard { totalPaise: number; effectiveLimitPaise: number; reason: string; }

export function Cart() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState<'ok' | 'bad' | ''>('');
  const [gated, setGated] = useState<Guard | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const { cart } = await api.get<{ cart: CartData }>('/cart');
    setCart(cart);
  }
  useEffect(() => { load(); }, []);

  function say(text: string, kind: 'ok' | 'bad' | '' = '') { setMsg(text); setMsgKind(kind); }

  async function remove(id: string) {
    const { cart } = await api.del<{ cart: CartData }>(`/cart/items/${id}`);
    setCart(cart);
  }

  // Full flow: create order → open Razorpay test widget → verify server-side → show result.
  async function checkout(confirmOverLimit = false) {
    setBusy(true); say(''); setGated(null);
    try {
      const res = await api.post<any>('/orders/checkout', confirmOverLimit ? { confirmOverLimit: true } : {});
      if (res.gated) { setGated(res.guard); say(`Over your limit — ${res.guard.reason}.`, 'bad'); return; }
      if (!res.razorpayKeyId) { say('Razorpay test keys not configured on the server.', 'bad'); return; }

      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: res.razorpayKeyId,
        order_id: res.razorpayOrderId,
        amount: res.order.totalPaise,
        currency: 'INR',
        name: 'Agentic Commerce',
        description: `Order ${String(res.order.id).slice(0, 8)}`,
        handler: async (r: any) => {
          // Success path → verify signature SERVER-SIDE before trusting it.
          try {
            const v = await api.post<any>(`/orders/${res.order.id}/confirm`, {
              razorpay_order_id: r.razorpay_order_id,
              razorpay_payment_id: r.razorpay_payment_id,
              razorpay_signature: r.razorpay_signature,
            });
            if (v.verified) { say('✅ Payment verified and captured.', 'ok'); await load(); }
            else say('Payment could not be verified — not charged.', 'bad');
          } catch (e: any) { say(e.message, 'bad'); }
        },
        modal: { ondismiss: () => say('Payment cancelled — your cart is safe.', '') },
        theme: { color: '#7aa2ff' },
      });
      // Graceful failure path (e.g. Razorpay failure test card).
      rzp.on('payment.failed', (resp: any) => {
        say(`❌ Payment failed (${resp.error?.description ?? 'declined'}). Your cart is intact — try again or use another method.`, 'bad');
      });
      rzp.open();
    } catch (e: any) {
      say(e.message, 'bad');
    } finally { setBusy(false); }
  }

  if (!cart) return <p className="muted">Loading cart…</p>;

  return (
    <>
      <div className="title">Your Cart</div>
      {!cart.items.length && <p className="muted">Cart is empty.</p>}
      {cart.items.map((i) => (
        <div key={i.productId} className="list-row glass row between">
          <div>
            <strong>{i.name}</strong>
            <div className="muted">{i.qty} × {rupees(i.pricePaise)}</div>
          </div>
          <div className="row">
            <span className="price">{rupees(i.pricePaise * i.qty)}</span>
            <button className="danger" onClick={() => remove(i.productId)}>Remove</button>
          </div>
        </div>
      ))}
      {cart.items.length > 0 && (
        <div className="list-row glass row between">
          <strong>Total</strong>
          <div className="row">
            <span className="price" style={{ fontSize: 18 }}>{rupees(cart.totalPaise)}</span>
            {gated
              ? <button className="danger" disabled={busy} onClick={() => checkout(true)}>Over limit — confirm & pay</button>
              : <button disabled={busy} onClick={() => checkout(false)}>{busy ? '…' : 'Checkout'}</button>}
          </div>
        </div>
      )}
      {gated && (
        <p className="muted" style={{ fontSize: 13 }}>
          Bounded by your spend limit ({rupees(gated.effectiveLimitPaise)}). Raise it in Settings, or confirm to proceed.
        </p>
      )}
      {msg && <div className="toast glass" style={{ borderColor: msgKind === 'ok' ? 'var(--ok)' : msgKind === 'bad' ? 'var(--danger)' : 'var(--glass-brd)' }}>{msg}</div>}
    </>
  );
}
