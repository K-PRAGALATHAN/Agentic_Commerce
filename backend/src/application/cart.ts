import { query, withTransaction } from '../adapters/db/pool.js';
import type { Cart, CartItem } from '../domain/types.js';
import { getProduct } from './catalog.js';

async function ensureCart(userId: string): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM carts WHERE user_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (existing.rows.length) return existing.rows[0].id;
  const created = await query<{ id: string }>('INSERT INTO carts(user_id) VALUES ($1) RETURNING id', [userId]);
  return created.rows[0].id;
}

export async function getCart(userId: string): Promise<Cart> {
  const cartId = await ensureCart(userId);
  const { rows } = await query<any>(
    `SELECT ci.product_id, p.name, ci.qty, ci.price_paise
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
      WHERE ci.cart_id = $1`,
    [cartId],
  );
  const items: CartItem[] = rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    qty: r.qty,
    pricePaise: Number(r.price_paise),
  }));
  const totalPaise = items.reduce((sum, i) => sum + i.pricePaise * i.qty, 0);
  return { id: cartId, userId, items, totalPaise };
}

export async function addItem(userId: string, productId: string, qty = 1): Promise<Cart> {
  const product = await getProduct(productId); // throws 404 if missing
  const cartId = await ensureCart(userId);
  await query(
    `INSERT INTO cart_items(cart_id, product_id, qty, price_paise)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (cart_id, product_id) DO UPDATE SET qty = cart_items.qty + EXCLUDED.qty`,
    [cartId, productId, qty, product.pricePaise],
  );
  return getCart(userId);
}

export async function removeItem(userId: string, productId: string): Promise<Cart> {
  const cartId = await ensureCart(userId);
  await query('DELETE FROM cart_items WHERE cart_id=$1 AND product_id=$2', [cartId, productId]);
  return getCart(userId);
}

export async function clearCart(userId: string): Promise<void> {
  await withTransaction(async (client) => {
    const cart = await client.query(
      `SELECT id FROM carts WHERE user_id=$1 AND status='active'`,
      [userId],
    );
    for (const row of cart.rows) {
      await client.query('DELETE FROM cart_items WHERE cart_id=$1', [row.id]);
      await client.query(`UPDATE carts SET status='ordered' WHERE id=$1`, [row.id]);
    }
  });
}
