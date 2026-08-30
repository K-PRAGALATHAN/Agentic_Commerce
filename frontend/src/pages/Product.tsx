import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { I } from '../lib/icons.js';
import { ProductCard, catLabel, toggleWishlist, type CardProduct, type CartOpt } from '../components/ProductCard.js';
import { cartsChanged } from '../lib/cartEvents.js';

// The product page.
//
// The app had none until now: cards added straight to the cart, so nothing ever
// showed a description, a variant list or a second photograph. That also meant
// `POST /catalog/:id/view` was never called by anything, and the two features
// built on it — the "Continue browsing" row and the VIEWED_WITH edges that feed
// cross-sell — were starved of the data they need. This page is where that
// signal comes from.

interface Variant {
  variantId?: string; id?: string; title: string; pricePaise: number;
  stock: number; sku?: string; imageUrl?: string;
}
interface Full extends CardProduct {
  description: string;
  vendor?: string;
  tags?: string[];
  images?: { id: string; url: string }[];
  variants?: Variant[];
}

export function Product() {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const [p, setP] = useState<Full | null>(null);
  const [err, setErr] = useState('');
  const [shot, setShot] = useState(0);
  const [variant, setVariant] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [carts, setCarts] = useState<CartOpt[]>([]);
  const [also, setAlso] = useState<CardProduct[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const say = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 2200); };

  useEffect(() => {
    setP(null); setErr(''); setShot(0); setQty(1); setVariant('');
    api.get<{ product: Full }>(`/catalog/${id}`)
      .then((r) => {
        setP(r.product);
        const vs = r.product.variants ?? [];
        // Default to the first variant that can actually be bought — landing on
        // a sold-out size and finding the button disabled reads as a broken page.
        const first = vs.find((v) => v.stock > 0) ?? vs[0];
        if (first) setVariant((first.variantId ?? first.id)!);
      })
      .catch((e) => setErr(e.message));

    // Telemetry, deliberately unawaited: a failed view must never delay or break
    // the page the customer is trying to read.
    api.post(`/catalog/${id}/view`).catch(() => {});
    api.get<{ carts: CartOpt[] }>('/carts').then((r) => setCarts(r.carts)).catch(() => {});
    // Returns [] whenever nothing clears the relevance bar — that is a real
    // answer, and the section simply does not render.
    api.get<{ crossSell: (CardProduct & { reason?: string })[] }>(`/catalog/${id}/cross-sell`)
      .then((r) => setAlso(r.crossSell ?? []))
      .catch(() => setAlso([]));
  }, [id]);

  if (err) {
    return (
      <>
        <div className="sp-page-head"><div><h1>Product not found</h1></div></div>
        <p className="muted">{err}</p>
        <button className="ghost" onClick={() => nav('/')}>← Back to the shop</button>
      </>
    );
  }
  if (!p) {
    return (
      <div className="pd">
        <div className="sk" style={{ height: 420 }} />
        <div>
          <div className="sk" style={{ height: 26, width: '60%', marginBottom: 12 }} />
          <div className="sk" style={{ height: 90 }} />
        </div>
      </div>
    );
  }

  const gallery = (p.images?.length ? p.images.map((i) => i.url) : [p.image]).filter(Boolean);
  const vs = p.variants ?? [];
  const chosen = vs.find((v) => (v.variantId ?? v.id) === variant);
  const price = chosen?.pricePaise ?? p.pricePaise;
  const stock = chosen?.stock ?? p.stock ?? 0;
  const off = p.compareAtPaise && p.compareAtPaise > price
    ? Math.round(((p.compareAtPaise - price) / p.compareAtPaise) * 100) : 0;
  // A lone "Default" variant is a storage detail, not a choice — showing it as a
  // one-option picker asks the customer to decide something they cannot.
  const realChoice = vs.length > 1;

  async function add(then?: 'cart') {
    setBusy(true);
    try {
      await api.post('/cart/items', variant ? { variantId: variant, qty } : { productId: p!.id, qty });
      cartsChanged();
      if (then === 'cart') nav('/cart');
      else say(`Added ${qty} × “${p!.name}” to your cart`);
    } catch (e: any) { say(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <nav className="pd-crumbs">
        <button onClick={() => nav('/')}>Shop</button>
        <span>/</span>
        <button onClick={() => nav(`/?category=${encodeURIComponent(p.category)}`)}>{catLabel(p.category)}</button>
        <span>/</span>
        <b>{p.name}</b>
      </nav>

      <div className="pd">
        {/* ---------------- gallery ---------------- */}
        <div>
          <div className="pd-stage">
            {gallery[shot]
              ? <img src={gallery[shot]} alt={p.name} />
              : <div className="pc-noimg" style={{ height: '100%' }} />}
            {off > 0 && <span className="pc-off">{off}% off</span>}
            {gallery.length > 1 && (
              <>
                <button className="pd-arrow l" aria-label="Previous image"
                  onClick={() => setShot((s) => (s - 1 + gallery.length) % gallery.length)}>{I.left()}</button>
                <button className="pd-arrow r" aria-label="Next image"
                  onClick={() => setShot((s) => (s + 1) % gallery.length)}>{I.right()}</button>
              </>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="pd-thumbs">
              {gallery.map((u, i) => (
                <button key={u + i} className={i === shot ? 'on' : ''} onClick={() => setShot(i)}
                  aria-label={`Image ${i + 1}`}>
                  <img src={u} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------------- detail ---------------- */}
        <div className="pd-info">
          <div className="pd-cat">{catLabel(p.category)}</div>

          <div className="pd-title">
            <h1>{p.name}</h1>
            <span className={`pd-stock ${stock > 0 ? '' : 'no'}`}>
              {stock > 0 ? `In stock` : 'Out of stock'}
            </span>
          </div>

          <div className="pd-rate">
            <span className="pd-stars">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < Math.round(p.rating) ? 'on' : ''}>{I.star()}</span>
              ))}
            </span>
            <b>{Number(p.rating).toFixed(1)}</b>
            {/* No review count: this store has no reviews table, and inventing
                "(245 reviews)" would be a lie printed next to a real number. */}
            <span className="muted">rating</span>
            {p.sellerName && (
              <button className="pd-seller" onClick={() => p.sellerSlug && nav(`/stores/${p.sellerSlug}`)}>
                Sold by <b>{p.sellerName}</b>
              </button>
            )}
          </div>

          <div className="pd-price">
            <b>{rupees(price)}</b>
            {off > 0 && <s>{rupees(p.compareAtPaise!)}</s>}
            {off > 0 && <span className="pd-save">Save {off}%</span>}
          </div>

          {p.description && <p className="pd-desc">{p.description}</p>}

          {realChoice && (
            <div className="pd-opts">
              <label>Options</label>
              <div className="pd-chips">
                {vs.map((v) => {
                  const vid = (v.variantId ?? v.id)!;
                  return (
                    <button
                      key={vid}
                      className={`pd-chip ${vid === variant ? 'on' : ''}`}
                      disabled={v.stock <= 0}
                      title={v.stock <= 0 ? 'Sold out' : `${v.title} — ${rupees(v.pricePaise)}`}
                      onClick={() => { setVariant(vid); setQty(1); }}
                    >
                      {v.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pd-buy">
            <div className="pd-qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1} aria-label="Fewer">{I.minus()}</button>
              <input
                value={qty}
                inputMode="numeric"
                aria-label="Quantity"
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  // Clamped to what is actually on the shelf, so the cart never
                  // holds a quantity the checkout will reject.
                  setQty(Number.isFinite(n) ? Math.min(Math.max(n, 1), Math.max(stock, 1)) : 1);
                }}
              />
              <button onClick={() => setQty((q) => Math.min(q + 1, Math.max(stock, 1)))}
                disabled={qty >= stock} aria-label="More">{I.plus()}</button>
            </div>
            <button className="pd-add" disabled={busy || stock <= 0} onClick={() => add()}>
              {I.cartSm()} Add to cart
            </button>
            <button className="pd-buy-now" disabled={busy || stock <= 0} onClick={() => add('cart')}>
              Buy now
            </button>
            <button
              className="pd-heart"
              title="Save to wishlist"
              aria-label="Save to wishlist"
              onClick={async () => { try { say(await toggleWishlist(p)); } catch (e: any) { say(e.message); } }}
            >
              {I.heart()}
            </button>
          </div>

          <div className="pd-meta">
            {chosen?.sku && <div><span>SKU</span> <code>{chosen.sku}</code></div>}
            {p.vendor && <div><span>Brand</span> {p.vendor}</div>}
            {!!p.tags?.length && (
              <div><span>Tags</span> {p.tags.map((t) => <em key={t}>{t}</em>)}</div>
            )}
            <div>
              <span>Share</span>
              <button className="pd-share" onClick={() => {
                navigator.clipboard?.writeText(window.location.href)
                  .then(() => say('Link copied'))
                  .catch(() => say(window.location.href));
              }}>{I.link()} Copy link</button>
            </div>
          </div>

          <div className="pd-trust">
            <div>{I.truck()}<span><b>Free delivery</b>on orders over ₹499</span></div>
            <div>{I.shield()}<span><b>Verified payment</b>checked server-side</span></div>
            <div>{I.refresh()}<span><b>30-day returns</b>on every store here</span></div>
          </div>
        </div>
      </div>

      {also.length > 0 && (
        <section className="hm-sec" style={{ marginTop: 32 }}>
          <div className="hm-sec-head">
            <div>
              <h2>Goes well with this</h2>
              <p>Based on what people actually buy together</p>
            </div>
          </div>
          <div className="pc-grid">
            {also.slice(0, 5).map((s) => (
              <ProductCard key={s.id} p={s} carts={carts} onNotify={say}
                onAdd={async (x) => {
                  try { await api.post('/cart/items', { productId: x.id, qty: 1 }); cartsChanged(); say(`Added “${x.name}”`); }
                  catch (e: any) { say(e.message); }
                }} />
            ))}
          </div>
        </section>
      )}

      {msg && <div className="toast">{msg}</div>}
    </>
  );
}
