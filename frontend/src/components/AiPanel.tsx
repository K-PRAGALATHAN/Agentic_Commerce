import { useEffect, useRef, useState } from 'react';
import { agentChat, api, rupees } from '../lib/api.js';
import { runCheckout, payExistingOrder } from '../lib/checkout.js';
import { useAuth } from '../lib/auth.js';
import { I } from '../lib/icons.js';
import { ProductCard, type CardProduct } from './ProductCard.js';
import {
  listen, speak, stopSpeaking, voiceSupported, speechSupported,
  normaliseNumbers, isRisky, isConsent, micTrouble, type ListenHandle,
} from '../lib/voice.js';
import { listConvos, newConvo, upsertConvo, removeConvo, exists, onConversationsChanged, type Convo } from '../lib/conversations.js';

// The chat's product shape is the card's shape. It was a near-copy with every
// field optional, which is how the two drifted apart in the first place — and
// why handing one to the rail needed a cast rather than just working.
interface Prod extends CardProduct { description?: string; }

// The model writes markdown whether or not we ask it to, and the bubble was
// printing the asterisks literally — "**Aster Linen Shirt**" on screen. This is
// deliberately the smallest possible reader: bold, and nothing else. A full
// markdown parser here would be a dependency and an injection surface for a
// couple of asterisks.
function rich(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <b key={i}>{part.slice(2, -2)}</b>
      : <span key={i}>{part}</span>,
  );
}
interface Step { tool: string; args?: any; ms?: number; ok?: boolean }
interface Msg { role: 'user' | 'assistant'; text: string; kind?: string; data?: any; steps?: Step[]; }

interface Props {
  isMerchant?: boolean;
  convoId: string | null;
  onConvoChange: (id: string) => void;
  onClose: () => void;
  onCartChanged: () => void;
  notify: (text: string) => void;
  // Opening a product is the shell's job, not the chat's: it goes to the right
  // rail so the conversation that produced it stays on screen.
  onOpenProduct: (p: Prod) => void;
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

export function AiPanel({ isMerchant = false, convoId, onConvoChange, onClose, onCartChanged, notify, onOpenProduct }: Props) {
  const { user } = useAuth();
  const uid = user?.id ?? 'anon';

  const [convo, setConvo] = useState<Convo | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuVersion, setMenuVersion] = useState(0);

  // --- voice ---------------------------------------------------------------
  // Speech is a transport in front of the same agent, so it drives `ask()`
  // rather than owning a loop of its own. The state here is only about the
  // microphone: what is being heard, and what is waiting to be confirmed.
  const [micOn, setMicOn] = useState(false);
  const [heard, setHeard] = useState('');          // live partial transcript
  const [speaking, setSpeaking] = useState(false);
  const [voiceOut, setVoiceOut] = useState(true);  // read replies aloud
  const [pending, setPending] = useState<string | null>(null); // awaiting read-back
  const micRef = useRef<ListenHandle | null>(null);
  // Push to talk: hold the space bar. 0 when idle, 0..1 while the hold is
  // filling. Two seconds is a long time to stare at nothing, so the progress is
  // drawn rather than merely counted.
  const [hold, setHold] = useState(0);
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

  // The single path into the agent. Typing and speaking both end up here, which
  // is what keeps voice from becoming a second assistant with its own rules.
  async function ask(text: string, spoken = false) {
    if (!text || busy) return;
    updateConvo((c) => ({
      ...c,
      title: c.title === 'New chat' ? text.slice(0, 40) : c.title,
      msgs: [...c.msgs, { role: 'user', text }],
      updatedAt: Date.now(),
    }));
    setInput(''); setBusy(true); setHeard('');
    try {
      const r = await agentChat(text, convo?.id);
      push({ role: 'assistant', text: r.reply, kind: r.kind, data: r.data, steps: (r as any).steps });
      onCartChanged();
      if (spoken && voiceOut) {
        // A gated turn is the one reply that must not end on an open question.
        // Read aloud as-is, "that is over your spend limit, shall I go ahead?"
        // invites a spoken yes — and consent to overspend is the single thing
        // voice is not allowed to give, because a cough in a noisy room is the
        // weakest evidence of intent in the system. The spoken version says so
        // and stops; the button on screen is the only way through.
        const line = r.kind === 'gated'
          ? `${r.reply} You will need to confirm that on screen — I cannot take that one by voice.`
          : r.reply;
        setSpeaking(true);
        speak(line, () => setSpeaking(false));
      }
    } catch (e: any) {
      push({ role: 'assistant', text: `Something went wrong: ${e.message}`, kind: 'error' });
    } finally { setBusy(false); }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    await ask(input.trim());
  }

  // Anything that names a quantity, a price or a payment gets repeated back
  // before it is acted on, and so does anything the recogniser was unsure of.
  // A misheard "seven hundred" as "seven thousand" is a real charge.
  function handleHeard(text: string, confidence: number) {
    const normalised = normaliseNumbers(text);
    if (!normalised) return;
    if (isConsent(normalised) || isRisky(normalised) || confidence < 0.75) {
      setPending(normalised);
      if (voiceOut) {
        setSpeaking(true);
        speak(`I heard: ${normalised}. Shall I go ahead?`, () => setSpeaking(false));
      }
      return;
    }
    void ask(normalised, true);
  }

  async function startMic() {
    // Ask the browser what is wrong BEFORE opening the recogniser, so a blocked
    // permission or a missing device says so instead of failing silently.
    const trouble = await micTrouble();
    if (trouble) { notify(trouble); return; }

    stopSpeaking(); setSpeaking(false);   // barge-in: talking over it stops it
    setHeard(''); setPending(null);
    const h = listen({
      onPartial: setHeard,
      onFinal: ({ text, confidence }) => { setMicOn(false); handleHeard(text, confidence); },
      onError: (msg) => { setMicOn(false); setHeard(''); notify(msg); },
      onEnd: () => setMicOn(false),
    });
    if (!h) { notify('Voice needs Chrome or Edge on this machine.'); return; }
    micRef.current = h;
    setMicOn(true);
  }

  function stopMic() { micRef.current?.abort(); micRef.current = null; setMicOn(false); setHeard(''); }

  // The key listener below is bound once and must not capture a stale startMic.
  // startMic reaches through handleHeard to `voiceOut`, so a listener bound
  // before the speaker was switched off would still read the reply aloud. A ref
  // refreshed every render keeps the shortcut pointing at the current one
  // without re-binding window listeners on every toggle.
  const startMicRef = useRef(startMic);
  startMicRef.current = startMic;

  // Leaving the panel with the microphone live, or with a reply still being
  // read out, is the kind of thing people notice about an app once.
  useEffect(() => () => { micRef.current?.abort(); stopSpeaking(); }, []);

  // --- hold space to talk ---------------------------------------------------
  //
  // Two seconds, deliberately. A tap would fire constantly by accident, and the
  // microphone opening unannounced is the one mistake a voice feature cannot
  // afford to make twice.
  //
  // It only arms when focus is NOT in a field. In a chat the composer usually
  // has focus, so space types a space exactly as it should; the shortcut is for
  // when you have clicked away or just finished reading a reply. That also keeps
  // the preventDefault narrow — space still scrolls the page everywhere it
  // normally would.
  useEffect(() => {
    if (!voiceSupported()) return;
    const HOLD_MS = 2000;
    let timer: number | undefined;
    let frame: number | undefined;

    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
    };
    const cancel = () => {
      if (timer) window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
      timer = frame = undefined;
      setHold(0);
    };

    function onDown(e: KeyboardEvent) {
      // `repeat` matters: holding a key fires keydown over and over, and without
      // this every repeat would restart the timer and it would never complete.
      if (e.code !== 'Space' || e.repeat || timer) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (typing() || micOn || busy || pending) return;
      e.preventDefault();

      const from = performance.now();
      const tick = () => {
        const p = Math.min(1, (performance.now() - from) / HOLD_MS);
        setHold(p);
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      timer = window.setTimeout(() => { cancel(); void startMicRef.current(); }, HOLD_MS);
    }

    const onUp = (e: KeyboardEvent) => { if (e.code === 'Space') cancel(); };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // Alt-tabbing away mid-hold must not leave a timer running that opens the
    // microphone once the window is no longer in front of the person.
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', cancel);
    };
  }, [micOn, busy, pending]);

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


  // Pays the order the agent already created after "confirm" — reusing it instead
  // of calling checkout again, which would create a second order for the same cart.
  async function payAgentOrder(data: any) {
    await payExistingOrder(data.order, data.razorpayOrderId, data.razorpayKeyId, (t) => notify(t), onCartChanged);
  }

  function startNew() {
    const c = newConvo(uid, isMerchant);
    upsertConvo(uid, c);
    setConvo(c); onConvoChange(c.id); setMenuOpen(false);
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
                  <span onClick={() => { onConvoChange(c.id); setMenuOpen(false); }}>{c.title}</span>
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

        <div className="sp-chat-scroll">
          <div className="sp-chat-inner">
            {msgs.map((m, i) => m.role === 'user' ? (
              <div key={i} className="sp-msg-user">{m.text}</div>
            ) : (
              <div key={i}>
                <div className="sp-msg-ai">{rich(m.text)}</div>

              {/* The same steps that went to agent_runs, so what the customer
                  sees matches what was recorded. Collapsed by default. */}
              {!!m.steps?.length && <Decision steps={m.steps} />}

                {m.data?.options?.length > 0 && (
                  <>
                    <div className="sp-msg-step">{I.check()} Found {m.data.options.length} matching product(s)</div>
                    <div className="sp-results pc-grid">
                      {/* The same card as the storefront. A product shown in the
                          chat and the same product shown on the home page were two
                          different components, so the discount flag, the rating and
                          the seller only ever appeared in one of them. */}
                      {m.data.options.map((p: Prod) => (
                        <ProductCard
                          key={p.id}
                          p={p}
                          onAdd={(x) => addToCart(x as Prod)}
                          onNotify={notify}
                          onOpen={() => onOpenProduct(p)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Upsell and cross-sell. The agent used to name these in prose
                    and leave the customer to picture them — no photograph, no
                    price to compare, nothing to press. They render as the same
                    card as everything else, with the tool's own reason as the
                    label. */}
                {m.data?.suggested?.length > 0 && (
                  <div className="sp-suggest">
                    {m.data.suggested.map((sug: Prod & { suggestReason?: string; suggestKind?: string }) => (
                      <div key={sug.id}>
                        <div className="sp-suggest-lbl">
                          {sug.suggestKind === 'upsell' ? 'A better one' : 'Goes well with it'}
                          {sug.suggestReason && <span> · {sug.suggestReason}</span>}
                        </div>
                        <ProductCard
                          p={sug}
                          onAdd={(x) => addToCart(x as Prod)}
                          onNotify={notify}
                          onOpen={() => onOpenProduct(sug)}
                        />
                      </div>
                    ))}
                  </div>
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
      {/* --- voice ------------------------------------------------------
          The read-back. Anything with a number, a price or a payment word in
          it is repeated before it is sent, so a misheard amount is caught by
          the customer rather than by their bank statement. */}
      {pending && (
        <div className="vc-check">
          <div>
            <span>I heard</span>
            <b>“{pending}”</b>
          </div>
          <div className="vc-check-acts">
            <button className="ghost" onClick={() => { setPending(null); void startMic(); }}>Say it again</button>
            <button className="pd-add" onClick={() => { const t = pending; setPending(null); void ask(t, true); }}>
              Yes, go ahead
            </button>
          </div>
        </div>
      )}

      <div className="sp-composer">
        {hold > 0 && !micOn && (
          <div className="vc-hold" role="status">
            <span className="vc-hold-bar"><i style={{ transform: `scaleX(${hold})` }} /></span>
            <span>Keep holding to talk…</span>
          </div>
        )}

        {micOn && (
          <div className="vc-live">
            <span className="vc-wave"><i /><i /><i /><i /></span>
            <span>{heard || 'Listening…'}</span>
            <button onClick={stopMic}>Stop</button>
          </div>
        )}

        <form onSubmit={send}>
          <span className="ai-dot">{I.sparkle()}</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={micOn ? 'Listening…' : isMerchant ? 'Ask about your store…' : 'Ask anything…'}
            disabled={busy || micOn}
            aria-label="Message the assistant"
          />

          {voiceSupported() && (
            <button
              type="button"
              className={`vc-mic ${micOn ? 'on' : ''}`}
              onClick={() => (micOn ? stopMic() : void startMic())}
              disabled={busy}
              title={micOn ? 'Stop listening' : 'Speak to the assistant — or hold the space bar'}
              aria-label={micOn ? 'Stop listening' : 'Speak to the assistant'}
              aria-pressed={micOn}
            >
              {I.mic()}
            </button>
          )}

          {speechSupported() && (
            <button
              type="button"
              className={`vc-spk ${voiceOut ? 'on' : ''}`}
              onClick={() => {
                setVoiceOut((v) => {
                  if (v) { stopSpeaking(); setSpeaking(false); }
                  return !v;
                });
              }}
              title={voiceOut ? 'Replies are read aloud' : 'Replies are silent'}
              aria-label="Toggle spoken replies"
              aria-pressed={voiceOut}
            >
              {speaking ? I.speakerOn() : voiceOut ? I.speaker() : I.speakerOff()}
            </button>
          )}

          <button className="sp-send" disabled={busy || !input.trim()} aria-label="Send">{I.send()}</button>
        </form>

        {speaking && (
          <button className="vc-hush" onClick={() => { stopSpeaking(); setSpeaking(false); }}>
            Stop speaking
          </button>
        )}
      </div>
    </section>
  );
}
