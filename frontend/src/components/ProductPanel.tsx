import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { I } from '../lib/icons.js';
import { catLabel, type CardProduct } from './ProductCard.js';
import { ensureLoaded, isSaved, onWishlistChanged, toggleWishlist } from '../lib/wishlist.js';
import { cartsChanged } from '../lib/cartEvents.js';
import { runCheckout } from '../lib/checkout.js';

// A product, opened from the assistant, shown in the right rail.
//
// It used to take over the centre, which meant tapping a product hid the
// conversation that produced it — you could no longer read what the assistant
// had said about the thing you were looking at. The rail is where secondary
// detail belongs in this shell (account and activity already open here), so the
// chat stays visible beside it.
//
// The card in the chat carries only what a card needs. This fetches the full
// record, so the description, the gallery and the variants are real rather than
// whatever happened to be in the search payload.

interface Variant {
  id?: string; variantId?: string; title: string;
  pricePaise: number; stock: number; sku?: string;
}
interface Full extends CardProduct {
  description?: string;
  vendor?: string;
  images?: { id: string; url: string }[];
  variants?: Variant[];
}

interface Props {
  product: CardProduct;
  onClose: () => void;
  onCartChanged: () => void;
  notify: (text: string) => void;
}

export function ProductPanel({ product, onClose, onCartChanged, notify }: Props) {
  const nav = useNavigate();
  const [p, setP] = useState<Full>(product);
  const [shot, setShot] = useState(0);
  const [variant, setVariant] = useState('');
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setP(product); setShot(0); setQty(1); setVariant('');
    let live = true;
    api.get<{ product: Full }>(`/catalog/${product.id}`)
      .then((r) => {
        if (!live) return;
        setP(r.product);
        const vs = r.product.variants ?? [];
        const first = vs.find((v) => v.stock > 0) ?? vs[0];
        if (first) setVariant((first.variantId ?? first.id)!);
      })
      .catch(() => { /* the card's own data is enough to render something */ });
    // Viewing from the assistant counts as a view, exactly as it does on the
    // product page — it is the same signal feeding the same two features.
    api.post(`/catalog/${product.id}/view`).catch(() => {});
    ensureLoaded();
    setSaved(isSaved(product.id));
    const off = onWishlistChanged(() => setSaved(isSaved(product.id)));
    return () => { live = false; off(); };
  }, [product.id]);

  const gallery = (p.images?.length ? p.images.map((i) => i.url) : [p.image]).filter(Boolean);
  const vs = p.variants ?? [];
  const chosen = vs.find((v) => (v.variantId ?? v.id) === variant);
  const price = chosen?.pricePaise ?? p.pricePaise;
  const stock = chosen?.stock ?? p.stock ?? 0;
  const off = p.compareAtPaise && p.compareAtPaise > price
    ? Math.round(((p.compareAtPaise - price) / p.compareAtPaise) * 100) : 0;

  async function add(then?: 'pay') {
    setBusy(true);
    try {
      await api.post('/cart/items', variant ? { variantId: variant, qty } : { productId: p.id, qty });
      cartsChanged();
      onCartChanged();
      if (then === 'pay') {
        // The same guarded checkout the chat uses. A gated result is reported
        // rather than overridden here — the rail has no authority the rest of
        // the app does not.
        const r = await runCheckout(false, notify, onCartChanged);
        if (r.gated) notify(`Over your spend limit of ${rupees(r.gated.effectiveLimitPaise)} — confirm in the chat.`);
      } else {
        notify(`Added ${qty} × “${p.name}” to your cart`);
      }
    } catch (e: any) { notify(e.message); } finally { setBusy(false); }
  }

  return (
    <aside className="sp-rail pp">
      <div className="sp-rail-head">
        <span className="sp-rail-title">Product</span>
        <button className="sp-rail-btn" onClick={onClose} title="Close" aria-label="Close panel">{I.close()}</button>
      </div>

      <div className="sp-panel-body">
        <div className="pd-stage pp-stage">
          {gallery[shot] ? <img src={gallery[shot]} alt={p.name} /> : <div className="pc-noimg" />}
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
          <div className="pd-thumbs pp-thumbs">
            {gallery.map((u, i) => (
              <button key={u + i} className={i === shot ? 'on' : ''}
                onClick={() => setShot(i)} aria-label={`Image ${i + 1}`}>
                <img src={u} alt="" />
              </button>
            ))}
          </div>
        )}

        <div className="pd-cat">{catLabel(p.category)}</div>

        <div className="pd-title">
          <h1>{p.name}</h1>
          <span className={`pd-stock ${stock > 0 ? '' : 'no'}`}>
            {stock > 0 ? 'In stock' : 'Out of stock'}
          </span>
        </div>

        <div className="pd-rate">
          <span className="pd-stars">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={i < Math.round(p.rating) ? 'on' : ''}>{I.star()}</span>
            ))}
          </span>
          <b>{Number(p.rating).toFixed(1)}</b>
          {p.sellerName && (
            <button className="pd-seller" onClick={() => p.sellerSlug && nav(`/stores/${p.sellerSlug}`)}>
              Sold by <b>{p.sellerName}</b>
            </button>
          )}
        </div>

        <div className="pd-price">
          <b>{rupees(price)}</b>
          {off > 0 && <s>{rupees(p.compareAtPaise!)}</s>}
        </div>

        {p.description && <p className="pd-desc">{p.description}</p>}

        {vs.length > 1 && (
          <div className="pd-opts">
            <label>Options</label>
            <div className="pd-chips">
              {vs.map((v) => {
                const vid = (v.variantId ?? v.id)!;
                return (
                  <button key={vid} className={`pd-chip ${vid === variant ? 'on' : ''}`}
                    disabled={v.stock <= 0}
                    title={v.stock <= 0 ? 'Sold out' : `${v.title} — ${rupees(v.pricePaise)}`}
                    onClick={() => { setVariant(vid); setQty(1); }}>
                    {v.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="pd-buy pp-buy">
          <div className="pd-qty">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1} aria-label="Fewer">{I.minus()}</button>
            <input value={qty} readOnly aria-label="Quantity" />
            <button onClick={() => setQty((q) => Math.min(q + 1, Math.max(stock, 1)))}
              disabled={qty >= stock} aria-label="More">{I.plus()}</button>
          </div>
          <button className="pd-add" disabled={busy || stock <= 0} onClick={() => add()}>
            {I.cartSm()} Add to cart
          </button>
          <button className="pd-buy-now" disabled={busy || stock <= 0} onClick={() => add('pay')}>
            Buy now
          </button>
          <button className={`pd-heart ${saved ? 'on' : ''}`}
            title={saved ? 'Remove from your wishlist' : 'Save to wishlist'}
            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-pressed={saved}
            onClick={async () => { try { notify(await toggleWishlist(p)); } catch (e: any) { notify(e.message); } }}>
            {saved ? I.heartOn() : I.heart()}
          </button>
        </div>

        <div className="pd-meta">
          {chosen?.sku && <div><span>SKU</span> <code>{chosen.sku}</code></div>}
          {p.vendor && <div><span>Brand</span> {p.vendor}</div>}
        </div>

        <button className="pp-full" onClick={() => { nav(`/product/${p.id}`); onClose(); }}>
          Open the full page {I.chevronRight()}
        </button>
      </div>
    </aside>
  );
}
