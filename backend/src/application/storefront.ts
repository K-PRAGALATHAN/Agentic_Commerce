import { query } from '../adapters/db/pool.js';

// A storefront organised around what this customer actually did.
//
// Rows are built from data we already have — views, orders and the knowledge
// graph — so nothing new needs tracking beyond a single product_views insert.
// A brand-new customer still gets Trending and collections, so the page is
// never empty; that matters because the empty state is the first impression.

export async function recordView(userId: string, productId: string): Promise<void> {
  try {
    await query('INSERT INTO product_views(user_id, product_id) VALUES ($1,$2)', [userId, productId]);
  } catch {
    // A view is telemetry, not a transaction — never fail a page load over it.
  }
}

export interface Row {
  key: string;
  title: string;
  subtitle: string;
  products: any[];
}

const SELECT = `p.id, p.name, p.price_paise, p.image, p.category, p.rating, p.stock,
                mp.store_name AS seller_name, mp.slug AS seller_slug`;
// Joined into every row below so a card can name its seller without a
// second round trip per product.
const SELLER = `LEFT JOIN merchant_profiles mp ON mp.merchant_id = p.merchant_id`;

function map(rows: any[]): any[] {
  return rows.map((r) => ({
    id: r.id, name: r.name, pricePaise: Number(r.price_paise),
    image: r.image, category: r.category, rating: Number(r.rating), stock: r.stock,
    sellerName: r.seller_name ?? '', sellerSlug: r.seller_slug ?? '',
  }));
}

export async function personalisedRows(userId: string, limit = 8): Promise<Row[]> {
  const rows: Row[] = [];

  // 1. Continue browsing — most recently viewed, de-duplicated.
  const viewed = await query<any>(
    `SELECT DISTINCT ON (p.id) ${SELECT}, MAX(v.ts) AS seen
       FROM product_views v JOIN products p ON p.id = v.product_id ${SELLER}
      WHERE v.user_id = $1 AND p.status = 'active'
      GROUP BY p.id, mp.store_name, mp.slug
      ORDER BY p.id, seen DESC
      LIMIT $2`,
    [userId, limit],
  );
  if (viewed.rows.length) {
    rows.push({ key: 'viewed', title: 'Continue browsing',
      subtitle: 'Picking up where you left off', products: map(viewed.rows) });
  }

  // 2. Buy again — things they have actually paid for.
  const bought = await query<any>(
    `SELECT DISTINCT ${SELECT}
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
       JOIN products p ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                                      THEN (item->>'productId')::uuid END ${SELLER}
      WHERE o.user_id = $1 AND o.status = 'paid' AND p.status = 'active'
      LIMIT $2`,
    [userId, limit],
  );
  if (bought.rows.length) {
    rows.push({ key: 'again', title: 'Buy it again',
      subtitle: 'From your past orders', products: map(bought.rows) });
  }

  // 3. Recommended — knowledge-graph neighbours of what they bought. This is
  //    what kg_edges was built for; it stays empty until orders exist, which is
  //    why the fallback rows below matter.
  const recommended = await query<any>(
    `SELECT DISTINCT ${SELECT}
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
       JOIN kg_edges e ON e.src_id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                                          THEN (item->>'productId')::uuid END
       JOIN products p ON p.id = e.dst_id ${SELLER}
      WHERE o.user_id = $1 AND p.status = 'active'
      ORDER BY p.rating DESC
      LIMIT $2`,
    [userId, limit],
  );
  if (recommended.rows.length) {
    rows.push({ key: 'foryou', title: 'Recommended for you',
      subtitle: 'Often bought with things you own', products: map(recommended.rows) });
  }

  // 4. Trending — what everyone is buying. Always available, so this is the
  //    row that saves a first-time visitor from an empty page.
  const trending = await query<any>(
    `SELECT ${SELECT}, COUNT(*) AS sold
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
       JOIN products p ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                                      THEN (item->>'productId')::uuid END ${SELLER}
      WHERE o.status = 'paid' AND o.created_at > now() - interval '30 days' AND p.status = 'active'
      GROUP BY p.id, mp.store_name, mp.slug ORDER BY sold DESC LIMIT $1`,
    [limit],
  );
  if (trending.rows.length) {
    rows.push({ key: 'trending', title: 'Trending now',
      subtitle: 'Popular in the last 30 days', products: map(trending.rows) });
  }

  // 5. Collections, so the store always has structure to browse.
  const collections = await query<any>(
    `SELECT c.id, c.title FROM collections c
       JOIN collection_products cp ON cp.collection_id = c.id
      GROUP BY c.id, c.title ORDER BY c.title LIMIT 4`,
  );
  for (const c of collections.rows) {
    const items = await query<any>(
      `SELECT ${SELECT} FROM products p ${SELLER}
         JOIN collection_products cp ON cp.product_id = p.id
        WHERE cp.collection_id = $1 AND p.status = 'active'
        ORDER BY cp.position LIMIT $2`,
      [c.id, limit],
    );
    if (items.rows.length) {
      rows.push({ key: `col-${c.id}`, title: c.title, subtitle: 'Collection', products: map(items.rows) });
    }
  }

  // 6. Last resort: a plain new-arrivals row, so the page is never blank.
  if (!rows.length) {
    const newest = await query<any>(
      `SELECT ${SELECT} FROM products p ${SELLER} WHERE p.status='active' ORDER BY p.created_at DESC LIMIT $1`,
      [limit],
    );
    rows.push({ key: 'new', title: 'New in', subtitle: 'Recently added to the store', products: map(newest.rows) });
  }

  return rows;
}
