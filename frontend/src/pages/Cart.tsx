import { useCallback, useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';
import { runCheckout, type Guard } from '../lib/checkout.js';
import { onCartsChanged, cartsChanged } from '../lib/cartEvents.js';

interface CartItem {
  productId: string; variantId: string; variantTitle: string;
  image: string; name: string; qty: number; pricePaise: number;
}
interface CartData { id: string; name: string; isDefault: boolean; items: CartItem[]; totalPaise: number; }
interface CartSummary { id: string; name: string; isDefault: boolean; itemCount: number; totalPaise: number; }

export function Cart() {
  const [carts, setCarts] = useState<CartSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartData | null>(null);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState<'ok' | 'bad' | ''>('');
  const [gated, setGated] = useState<Guard | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  const say = (text: string, kind: 'ok' | 'bad' | '' = '') => { setMsg(text); setMsgKind(kind); };

  const loadCarts = useCallback(async () => {
    const { carts } = await api.get<{ carts: CartSummary[] }>('/carts');
    setCarts(carts);
    // Keep the selection if it still exists; otherwise fall back to the universal cart.
    setActiveId((cur) => (cur && carts.some((c) => c.id === cur) ? cur : carts.find((c) => c.isDefault)?.id ?? carts[0]?.id ?? null));
  }, []);

  const loadCart = useCallback(async (id: string | null) => {
    if (!id) return;
    const { cart } = await api.get<{ cart: CartData }>(`/cart?cartId=${id}`);
    setCart(cart);
  }, []);

  useEffect(() => { loadCarts(); }, [loadCarts]);
  useEffect(() => { loadCart(activeId); }, [activeId, loadCart]);

  // The assistant works on carts too, so re-read when it reports a change.
  useEffect(() => onCartsChanged(() => { loadCarts(); loadCart(activeId); }), [loadCarts, loadCart, activeId]);

  async function remove(variantId: string) {
    const { cart } = await api.del<{ cart: CartData }>(`/cart/items/${variantId}?cartId=${activeId}`);
    setCart(cart); loadCarts(); cartsChanged();
  }

  async function move(variantId: string, toCartId: string) {
    try {
      await api.post('/cart/move', { variantId, fromCartId: activeId, toCartId });
      await loadCart(activeId); await loadCarts(); cartsChanged();
      say(`Moved to ${carts.find((c) => c.id === toCartId)?.name}`, 'ok');
    } catch (e: any) { say(e.message, 'bad'); }
  }

  async function addCart(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { cart } = await api.post<{ cart: CartSummary }>('/carts', { name: newName });
      setNewName(''); setNaming(false); await loadCarts(); setActiveId(cart.id); cartsChanged();
    } catch (e: any) { say(e.message, 'bad'); }
  }

  async function dropCart(id: string) {
    try { await api.del(`/carts/${id}`); await loadCarts(); cartsChanged(); say('Cart deleted', 'ok'); }
    catch (e: any) { say(e.message, 'bad'); }
  }

  // Checkout buys ONE cart — the others survive, which is the point of having them.
  async function checkout(confirmOverLimit = false) {
    if (!activeId) return;
    setBusy(true); say(''); setGated(null);
    try {
      const r = await runCheckout(confirmOverLimit, say, async () => {
        await loadCarts(); await loadCart(activeId); cartsChanged();
      }, activeId);
      if (r.gated) setGated(r.gated);
    } catch (e: any) { say(e.message, 'bad'); } finally { setBusy(false); }
  }

  const others = carts.filter((c) => c.id !== activeId);

  return (
    <>
      <div className="sp-page-head">
        <div><h1>Cart</h1><span className="muted">{carts.length} cart{carts.length === 1 ? '' : 's'}</span></div>
        {naming ? (
          <form className="row" onSubmit={addCart}>
            <input autoFocus placeholder="Cart name" value={newName} style={{ margin: 0, width: 180 }}
              onChange={(e) => setNewName(e.target.value)} />
            <button type="submit">Create</button>
            <button type="button" className="ghost" onClick={() => setNaming(false)}>Cancel</button>
          </form>
        ) : (
          <button className="ghost" onClick={() => setNaming(true)}>+ New cart</button>
        )}
      </div>

      {/* Every cart the customer has, including any the assistant created. */}
      <div className="ct-tabs">
        {carts.map((c) => (
          <button key={c.id} className={`ct-tab ${c.id === activeId ? 'on' : ''}`} onClick={() => setActiveId(c.id)}>
            <span className="ct-tab-name">{c.name}</span>
            <span className="ct-tab-meta">{c.itemCount} · {rupees(c.totalPaise)}</span>
            {c.isDefault && <span className="pill">default</span>}
          </button>
        ))}
      </div>

      {!cart ? <p className="muted">Loading…</p> : (
        <>
          {!cart.items.length && (
            <p className="muted">
              {cart.isDefault
                ? 'Your universal cart is empty. Anything you add without naming a cart lands here.'
                : `“${cart.name}” is empty.`}
            </p>
          )}

          {cart.items.map((i) => (
            <div key={i.variantId} className="list-row glass row between">
              <div className="row">
                {i.image ? <img className="ct-thumb" src={i.image} alt="" /> : <div className="ct-thumb" />}
                <div>
                  <strong>{i.name}</strong>
                  {i.variantTitle && i.variantTitle !== 'Default' && (
                    <span className="pill" style={{ marginLeft: 8 }}>{i.variantTitle}</span>
                  )}
                  <div className="muted">{i.qty} × {rupees(i.pricePaise)}</div>
                </div>
              </div>
              <div className="row">
                <span className="price">{rupees(i.pricePaise * i.qty)}</span>
                {others.length > 0 && (
                  <select defaultValue="" style={{ margin: 0, width: 140 }}
                    onChange={(e) => { if (e.target.value) move(i.variantId, e.target.value); }}>
                    <option value="" disabled>Move to…</option>
                    {others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <button className="danger" onClick={() => remove(i.variantId)}>Remove</button>
              </div>
            </div>
          ))}

          {cart.items.length > 0 && (
            <div className="list-row glass row between">
              <strong>Total</strong>
              <div className="row">
                <span className="price" style={{ fontSize: 18 }}>{rupees(cart.totalPaise)}</span>
                {gated
                  ? <button className="danger" disabled={busy} onClick={() => checkout(true)}>Over limit — confirm &amp; pay</button>
                  : <button disabled={busy} onClick={() => checkout(false)}>{busy ? '…' : `Check out ${cart.name}`}</button>}
              </div>
            </div>
          )}

          {gated && (
            <p className="muted" style={{ fontSize: 13 }}>
              Bounded by your spend limit ({rupees(gated.effectiveLimitPaise)}). Raise it in Settings, or confirm to proceed.
            </p>
          )}

          {!cart.isDefault && !cart.items.length && (
            <button className="danger" onClick={() => dropCart(cart.id)}>Delete “{cart.name}”</button>
          )}
        </>
      )}

      {msg && (
        <div className="toast" style={{ borderColor: msgKind === 'ok' ? 'var(--sp-green)' : msgKind === 'bad' ? 'var(--sp-red)' : undefined }}>
          {msg}
        </div>
      )}
    </>
  );
}
