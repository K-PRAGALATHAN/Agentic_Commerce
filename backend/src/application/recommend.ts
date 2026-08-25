import { query } from '../adapters/db/pool.js';
import type { Product } from '../domain/types.js';

// Upsell + cross-sell. Cross-sell uses order co-occurrence ("bought together"),
// which is the seed of the Phase-5 knowledge graph (BOUGHT_WITH edges).

function mapRow(r: any): Product {
  return {
    id: r.id, sourceId: r.source_id, merchantId: r.merchant_id, name: r.name,
    description: r.description, pricePaise: Number(r.price_paise), stock: r.stock,
    category: r.category, rating: Number(r.rating), image: r.image, createdAt: r.created_at,
  };
}

// Upsell: a better (higher-priced, same-category) item just above this one.
export async function getUpsell(productId: string): Promise<Product | null> {
  const { rows } = await query(
    `SELECT p.* FROM products p
       JOIN products base ON base.id = $1
      WHERE p.category = base.category AND p.id <> base.id AND p.price_paise > base.price_paise
      ORDER BY p.price_paise ASC LIMIT 1`,
    [productId],
  );
  return rows.length ? mapRow(rows[0]) : null;
}

// Cross-sell: items most frequently bought in the SAME order as this product.
// Falls back to same-category items when there's no purchase history yet.
export async function getCrossSell(productId: string, limit = 3): Promise<Product[]> {
  const co = await query(
    `SELECT (item->>'productId') AS pid, COUNT(*) AS n
       FROM orders o, jsonb_array_elements(o.items) item
      WHERE o.id IN (
              SELECT o2.id FROM orders o2, jsonb_array_elements(o2.items) it2
               WHERE it2->>'productId' = $1)
        AND (item->>'productId') <> $1
      GROUP BY pid ORDER BY n DESC LIMIT $2`,
    [productId, limit],
  );
  if (co.rows.length) {
    const ids = co.rows.map((r: any) => r.pid);
    const { rows } = await query(`SELECT * FROM products WHERE id = ANY($1)`, [ids]);
    return rows.map(mapRow);
  }
  const { rows } = await query(
    `SELECT p.* FROM products p JOIN products base ON base.id = $1
      WHERE p.category = base.category AND p.id <> base.id
      ORDER BY p.rating DESC LIMIT $2`,
    [productId, limit],
  );
  return rows.map(mapRow);
}
