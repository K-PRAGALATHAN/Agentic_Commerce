import { useRef, useState, useEffect } from 'react';
import { agentChat } from '../lib/api.js';

interface Msg { role: 'user' | 'assistant'; text: string; kind?: string; }

const kindColor: Record<string, string> = {
  gated: 'var(--danger)', checkout: 'var(--ok)', recommend: 'var(--accent2)', error: 'var(--danger)',
};

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: 'assistant', text: 'Hi! Tell me what to buy — e.g. "buy me a blue shirt under ₹600".' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setInput(''); setBusy(true);
    try {
      const r = await agentChat(text);
      setMsgs((m) => [...m, { role: 'assistant', text: r.reply, kind: r.kind }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', text: `⚠️ ${e.message}`, kind: 'error' }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="title">Conversational AI</div>
      <div className="glass" style={{ padding: 16, minHeight: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
              <div className="glass" style={{
                padding: '10px 14px',
                borderRadius: 14,
                background: m.role === 'user' ? 'rgba(122,162,255,0.22)' : 'var(--glass)',
                borderColor: m.kind ? kindColor[m.kind] ?? 'var(--glass-brd)' : 'var(--glass-brd)',
              }}>
                {m.text}
                {m.kind && m.role === 'assistant' && m.kind !== 'general' && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.kind}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={send} className="row">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder='e.g. "buy me a blue shirt under ₹600"' disabled={busy} />
          <button disabled={busy}>{busy ? '…' : 'Send'}</button>
        </form>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        The agent searches, recommends, and buys within your spend limit — every action is audited and gated. Try "confirm" after a recommendation, or set a low spend limit in Settings to see the guardrail kick in.
      </p>
    </>
  );
}
