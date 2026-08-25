import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';

interface AuditRow { id: number; actor: string; action: string; reason: string; amount_paise: number | null; verified: boolean | null; ts: string; }
interface LedgerRow { id: number; hash: string; prev_hash: string; ts: string; payload: any; }

interface RunRow { id: number; run_id: string; agent: string; output: any; status: string; ts: string; }

export function Observability() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [chain, setChain] = useState<{ ok: boolean; count: number; brokenAt?: number } | null>(null);
  const [which, setWhich] = useState<'intent' | 'checkout'>('intent');

  async function load() {
    const a = await api.get<{ audit: AuditRow[] }>('/observability/audit');
    setAudit(a.audit);
    const l = await api.get<{ ledger: LedgerRow[] }>(`/observability/ledger/${which}`);
    setLedger(l.ledger);
    try { setRuns((await api.get<{ runs: RunRow[] }>('/observability/agent-runs')).runs); } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, [which]);

  async function verify() {
    const r = await api.get<{ ok: boolean; count: number; brokenAt?: number }>(`/observability/verify/${which}`);
    setChain(r);
  }

  return (
    <>
      <div className="title">Observability · Audit Trail</div>
      <p className="muted" style={{ marginTop: -6 }}>Every money + agent action is logged; ledgers are hash-chained + verifiable.</p>

      <div className="list-row glass">
        <div className="row between">
          <strong>Audit log</strong><span className="muted">{audit.length} entries</span>
        </div>
        <table>
          <thead><tr><th>Actor</th><th>Action</th><th>Reason</th><th>Amount</th><th>Verified</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td><span className="pill">{a.actor}</span></td>
                <td>{a.action}</td>
                <td className="muted">{a.reason}</td>
                <td>{a.amount_paise != null ? rupees(Number(a.amount_paise)) : '—'}</td>
                <td>{a.verified == null ? '—' : a.verified ? <span className="badge-ok">✓</span> : <span className="badge-bad">✗</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="list-row glass">
        <div className="row between">
          <strong>Agent runs (multi-agent trace)</strong><span className="muted">{runs.length} steps</span>
        </div>
        <table>
          <thead><tr><th>run</th><th>agent</th><th>output</th><th>status</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td><code>{r.run_id.slice(0, 6)}</code></td>
                <td><span className="pill">{r.agent}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{JSON.stringify(r.output)}</td>
                <td>{r.status === 'ok' ? <span className="badge-ok">ok</span> : <span className="badge-bad">{r.status}</span>}</td>
              </tr>
            ))}
            {!runs.length && <tr><td colSpan={4} className="muted">No agent runs yet — chat with the AI to populate.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="list-row glass">
        <div className="row between">
          <div className="row">
            <strong>Ledger:</strong>
            <select style={{ width: 260 }} value={which} onChange={(e) => setWhich(e.target.value as any)}>
              <option value="intent">intent_ledger · Intent Mandate (AP2)</option>
              <option value="checkout">checkout_ledger · Cart Mandate (AP2)</option>
            </select>
          </div>
          <button className="ghost" onClick={verify}>🔗 Verify chain</button>
        </div>
        {chain && (
          <p className={chain.ok ? 'badge-ok' : 'badge-bad'}>
            {chain.ok ? `✓ Chain valid (${chain.count} rows) — no tampering` : `✗ Chain BROKEN at row ${chain.brokenAt}`}
          </p>
        )}
        <table>
          <thead><tr><th>#</th><th>hash</th><th>prev_hash</th><th>ts</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td><code>{l.hash.slice(0, 16)}…</code></td>
                <td><code>{l.prev_hash.slice(0, 16)}…</code></td>
                <td className="muted">{new Date(l.ts).toLocaleTimeString()}</td>
              </tr>
            ))}
            {!ledger.length && <tr><td colSpan={4} className="muted">No ledger entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
