import { query } from '../adapters/db/pool.js';
import { fetchProducts } from '../adapters/catalog/source.js';
import { Money } from '../domain/money.js';
import type { Product } from '../domain/types.js';
import { HttpError } from './auth.js';

function mapRow(r: any): Product {
  return {
    id: r.id,
    sourceId: r.source_id,
    merchantId: r.merchant_id,
    name: r.name,
    description: r.description,
    pricePaise: Number(r.price_paise),
    stock: r.stock,
    category: r.category,
    rating: Number(r.rating),
    image: r.image,
    createdAt: r.created_at,
  };
}

export interface CatalogFilter {
  q?: string;
  category?: string;
  maxPaise?: number;
  limit?: number;
}

// The ONE read path. Agents + storefront use only this; source is hidden.
export async function getCatalog(f: CatalogFilter = {}): Promise<Product[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`name ILIKE $${params.length}`);
  }
  if (f.category) {
    params.push(f.category);
    where.push(`category = $${params.length}`);
  }
  if (typeof f.maxPaise === 'number') {
    params.push(f.maxPaise);
    where.push(`price_paise <= $${params.length}`);
  }
  params.push(f.limit ?? 100);
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY rating DESC, created_at DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return rows.map(mapRow);
}

export async function getProduct(id: string): Promise<Product> {
  const { rows } = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (!rows.length) throw new HttpError(404, 'no such product');
  return mapRow(rows[0]);
}

// Door 1 — internet fetch (seed). Upserts on source_id so re-syncs are idempotent.
export async function syncCatalog(): Promise<{ synced: number }> {
  const products = await fetchProducts();
  for (const p of products) {
    await query(
      `INSERT INTO products(source_id, name, description, price_paise, stock, category, rating, image)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (source_id) WHERE source_id IS NOT NULL DO UPDATE SET
         name=EXCLUDED.name, price_paise=EXCLUDED.price_paise, stock=EXCLUDED.stock,
         category=EXCLUDED.category, rating=EXCLUDED.rating, image=EXCLUDED.image`,
      [p.sourceId, p.name, p.description, p.pricePaise, p.stock, p.category, p.rating, p.image],
    );
  }
  return { synced: products.length };
}

// Door 2 — merchant admin CRUD. Price comes in as RUPEES from the form; stored as paise.
export interface ProductInput {
  name: string;
  description?: string;
  priceRupees: number;
  stock: number;
  category?: string;
  image?: string;
}

export async function createProduct(merchantId: string, input: ProductInput): Promise<Product> {
  const pricePaise = Money.fromRupees(input.priceRupees);
  const { rows } = await query(
    `INSERT INTO products(merchant_id, name, description, price_paise, stock, category, image)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [merchantId, input.name, input.description ?? '', pricePaise, input.stock, input.category ?? 'general', input.image ?? ''],
  );
  return mapRow(rows[0]);
}

export async function updateProduct(merchantId: string, id: string, input: ProductInput): Promise<Product> {
  const pricePaise = Money.fromRupees(input.priceRupees);
  const { rows } = await query(
    `UPDATE products SET name=$1, description=$2, price_paise=$3, stock=$4, category=$5, image=$6
     WHERE id=$7 AND merchant_id=$8 RETURNING *`,
    [input.name, input.description ?? '', pricePaise, input.stock, input.category ?? 'general', input.image ?? '', id, merchantId],
  );
  if (!rows.length) throw new HttpError(404, 'product not found or not owned by you');
  return mapRow(rows[0]);
}

export async function deleteProduct(merchantId: string, id: string): Promise<void> {
  const res = await query('DELETE FROM products WHERE id=$1 AND merchant_id=$2', [id, merchantId]);
  if (!res.rowCount) throw new HttpError(404, 'product not found or not owned by you');
}

export async function listOwnProducts(merchantId: string): Promise<Product[]> {
  const { rows } = await query('SELECT * FROM products WHERE merchant_id=$1 ORDER BY created_at DESC', [merchantId]);
  return rows.map(mapRow);
}
