import { query, withTransaction } from '../adapters/db/pool.js';
import { Money } from '../domain/money.js';
import type { Product, ProductImage, ProductOption, Variant } from '../domain/types.js';
import { HttpError } from './auth.js';

// Every product read carries its seller. One LEFT JOIN, so a merchant who has
// not named their store yet still returns a product rather than nothing.
const WITH_SELLER = `FROM products p
       LEFT JOIN merchant_profiles mp ON mp.merchant_id = p.merchant_id`;
const SELLER_COLS = `p.*, mp.store_name AS seller_name, mp.slug AS seller_slug`;

function mapRow(r: any): Product {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    sellerName: r.seller_name ?? '',
    sellerSlug: r.seller_slug ?? '',
    name: r.name,
    description: r.description,
    pricePaise: Number(r.price_paise),
    stock: r.stock,
    category: r.category,
    rating: Number(r.rating),
    image: r.image,
    createdAt: r.created_at,
    status: r.status,
    productType: r.product_type,
    vendor: r.vendor,
    tags: r.tags ?? [],
    compareAtPaise: r.compare_at_paise === null ? null : Number(r.compare_at_paise),
    costPaise: r.cost_paise === null ? null : Number(r.cost_paise),
    trackInventory: r.track_inventory,
    sellWhenOutOfStock: r.sell_when_out_of_stock,
    physical: r.physical,
    weightGrams: r.weight_grams,
    countryOfOrigin: r.country_of_origin,
    hsCode: r.hs_code,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    options: r.options ?? [],
  };
}

function mapVariant(r: any): Variant {
  return {
    id: r.id,
    productId: r.product_id,
    title: r.title,
    optionValues: r.option_values ?? {},
    pricePaise: Number(r.price_paise),
    compareAtPaise: r.compare_at_paise === null ? null : Number(r.compare_at_paise),
    sku: r.sku,
    barcode: r.barcode,
    stock: r.stock,
    weightGrams: r.weight_grams,
    imageUrl: r.image_url,
    position: r.position,
  };
}

const mapImage = (r: any): ProductImage => ({ id: r.id, url: r.url, alt: r.alt, position: r.position });

export interface CatalogFilter {
  q?: string;
  name?: string;
  category?: string;
  categories?: string[];
  collectionId?: string;
  merchantId?: string;
  maxPaise?: number;
  limit?: number;
  includeDrafts?: boolean;
}

// The ONE read path. Agents + storefront both use only this.
// Drafts are hidden unless a merchant explicitly asks for them.
export async function getCatalog(f: CatalogFilter = {}): Promise<Product[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!f.includeDrafts) where.push(`p.status = 'active'`);
  if (f.q) {
    params.push(`%${f.q}%`);
    const p = `$${params.length}`;
    where.push(`(p.name ILIKE ${p} OR p.category ILIKE ${p})`); // no description — avoids false positives
  }
  if (f.name) {
    params.push(`%${f.name}%`);
    where.push(`p.name ILIKE $${params.length}`); // NAME only (precise keyword search)
  }
  if (f.category) {
    params.push(f.category);
    where.push(`p.category = $${params.length}`);
  }
  if (f.categories?.length) {
    params.push(f.categories);
    where.push(`p.category = ANY($${params.length})`);
  }
  if (f.collectionId) {
    params.push(f.collectionId);
    where.push(`EXISTS (SELECT 1 FROM collection_products cp
                         WHERE cp.product_id = p.id AND cp.collection_id = $${params.length})`);
  }
  if (f.merchantId) {
    params.push(f.merchantId);
    where.push(`p.merchant_id = $${params.length}`);
  }
  if (typeof f.maxPaise === 'number') {
    params.push(f.maxPaise);
    where.push(`p.price_paise <= $${params.length}`);
  }
  params.push(f.limit ?? 100);
  const sql = `SELECT ${SELLER_COLS} ${WITH_SELLER} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY p.rating DESC, p.created_at DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return rows.map(mapRow);
}

// Full detail: the product plus its images and variants. This is what the
// product page and the merchant editor read.
export async function getProduct(id: string): Promise<Product> {
  const { rows } = await query(`SELECT ${SELLER_COLS} ${WITH_SELLER} WHERE p.id = $1`, [id]);
  if (!rows.length) throw new HttpError(404, 'no such product');
  const product = mapRow(rows[0]);
  const [images, variants] = await Promise.all([
    query('SELECT * FROM product_images WHERE product_id = $1 ORDER BY position', [id]),
    query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY position, created_at', [id]),
  ]);
  product.images = images.rows.map(mapImage);
  product.variants = variants.rows.map(mapVariant);
  return product;
}

// The sellable unit. Everything that takes money resolves a variant first.
export async function getVariant(variantId: string): Promise<Variant & { productName: string; productImage: string }> {
  const { rows } = await query<any>(
    `SELECT v.*, p.name AS product_name, p.image AS product_image
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id = $1`,
    [variantId],
  );
  if (!rows.length) throw new HttpError(404, 'no such variant');
  return { ...mapVariant(rows[0]), productName: rows[0].product_name, productImage: rows[0].product_image };
}

// A product's default (first) variant — what "add this product" means when the
// caller doesn't name a variant.
export async function defaultVariantId(productId: string): Promise<string> {
  const { rows } = await query<{ id: string }>(
    'SELECT id FROM product_variants WHERE product_id = $1 ORDER BY position, created_at LIMIT 1',
    [productId],
  );
  if (!rows.length) throw new HttpError(404, 'product has no variants');
  return rows[0].id;
}

// ---------------------------------------------------------------- write path
export interface VariantInput {
  id?: string;
  title?: string;
  optionValues?: Record<string, string>;
  priceRupees: number;
  compareAtRupees?: number | null;
  sku?: string;
  barcode?: string;
  stock: number;
  weightGrams?: number;
  imageUrl?: string;
}

export interface ProductInput {
  name: string;
  description?: string;
  category?: string;
  status?: 'active' | 'draft';
  productType?: string;
  vendor?: string;
  tags?: string[];
  costRupees?: number | null;
  trackInventory?: boolean;
  sellWhenOutOfStock?: boolean;
  physical?: boolean;
  weightGrams?: number;
  countryOfOrigin?: string;
  hsCode?: string;
  seoTitle?: string;
  seoDescription?: string;
  options?: ProductOption[];
  images?: string[];      // urls, in order
  variants?: VariantInput[];
  // Convenience for the simple single-variant case (and older callers).
  priceRupees?: number;
  stock?: number;
  image?: string;
}

const rupeesToPaise = (v: number | null | undefined) =>
  v === null || v === undefined ? null : Money.fromRupees(v);

// Normalise either shape — a simple product, or one with an explicit variant
// list — into the variant rows we actually store.
function variantRows(input: ProductInput): VariantInput[] {
  if (input.variants?.length) return input.variants;
  return [{
    title: 'Default',
    priceRupees: input.priceRupees ?? 0,
    stock: input.stock ?? 0,
    imageUrl: input.image ?? input.images?.[0] ?? '',
  }];
}

// Written out in full rather than generated: the column list and the parameter
// numbering have to agree exactly, and clever string manipulation here would be
// a silent SQL bug waiting to happen.
function productParams(input: ProductInput, variants: VariantInput[]) {
  // Compare-at follows the cheapest variant, so a strike-through price is consistent.
  const compareAt = variants.find((v) => v.compareAtRupees)?.compareAtRupees ?? null;
  return [
    input.name,
    input.description ?? '',
    input.category ?? 'general',
    input.status ?? 'active',
    input.productType ?? '',
    input.vendor ?? '',
    input.tags ?? [],
    rupeesToPaise(compareAt),
    rupeesToPaise(input.costRupees),
    input.trackInventory ?? true,
    input.sellWhenOutOfStock ?? false,
    input.physical ?? true,
    input.weightGrams ?? 0,
    input.countryOfOrigin ?? '',
    input.hsCode ?? '',
    input.seoTitle ?? '',
    input.seoDescription ?? '',
    JSON.stringify(input.options ?? []),
  ]; // 18 values, $1..$18
}

async function replaceImages(client: any, productId: string, urls: string[]) {
  await client.query('DELETE FROM product_images WHERE product_id = $1', [productId]);
  for (const [i, url] of urls.entries()) {
    if (url) await client.query('INSERT INTO product_images(product_id, url, position) VALUES ($1,$2,$3)', [productId, url, i]);
  }
  // products.image stays the first image so existing callers keep working.
  await client.query('UPDATE products SET image = $1 WHERE id = $2', [urls[0] ?? '', productId]);
}

async function writeVariants(client: any, productId: string, variants: VariantInput[]) {
  const keep: string[] = [];
  for (const [i, v] of variants.entries()) {
    const params = [
      v.title ?? 'Default', JSON.stringify(v.optionValues ?? {}), Money.fromRupees(v.priceRupees),
      rupeesToPaise(v.compareAtRupees), v.sku ?? '', v.barcode ?? '',
      v.stock, v.weightGrams ?? 0, v.imageUrl ?? '', i,
    ];
    if (v.id) {
      const upd = await client.query(
        `UPDATE product_variants SET title=$1, option_values=$2, price_paise=$3, compare_at_paise=$4,
                sku=$5, barcode=$6, stock=$7, weight_grams=$8, image_url=$9, position=$10
          WHERE id=$11 AND product_id=$12 RETURNING id`,
        [...params, v.id, productId],
      );
      if (upd.rowCount) { keep.push(v.id); continue; }
    }
    const ins = await client.query(
      `INSERT INTO product_variants(title, option_values, price_paise, compare_at_paise, sku, barcode,
                                    stock, weight_grams, image_url, position, product_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [...params, productId],
    );
    keep.push(ins.rows[0].id);
  }
  // Removing a variant deletes its cart lines too (FK cascade) — deliberate:
  // a line pointing at a variant that no longer sells cannot be checked out.
  await client.query(
    `DELETE FROM product_variants WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))`,
    [productId, keep],
  );
}

export async function createProduct(merchantId: string, input: ProductInput): Promise<Product> {
  const variants = variantRows(input);
  const id = await withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO products(
         name, description, category, status, product_type, vendor, tags,
         compare_at_paise, cost_paise, track_inventory, sell_when_out_of_stock, physical,
         weight_grams, country_of_origin, hs_code, seo_title, seo_description, options,
         merchant_id, price_paise, stock)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,0,0)
       RETURNING id`,
      [...productParams(input, variants), merchantId],
    );
    const pid = ins.rows[0].id;
    // The rollup trigger fills price_paise/stock from the variants below.
    await writeVariants(client, pid, variants);
    await replaceImages(client, pid, input.images ?? (input.image ? [input.image] : []));
    return pid;
  });
  return getProduct(id);
}

export async function updateProduct(merchantId: string, id: string, input: ProductInput): Promise<Product> {
  const variants = variantRows(input);
  await withTransaction(async (client) => {
    const upd = await client.query(
      `UPDATE products SET
         name=$1, description=$2, category=$3, status=$4, product_type=$5, vendor=$6, tags=$7,
         compare_at_paise=$8, cost_paise=$9, track_inventory=$10, sell_when_out_of_stock=$11,
         physical=$12, weight_grams=$13, country_of_origin=$14, hs_code=$15, seo_title=$16,
         seo_description=$17, options=$18
        WHERE id=$19 AND merchant_id=$20 RETURNING id`,
      [...productParams(input, variants), id, merchantId],
    );
    if (!upd.rowCount) throw new HttpError(404, 'product not found or not owned by you');
    await writeVariants(client, id, variants);
    await replaceImages(client, id, input.images ?? (input.image ? [input.image] : []));
  });
  return getProduct(id);
}

export async function deleteProduct(merchantId: string, id: string): Promise<void> {
  const res = await query('DELETE FROM products WHERE id=$1 AND merchant_id=$2', [id, merchantId]);
  if (!res.rowCount) throw new HttpError(404, 'product not found or not owned by you');
}

export async function listOwnProducts(merchantId: string): Promise<Product[]> {
  const { rows } = await query(
    `SELECT ${SELLER_COLS} ${WITH_SELLER} WHERE p.merchant_id = $1 ORDER BY p.created_at DESC`,
    [merchantId],
  );
  return rows.map(mapRow);
}

// Flat variant list for the Inventory screen.
export async function listInventory(merchantId: string): Promise<any[]> {
  const { rows } = await query(
    `SELECT v.id, v.sku, v.barcode, v.stock, v.price_paise, v.title AS variant_title,
            p.id AS product_id, p.name AS product_name, p.image, p.track_inventory
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.merchant_id = $1
      ORDER BY p.name, v.position`,
    [merchantId],
  );
  return rows.map((r: any) => ({
    variantId: r.id, sku: r.sku, barcode: r.barcode, stock: r.stock,
    pricePaise: Number(r.price_paise), variantTitle: r.variant_title,
    productId: r.product_id, productName: r.product_name, image: r.image,
    trackInventory: r.track_inventory,
  }));
}

export async function adjustInventory(merchantId: string, variantId: string, stock: number): Promise<void> {
  const res = await query(
    `UPDATE product_variants v SET stock = $1
       FROM products p WHERE p.id = v.product_id AND v.id = $2 AND p.merchant_id = $3`,
    [stock, variantId, merchantId],
  );
  if (!res.rowCount) throw new HttpError(404, 'variant not found or not owned by you');
}
