import { useEffect, useRef, useState } from 'react';
import { agentChat, api, rupees } from '../lib/api.js';
import { runCheckout, payExistingOrder } from '../lib/checkout.js';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';
import { listConvos, newConvo, upsertConvo, removeConvo, exists, onConversationsChanged, type Convo } from '../lib/conversations.js';

interface Prod { id: string; name: string; pricePaise: number; image?: string; rating?: number; category?: string; description?: string; }
interface Step { tool: string; args?: any; ms?: number; ok?: boolean }
interface Msg { role: 'user' | 'assistant'; text: string; kind?: string; data?: any; steps?: Step[]; }

interface Props {
  isMerchant?: boolean;
  convoId: string | null;
  onConvoChange: (id: string) => void;
  onClose: () => void;
  onCartChanged: () => void;
  notify: (text: string) => void;
}

// The shopping assistant. It takes over the centre content area, replacing the
// storefront, so results and the checkout card get full width.
function Decision({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false);
  const total = steps.reduce((s, x) => s + (x.ms ?? 0), 0);
  return (
    <div className="ai-why">
      <button className="ai-why-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? '▾' : '▸'} How I decided · {steps.length} step{steps.length === 1 ? '' : 's'} · {total}ms
      </button>
      {open && (
        <ol className="ai-why-list">
          {steps.map((s, i) => (
            <li key={i}>
              <code>{s.tool}</code>
              {s.args && Object.keys(s.args).length > 0 && (
                <span className="muted"> {JSON.stringify(s.args).slice(0, 90)}</span>
              )}
              <span className="ai-why-ms">{s.ms}ms</span>
              {s.ok === false && <span className="badge-bad"> failed</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AiPanel({ isMerchant = false, convoId, onConvoChange, onClose, onCartChanged, notify }: Props) {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';

  const [convo, setConvo] = useState<Convo | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVersion, setMenuVersion] = useState(0);
  const [detail, setDetail] = useState<Prod | null>(null);
  const [qty, setQty] = useState(1);
  const endRef = useRef<HTMLDivElement>(null);

  const msgs: Msg[] = convo?.msgs ?? [];

  // Load the requested conversation, else the most recent, else a fresh one.
  useEffect(() => {
    const list = listConvos(uid);
    const c = (convoId ? list.find((x) => x.id === convoId) : list[0]) ?? newConvo(uid, isMerchant);
    if (!list.find((x) => x.id === c.id)) upsertConvo(uid, c);
    setConvo(c);
    if (convoId !== c.id) onConvoChange(c.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convoId, uid]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs.length, busy]);

  // If the conversation on screen was deleted from the sidebar, drop it. Without
  // this the panel keeps it in state and the next message writes it straight
  // back — which looked exactly like delete not working.
  useEffect(() => onConversationsChanged(() => {
    setConvo((cur) => {
      if (!cur || exists(uid, cur.id)) return cur;
      const next = listConvos(uid)[0] ?? newConvo(uid, isMerchant);
      if (!exists(uid, next.id)) upsertConvo(uid, next);
      onConvoChange(next.id);
      return next;
    });
    setDetail(null);
  }), [uid, isMerchant, onConvoChange]);

  function updateConvo(fn: (c: Convo) => Convo) {
    setConvo((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      upsertConvo(uid, next);
      return next;
    });
  }
  const push = (m: Msg) => updateConvo((c) => ({ ...c, msgs: [...c.msgs, m], updatedAt: Date.now() }));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    updateConvo((c) => ({
      ...c,
      title: c.title === 'New chat' ? text.slice(0, 40) : c.title,
      msgs: [...c.msgs, { role: 'user', text }],
      updatedAt: Date.now(),
    }));
    setInput(''); setBusy(true); setDetail(null);
    try {
      const r = await agentChat(text, convo?.id);
      push({ role: 'assistant', text: r.reply, kind: r.kind, data: r.data, steps: (r as any).steps });
      onCartChanged();
    } catch (e: any) {
      push({ role: 'assistant', text: `Something went wrong: ${e.message}`, kind: 'error' });
    } finally { setBusy(false); }
  }

  async function addToCart(p: Prod, q = 1) {
    try { await api.post('/cart/items', { productId: p.id, qty: q }); notify(`Added “${p.name}” to cart`); onCartChanged(); }
    catch (e: any) { notify(e.message); }
  }

  async function pay(confirmOver = false) {
    const r = await runCheckout(confirmOver, (t) => notify(t), onCartChanged);
    if (r.gated) push({
      role: 'assistant',
      text: `That's over your spend limit of ${rupees(r.gated.effectiveLimitPaise)}.`,
      kind: 'gated',
      data: { confirmPay: true },
    });
  }

  async function buyNow(p: Prod, q = 1) { await addToCart(p, q); setDetail(null); await pay(false); }

  // Pays the order the agent already created after "confirm" — reusing it instead
  // of calling checkout again, which would create a second order for the same cart.
  async function payAgentOrder(data: any) {
    await payExistingOrder(data.order, data.razorpayOrderId, data.razorpayKeyId, (t) => notify(t), onCartChanged);
  }

  function startNew() {
    const c = newConvo(uid, isMerchant);
    upsertConvo(uid, c);
    setConvo(c); onConvoChange(c.id); setDetail(null); setMenuOpen(false);
  }

  // Deleting the open conversation drops you into whatever remains, or a fresh
  // one — never a blank panel pointing at something that no longer exists.
  function deleteConvo(id: string) {
    // removeConvo announces the change; the effect above handles the case where
    // the deleted one was on screen, so this only has to switch when it is the
    // panel's own delete and the menu should stay open on the remaining list.
    removeConvo(uid, id);
    if (convo?.id === id) {
      const left = listConvos(uid);
      const next = left[0] ?? newConvo(uid, isMerchant);
      if (!left.length) upsertConvo(uid, next);
      setConvo(next);
      onConvoChange(next.id);
      setDetail(null);
    }
    setMenuVersion((v) => v + 1);
  }

  void menuVersion; // re-read the list after a delete inside the dropdown
  const list = menuOpen ? listConvos(uid) : [];

  return (
    <section className="sp-chat">
      <div className="sp-chat-head">
        <span className="sp-chat-title">{convo?.title ?? 'New chat'}</span>

        <div className="sp-rail-menu">
          <button className="sp-rail-btn" onClick={() => setMenuOpen((o) => !o)} title="Conversations" aria-label="Conversations">
            {I.chevronDown()}
          </button>
          {menuOpen && (
            <div className="sp-rail-drop">
              <div style={{ fontWeight: 600 }} onClick={startNew}>+ New conversation</div>
              {list.map((c) => (
                <div key={c.id} className="sp-rail-drop-row" title={c.title}>
                  <span onClick={() => { onConvoChange(c.id); setMenuOpen(false); setDetail(null); }}>{c.title}</span>
                  <button
                    className="sp-rail-del"
                    title={`Delete "${c.title}"`}
                    aria-label={`Delete conversation ${c.title}`}
                    onClick={(e) => { e.stopPropagation(); deleteConvo(c.id); }}
                  >✕</button>
                </div>
              ))}
              {!list.length && <div className="muted" style={{ padding: '7px 9px' }}>No conversations yet</div>}
            </div>
          )}
        </div>

        <button className="sp-rail-btn" onClick={startNew} title="New conversation" aria-label="New conversation">{I.compose()}</button>
        <button className="sp-rail-btn" onClick={onClose}
          title={isMerchant ? 'Back to Products' : 'Back to storefront'} aria-label="Close assistant">{I.close()}</button>
      </div>

      {detail ? (
        <div className="sp-chat-scroll">
          <div className="sp-chat-inner sp-detail">
            <button className="sp-detail-back" onClick={() => setDetail(null)}>{I.back()} Back to chat</button>
            {detail.image
              ? <img className="sp-detail-img" src={detail.image} alt="" />
              : <div className="sp-detail-img" />}
            <div className="sp-detail-cat">{detail.category}</div>
            <div className="sp-detail-name">{detail.name}</div>
            <div className="sp-detail-price">{rupees(detail.pricePaise)}</div>
            <p className="sp-detail-desc">{detail.description || 'A pick from the store catalogue.'}</p>
            <div className="sp-detail-actions">
              <div className="sp-qty">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">−</button>
                <span>{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
              </div>
              <button className="ghost" onClick={() => { addToCart(detail, qty); setDetail(null); }}>Add to cart</button>
              <button onClick={() => buyNow(detail, qty)}>Buy now</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="sp-chat-scroll">
          <div className="sp-chat-inner">
            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="sp-msg-user">{m.text}</div>
            ) : (
              <div key={i}>
                <div className="sp-msg-ai">{m.text}</div>

              {/* The same steps that went to agent_runs, so what the customer
                  sees matches what was recorded. Collapsed by default. */}
              {!!m.steps?.length && <Decision steps={m.steps} />}

                {m.data?.options?.length > 0 && (
                  <>
                    <div className="sp-msg-step">{I.check()} Found {m.data.options.length} matching product(s)</div>
                    <div className="sp-results">
                      {m.data.options.map((p: Prod) => (
                        <div key={p.id} className="sp-res" onClick={() => { setDetail(p); setQty(1); }}>
                          {p.image ? <img className="sp-res-img" src={p.image} alt="" /> : <div className="sp-res-img" />}
                          <div className="sp-res-body">
                            <div className="sp-res-name">{p.name}</div>
                            <div className="sp-res-meta">
                              <span className="sp-res-price">{rupees(p.pricePaise)}</span>
                              {p.rating ? <span>★ {Number(p.rating).toFixed(1)}</span> : null}
                            </div>
                          </div>
                          <button className="sp-res-add" onClick={(e) => { e.stopPropagation(); addToCart(p); }}>Add</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {m.data?.cartTotalPaise != null && (
                  <div className="sp-rail-checkout">
                    <div>
                      <div className="lbl">Cart total</div>
                      <div className="amt">{rupees(m.data.cartTotalPaise)}</div>
                    </div>
                    <button onClick={() => pay(false)}>Check out</button>
                  </div>
                )}

                {m.data?.confirmPay && (
                  <div className="sp-rail-checkout warn">
                    <div className="lbl">Over your limit — needs your consent</div>
                    <button onClick={() => pay(true)}>Confirm &amp; pay</button>
                  </div>
                )}

                {/* The agent created a real order — pay THAT one, not a new one. */}
                {m.data?.order?.id && m.data?.razorpayOrderId && (
                  <div className="sp-rail-checkout">
                    <div>
                      <div className="lbl">Order {String(m.data.order.id).slice(0, 8)} · awaiting payment</div>
                      <div className="amt">{rupees(Number(m.data.order.totalPaise))}</div>
                    </div>
                    <button onClick={() => payAgentOrder(m.data)}>Pay now</button>
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="sp-thinking"><span className="sp-dot" /> Thinking…</div>}
            <div ref={endRef} />
          </div>
        </div>
      )}

      <div className="sp-composer">
        <form onSubmit={send}>
          <span className="ai-dot">{I.sparkle()}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isMerchant ? "Ask about your store…" : "Ask anything…"}
            disabled={busy}
            aria-label="Message the assistant"
          />
          <button className="sp-send" disabled={busy || !input.trim()} aria-label="Send">{I.send()}</button>
        </form>
      </div>
    </section>
  );
}
