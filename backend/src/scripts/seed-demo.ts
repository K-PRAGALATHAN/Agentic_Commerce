// Demo data: several real storefronts, not one anonymous seller.
//
// A marketplace only demonstrates anything once more than one merchant is in it.
// This script builds that world and is safe to run repeatedly — every step is
// keyed on something stable (an email, a slug, a product name), so a second run
// updates instead of duplicating.
//
//   docker compose exec backend npx tsx src/scripts/seed-demo.ts
//
// Passwords here are deliberately weak and deliberately printed: this is a demo
// fixture for a test-mode store, and the credentials are meant to be shared with
// whoever is watching the demo.
import bcrypt from 'bcryptjs';
import { pool, query } from '../adapters/db/pool.js';
import { signup } from '../application/auth.js';
import { createProduct } from '../application/catalog.js';
import { upsertStore } from '../application/merchants.js';
import { materializeKG } from '../application/kg.js';

const PASSWORD = 'demo1234';

// The catalogue this project was seeded from is a public sample API. Images are
// resolved from it once per category and cached here, so the seed makes a
// handful of requests rather than one per product.
//
// If it cannot be reached, the seed still works: `thumbnail.webp` follows a
// fixed path for every item, so there is always one usable photograph even
// offline. Only the extra gallery shots are lost.
const ART_BASE = 'https://cdn.dummyjson.com/product-images';
const artCache = new Map<string, string[]>();

async function artFor(a: { category: string; slug: string }): Promise<string[]> {
  const key = `${a.category}/${a.slug}`;
  const cached = artCache.get(key);
  if (cached) return cached;
  const fallback = [`${ART_BASE}/${key}/thumbnail.webp`];
  try {
    const res = await fetch(
      `https://dummyjson.com/products/category/${a.category}?limit=0&select=title,images,thumbnail`,
      { signal: AbortSignal.timeout(8000) },
    );
    const body = (await res.json()) as { products?: { images?: string[]; thumbnail?: string }[] };
    for (const prod of body.products ?? []) {
      const urls = (prod.images ?? []).filter(Boolean);
      const slug = (prod.thumbnail ?? '').split('/').at(-2);
      if (slug) artCache.set(`${a.category}/${slug}`, urls.length ? urls : [prod.thumbnail!]);
    }
  } catch {
    // offline, or the sample API moved — the fallback below still renders
  }
  return artCache.get(key) ?? fallback;
}

interface SeedProduct {
  name: string;
  description: string;
  category: string;
  priceRupees: number;
  stock: number;
  vendor: string;
  rating?: number;
  // Where to get a photograph. The first pass of this seed created products with
  // no image at all, which left eighteen blank tiles in a storefront whose whole
  // design is built around the product photo. `art` names a real item in the
  // same open catalogue the original hundred products came from, so every
  // seeded product shows something that actually depicts it.
  art?: { category: string; slug: string };
}

interface StoreSpec {
  email: string;
  store: { storeName: string; tagline: string; about: string; logo: string; accent: string; location: string };
  // Categories this store takes over from the original single-owner catalogue.
  categories: string[];
  // A handful created through the ordinary merchant write path, so the seed
  // exercises the same code the "+ Add product" button does.
  products: SeedProduct[];
}

const STORES: StoreSpec[] = [
  {
    email: 'nova@demo.store',
    store: {
      storeName: 'Nova Tech',
      tagline: 'Laptops, phones and the bits that go with them',
      about: 'An electronics specialist. We stock a narrow range and know all of it — every machine is checked and set up before it ships.',
      logo: '⚡', accent: '#2f6fed', location: 'Bengaluru',
    },
    categories: ['laptops', 'smartphones', 'tablets', 'mobile-accessories'],
    products: [
      { name: 'Nova Fast Charger 65W', description: 'A single charger for the laptop, the phone and the earbuds. Two USB-C ports, one USB-A, and small enough to forget in a bag.', category: 'mobile-accessories', priceRupees: 2499, stock: 40, vendor: 'Nova', rating: 4.6, art: { category: 'mobile-accessories', slug: 'apple-iphone-charger' } },
      { name: 'Nova Wireless Charging Pad', description: 'Sets a phone down and picks it up charged. A rubber ring so it does not slide, and cool enough to leave on a bedside table.', category: 'mobile-accessories', priceRupees: 1299, stock: 55, vendor: 'Nova', rating: 4.4, art: { category: 'mobile-accessories', slug: 'apple-airpower-wireless-charger' } },
      { name: 'Nova Selfie Tripod', description: 'Extends to 1.2 metres and folds to the size of a pen, with the shutter button in the handle.', category: 'mobile-accessories', priceRupees: 1099, stock: 70, vendor: 'Nova', rating: 4.3, art: { category: 'mobile-accessories', slug: 'selfie-stick-monopod' } },
      { name: 'Nova Smart Speaker Mini', description: 'Fills one room properly rather than a whole house badly, and answers without waking the rest of the flat.', category: 'mobile-accessories', priceRupees: 3299, stock: 30, vendor: 'Nova', rating: 4.5, art: { category: 'mobile-accessories', slug: 'apple-homepod-mini-cosmic-grey' } },
      { name: 'Nova Over-Ear Headphones', description: 'Active noise cancelling with 30 hours of battery. Folds flat, and the cable still works when the battery does not.', category: 'mobile-accessories', priceRupees: 6999, stock: 25, vendor: 'Nova', rating: 4.7, art: { category: 'mobile-accessories', slug: 'apple-airpods-max-silver' } },
      { name: 'Nova Power Bank 20000mAh', description: 'Charges a laptop once or a phone four times. Shows the remaining percentage rather than four vague dots.', category: 'mobile-accessories', priceRupees: 3499, stock: 45, vendor: 'Nova', rating: 4.5, art: { category: 'mobile-accessories', slug: 'apple-magsafe-battery-pack' } },
    ],
  },
  {
    email: 'aster@demo.store',
    store: {
      storeName: 'Aster and Vine',
      tagline: 'Everyday clothing, watches and scent',
      about: 'A small fashion house working with natural fabrics. Sizes run true, and anything that does not fit comes back free within thirty days.',
      logo: '🌿', accent: '#b0483a', location: 'Mumbai',
    },
    categories: ['mens-shirts', 'shirts', 'mens-shoes', 'mens-watches', 'beauty', 'fragrances', 'sunglasses', 'womens-dresses', 'womens-bags'],
    products: [
      { name: 'Aster Linen Shirt', description: 'Washed linen that softens with every wear. Cut slightly loose through the body so it works untucked.', category: 'mens-shirts', priceRupees: 1899, stock: 60, vendor: 'Aster and Vine', rating: 4.6, art: { category: 'mens-shirts', slug: 'man-short-sleeve-shirt' } },
      { name: 'Vine Check Overshirt', description: 'Brushed cotton, heavy enough to wear as a light jacket over a tee.', category: 'mens-shirts', priceRupees: 1499, stock: 40, vendor: 'Aster and Vine', rating: 4.4, art: { category: 'mens-shirts', slug: 'men-check-shirt' } },
      { name: 'Aster Leather Handbag', description: 'Full-grain leather that darkens with use, with an inner pocket that actually holds a phone.', category: 'womens-bags', priceRupees: 999, stock: 80, vendor: 'Aster and Vine', rating: 4.5, art: { category: 'womens-bags', slug: 'prada-women-bag' } },
      { name: 'Vine Classic Sunglasses', description: 'Polarised glass in a light metal frame, with a hard case included rather than sold separately.', category: 'sunglasses', priceRupees: 2299, stock: 35, vendor: 'Aster and Vine', rating: 4.4, art: { category: 'sunglasses', slug: 'classic-sun-glasses' } },
    ],
  },
  {
    email: 'basket@demo.store',
    store: {
      storeName: 'Fresh Basket',
      tagline: 'Groceries and daily essentials, delivered cold',
      about: 'Produce, pantry staples and household basics. We buy short and often, so what is listed is what came in this week.',
      logo: '🧺', accent: '#2f7d4f', location: 'Chennai',
    },
    categories: ['groceries'],
    products: [
      { name: 'Cold Pressed Groundnut Oil 1L', description: 'Wood-pressed in small batches, unrefined, with the sediment left in. Keeps about six months.', category: 'groceries', priceRupees: 449, stock: 90, vendor: 'Fresh Basket', rating: 4.6, art: { category: 'groceries', slug: 'cooking-oil' } },
      { name: 'Organic Brown Rice 5kg', description: 'Single-origin short grain from Thanjavur. Takes about forty minutes to cook.', category: 'groceries', priceRupees: 629, stock: 65, vendor: 'Fresh Basket', rating: 4.5, art: { category: 'groceries', slug: 'rice' } },
      { name: 'Raw Forest Honey 500g', description: 'Unfiltered and unpasteurised, so it crystallises in winter. That is the honey working, not spoiling.', category: 'groceries', priceRupees: 189, stock: 120, vendor: 'Fresh Basket', rating: 4.3, art: { category: 'groceries', slug: 'honey-jar' } },
      { name: 'Filter Coffee Blend 500g', description: 'Eighty percent arabica with chicory, ground for a South Indian filter rather than a machine.', category: 'groceries', priceRupees: 549, stock: 75, vendor: 'Fresh Basket', rating: 4.8, art: { category: 'groceries', slug: 'nescafe-coffee' } },
    ],
  },
];

// The account that originally owned the whole catalogue keeps everything the
// three specialists did not take — which turns out to be a coherent home store.
const HOUSE_STORE = {
  storeName: 'Kalyani Home and Living',
  tagline: 'Kitchen, furniture and things for the house',
  about: 'The original shop on this marketplace. Cookware, storage, furniture and small decorative pieces.',
  logo: '🏡', accent: '#a2622b', location: 'Coimbatore',
};

const CUSTOMERS = [
  { email: 'riya@demo.shop', note: 'shops across all four stores' },
  { email: 'arjun@demo.shop', note: 'electronics and groceries' },
  { email: 'meera@demo.shop', note: 'fashion and home' },
];

// Signup throws 409 on a repeat run; that is the idempotent path, not an error.
async function ensureUser(email: string, role: 'customer' | 'merchant'): Promise<string> {
  try {
    const u = await signup(email, PASSWORD, role);
    console.log(`  + created ${role} ${email}`);
    return u.id;
  } catch {
    const { rows } = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) throw new Error(`could not create or find ${email}`);
    // Reset the password so the printed credentials are always the true ones,
    // even if this account was created by hand earlier with something else.
    await query('UPDATE users SET password_hash = $1 WHERE id = $2',
      [await bcrypt.hash(PASSWORD, 10), rows[0].id]);
    console.log(`  = ${role} ${email} already existed (password reset to the demo one)`);
    return rows[0].id;
  }
}

async function run() {
  console.log('\nStorefronts');
  const merchantIds: string[] = [];

  for (const spec of STORES) {
    const id = await ensureUser(spec.email, 'merchant');
    merchantIds.push(id);
    await upsertStore(id, spec.store);

    // Hand this store the categories it specialises in. The catalogue was seeded
    // under one owner; splitting it by category is what turns a single shop into
    // a marketplace without inventing a hundred new products.
    const moved = await query(
      `UPDATE products SET merchant_id = $1 WHERE category = ANY($2) AND merchant_id <> $1`,
      [id, spec.categories],
    );

    let made = 0;
    for (const p of spec.products) {
      const { rows } = await query<{ id: string }>('SELECT id FROM products WHERE name = $1', [p.name]);
      if (rows.length) continue;
      const images = p.art ? await artFor(p.art) : [];
      const created = await createProduct(id, {
        name: p.name, description: p.description, category: p.category,
        priceRupees: p.priceRupees, stock: p.stock, vendor: p.vendor, status: 'active',
        images,
      });
      // rating is not part of the merchant input — it is earned, not set — so the
      // seed writes a plausible one directly to give the demo something to sort by.
      if (p.rating) await query('UPDATE products SET rating = $1 WHERE id = $2', [p.rating, created.id]);
      made += 1;
    }
    console.log(`  ${spec.store.storeName}: took over ${moved.rowCount} products, created ${made}`);
  }

  // Whoever still owns the most products is the original catalogue owner.
  const { rows: house } = await query<{ merchant_id: string; n: string }>(
    `SELECT merchant_id, COUNT(*) AS n FROM products
      WHERE merchant_id IS NOT NULL AND merchant_id <> ALL($1::uuid[])
      GROUP BY merchant_id ORDER BY COUNT(*) DESC LIMIT 1`,
    [merchantIds],
  );
  if (house.length) {
    await upsertStore(house[0].merchant_id, HOUSE_STORE);
    console.log(`  ${HOUSE_STORE.storeName}: kept ${house[0].n} products`);
  }

  // Products created by an earlier run of this script have no image, because
  // the first version of it did not set one. Rather than ask anyone to wipe the
  // database, give them one now.
  let fixed = 0;
  for (const spec of STORES) {
    for (const sp of spec.products) {
      if (!sp.art) continue;
      const { rows } = await query<{ id: string; image: string }>(
        'SELECT id, image FROM products WHERE name = $1', [sp.name]);
      if (!rows.length || rows[0].image) continue;
      const urls = await artFor(sp.art);
      await query('UPDATE products SET image = $1 WHERE id = $2', [urls[0], rows[0].id]);
      await query('DELETE FROM product_images WHERE product_id = $1', [rows[0].id]);
      for (const [i, url] of urls.entries()) {
        await query('INSERT INTO product_images(product_id, url, position) VALUES ($1,$2,$3)',
          [rows[0].id, url, i]);
      }
      fixed += 1;
    }
  }
  if (fixed) console.log(`  backfilled photographs for ${fixed} products`);

  console.log('\nCustomers');
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) customerIds.push(await ensureUser(c.email, 'customer'));

  console.log('\nSales history');
  // Without paid orders every storefront reads "0 sold", the trending row is
  // empty and the knowledge graph has no edges to learn from. These rows are the
  // same shape the real checkout writes.
  const { rows: candidates } = await query<any>(
    `SELECT p.id, p.name, p.price_paise FROM products p
      WHERE p.status = 'active' AND p.stock > 0 ORDER BY random() LIMIT 60`,
  );
  const existing = await query<{ n: string }>(
    'SELECT COUNT(*) AS n FROM orders WHERE user_id = ANY($1::uuid[])', [customerIds]);
  if (Number(existing.rows[0].n) >= 18) {
    console.log('  = demo customers already have orders, leaving them alone');
  } else {
    let made = 0;
    for (let i = 0; i < 24; i += 1) {
      const user = customerIds[i % customerIds.length];
      // Two or three lines per order, deliberately drawn from across the
      // catalogue — that is what makes the payout split and the "sold by"
      // column worth showing at all.
      const lines = [
        candidates[(i * 3) % candidates.length],
        candidates[(i * 7 + 1) % candidates.length],
        candidates[(i * 5 + 2) % candidates.length],
      ]
        .filter((v, idx, arr) => v && arr.findIndex((x) => x.id === v.id) === idx)
        .slice(0, 2 + (i % 2));
      const items = lines.map((l) => ({
        productId: l.id, name: l.name, qty: 1 + (i % 2), pricePaise: Number(l.price_paise),
      }));
      const total = items.reduce((s, it) => s + it.qty * it.pricePaise, 0);
      await query(
        `INSERT INTO orders(user_id, total_paise, subtotal_paise, status, items, created_at)
         VALUES ($1,$2,$2,'paid',$3::jsonb, now() - ($4 || ' days')::interval)`,
        [user, total, JSON.stringify(items), String(i % 25)],
      );
      made += 1;
    }
    console.log(`  + ${made} paid orders across ${customerIds.length} customers`);
  }

  const kg = await materializeKG();
  console.log(`  knowledge graph rebuilt: ${kg.edges} edges`);

  console.log('\n--- demo credentials ------------------------------');
  console.log(`  password for every account marked (demo): ${PASSWORD}`);
  console.log('  accounts without that mark predate this seed and keep their own.\n');
  const { rows: stores } = await query<any>(
    `SELECT mp.store_name, u.email, COUNT(p.id)::int AS n
       FROM merchant_profiles mp JOIN users u ON u.id = mp.merchant_id
       LEFT JOIN products p ON p.merchant_id = mp.merchant_id AND p.status = 'active'
      GROUP BY mp.store_name, u.email HAVING COUNT(p.id) > 0
      ORDER BY COUNT(p.id) DESC`);
  const seeded = new Set(STORES.map((x) => x.email));
  for (const s of stores) {
    const mark = seeded.has(s.email) ? '(demo)' : '      ';
    console.log(`  merchant ${mark} ${s.email.padEnd(24)} ${s.store_name} (${s.n} products)`);
  }
  for (const c of CUSTOMERS) console.log(`  customer (demo) ${c.email.padEnd(24)} ${c.note}`);
  console.log('---------------------------------------------------\n');
  await pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
