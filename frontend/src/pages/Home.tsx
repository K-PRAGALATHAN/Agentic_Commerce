import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { onCartsChanged } from '../lib/cartEvents.js';

interface Product {
  id: string; name: string; pricePaise: number; category: string; rating: number; image: string; stock?: number;
}
interface Row { key: string; title: string; subtitle: string; products: Product[]; }
interface CartOpt { id: string; name: string; isDefault: boolean; }

function Card({ p, carts, onAdd }: { p: Product; carts: CartOpt[]; onAdd: (p: Product, cartId?: string) => void }) {
  const [pick, setPick] = useState(false);
  return (
    <div className="card glass sf-card">
      {p.image ? <img className="thumb" src={p.image} alt="" /> : <div className="thumb" />}
      <div className="cat">{p.category}</div>
      <h3 title={p.name}>{p.name}</h3>
      <div className="row between">
        <span className="price">{rupees(p.pricePaise)}</span>
        <span className="muted">★ {Number(p.rating).toFixed(1)}</span>
      </div>
      {/* One cart is the common case; the chooser only appears if you have more. */}
      {carts.length > 1 && pick ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => { if (e.target.value) { onAdd(p, e.target.value); setPick(false); } }}
          onBlur={() => setPick(false)}
        >
          <option value="" disabled>Add to which cart?</option>
          {carts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : (
        <button className="ghost" style={{ width: '100%', marginTop: 10 }}
          onClick={() => (carts.length > 1 ? setPick(true) : onAdd(p))}>
          Add to cart
        </button>
      )}
    </div>
  );
}

export function Home() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [results, setResults] = useState<Product[] | null>(null);
  const [carts, setCarts] = useState<CartOpt[]>([]);
  const [msg, setMsg] = useState('');

  const loadCarts = () => api.get<{ carts: CartOpt[] }>('/carts').then((r) => setCarts(r.carts)).catch(() => {});
  useEffect(() => { loadCarts(); }, []);
  // A cart the assistant just created should appear in the picker straight away.
  useEffect(() => onCartsChanged(loadCarts), []);

  // Search replaces the personalised rows; otherwise the page is built from
  // what this customer has viewed, bought and what is selling.
  useEffect(() => {
    let live = true;
    if (q) {
      setRows(null);
      api.get<{ products: Product[] }>(`/catalog?limit=60&q=${encodeURIComponent(q)}`)
        .then((r) => { if (live) setResults(r.products); }).catch(() => {});
    } else {
      setResults(null);
      api.get<{ rows: Row[] }>('/storefront').then((r) => { if (live) setRows(r.rows); }).catch(() => {});
    }
    return () => { live = false; };
  }, [q]);

  async function add(p: Product, cartId?: string) {
    try {
      await api.post('/cart/items', { productId: p.id, qty: 1, ...(cartId ? { cartId } : {}) });
      const where = cartId ? carts.find((c) => c.id === cartId)?.name : carts.find((c) => c.isDefault)?.name;
      setMsg(`Added “${p.name}”${where ? ` to ${where}` : ''}`);
      setTimeout(() => setMsg(''), 1900);
      api.get<{ carts: CartOpt[] }>('/carts').then((r) => setCarts(r.carts)).catch(() => {});
    } catch (e: any) { setMsg(e.message); }
  }

  if (q) {
    return (
      <>
        <div className="sp-page-head">
          <div><h1>Results for “{q}”</h1>
            <span className="muted">{results ? `${results.length} product${results.length === 1 ? '' : 's'}` : 'Searching…'}</span>
          </div>
        </div>
        <div className="grid">
          {(results ?? []).map((p) => <Card key={p.id} p={p} carts={carts} onAdd={add} />)}
          {results && !results.length && <p className="muted">Nothing matched that search.</p>}
        </div>
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  return (
    <>
      <div className="sp-page-head">
        <div><h1>Shop</h1><span className="muted">Put together from what you browse and buy</span></div>
      </div>

      {!rows && <p className="muted">Loading…</p>}
      {rows?.map((row) => (
        <section key={row.key} className="sf-row">
          <div className="sf-row-head">
            <h2>{row.title}</h2>
            <span className="muted">{row.subtitle}</span>
          </div>
          <div className="sf-scroller">
            {row.products.map((p) => <Card key={p.id} p={p} carts={carts} onAdd={add} />)}
          </div>
        </section>
      ))}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
