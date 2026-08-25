import { useEffect, useState } from 'react';
import { api, rupees } from '../lib/api.js';

interface Product { id: string; name: string; pricePaise: number; stock: number; category: string; }
interface Refund { id: string; order_id: string; amount_paise: number; reason: string; requester_email: string; }
interface Cost { totalCalls: number; totalCost: number; byModel: any[]; }
const empty = { name: '', priceRupees: 0, stock: 0, category: '' };

export function Merchant() {
  const [products, setProducts] = useState<Product[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  async function load() {
    const { products } = await api.get<{ products: Product[] }>('/merchant/products');
    setProducts(products);
    try {
      const r = await api.get<{ requests: Refund[] }>('/merchant/refunds');
      setRefunds(r.requests);
      setCost(await api.get<Cost>('/merchant/model-cost'));
    } catch { /* non-fatal */ }
  }
  useEffect(() => { load(); }, []);

  async function decideRefund(id: string, action: 'approve' | 'reject') {
    try { await api.post(`/merchant/refunds/${id}/${action}`); setMsg(`Refund ${action}d`); await load(); }
    catch (e: any) { setMsg(e.message); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const body = { ...form, priceRupees: Number(form.priceRupees), stock: Number(form.stock) };
      if (editing) await api.put(`/merchant/products/${editing}`, body);
      else await api.post('/merchant/products', body);
      setForm(empty); setEditing(null); setMsg('Saved'); await load();
    } catch (e: any) { setMsg(e.message); }
  }

  async function edit(p: Product) {
    setEditing(p.id);
    setForm({ name: p.name, priceRupees: p.pricePaise / 100, stock: p.stock, category: p.category });
  }
  async function del(id: string) { await api.del(`/merchant/products/${id}`); await load(); }
  async function seed() {
    setMsg('Seeding from internet…');
    const r = await api.post<{ synced: number }>('/admin/sync-catalog');
    setMsg(`Seeded ${r.synced} products from the internet (Door 1)`);
    await load();
  }

  return (
    <>
      <div className="row between">
        <div className="title">Merchant · Catalog</div>
        <button className="ghost" onClick={seed}>⤓ Seed from internet (Door 1)</button>
      </div>

      <div className="list-row glass">
        <strong>{editing ? 'Edit product' : 'Add product (Door 2)'}</strong>
        <form onSubmit={save}>
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr' }}>
            <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label>Price (₹)</label><input type="number" min="0" step="0.01" value={form.priceRupees} onChange={(e) => setForm({ ...form, priceRupees: e.target.value })} required /></div>
            <div><label>Stock</label><input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required /></div>
            <div><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          </div>
          <div className="row">
            <button type="submit">{editing ? 'Update' : 'Add product'}</button>
            {editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(empty); }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="title" style={{ fontSize: 16 }}>My products ({products.length})</div>
      <table className="glass" style={{ padding: 8 }}>
        <thead><tr><th>Name</th><th>Price</th><th>Stock</th><th>Category</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td className="price">{rupees(p.pricePaise)}</td><td>{p.stock}</td><td>{p.category}</td>
              <td className="row">
                <button className="ghost" onClick={() => edit(p)}>Edit</button>
                <button className="danger" onClick={() => del(p.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="title" style={{ fontSize: 16 }}>Refund requests (gated — approval required) {refunds.length > 0 && <span className="pill">{refunds.length} pending</span>}</div>
      {!refunds.length && <p className="muted">No pending refund requests.</p>}
      {refunds.map((r) => (
        <div key={r.id} className="list-row glass row between">
          <div>
            <strong>{rupees(Number(r.amount_paise))}</strong> · <span className="muted">order {r.order_id.slice(0, 8)} · {r.requester_email}</span>
            <div className="muted" style={{ fontSize: 12 }}>{r.reason}</div>
          </div>
          <div className="row">
            <button onClick={() => decideRefund(r.id, 'approve')}>Approve</button>
            <button className="danger" onClick={() => decideRefund(r.id, 'reject')}>Reject</button>
          </div>
        </div>
      ))}

      <div className="title" style={{ fontSize: 16 }}>LLM cost tracker</div>
      <div className="list-row glass">
        {cost ? (
          <div className="row between">
            <span>{cost.totalCalls} model calls</span>
            <span className="price">₹{cost.totalCost.toFixed(4)}</span>
          </div>
        ) : <span className="muted">No model usage yet.</span>}
        {cost?.byModel?.map((m: any) => (
          <div key={m.model} className="row between muted" style={{ fontSize: 12 }}>
            <span>{m.model}</span>
            <span>{m.calls} calls · {m.tokens_in}/{m.tokens_out} tok · ₹{Number(m.cost).toFixed(4)}</span>
          </div>
        ))}
      </div>

      {msg && <div className="toast glass">{msg}</div>}
    </>
  );
}
