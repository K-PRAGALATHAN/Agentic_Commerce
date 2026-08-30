import { query } from '../adapters/db/pool.js';
import type { Product } from '../domain/types.js';
import { getProduct } from './catalog.js';

// Upsell and cross-sell answer two DIFFERENT questions, and conflating them is
// why the old version was useless:
//
//   upsell     — a better version of this thing        (same category, traded up)
//   cross-sell — something that goes WITH this thing   (a different category)
//
// The previous cross-sell fell back to same-category, so a shirt suggested three
// more shirts. Those are substitutes; a customer who just chose a shirt does not
// want another shirt.

export interface Suggestion {
  product: Product;
  reason: string;
  via: 'graph' | 'complement' | 'similar';
}

// Complementary pairs — what people genuinely buy together. Used when the
// knowledge graph is too sparse to know, which is most of the time early on.
const COMPLEMENTS: Record<string, string[]> = {
  'mens-shirts': ['mens-shoes', 'mens-watches', 'sunglasses', 'fragrances'],
  'mens-shoes': ['mens-shirts', 'mens-watches', 'sports-accessories'],
  'mens-watches': ['mens-shirts', 'sunglasses', 'fragrances'],
  'womens-dresses': ['womens-shoes', 'womens-bags', 'womens-jewellery', 'beauty'],
  'womens-shoes': ['womens-dresses', 'womens-bags'],
  'womens-bags': ['womens-dresses', 'sunglasses', 'beauty'],
  'womens-jewellery': ['womens-dresses', 'beauty', 'fragrances'],
  'womens-watches': ['womens-jewellery', 'womens-bags'],
  laptops: ['mobile-accessories', 'tablets', 'kitchen-accessories'],
  smartphones: ['mobile-accessories', 'tablets'],
  tablets: ['mobile-accessories', 'laptops'],
  'mobile-accessories': ['smartphones', 'laptops', 'tablets'],
  groceries: ['kitchen-accessories', 'home-decoration'],
  'kitchen-accessories': ['groceries', 'home-decoration'],
  furniture: ['home-decoration', 'kitchen-accessories'],
  'home-decoration': ['furniture', 'kitchen-accessories'],
  beauty: ['fragrances', 'skin-care', 'womens-jewellery'],
  fragrances: ['beauty', 'mens-watches'],
  'skin-care': ['beauty', 'fragrances'],
  sunglasses: ['mens-watches', 'womens-bags', 'mens-shirts'],
  motorcycle: ['sports-accessories', 'sunglasses'],
  'sports-accessories': ['mens-shoes', 'motorcycle'],
};

const SELECT = `p.id, p.merchant_id, p.name, p.description, p.price_paise, p.stock,
                p.category, p.rating, p.image, p.created_at, p.status, p.product_type,
                p.vendor, p.tags, p.compare_at_paise, p.cost_paise, p.track_inventory,
                p.sell_when_out_of_stock, p.physical, p.weight_grams, p.country_of_origin,
                p.hs_code, p.seo_title, p.seo_description, p.options`;

function mapRow(r: any): Product {
  return {
    id: r.id, merchantId: r.merchant_id, name: r.name, description: r.description,
    pricePaise: Number(r.price_paise), stock: r.stock, category: r.category,
    rating: Number(r.rating), image: r.image, createdAt: r.created_at,
    status: r.status, productType: r.product_type, vendor: r.vendor, tags: r.tags ?? [],
    compareAtPaise: r.compare_at_paise === null ? null : Number(r.compare_at_paise),
    costPaise: r.cost_paise === null ? null : Number(r.cost_paise),
    trackInventory: r.track_inventory, sellWhenOutOfStock: r.sell_when_out_of_stock,
    physical: r.physical, weightGrams: r.weight_grams, countryOfOrigin: r.country_of_origin,
    hsCode: r.hs_code, seoTitle: r.seo_title, seoDescription: r.seo_description,
    options: r.options ?? [],
  };
}

const rupees = (paise: number) => `₹${(paise / 100).toFixed(0)}`;

// UPSELL: a better version of the same thing. "Better" is rating first, price
// second — trading a customer up to something worse but pricier is a bad deal
// for them and a returned item for the merchant.
export async function getUpsell(productId: string): Promise<Suggestion | null> {
  const { rows } = await query<any>(
    `SELECT ${SELECT}
       FROM products p JOIN products base ON base.id = $1
      WHERE p.category = base.category
        AND p.id <> base.id
        AND p.status = 'active'
        AND p.stock > 0
        AND p.rating > base.rating
        AND p.price_paise > base.price_paise
        AND p.price_paise <= base.price_paise * 2.5   -- a step up, not a different budget
      ORDER BY (p.rating - base.rating) DESC, p.price_paise ASC
      LIMIT 1`,
    [productId],
  );
  if (!rows.length) return null;
  const base = await getProduct(productId);
  const product = mapRow(rows[0]);
  const extra = product.pricePaise - base.pricePaise;
  return {
    product,
    via: 'similar',
    reason: `rated ${product.rating.toFixed(1)}★ against ${base.rating.toFixed(1)}★, for ${rupees(extra)} more`,
  };
}

// CROSS-SELL: things that go WITH this, never more of the same.
//
// Three sources, best evidence first:
//   1. the knowledge graph — people actually bought these together
//   2. complementary categories — the curated map above
//   3. semantic similarity — shared vocabulary in name/description/tags, but
//      restricted to a DIFFERENT category so it stays a complement
export async function getCrossSell(productId: string, limit = 3): Promise<Suggestion[]> {
  const base = await getProduct(productId);
  const out: Suggestion[] = [];
  const seen = new Set<string>([productId]);

  // 1. Real co-occurrence.
  const graph = await query<any>(
    `SELECT ${SELECT}, e.weight
       FROM kg_edges e JOIN products p ON p.id = e.dst_id
      WHERE e.src_id = $1 AND e.type = 'BOUGHT_WITH'
        AND p.status = 'active' AND p.category <> $2
      ORDER BY e.weight DESC LIMIT $3`,
    [productId, base.category, limit],
  );
  for (const r of graph.rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      product: mapRow(r), via: 'graph',
      reason: `bought together with ${base.name} by ${r.weight} other customer${r.weight === 1 ? '' : 's'}`,
    });
  }

  // 2. Complementary categories.
  const complements = COMPLEMENTS[base.category] ?? [];
  if (out.length < limit && complements.length) {
    const rows = await query<any>(
      `SELECT DISTINCT ON (p.category) ${SELECT}
         FROM products p
        WHERE p.category = ANY($1) AND p.status = 'active' AND p.stock > 0
          AND NOT (p.id = ANY($2::uuid[]))
        ORDER BY p.category, p.rating DESC
        LIMIT $3`,
      [complements, [...seen], limit - out.length],
    );
    for (const r of rows.rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({
        product: mapRow(r), via: 'complement',
        reason: `${r.category.replace(/-/g, ' ')} that pairs with ${base.name}`,
      });
    }
  }

  // 3. Semantic similarity — shared vocabulary, different category.
  //    full-text ranking over name + description + tags, which is the closest
  //    thing to "means something similar" available without a vector store.
  if (out.length < limit) {
    const rows = await query<any>(
      `SELECT ${SELECT},
              ts_rank(
                to_tsvector('english', p.name || ' ' || p.description || ' ' || array_to_string(p.tags, ' ')),
                plainto_tsquery('english', $2)
              ) AS rank
         FROM products p
        WHERE p.status = 'active' AND p.stock > 0
          AND p.category <> $3
          AND NOT (p.id = ANY($4::uuid[]))
          AND to_tsvector('english', p.name || ' ' || p.description || ' ' || array_to_string(p.tags, ' '))
              @@ plainto_tsquery('english', $2)
        ORDER BY rank DESC, p.rating DESC
        LIMIT $1`,
      [limit - out.length, `${base.name} ${base.description}`.slice(0, 300), base.category, [...seen]],
    );
    for (const r of rows.rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({ product: mapRow(r), via: 'similar', reason: `similar in style to ${base.name}` });
    }
  }

  return out.slice(0, limit);
}
