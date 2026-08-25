import { useRef, useState, useEffect } from 'react';
import { agentChat, api, rupees } from '../lib/api.js';
import { runCheckout } from '../lib/checkout.js';
import { useAuth } from '../lib/auth.js';

interface Prod { id: string; name: string; pricePaise: number; image?: string; rating?: number; category?: string; }
interface Msg { role: 'user' | 'assistant'; text: string; kind?: string; data?: any; }
interface Convo { id: string; title: string; messages: Msg[]; updatedAt: number; }

const GREETING: Msg = { role: 'assistant', text: 'Hi! Tell me what to buy — e.g. "buy me a blue shirt under ₹600", or "a shirt and shoes under ₹2000". You can also ask about returns, shipping, or payments.' };
const kindColor: Record<string, string> = { gated: 'var(--danger)', checkout: 'var(--ok)', recommend: 'var(--accent2)', error: 'var(--danger)' };

function newConvo(): Convo { return { id: crypto.randomUUID(), title: 'New chat', messages: [GREETING], updatedAt: Date.now() }; }

export function Chat() {
  const { user } = useAuth();
  const storeKey = `chat:${user?.id ?? 'anon'}`;
  const [convos, setConvos] = useState<Convo[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let loaded: Convo[] = [];
    try { loaded = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch { /* ignore */ }
    if (!loaded.length) loaded = [newConvo()];
    setConvos(loaded); setActiveId(loaded[0].id);
  }, [storeKey]);

  useEffect(() => {
    if (convos.length) { try { localStorage.setItem(storeKey, JSON.stringify(convos)); } catch { /* ignore */ } }
  }, [convos, storeKey]);

  const active = convos.find((c) => c.id === activeId);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [active?.messages.length, busy]);

  const patchActive = (fn: (c: Convo) => Convo) => setConvos((cs) => cs.map((c) => (c.id === activeId ? fn(c) : c)));
  const pushMsg = (m: Msg) => patchActive((c) => ({ ...c, messages: [...c.messages, m], updatedAt: Date.now() }));

  function createChat() { const c = newConvo(); setConvos((cs) => [c, ...cs]); setActiveId(c.id); }
  function deleteChat(id: string) {
    setConvos((cs) => { const n = cs.filter((c) => c.id !== id); const f = n.length ? n : [newConvo()]; if (id === activeId) setActiveId(f[0].id); return f; });
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy || !active) return;
    const isFirst = active.messages.filter((m) => m.role === 'user').length === 0;
    patchActive((c) => ({ ...c, title: isFirst ? text.slice(0, 32) : c.title, messages: [...c.messages, { role: 'user', text }], updatedAt: Date.now() }));
    setInput(''); setBusy(true);
    try {
      const r = await agentChat(text);
      pushMsg({ role: 'assistant', text: r.reply, kind: r.kind, data: r.data });
    } catch (e: any) {
      pushMsg({ role: 'assistant', text: `⚠️ ${e.message}`, kind: 'error' });
    } finally { setBusy(false); }
  }

  async function addToCart(p: Prod) {
    try { await api.post('/cart/items', { productId: p.id, qty: 1 }); pushMsg({ role: 'assistant', text: `Added "${p.name}" to your cart.`, kind: 'recommend' }); }
    catch (e: any) { pushMsg({ role: 'assistant', text: e.message, kind: 'error' }); }
  }
  async function payNow(confirmOver = false) {
    const notify = (t: string, k: any) => pushMsg({ role: 'assistant', text: t, kind: k === 'ok' ? 'checkout' : k === 'bad' ? 'error' : 'general' });
    const r = await runCheckout(confirmOver, notify);
    if (r.gated) pushMsg({ role: 'assistant', text: `That's over your limit of ${rupees(r.gated.effectiveLimitPaise)}. Pay anyway?`, kind: 'gated', data: { confirmPay: true } });
  }

  return (
    <>
      <div className="title">Conversational AI</div>
      <div className="chat-wrap">
        <aside className="chat-side glass">
          <button style={{ width: '100%' }} onClick={createChat}>+ New chat</button>
          <div className="chat-list">
            {[...convos].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => (
              <div key={c.id} className={`chat-item ${c.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(c.id)}>
                <span className="chat-item-title">{c.title}</span>
                <span className="chat-del" onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}>×</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="chat-main glass">
          <div className="chat-scroll">
            {active?.messages.map((m, i) => (
              <div key={i} className="chat-turn" style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className="chat-bubble glass" style={{
                  background: m.role === 'user' ? 'rgba(122,162,255,0.22)' : 'var(--glass)',
                  borderColor: m.kind ? kindColor[m.kind] ?? 'var(--glass-brd)' : 'var(--glass-brd)',
                }}>
                  {m.text}
                  {m.kind && m.role === 'assistant' && m.kind !== 'general' && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.kind}</div>
                  )}
                </div>

                {/* Inline product-card carousel */}
                {m.data?.options?.length > 0 && (
                  <div className="prod-row">
                    {m.data.options.map((p: Prod) => (
                      <div key={p.id} className="prod-card glass">
                        {p.image ? <img className="prod-img" src={p.image} alt="" /> : <div className="prod-img" />}
                        <div className="prod-name">{p.name}</div>
                        <div className="row between">
                          <span className="price">{rupees(p.pricePaise)}</span>
                          {p.rating ? <span className="muted" style={{ fontSize: 12 }}>★ {Number(p.rating).toFixed(1)}</span> : null}
                        </div>
                        <button className="ghost" style={{ width: '100%' }} onClick={() => addToCart(p)}>Add to cart</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline checkout card */}
                {m.data?.cartTotalPaise != null && (
                  <div className="checkout-card glass row between">
                    <div><strong>Your cart</strong><div className="muted" style={{ fontSize: 12 }}>Total {rupees(m.data.cartTotalPaise)}</div></div>
                    <button onClick={() => payNow(false)}>Checkout</button>
                  </div>
                )}
                {m.data?.confirmPay && (
                  <div className="checkout-card glass row between">
                    <span className="muted">Over limit — with your consent</span>
                    <button className="danger" onClick={() => payNow(true)}>Confirm & pay</button>
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="muted" style={{ alignSelf: 'flex-start' }}>…thinking</div>}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="row chat-input">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="What are you looking for?" disabled={busy} />
            <button disabled={busy}>{busy ? '…' : 'Send'}</button>
          </form>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Conversations are saved on this device. Set a low spend limit in Settings to see the guardrail in action.</p>
    </>
  );
}
