import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { onCartsChanged } from '../lib/cartEvents.js';
import { I } from '../lib/icons.js';
import heroShot from '../assets/hero-shot.jpg';
import { ProductCard, catLabel as label, type CardProduct, type CartOpt } from '../components/ProductCard.js';

type Product = CardProduct;
interface Row { key: string; title: string; subtitle: string; products: Product[]; }
interface Store {
  slug: string; storeName: string; tagline: string; logo: string;
  productCount: number; unitsSold: number; rating: number;
}

export function Home() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const q = (params.get('q') ?? '').trim();
  const category = (params.get('category') ?? '').trim();

  const [rows, setRows] = useState<Row[] | null>(null);
  const [results, setResults] = useState<Product[] | null>(null);
  const [top, setTop] = useState<Product[]>([]);
  const [cats, setCats] = useState<{ category: string; count: number; image: string }[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [carts, setCarts] = useState<CartOpt[]>([]);
  const [msg, setMsg] = useState('');

  const loadCarts = () => api.get<{ carts: CartOpt[] }>('/carts').then((r) => setCarts(r.carts)).catch(() => {});
  useEffect(() => { loadCarts(); }, []);
  // A cart the assistant just created should appear in the picker straight away.
  useEffect(() => onCartsChanged(loadCarts), []);

  // The landing furniture — categories, stores, the best-rated products behind
  // the hero — is the same for every visitor, so it loads once and is not
  // re-fetched when a search runs.
  useEffect(() => {
    api.get<{ clusters: { category: string; count: number; image: string }[] }>('/kg/clusters')
      .then((r) => setCats(r.clusters.filter((c) => c.count > 1).slice(0, 12))).catch(() => {});
    api.get<{ stores: Store[] }>('/stores').then((r) => setStores(r.stores)).catch(() => {});
    api.get<{ products: Product[] }>('/catalog?limit=12').then((r) => setTop(r.products)).catch(() => {});
  }, []);

  // A search or a category replaces the landing page; otherwise the page is
  // built from what this customer has viewed and bought.
  useEffect(() => {
    let live = true;
    if (q || category) {
      setRows(null);
      const url = q
        ? `/catalog?limit=60&q=${encodeURIComponent(q)}`
        : `/catalog?limit=60&category=${encodeURIComponent(category)}`;
      api.get<{ products: Product[] }>(url)
        .then((r) => { if (live) setResults(r.products); }).catch(() => {});
    } else {
      setResults(null);
      api.get<{ rows: Row[] }>('/storefront').then((r) => { if (live) setRows(r.rows); }).catch(() => {});
    }
    return () => { live = false; };
  }, [q, category]);

  async function add(p: Product, cartId?: string) {
    try {
      await api.post('/cart/items', { productId: p.id, qty: 1, ...(cartId ? { cartId } : {}) });
      const where = cartId ? carts.find((c) => c.id === cartId)?.name : carts.find((c) => c.isDefault)?.name;
      setMsg(`Added “${p.name}”${where ? ` to ${where}` : ''}`);
      setTimeout(() => setMsg(''), 1900);
      api.get<{ carts: CartOpt[] }>('/carts').then((r) => setCarts(r.carts)).catch(() => {});
    } catch (e: any) { setMsg(e.message); }
  }

  // ---------------------------------------------------------------- filtered
  if (q || category) {
    const heading = q ? `Results for “${q}”` : label(category);
    return (
      <>
        <div className="sp-page-head">
          <div>
            <h1>{heading}</h1>
            <span className="muted">
              {results ? `${results.length} product${results.length === 1 ? '' : 's'}` : 'Searching…'}
            </span>
          </div>
          <button className="ghost" onClick={() => setParams({})}>← All products</button>
        </div>
        <div className="pc-grid">
          {(results ?? []).map((p) => <ProductCard key={p.id} p={p} carts={carts} onAdd={add} onNotify={setMsg} />)}
          {results && !results.length && <p className="muted">Nothing matched that search.</p>}
        </div>
        {msg && <div className="toast">{msg}</div>}
      </>
    );
  }

  // ---------------------------------------------------------------- landing
  const best = top.slice(0, 10);
  const chips = top.slice(0, 3);

  return (
    <>
      <section className="hm-hero">
        <div className="hm-hero-copy">
          <span className="hm-eyebrow">{I.sparkle()} Agent-assisted shopping</span>
          <h1>Discover products <em>you'll love</em></h1>
          <p>
            {stores.length || 4} independent stores in one catalogue. Browse it yourself, or
            tell the assistant what you need and let it search, compare and stop at your
            spend limit.
          </p>
          <div className="hm-hero-cta">
            <button className="btn-brand" onClick={() => nav('/chat')}>Ask the assistant →</button>
            <button className="ghost" onClick={() => nav('/stores')}>Browse the stores</button>
          </div>
          <div className="hm-hero-note">
            <b>Test mode.</b> Payments run on Razorpay test keys — no real money moves.
          </div>
        </div>

        {/* Real catalogue rows, not a mock-up: the hero cannot advertise a
            product the store does not actually have. */}
        <div className="hm-stage">
          {/* The arch was a flat gradient. The photograph fills the same
              shape — same border-radius, same box — so the floating price
              chips still sit where they were composed to sit. */}
          <div className="hm-stage-bg">
            <img src={heroShot} alt="" />
          </div>
          {chips.map((p, i) => (
            <button
              key={p.id}
              className={`hm-chip ${['a', 'b', 'c'][i]}`}
              onClick={() => setParams({ q: p.name })}
              title={p.name}
            >
              {p.image ? <img src={p.image} alt="" /> : <span className="sk" style={{ width: 38, height: 38 }} />}
              <span style={{ minWidth: 0 }}>
                <b>{p.name}</b>
                <i>{rupees(p.pricePaise)}</i>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="hm-trust">
        <div><b>Free delivery over ₹499</b><span>On every store here</span></div>
        <div><b>Verified payments</b><span>Razorpay, checked server-side</span></div>
        <div><b>Bounded by your limit</b><span>The agent cannot overspend it</span></div>
        <div><b>Full audit trail</b><span>Every action, with its reason</span></div>
      </div>

      <section className="hm-sec">
        <div className="hm-sec-head">
          <div>
            <h2>Shop by category</h2>
            <p>Everything the four stores stock between them</p>
          </div>
        </div>
        <div className="hm-cats">
          {cats.map((c) => (
            <button key={c.category} className="hm-cat" onClick={() => setParams({ category: c.category })}
              title={`${label(c.category)} — ${c.count} products`}>
              <span className="ring">
                {c.image ? <img src={c.image} alt="" loading="lazy" /> : <b>{label(c.category).slice(0, 1)}</b>}
              </span>
              <span>{label(c.category)}</span>
            </button>
          ))}
          {!cats.length && Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="hm-cat"><span className="ring sk" /></span>
          ))}
        </div>
      </section>

      {stores.length > 0 && (
        <section className="hm-sec">
          <div className="hm-sec-head">
            <div>
              <h2>Shop by store</h2>
              <p>Independent merchants — you always know who you are buying from</p>
            </div>
            <button className="hm-link" onClick={() => nav('/stores')}>All stores {I.chevronRight()}</button>
          </div>
          <div className="st-grid">
            {stores.slice(0, 4).map((s) => (
              <button key={s.slug} className="st-card" onClick={() => nav(`/stores/${s.slug}`)}>
                <div className="st-top">
                  <span className="st-logo">{s.logo || '🏬'}</span>
                  <span style={{ minWidth: 0 }}>
                    <b>{s.storeName}</b>
                    <span>★ {s.rating.toFixed(1)} · {s.productCount} products</span>
                  </span>
                </div>
                <div className="st-tag">{s.tagline}</div>
                <div className="st-stats">
                  <div><b>{s.productCount}</b><span>products</span></div>
                  <div><b>{s.unitsSold}</b><span>sold</span></div>
                  <div><b>★ {s.rating.toFixed(1)}</b><span>rating</span></div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="hm-sec">
        <div className="hm-sec-head">
          <div>
            <h2>Best rated</h2>
            <p>The highest-scoring products across every store</p>
          </div>
        </div>
        <div className="pc-grid">
          {best.map((p) => <ProductCard key={p.id} p={p} carts={carts} onAdd={add} onNotify={setMsg} />)}
          {!best.length && Array.from({ length: 5 }, (_, i) => <div key={i} className="sk sk-card" />)}
        </div>
      </section>

      <div className="hm-deal">
        <div>
          <h3>Not sure what you want? <em>Describe it.</em></h3>
          <p>
            "A cotton shirt under ₹1500" or "something to go with my laptop" — the assistant
            searches the catalogue, explains why it picked what it picked, and asks before it
            spends anything.
          </p>
        </div>
        <button className="btn-brand" onClick={() => nav('/chat')}>Open the assistant</button>
      </div>

      {/* Below the landing furniture: the rows built from this customer's own
          activity. A first-time visitor sees the store; a returning one sees
          their own. */}
      {!rows && <p className="muted">Loading your picks…</p>}
      {rows?.map((row) => (
        <section key={row.key} className="sf-row">
          <div className="sf-row-head">
            <h2>{row.title}</h2>
            <span className="muted">{row.subtitle}</span>
          </div>
          <div className="sf-scroller">
            {row.products.map((p) => <ProductCard key={p.id} p={p} carts={carts} onAdd={add} onNotify={setMsg} />)}
          </div>
        </section>
      ))}
      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
