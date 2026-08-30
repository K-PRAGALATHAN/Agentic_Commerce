import { useEffect, useState } from 'react';
import { api, rupees } from '../../lib/api.js';

interface Row {
  variantId: string; sku: string; barcode: string; stock: number; pricePaise: number;
  variantTitle: string; productId: string; productName: string; image: string; trackInventory: boolean;
}

export function MerchantInventory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2000); };

  async function load() {
    setRows((await api.get<{ inventory: Row[] }>('/merchant/inventory')).inventory);
    setDraft({});
  }
  useEffect(() => { load(); }, []);

  // Commit on blur/Enter rather than per keystroke — one request per edit, and
  // a half-typed number never reaches the server.
  async function commit(r: Row) {
    const v = draft[r.variantId];
    if (v === undefined || v === '' || Number(v) === r.stock) return;
    try { await api.post(`/merchant/inventory/${r.variantId}`, { stock: Number(v) }); say('Stock updated'); await load(); }
    catch (e: any) { say(e.message); }
  }

  const low = rows.filter((r) => r.trackInventory && r.stock <= 5).length;

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Inventory</h1>
          <span className="muted">
            {rows.length} variant{rows.length === 1 ? '' : 's'}{low ? ` · ${low} running low` : ''}
          </span>
        </div>
      </div>

      <div className="glass mp-tablewrap">
        <table className="mp-table">
          <thead>
            <tr><th>Product</th><th>SKU</th><th className="num">Price</th><th className="num">Available</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variantId} style={{ cursor: 'default' }}>
                <td>
                  <div className="mp-name" title={r.productName}>{r.productName}</div>
                  {r.variantTitle !== 'Default' && <div className="muted mp-cat">{r.variantTitle}</div>}
                </td>
                <td className="muted">{r.sku || '—'}</td>
                <td className="num">{rupees(r.pricePaise)}</td>
                <td className="num">
                  <input
                    className="inv-qty" type="number" min="0"
                    aria-label={`Stock for ${r.productName} ${r.variantTitle}`}
                    value={draft[r.variantId] ?? String(r.stock)}
                    onChange={(e) => setDraft({ ...draft, [r.variantId]: e.target.value })}
                    onBlur={() => commit(r)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                  {r.trackInventory && r.stock <= 5 && <span className="pill badge-bad" style={{ marginLeft: 8 }}>low</span>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={4} className="muted">No variants yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Edit a quantity, then press Enter or click away to save.</p>
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
