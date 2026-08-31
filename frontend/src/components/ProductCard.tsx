import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { I } from '../lib/icons.js';
import { ensureLoaded, isSaved, onWishlistChanged, toggleWishlist } from '../lib/wishlist.js';

// One product card, used by the storefront, the search results and every store
// page. It was duplicated across three files before this; the discount maths and
// the seller line drifted between copies, which is exactly the kind of thing a
// shared component exists to stop.

export interface CardProduct {
  id: string;
  name: string;
  pricePaise: number;
  category: string;
  rating: number;
  image: string;
  stock?: number;
  compareAtPaise?: number | null;
  sellerName?: string;
  sellerSlug?: string;
}

export interface CartOpt { id: string; name: string; isDefault: boolean; }

export const catLabel = (c: string) =>
  (c || '').replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

// The wishlist lives in lib/wishlist.ts, which owns membership for the whole
// app. It used to be a local add-only helper here, which is why nothing could
// unsave and why the heart forgot what was saved the moment you reloaded.
export { toggleWishlist } from '../lib/wishlist.js';

interface Props {
  p: CardProduct;
  carts?: CartOpt[];
  onAdd: (p: CardProduct, cartId?: string) => void;
  onNotify?: (msg: string) => void;
  // Opening a product normally means navigating to its page. Inside the
  // assistant panel that would throw away the conversation, so the chat passes
  // its own handler and shows the detail in place.
  onOpen?: (p: CardProduct) => void;
}

export function ProductCard({ p, carts = [], onAdd, onNotify, onOpen }: Props) {
  const nav = useNavigate();
  const [pick, setPick] = useState(false);
  // Read from the shared map, not local state, so a product saved on the
  // product page shows as saved on the card behind it.
  const [saved, setSaved] = useState(() => isSaved(p.id));
  useEffect(() => {
    ensureLoaded();
    setSaved(isSaved(p.id));
    return onWishlistChanged(() => setSaved(isSaved(p.id)));
  }, [p.id]);

  const off = p.compareAtPaise && p.compareAtPaise > p.pricePaise
    ? Math.round(((p.compareAtPaise - p.pricePaise) / p.compareAtPaise) * 100)
    : 0;
  const out = p.stock !== undefined && p.stock <= 0;
  const open = () => (onOpen ? onOpen(p) : nav(`/product/${p.id}`));

  async function save(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      onNotify?.(await toggleWishlist(p));
    } catch (err: any) { onNotify?.(err.message); }
  }

  return (
    <article className={`pc ${out ? 'out' : ''}`} onClick={open}>
      <div className="pc-media">
        {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="pc-noimg" />}

        {off > 0 && <span className="pc-off">{off}% off</span>}
        {out && <span className="pc-oos">Out of stock</span>}

        {/* Stacked on the right, the way every storefront in the references does
            it. They are real actions, not decoration: the heart writes to a
            wishlist cart and the eye opens the product. */}
        <div className="pc-acts">
          <button
            className={`pc-act ${saved ? 'on' : ''}`}
            onClick={save}
            title={saved ? 'Remove from your wishlist' : 'Save to wishlist'}
            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            aria-pressed={saved}
          >
            {saved ? I.heartOn() : I.heart()}
          </button>
          <button
            className="pc-act"
            onClick={(e) => { e.stopPropagation(); open(); }}
            title="View details"
            aria-label="View details"
          >
            {I.eye()}
          </button>
        </div>
      </div>

      <div className="pc-body">
        <div className="pc-cat">{catLabel(p.category)}</div>

        <div className="pc-head">
          <h3 title={p.name}>{p.name}</h3>
          <span className="pc-rate">{I.star()} {Number(p.rating).toFixed(1)}</span>
        </div>

        {/* Who takes the money. On a marketplace that belongs beside the price. */}
        {p.sellerName && (
          <span
            className="pc-seller"
            title={`Sold by ${p.sellerName}`}
            onClick={(e) => { e.stopPropagation(); if (p.sellerSlug) nav(`/stores/${p.sellerSlug}`); }}
          >
            {p.sellerName}
          </span>
        )}

        <div className="pc-price">
          <b>{rupees(p.pricePaise)}</b>
          {off > 0 && <s>{rupees(p.compareAtPaise!)}</s>}
        </div>

        {carts.length > 1 && pick ? (
          <select
            autoFocus
            defaultValue=""
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { if (e.target.value) { onAdd(p, e.target.value); setPick(false); } }}
            onBlur={() => setPick(false)}
          >
            <option value="" disabled>Add to which cart?</option>
            {carts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <button
            className="pc-add"
            disabled={out}
            onClick={(e) => { e.stopPropagation(); carts.length > 1 ? setPick(true) : onAdd(p); }}
          >
            {out ? 'Out of stock' : 'Add to cart'}
          </button>
        )}
      </div>
    </article>
  );
}
