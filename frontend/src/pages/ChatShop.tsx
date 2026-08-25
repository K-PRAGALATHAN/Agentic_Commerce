import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentChat, api, rupees } from '../lib/api.js';
import { runCheckout } from '../lib/checkout.js';
import { useAuth } from '../lib/auth.js';
import { Sidebar } from '../components/Sidebar.js';
import './chatshop.css';

interface Prod { id: string; name: string; pricePaise: number; image?: string; rating?: number; category?: string; description?: string; }
interface Msg { role: 'user' | 'assistant'; text: string; kind?: string; data?: any; }

// --- inline icons (line style, to match the reference) ---
const I = {
  chats: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  search: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>,
  card: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  faq: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 11a8 8 0 0 1 16 0"/><path d="M4 11v3M20 11v3M2 13h4M18 13h4"/></svg>,
  gear: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.2.61.79 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  cart: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>,
  cartSm: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>,
  check: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></svg>,
  back: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  close: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  left: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>,
  right: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>,
};

const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL'];

export function ChatShop() {
  const { user } = useAuth();
  const nav = useNavigate();
  const storeKey = `csthread:${user?.id ?? 'anon'}`;

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Prod | null>(null);
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState('M');
  const [cartCount, setCartCount] = useState(0);
  const [toast, setToast] = useState('');
  const [title, setTitle] = useState('New chat');
  const endRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      if (saved?.msgs?.length) { setMsgs(saved.msgs); setTitle(saved.title || 'New chat'); return; }
    } catch { /* ignore */ }
    setMsgs([{ role: 'assistant', text: 'Hi! What are you looking for? Try "show me shirts" or "buy a blue shirt under ₹600".' }]);
  }, [storeKey]);

  useEffect(() => {
    if (msgs.length) { try { localStorage.setItem(storeKey, JSON.stringify({ msgs, title })); } catch { /* ignore */ } }
  }, [msgs, title, storeKey]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, busy]);
  useEffect(() => { refreshCart(); }, []);

  async function refreshCart() {
    try { const { cart } = await api.get<any>('/cart'); setCartCount(cart.items.reduce((s: number, i: any) => s + i.qty, 0)); } catch { /* ignore */ }
  }
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2000); };
  const push = (m: Msg) => setMsgs((ms) => [...ms, m]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    if (title === 'New chat') setTitle(text.slice(0, 40));
    push({ role: 'user', text });
    setInput(''); setBusy(true);
    try {
      const r = await agentChat(text);
      push({ role: 'assistant', text: r.reply, kind: r.kind, data: r.data });
      refreshCart();
    } catch (e: any) { push({ role: 'assistant', text: `⚠️ ${e.message}`, kind: 'error' }); }
    finally { setBusy(false); }
  }

  async function addToCart(p: Prod, q = 1) {
    try { await api.post('/cart/items', { productId: p.id, qty: q }); flash(`Added "${p.name}"`); refreshCart(); }
    catch (e: any) { flash(e.message); }
  }
  async function pay(confirmOver = false) {
    const notify = (t: string) => flash(t);
    const r = await runCheckout(confirmOver, notify, refreshCart);
    if (r.gated) push({ role: 'assistant', text: `That's over your limit of ${rupees(r.gated.effectiveLimitPaise)}.`, kind: 'gated', data: { confirmPay: true } });
  }
  async function buyNow(p: Prod, q = 1) { await addToCart(p, q); setDetail(null); await pay(false); }

  function scrollRow(i: number, dir: number) {
    rowRefs.current[i]?.scrollBy({ left: dir * 260, behavior: 'smooth' });
  }

  return (
    <div className="cs-app">
      <Sidebar />

      <main className="cs-main">
        <header className="cs-header">
          <h1>{title}</h1>
          <span className="cs-cart" onClick={() => nav('/cart')}>{I.cart()}{cartCount > 0 && <span className="cs-cart-badge">{cartCount}</span>}</span>
        </header>

        <div className="cs-thread">
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="cs-user">{m.text}</div>
          ) : (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="cs-assistant"><span className="cs-check">{I.check()}</span><span>{m.text}</span></div>

              {m.data?.options?.length > 0 && (
                <div className="cs-carousel">
                  {m.data.options.length > 2 && <button className="cs-arrow left" onClick={() => scrollRow(i, -1)}>{I.left()}</button>}
                  <div className="cs-cards" ref={(el) => { rowRefs.current[i] = el; }}>
                    {m.data.options.map((p: Prod) => (
                      <div key={p.id} className="cs-card" onClick={() => { setDetail(p); setQty(1); setSize('M'); }}>
                        <div className="cs-media">
                          {p.image ? <img src={p.image} alt="" /> : null}
                          <div className="cs-media-actions">
                            <button className="cs-buynow" onClick={(e) => { e.stopPropagation(); buyNow(p); }}>Buy now</button>
                            <button className="cs-addcart" onClick={(e) => { e.stopPropagation(); addToCart(p); }}>{I.cartSm()} Add to cart</button>
                          </div>
                        </div>
                        <div className="cs-info">
                          <div className="cs-name">{p.name}</div>
                          <div className="cs-sub">{p.category}</div>
                          <div className="cs-price">{rupees(p.pricePaise)}</div>
                          <div className="cs-foot">
                            <span className="cs-brand-sm">{p.category}</span>
                            {p.rating ? <span className="cs-rating"><span className="cs-star">★</span> {Number(p.rating).toFixed(1)}</span> : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {m.data.options.length > 2 && <button className="cs-arrow right" onClick={() => scrollRow(i, 1)}>{I.right()}</button>}
                </div>
              )}

              {m.data?.cartTotalPaise != null && (
                <div className="cs-checkout">
                  <div className="cs-checkout-left">
                    <div className="cs-checkout-thumb" />
                    <div><strong>Your cart</strong><div className="cs-sub">{cartCount} item{cartCount === 1 ? '' : 's'}</div></div>
                  </div>
                  <button className="cs-checkout-btn" onClick={() => pay(false)}>Checkout <span className="amt">{rupees(m.data.cartTotalPaise)}</span></button>
                </div>
              )}
              {m.data?.confirmPay && (
                <div className="cs-checkout"><span className="cs-sub">Over limit — with your consent</span>
                  <button className="cs-checkout-btn" onClick={() => pay(true)}>Confirm &amp; pay</button></div>
              )}
            </div>
          ))}
          {busy && <div className="cs-thinking">…thinking</div>}
          <div ref={endRef} />
        </div>

        <form className="cs-composer" onSubmit={send}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="What are you looking for?" disabled={busy} />
        </form>
      </main>

      {detail && (
        <>
          <div className="cs-scrim" onClick={() => setDetail(null)} />
          <aside className="cs-drawer">
            <div className="cs-drawer-head">
              <button className="cs-icon-btn" onClick={() => setDetail(null)}>{I.back()}</button>
              <span className="mid">{detail.name}</span>
              <button className="cs-icon-btn" onClick={() => setDetail(null)}>{I.close()}</button>
            </div>
            {detail.image ? <img className="cs-hero" src={detail.image} alt="" /> : <div className="cs-hero" />}
            <div className="cs-thumbs">{[0, 1, 2, 3].map((n) => detail.image ? <img key={n} className="cs-thumb" src={detail.image} alt="" /> : <div key={n} className="cs-thumb" />)}</div>
            <div className="cs-d-brand">{detail.category}</div>
            <div className="cs-d-name">{detail.name}</div>
            <div className="cs-d-price">{rupees(detail.pricePaise)}</div>

            <div className="cs-d-label">Size {size}</div>
            <div className="cs-sizes">{SIZES.map((s) => <div key={s} className={`cs-size ${s === size ? 'active' : ''}`} onClick={() => setSize(s)}>{s}</div>)}</div>

            <div className="cs-d-label">Color</div>
            <div className="cs-colors"><span className="cs-swatch" style={{ background: '#1b1c26' }} /><span className="cs-swatch" style={{ background: '#d8d3c4' }} /></div>

            <p className="cs-desc">{detail.description || 'A great pick from our catalog.'}</p>

            <div className="cs-qtyrow">
              <div className="cs-qty"><button onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button><span>{qty}</span><button onClick={() => setQty((q) => q + 1)}>+</button></div>
              <button className="cs-d-addcart" onClick={() => { addToCart(detail, qty); setDetail(null); }}>Add to cart</button>
            </div>
            <button className="cs-d-buynow" onClick={() => buyNow(detail, qty)}>Buy now</button>
          </aside>
        </>
      )}

      {toast && <div className="cs-toast">{toast}</div>}
    </div>
  );
}
