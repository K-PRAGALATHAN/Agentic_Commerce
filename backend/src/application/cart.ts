import { query, withTransaction } from '../adapters/db/pool.js';
import type { Cart, CartItem } from '../domain/types.js';
import { defaultVariantId, getVariant } from './catalog.js';
import { HttpError } from './auth.js';

// Multiple carts per user, with one universal default.
//
// Everything lands in the universal cart unless a specific cart is named — so a
// customer who never thinks about carts sees exactly the old single-cart
// behaviour, while "put this in my gift list" is now expressible.

async function ensureDefaultCart(userId: string): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM carts WHERE user_id=$1 AND status='active' AND is_default LIMIT 1`,
    [userId],
  );
  if (existing.rows.length) return existing.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO carts(user_id, name, is_default) VALUES ($1,'Universal cart',true) RETURNING id`,
    [userId],
  );
  return created.rows[0].id;
}

// Resolve which cart a request means: the one named, or the universal default.
// Also the ownership check — a cart id from another user must never resolve.
async function resolveCart(userId: string, cartId?: string): Promise<string> {
  if (!cartId) return ensureDefaultCart(userId);
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM carts WHERE id=$1 AND user_id=$2 AND status='active'`,
    [cartId, userId],
  );
  if (!rows.length) throw new HttpError(404, 'no such cart');
  return rows[0].id;
}

export interface CartSummary {
  id: string;
  name: string;
  isDefault: boolean;
  itemCount: number;
  totalPaise: number;
}

export async function listCarts(userId: string): Promise<CartSummary[]> {
  await ensureDefaultCart(userId);
  const { rows } = await query<any>(
    `SELECT c.id, c.name, c.is_default,
            COALESCE(SUM(ci.qty), 0)                       AS item_count,
            COALESCE(SUM(ci.qty * ci.price_paise), 0)      AS total
       FROM carts c LEFT JOIN cart_items ci ON ci.cart_id = c.id
      WHERE c.user_id = $1 AND c.status = 'active'
      GROUP BY c.id, c.name, c.is_default
      ORDER BY c.is_default DESC, c.created_at`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, isDefault: r.is_default,
    itemCount: Number(r.item_count), totalPaise: Number(r.total),
  }));
}

export async function createCart(userId: string, name: string): Promise<CartSummary> {
  const clean = name.trim().slice(0, 60) || 'New cart';
  const { rows } = await query<{ id: string }>(
    `INSERT INTO carts(user_id, name, is_default) VALUES ($1,$2,false) RETURNING id`,
    [userId, clean],
  );
  return { id: rows[0].id, name: clean, isDefault: false, itemCount: 0, totalPaise: 0 };
}

export async function renameCart(userId: string, cartId: string, name: string): Promise<void> {
  const res = await query(
    `UPDATE carts SET name=$1 WHERE id=$2 AND user_id=$3 AND status='active'`,
    [name.trim().slice(0, 60) || 'Cart', cartId, userId],
  );
  if (!res.rowCount) throw new HttpError(404, 'no such cart');
}

export async function deleteCart(userId: string, cartId: string): Promise<void> {
  const { rows } = await query<{ is_default: boolean }>(
    `SELECT is_default FROM carts WHERE id=$1 AND user_id=$2`, [cartId, userId],
  );
  if (!rows.length) throw new HttpError(404, 'no such cart');
  // The universal cart is where un-targeted items go, so it must always exist.
  if (rows[0].is_default) throw new HttpError(400, 'the universal cart cannot be deleted');
  await query('DELETE FROM carts WHERE id=$1', [cartId]);
}

export async function getCart(userId: string, cartId?: string): Promise<Cart> {
  const id = await resolveCart(userId, cartId);
  const { rows } = await query<any>(
    `SELECT ci.product_id, ci.variant_id, ci.qty, ci.price_paise,
            p.name, p.image, v.title AS variant_title, v.image_url,
            c.name AS cart_name, c.is_default
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = ci.product_id
       JOIN carts c ON c.id = ci.cart_id
      WHERE ci.cart_id = $1`,
    [id],
  );
  const items: CartItem[] = rows.map((r) => ({
    productId: r.product_id,
    variantId: r.variant_id,
    variantTitle: r.variant_title,
    name: r.name,
    image: r.image_url || r.image,
    qty: r.qty,
    pricePaise: Number(r.price_paise),
  }));
  const meta = await query<any>('SELECT name, is_default FROM carts WHERE id=$1', [id]);
  const totalPaise = items.reduce((sum, i) => sum + i.pricePaise * i.qty, 0);
  return {
    id, userId, items, totalPaise,
    name: meta.rows[0]?.name ?? 'Universal cart',
    isDefault: meta.rows[0]?.is_default ?? true,
  };
}

// Add by VARIANT. A caller that only knows a product id (the storefront grid,
// the agent's quick add) resolves the default variant first.
export async function addItem(
  userId: string,
  ref: { productId?: string; variantId?: string; cartId?: string },
  qty = 1,
): Promise<Cart> {
  const variantId = ref.variantId ?? (await defaultVariantId(ref.productId!));
  const variant = await getVariant(variantId); // throws 404 if missing
  const cartId = await resolveCart(userId, ref.cartId);
  // Price is captured at add time from the VARIANT — a later price change must
  // not silently rewrite what someone already put in their cart.
  await query(
    `INSERT INTO cart_items(cart_id, product_id, variant_id, qty, price_paise)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty`,
    [cartId, variant.productId, variantId, qty, variant.pricePaise],
  );
  return getCart(userId, cartId);
}

export async function removeItem(userId: string, variantId: string, cartId?: string): Promise<Cart> {
  const id = await resolveCart(userId, cartId);
  await query('DELETE FROM cart_items WHERE cart_id=$1 AND variant_id=$2', [id, variantId]);
  return getCart(userId, id);
}

// Move one line between carts, keeping the price captured when it was added.
export async function moveItem(
  userId: string,
  variantId: string,
  fromCartId: string | undefined,
  toCartId: string,
): Promise<Cart> {
  const from = await resolveCart(userId, fromCartId);
  const to = await resolveCart(userId, toCartId);
  if (from === to) return getCart(userId, to);
  await withTransaction(async (client) => {
    const line = await client.query(
      'SELECT product_id, qty, price_paise FROM cart_items WHERE cart_id=$1 AND variant_id=$2',
      [from, variantId],
    );
    if (!line.rowCount) throw new HttpError(404, 'that item is not in the source cart');
    const l = line.rows[0];
    await client.query(
      `INSERT INTO cart_items(cart_id, product_id, variant_id, qty, price_paise)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (cart_id, variant_id) DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty`,
      [to, l.product_id, variantId, l.qty, l.price_paise],
    );
    await client.query('DELETE FROM cart_items WHERE cart_id=$1 AND variant_id=$2', [from, variantId]);
  });
  return getCart(userId, to);
}

// Called after a verified payment. Only the cart that was bought is closed —
// the customer's other carts survive, which is the point of having them.
export async function clearCart(userId: string, cartId?: string): Promise<void> {
  const id = await resolveCart(userId, cartId);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM cart_items WHERE cart_id=$1', [id]);
    const isDefault = await client.query('SELECT is_default FROM carts WHERE id=$1', [id]);
    if (isDefault.rows[0]?.is_default) {
      // Keep the universal cart alive and empty; closing it would orphan the
      // unique-default index and force a new one on the next add.
      return;
    }
    await client.query(`UPDATE carts SET status='ordered' WHERE id=$1`, [id]);
  });
}
