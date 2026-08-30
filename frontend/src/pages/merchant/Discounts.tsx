import { useEffect, useState } from 'react';
import { api, rupees } from '../../lib/api.js';

interface Discount {
  id: string; code: string; kind: 'percent' | 'fixed'; value: number;
  active: boolean; automatic: boolean; minOrderPaise: number;
  usageLimit: number | null; usedCount: number;
}

const EMPTY = { code: '', kind: 'percent' as const, value: '10', minOrderRupees: '0', automatic: false, usageLimit: '' };

export function MerchantDiscounts() {
  const [rows, setRows] = useState<Discount[]>([]);
  const [form, setForm] = useState<any>(EMPTY);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2400); };

  async function load() {
    setRows((await api.get<{ discounts: Discount[] }>('/merchant/discounts')).discounts);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/merchant/discounts', {
        code: form.code.trim(),
        kind: form.kind,
        value: Number(form.value),
        automatic: form.automatic,
        minOrderRupees: Number(form.minOrderRupees || 0),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      });
      setForm(EMPTY); setOpen(false); say('Discount created'); await load();
    } catch (err: any) { say(err.message); }
  }

  async function toggle(d: Discount) {
    try { await api.post(`/merchant/discounts/${d.id}/toggle`, { active: !d.active }); await load(); }
    catch (err: any) { say(err.message); }
  }
  async function del(id: string) {
    try { await api.del(`/merchant/discounts/${id}`); say('Discount deleted'); await load(); }
    catch (err: any) { say(err.message); }
  }

  const describe = (d: Discount) =>
    d.kind === 'percent' ? `${d.value}% off` : `${rupees(d.value)} off`;

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Discounts</h1>
          <span className="muted">{rows.length} discount{rows.length === 1 ? '' : 's'}</span>
        </div>
        <button onClick={() => setOpen((o) => !o)}>{open ? 'Cancel' : '+ Create discount'}</button>
      </div>

      {open && (
        <form className="list-row glass" onSubmit={create}>
          <div className="dc-grid">
            <div>
              <label>Code</label>
              <input value={form.code} required placeholder="SAVE20"
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label>Type</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="percent">Percentage off</option>
                <option value="fixed">Fixed amount off</option>
              </select>
            </div>
            <div>
              <label>{form.kind === 'percent' ? 'Percent (1–100)' : 'Amount (₹)'}</label>
              <input type="number" min="1" max={form.kind === 'percent' ? 100 : undefined} required
                value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
            <div>
              <label>Minimum order (₹)</label>
              <input type="number" min="0" value={form.minOrderRupees}
                onChange={(e) => setForm({ ...form, minOrderRupees: e.target.value })} />
            </div>
            <div>
              <label>Usage limit</label>
              <input type="number" min="1" placeholder="unlimited" value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
            </div>
            <div>
              <label>Applies</label>
              <select value={form.automatic ? 'auto' : 'code'}
                onChange={(e) => setForm({ ...form, automatic: e.target.value === 'auto' })}>
                <option value="code">When the code is entered</option>
                <option value="auto">Automatically at checkout</option>
              </select>
            </div>
          </div>
          <button type="submit">Create discount</button>
        </form>
      )}

      {!rows.length && !open && (
        <div className="list-row glass mp-empty">
          <strong>No discounts yet</strong>
          <p className="muted">
            A discount is applied before the spend guardrail, so customers are judged on what they actually pay.
          </p>
        </div>
      )}

      {rows.map((d) => (
        <div key={d.id} className="list-row glass row between">
          <div>
            <strong>{d.code}</strong>
            <span className={`pill ${d.active ? 'badge-ok' : ''}`} style={{ marginLeft: 8 }}>
              {d.active ? 'Active' : 'Paused'}
            </span>
            {d.automatic && <span className="pill" style={{ marginLeft: 6 }}>Automatic</span>}
            <div className="muted">
              {describe(d)}
              {d.minOrderPaise > 0 && ` · min ${rupees(d.minOrderPaise)}`}
              {` · used ${d.usedCount}${d.usageLimit ? ` of ${d.usageLimit}` : ''}`}
            </div>
          </div>
          <div className="row">
            <button className="ghost" onClick={() => toggle(d)}>{d.active ? 'Pause' : 'Activate'}</button>
            <button className="danger" onClick={() => del(d.id)}>Delete</button>
          </div>
        </div>
      ))}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
