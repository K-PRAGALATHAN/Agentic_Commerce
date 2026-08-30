import { query } from '../adapters/db/pool.js';

// Formal knowledge graph. Edges are MATERIALIZED from order history (co-occurrence),
// so cross-sell reads a real graph rather than recomputing a join each time.

export async function materializeKG(): Promise<{ edges: number }> {
  await query('TRUNCATE kg_edges');
  // BOUGHT_WITH: products that appear together in the same order, weighted by frequency.
  await query(`
    INSERT INTO kg_edges(src_id, dst_id, type, weight)
    SELECT a.pid::uuid, b.pid::uuid, 'BOUGHT_WITH', COUNT(*)::int
      FROM (SELECT o.id AS oid, (item->>'productId') AS pid
              FROM orders o, jsonb_array_elements(o.items) item) a
      JOIN (SELECT o.id AS oid, (item->>'productId') AS pid
              FROM orders o, jsonb_array_elements(o.items) item) b
        ON a.oid = b.oid AND a.pid <> b.pid
     -- An order keeps its line items forever, but a merchant may delete the
     -- product afterwards. kg_edges has a foreign key to products, so without
     -- these joins one deleted-but-once-sold product makes every later rebuild
     -- fail with a constraint violation -- and "Rebuild graph" stays broken.
      JOIN products pa ON pa.id = a.pid::uuid
      JOIN products pb ON pb.id = b.pid::uuid
     WHERE a.pid ~ '^[0-9a-f-]{36}$' AND b.pid ~ '^[0-9a-f-]{36}$'
     GROUP BY a.pid, b.pid
    ON CONFLICT (src_id, dst_id, type) DO UPDATE SET weight = EXCLUDED.weight
  `);
  // VIEWED_WITH: products the SAME person looked at close together. Co-purchase is
  // the strongest signal for "these go together", but it needs orders to exist —
  // browsing produces evidence far sooner, which is what makes cold-start
  // cross-sell possible at all.
  //
  // Same-category pairs are excluded: looking at two laptops means comparing
  // substitutes, not assembling a set.
  await query(`
    INSERT INTO kg_edges(src_id, dst_id, type, weight)
    SELECT a.product_id, b.product_id, 'VIEWED_WITH', COUNT(DISTINCT a.user_id)::int
      FROM product_views a
      JOIN product_views b
        ON a.user_id = b.user_id
       AND a.product_id <> b.product_id
       AND abs(extract(epoch FROM (a.ts - b.ts))) <= 1800   -- one browsing session
      JOIN products pa ON pa.id = a.product_id
      JOIN products pb ON pb.id = b.product_id
     WHERE pa.category <> pb.category
     GROUP BY a.product_id, b.product_id
    ON CONFLICT (src_id, dst_id, type) DO UPDATE SET weight = EXCLUDED.weight
  `);

  const { rows } = await query<{ n: string }>('SELECT COUNT(*) AS n FROM kg_edges');
  return { edges: Number(rows[0].n) };
}

// Edge weights for one product, by type. Cross-sell scores against these rather
// than querying the graph twice.
export async function edgeWeights(
  productId: string,
  type: 'BOUGHT_WITH' | 'VIEWED_WITH',
): Promise<Map<string, number>> {
  const { rows } = await query<{ dst_id: string; weight: number }>(
    'SELECT dst_id, weight FROM kg_edges WHERE src_id = $1 AND type = $2',
    [productId, type],
  );
  return new Map(rows.map((r) => [r.dst_id, r.weight]));
}

// Top BOUGHT_WITH neighbours for a product (empty until orders exist + KG materialized).
export async function relatedProducts(productId: string, limit = 3): Promise<any[]> {
  const { rows } = await query(
    `SELECT p.* FROM kg_edges e JOIN products p ON p.id = e.dst_id
      WHERE e.src_id = $1 AND e.type = 'BOUGHT_WITH'
      ORDER BY e.weight DESC LIMIT $2`,
    [productId, limit],
  );
  return rows;
}

// Clusters = category groupings (the "closed cluster of relevant products").
//
// Each one carries a photograph: the image of its best-rated stocked product.
// The storefront used to draw these tiles with emoji, which meant a hand-written
// glyph map that silently fell back to a generic tag the moment a merchant
// invented a category nobody had mapped. Deriving the picture from the catalogue
// means a new category is illustrated the day its first product lands.
export async function clusters(): Promise<{ category: string; count: number; image: string }[]> {
  const { rows } = await query<any>(`
    SELECT category, COUNT(*)::int AS count,
           -- DISTINCT ON would need the ordering to lead with category; this is
           -- the same thing without reshaping the whole query.
           (ARRAY_AGG(image ORDER BY rating DESC, created_at DESC)
              FILTER (WHERE COALESCE(image, '') <> ''))[1] AS image
      FROM products
     WHERE status = 'active'
     GROUP BY category
     ORDER BY count DESC`);
  return rows.map((r: any) => ({ category: r.category, count: r.count, image: r.image ?? '' }));
}
