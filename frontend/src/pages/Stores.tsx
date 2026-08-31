import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { onCartsChanged, cartsChanged } from '../lib/cartEvents.js';
import { ProductCard, catLabel as label, type CardProduct } from '../components/ProductCard.js';

// Who is selling, and how they are doing.
//
// A marketplace that hides its merchants is asking the customer to trust a
// logo. These two screens do the opposite: every store has a name, a
// description, a product count and a real sales figure drawn from paid orders.

interface Store {
  slug: string; storeName: string; tagline: string; about?: string; logo: string;
  location: string; productCount: number; categories: string[];
  rating: number; unitsSold: number; revenuePaise: number; since: string;
}
type Product = CardProduct;


export function Stores() {
  const nav = useNavigate();
  const [stores, setStores] = useState<Store[] | null>(null);

  useEffect(() => {
    api.get<{ stores: Store[] }>('/stores').then((r) => setStores(r.stores)).catch(() => setStores([]));
  }, []);

  return (
    <>
      <div className="sp-page-head">
        <div>
          <h1>Stores</h1>
          <span className="muted">
            {stores ? `${stores.length} merchants selling here` : 'Loading…'}
          </span>
        </div>
      </div>

      <div className="st-grid">
        {(stores ?? []).map((s) => (
          <button key={s.slug} className="st-card" onClick={() => nav(`/stores/${s.slug}`)}>
            <div className="st-top">
              <b>{s.storeName}</b>
              <span>{s.location || 'India'}</span>
            </div>
            <div className="st-tag">{s.tagline || 'No description yet.'}</div>
            <div className="st-stats">
              <div><b>{s.productCount}</b><span>products</span></div>
              <div><b>{s.unitsSold}</b><span>sold</span></div>
              {/* Revenue is what the store has actually taken on paid orders —
                  the same number its own analytics screen reports. */}
              <div><b>{rupees(s.revenuePaise)}</b><span>revenue</span></div>
            </div>
          </button>
        ))}
        {stores && !stores.length && <p className="muted">No stores have listed anything yet.</p>}
        {!stores && Array.from({ length: 4 }, (_, i) => <div key={i} className="sk sk-card" />)}
      </div>
    </>
  );
}

export function StorePage() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<{ store: Store; products: Product[] } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Adds from a store page go to the universal cart. Choosing between several
  // carts is a storefront concern; here the question is which shop, not which list.
  useEffect(() => onCartsChanged(() => {}), []);

  useEffect(() => {
    setData(null); setErr('');
    api.get<{ store: Store; products: Product[] }>(`/stores/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((e) => setErr(e.message));
  }, [slug]);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2000); };

  async function add(p: Product) {
    try {
      await api.post('/cart/items', { productId: p.id, qty: 1 });
      // The badge in the top bar and any open cart page both re-read on this.
      cartsChanged();
      say(`Added “${p.name}”`);
    } catch (e: any) { say(e.message); }
  }

  if (err) {
    return (
      <>
        <div className="sp-page-head"><div><h1>Store not found</h1></div></div>
        <p className="muted">{err}</p>
        <button className="ghost" onClick={() => nav('/stores')}>← All stores</button>
      </>
    );
  }
  if (!data) return <p className="muted">Loading…</p>;

  const { store, products } = data;
  return (
    <>
      <button className="hm-link" style={{ marginBottom: 12 }} onClick={() => nav('/stores')}>
        ← All stores
      </button>

      <div className="st-hero">
        <span className="st-logo">{store.logo || '🏬'}</span>
        <div style={{ minWidth: 0 }}>
          <h1>{store.storeName}</h1>
          <p>{store.about || store.tagline}</p>
          <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            {store.location && <>{store.location} · </>}
            {store.categories.map(label).join(' · ')}
          </p>
        </div>
        <div className="st-stats">
          <div><b>{store.productCount}</b><span>products</span></div>
          <div><b>{store.unitsSold}</b><span>units sold</span></div>
          <div><b>{rupees(store.revenuePaise)}</b><span>revenue</span></div>
          <div><b>★ {store.rating.toFixed(1)}</b><span>avg rating</span></div>
        </div>
      </div>

      <div className="pc-grid">
        {products.map((p) => (
          <ProductCard key={p.id} p={p} onAdd={add} onNotify={say} />
        ))}
        {!products.length && <p className="muted">This store has nothing listed right now.</p>}
      </div>
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
