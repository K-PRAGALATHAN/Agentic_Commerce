import { api } from './api.js';
import { cartsChanged, onCartsChanged } from './cartEvents.js';

// The wishlist.
//
// It is a named cart, not a new concept — the multi-cart work already stores,
// lists and checks those out, and a saved list of things you might buy IS a
// cart. What was missing was the other half of the verb: the heart could add and
// nothing could remove, and no screen knew whether an item was already saved, so
// the icon showed "saved" only for the session in which you clicked it.
//
// Membership is held here rather than fetched per card. Twenty product cards
// each asking the server whether they are in the wishlist is twenty requests to
// answer one question.

export const WISHLIST = 'Wishlist';

interface Cart { id: string; name: string; isDefault: boolean }
interface Item { productId: string; variantId: string }

// productId -> variantId, because removing needs the variant and the caller
// only ever knows the product.
let membership = new Map<string, string>();
let loaded = false;
let inflight: Promise<void> | null = null;

const listeners = new Set<() => void>();
const announce = () => listeners.forEach((fn) => fn());

export function onWishlistChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// Anything that moves a cart may have moved this one — the assistant included.
onCartsChanged(() => { loaded = false; void refresh(); });

async function findCart(): Promise<Cart | undefined> {
  const { carts } = await api.get<{ carts: Cart[] }>('/carts');
  return carts.find((c) => c.name.toLowerCase() === WISHLIST.toLowerCase());
}

export async function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const cart = await findCart();
      const next = new Map<string, string>();
      if (cart) {
        const r = await api.get<{ cart: { items: Item[] } }>(`/cart?cartId=${cart.id}`);
        for (const i of r.cart.items ?? []) next.set(i.productId, i.variantId);
      }
      membership = next;
      loaded = true;
      announce();
    } catch {
      // A wishlist that cannot be read is not worth breaking a page over; the
      // heart simply shows unsaved until the next attempt succeeds.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function isSaved(productId: string): boolean {
  return membership.has(productId);
}

/** Load once, the first time any card asks. */
export function ensureLoaded(): void {
  if (!loaded && !inflight) void refresh();
}

/**
 * Add if absent, remove if present. Returns what to tell the customer.
 *
 * The membership map is updated before the request settles so the heart flips
 * immediately — a save that takes a round trip to show up feels broken. A
 * failure re-reads the truth and puts it back.
 */
export async function toggleWishlist(p: { id: string; name: string }): Promise<string> {
  const variantId = membership.get(p.id);

  if (variantId) {
    membership.delete(p.id);
    announce();
    try {
      const cart = await findCart();
      if (cart) await api.del(`/cart/items/${variantId}?cartId=${cart.id}`);
      cartsChanged();
      return `Removed “${p.name}” from your wishlist`;
    } catch (e: any) {
      await refresh();
      throw e;
    }
  }

  membership.set(p.id, 'pending');
  announce();
  try {
    let cart = await findCart();
    if (!cart) cart = (await api.post<{ cart: Cart }>('/carts', { name: WISHLIST })).cart;
    await api.post('/cart/items', { productId: p.id, qty: 1, cartId: cart.id });
    // Re-read so the map holds the real variant id, which is what a later
    // removal needs. The optimistic 'pending' above only gets the icon right.
    await refresh();
    cartsChanged();
    return `Saved “${p.name}” to your wishlist`;
  } catch (e: any) {
    await refresh();
    throw e;
  }
}
