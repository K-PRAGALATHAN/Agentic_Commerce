import { query } from '../adapters/db/pool.js';
import { HttpError } from './auth.js';

// Who is selling this.
//
// A marketplace with one anonymous seller is just a shop. Once several merchants
// share a catalogue, "who am I buying from" stops being decoration and becomes
// part of the purchase decision — and part of what the assistant has to be able
// to answer honestly. Everything here exists to make the seller visible: on the
// card, on the product, in the cart, and as a storefront of its own.

export interface StoreSummary {
  slug: string;
  storeName: string;
  tagline: string;
  logo: string;
  accent: string;
  location: string;
  productCount: number;
  categories: string[];
  rating: number;
  unitsSold: number;
  revenuePaise: number;
  since: string;
}

// Sales are read from PAID orders only. An order that was created and never paid
// is not a sale, and counting it would flatter every store on the directory.
//
// items is jsonb, so the join back to products goes through the same uuid guard
// the rest of the codebase uses — historic rows carry non-uuid product ids.
const SALES = `
  SELECT p.merchant_id,
         SUM((item->>'qty')::int)                                    AS units,
         SUM((item->>'qty')::int * (item->>'pricePaise')::bigint)    AS revenue
    FROM orders o
    CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
    JOIN products p ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                                   THEN (item->>'productId')::uuid END
   WHERE o.status = 'paid'
   GROUP BY p.merchant_id`;

function mapStore(r: any): StoreSummary {
  return {
    slug: r.slug,
    storeName: r.store_name,
    tagline: r.tagline,
    logo: r.logo,
    accent: r.accent,
    location: r.location,
    productCount: Number(r.product_count),
    // A store with no products aggregates to [null] rather than []; the store
    // page maps over this to render its category list and would throw on it.
    categories: (r.categories ?? []).filter(Boolean),
    rating: r.rating === null ? 0 : Number(Number(r.rating).toFixed(1)),
    unitsSold: Number(r.units ?? 0),
    revenuePaise: Number(r.revenue ?? 0),
    since: r.created_at,
  };
}

// The directory. Stores with nothing to sell are left out — an empty shopfront
// on the browse page is a dead end for the customer, not a discovery.
export async function listStores(): Promise<StoreSummary[]> {
  const { rows } = await query<any>(`
    WITH sales AS (${SALES})
    SELECT mp.slug, mp.store_name, mp.tagline, mp.logo, mp.accent, mp.location, mp.created_at,
           COUNT(p.id)::int AS product_count,
           AVG(p.rating) AS rating,
           (ARRAY_AGG(DISTINCT p.category))[1:4] AS categories,
           COALESCE(MAX(s.units), 0) AS units,
           COALESCE(MAX(s.revenue), 0) AS revenue
      FROM merchant_profiles mp
      JOIN products p ON p.merchant_id = mp.merchant_id AND p.status = 'active'
      LEFT JOIN sales s ON s.merchant_id = mp.merchant_id
     GROUP BY mp.merchant_id, mp.slug, mp.store_name, mp.tagline, mp.logo, mp.accent,
              mp.location, mp.created_at
     ORDER BY units DESC, product_count DESC`);
  return rows.map(mapStore);
}

export async function getStore(slug: string): Promise<StoreSummary & { about: string; merchantId: string }> {
  const { rows } = await query<any>(`
    WITH sales AS (${SALES})
    SELECT mp.*, COUNT(p.id)::int AS product_count, AVG(p.rating) AS rating,
           (ARRAY_AGG(DISTINCT p.category))[1:6] AS categories,
           COALESCE(MAX(s.units), 0) AS units, COALESCE(MAX(s.revenue), 0) AS revenue
      FROM merchant_profiles mp
      LEFT JOIN products p ON p.merchant_id = mp.merchant_id AND p.status = 'active'
      LEFT JOIN sales s ON s.merchant_id = mp.merchant_id
     WHERE mp.slug = $1
     GROUP BY mp.merchant_id`, [slug]);
  if (!rows.length) throw new HttpError(404, 'no such store');
  return { ...mapStore(rows[0]), about: rows[0].about, merchantId: rows[0].merchant_id };
}

// A merchant editing their own shopfront. The slug is derived once, on first
// save, and then left alone: changing it would break every link a customer or an
// agent has already followed.
export async function upsertStore(
  merchantId: string,
  input: { storeName: string; tagline?: string; about?: string; logo?: string; accent?: string; location?: string },
): Promise<void> {
  const name = (input.storeName ?? '').trim();
  if (!name) throw new HttpError(400, 'store name is required');
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) ||
    `store-${merchantId.slice(0, 6)}`;
  await query(
    `INSERT INTO merchant_profiles (merchant_id, slug, store_name, tagline, about, logo, accent, location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (merchant_id) DO UPDATE SET
       store_name = EXCLUDED.store_name, tagline = EXCLUDED.tagline, about = EXCLUDED.about,
       logo = EXCLUDED.logo, accent = EXCLUDED.accent, location = EXCLUDED.location,
       updated_at = now()`,
    [merchantId, slug, name, input.tagline ?? '', input.about ?? '', input.logo ?? '',
     input.accent || '#e8552d', input.location ?? ''],
  );
}

export async function myStore(merchantId: string) {
  const { rows } = await query<any>('SELECT * FROM merchant_profiles WHERE merchant_id = $1', [merchantId]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    slug: r.slug, storeName: r.store_name, tagline: r.tagline, about: r.about,
    logo: r.logo, accent: r.accent, location: r.location,
  };
}
