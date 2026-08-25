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
     WHERE a.pid ~ '^[0-9a-f-]{36}$' AND b.pid ~ '^[0-9a-f-]{36}$'
     GROUP BY a.pid, b.pid
    ON CONFLICT (src_id, dst_id, type) DO UPDATE SET weight = EXCLUDED.weight
  `);
  const { rows } = await query<{ n: string }>('SELECT COUNT(*) AS n FROM kg_edges');
  return { edges: Number(rows[0].n) };
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
export async function clusters(): Promise<{ category: string; count: number }[]> {
  const { rows } = await query<any>(
    `SELECT category, COUNT(*)::int AS count FROM products GROUP BY category ORDER BY count DESC`,
  );
  return rows;
}
