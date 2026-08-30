import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, rupees } from '../lib/api.js';
import { I } from '../lib/icons.js';

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

// A wishlist is not a new concept here — it is a named cart, which the multi-cart
// work already supports end to end (the assistant can read it, and it can be
// checked out). Inventing a separate table for it would have been the wrong
// instinct: a saved list of things you might buy IS a cart.
export const WISHLIST = 'Wishlist';

export async function toggleWishlist(p: CardProduct): Promise<string> {
  const { carts } = await api.get<{ carts: CartOpt[] }>('/carts');
  let list = carts.find((c) => c.name.toLowerCase() === WISHLIST.toLowerCase());
  if (!list) list = (await api.post<{ cart: CartOpt }>('/carts', { name: WISHLIST })).cart;
  await api.post('/cart/items', { productId: p.id, qty: 1, cartId: list.id });
  return `Saved “${p.name}” to your wishlist`;
}

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
  const [saved, setSaved] = useState(false);

  const off = p.compareAtPaise && p.compareAtPaise > p.pricePaise
    ? Math.round(((p.compareAtPaise - p.pricePaise) / p.compareAtPaise) * 100)
    : 0;
  const out = p.stock !== undefined && p.stock <= 0;
  const open = () => (onOpen ? onOpen(p) : nav(`/product/${p.id}`));

  async function save(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const msg = await toggleWishlist(p);
      setSaved(true);
      onNotify?.(msg);
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
            title={saved ? 'Saved to your wishlist' : 'Save to wishlist'}
            aria-label="Save to wishlist"
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
