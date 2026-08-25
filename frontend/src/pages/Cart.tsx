import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';

interface CartItem { productId: string; name: string; qty: number; pricePaise: number; }
interface CartData { items: CartItem[]; totalPaise: number; }

export function Cart() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { cart } = await api.get<{ cart: CartData }>('/cart');
    setCart(cart);
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    const { cart } = await api.del<{ cart: CartData }>(`/cart/items/${id}`);
    setCart(cart);
  }

  async function checkout() {
    setBusy(true); setMsg('');
    try {
      const res = await api.post<any>('/orders/checkout');
      if (res.razorpayKeyId) {
        // Real Razorpay test checkout would open here (checkout.js) using res.razorpayOrderId.
        setMsg('Order created. (Razorpay test widget opens here when keys are set.)');
      } else {
        setMsg('Order intent recorded.');
      }
      await load();
    } catch (e: any) {
      // Graceful: e.g. keys not configured, or empty cart — shown, never a crash.
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
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
            <button disabled={busy} onClick={checkout}>{busy ? '…' : 'Checkout'}</button>
          </div>
        </div>
      )}
      {msg && <div className="toast glass">{msg}</div>}
    </>
  );
}
