import { query } from '../adapters/db/pool.js';
import type { Product } from '../domain/types.js';
import { getProduct } from './catalog.js';
import { edgeWeights } from './kg.js';

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
  via: 'graph' | 'viewed' | 'complement' | 'similar';
}

// What genuinely goes WITH something, most relevant first — the order matters,
// it is scored below.
//
// Two rules learned the hard way, after a laptop suggested a Lunch Box:
//   * Never pad a list to guarantee a hit. A category with no honest companion in
//     this catalogue is left out entirely, and cross-sell returns nothing.
//   * A substitute is not a complement. laptops -> tablets was wrong: a tablet
//     replaces a laptop, it does not accompany one.
const COMPLEMENTS: Record<string, string[]> = {
  'mens-shirts': ['mens-shoes', 'mens-watches', 'sunglasses', 'fragrances'],
  'mens-shoes': ['mens-shirts', 'mens-watches', 'sports-accessories'],
  'mens-watches': ['mens-shirts', 'sunglasses', 'fragrances'],
  'womens-dresses': ['womens-shoes', 'womens-bags', 'womens-jewellery', 'beauty'],
  'womens-shoes': ['womens-dresses', 'womens-bags'],
  'womens-bags': ['womens-dresses', 'sunglasses', 'beauty'],
  'womens-jewellery': ['womens-dresses', 'beauty', 'fragrances'],
  'womens-watches': ['womens-jewellery', 'womens-bags'],
  // Computing: accessories only. Tablets and laptops substitute for each other.
  laptops: ['mobile-accessories'],
  smartphones: ['mobile-accessories'],
  tablets: ['mobile-accessories'],
  'mobile-accessories': ['smartphones', 'laptops', 'tablets'],
  groceries: ['kitchen-accessories'],
  'kitchen-accessories': ['groceries'],
  furniture: ['home-decoration'],
  'home-decoration': ['furniture'],
  beauty: ['fragrances', 'skin-care'],
  fragrances: ['beauty'],
  'skin-care': ['beauty', 'fragrances'],
  sunglasses: ['mens-watches', 'womens-bags'],
  motorcycle: ['sports-accessories'],
  'sports-accessories': ['mens-shoes', 'motorcycle'],
  // Deliberately absent: stationery, vehicle, and anything else with no honest
  // companion here. Absent means "suggest nothing", which is the correct answer.
};

// Evidence is worth more than a curated guess, and a guess is worth more than
// nothing. A candidate must clear MIN_SCORE to be shown at all.
const W_BOUGHT = 10;   // per co-purchase, once support is met
const W_VIEWED = 3;    // per person who viewed both in one session
const W_CURATED = 4;   // top-priority category; decays down the list
const MIN_SCORE = 3;   // below this we say nothing

// One person buying two things together is a coincidence — a laptop and cooking
// oil in the same basket says nothing about either. Two independent baskets is a
// pattern. Below this support, co-purchase is ignored entirely rather than
// down-weighted, because a single spurious edge outscores every curated guess.
const MIN_SUPPORT = 2;

const SELECT = `mp.store_name AS seller_name, mp.slug AS seller_slug,
                p.id, p.merchant_id, p.name, p.description, p.price_paise, p.stock,
                p.category, p.rating, p.image, p.created_at, p.status, p.product_type,
                p.vendor, p.tags, p.compare_at_paise, p.cost_paise, p.track_inventory,
                p.sell_when_out_of_stock, p.physical, p.weight_grams, p.country_of_origin,
                p.hs_code, p.seo_title, p.seo_description, p.options`;
const SELLER = `LEFT JOIN merchant_profiles mp ON mp.merchant_id = p.merchant_id`;

function mapRow(r: any): Product {
  return {
    id: r.id, merchantId: r.merchant_id, name: r.name, description: r.description,
    sellerName: r.seller_name ?? '', sellerSlug: r.seller_slug ?? '',
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
       FROM products p ${SELLER} JOIN products base ON base.id = $1
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
// Scored, not cascaded. Every candidate earns a score from three signals and has
// to clear MIN_SCORE, so when nothing genuinely fits the answer is an empty list.
//   1. co-purchase  — people actually bought these together   (strongest)
//   2. co-view      — people looked at both in one session
//   3. curated      — the map above, weighted by position
//
// There is deliberately NO text-similarity signal. Similar wording finds
// SUBSTITUTES: a laptop and another laptop read almost identically, while a
// laptop and its charger share no vocabulary at all. Using it here was the wrong
// instinct and it has been removed.
export async function getCrossSell(productId: string, limit = 3): Promise<Suggestion[]> {
  const base = await getProduct(productId);

  // Curated categories carry a rank: first in the list scores highest. The old
  // version ordered by category name, so the least relevant category won whenever
  // there was one slot to fill.
  const complements = COMPLEMENTS[base.category] ?? [];
  const curatedRank = new Map(complements.map((c, i) => [c, complements.length - i]));

  const [bought, viewed] = await Promise.all([
    edgeWeights(productId, 'BOUGHT_WITH'),
    edgeWeights(productId, 'VIEWED_WITH'),
  ]);

  // Everything that could possibly qualify: graph neighbours plus stocked items
  // from the curated categories. Same category is excluded throughout — those are
  // substitutes, and suggesting one to someone who just chose is pointless.
  const ids = [...new Set([...bought.keys(), ...viewed.keys()])];
  const { rows } = await query<any>(
    `SELECT ${SELECT}
       FROM products p ${SELLER}
      WHERE p.status = 'active' AND p.stock > 0
        AND p.id <> $1
        AND p.category <> $2
        AND (p.id = ANY($3::uuid[]) OR p.category = ANY($4))`,
    [productId, base.category, ids, complements],
  );

  const scored = rows.map((r: any) => {
    const rawB = bought.get(r.id) ?? 0;
    const b = rawB >= MIN_SUPPORT ? rawB : 0;
    const v = viewed.get(r.id) ?? 0;
    const c = curatedRank.get(r.category) ?? 0;
    // Rating is a TIE-BREAK, never a reason to include something. Treating it as
    // a reason is how a well-rated Lunch Box outranked a relevant accessory.
    const score = b * W_BOUGHT + v * W_VIEWED + c * W_CURATED;
    return { row: r, score, b, v };
  })
    .filter((x: any) => x.score >= MIN_SCORE)
    .sort((a: any, b2: any) => b2.score - a.score || Number(b2.row.rating) - Number(a.row.rating));

  // One per category. Without this the top-ranked category takes every slot —
  // a shirt returned three pairs of shoes, where a shoe, a watch and a fragrance
  // is plainly more useful. Graph evidence is exempt: if two specific things are
  // genuinely bought together, that beats spreading for variety.
  const spread: typeof scored = [];
  const usedCategory = new Set<string>();
  for (const x of scored) {
    if (x.b === 0 && usedCategory.has(x.row.category)) continue;
    usedCategory.add(x.row.category);
    spread.push(x);
    if (spread.length >= limit) break;
  }

  return spread.map((x: any) => ({
    product: mapRow(x.row),
    via: x.b > 0 ? 'graph' : x.v > 0 ? 'viewed' : 'complement',
    // Worded for a customer, not for us. No "complementary", no "cross-sell".
    reason: x.b > 0
      ? `often bought with ${base.name}`
      : x.v > 0
        ? `shoppers looking at ${base.name} also looked at this`
        : `goes well with ${base.name}`,
  }));
}
