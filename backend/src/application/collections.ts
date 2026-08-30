import { query, withTransaction } from '../adapters/db/pool.js';
import type { Collection } from '../domain/types.js';
import { HttpError } from './auth.js';

const map = (r: any): Collection => ({
  id: r.id,
  merchantId: r.merchant_id,
  title: r.title,
  handle: r.handle,
  description: r.description,
  image: r.image,
  productCount: r.product_count === undefined ? undefined : Number(r.product_count),
});

const slug = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'collection';

// Public: every collection that has at least one active product. Drives the
// storefront rows and the customer agent's browse_collection tool.
export async function listCollections(merchantId?: string): Promise<Collection[]> {
  const { rows } = await query(
    `SELECT c.*, COUNT(cp.product_id) AS product_count
       FROM collections c
       LEFT JOIN collection_products cp ON cp.collection_id = c.id
       ${merchantId ? 'WHERE c.merchant_id = $1' : ''}
      GROUP BY c.id ORDER BY c.title`,
    merchantId ? [merchantId] : [],
  );
  return rows.map(map);
}

export async function getCollectionByHandle(handle: string): Promise<Collection> {
  const { rows } = await query('SELECT * FROM collections WHERE handle = $1 LIMIT 1', [handle]);
  if (!rows.length) throw new HttpError(404, 'no such collection');
  return map(rows[0]);
}

export interface CollectionInput {
  title: string;
  description?: string;
  image?: string;
  productIds?: string[];
}

export async function upsertCollection(
  merchantId: string,
  input: CollectionInput,
  id?: string,
): Promise<Collection> {
  const handle = slug(input.title);
  const collectionId = await withTransaction(async (client) => {
    let cid = id;
    if (cid) {
      const upd = await client.query(
        `UPDATE collections SET title=$1, handle=$2, description=$3, image=$4
          WHERE id=$5 AND merchant_id=$6 RETURNING id`,
        [input.title, handle, input.description ?? '', input.image ?? '', cid, merchantId],
      );
      if (!upd.rowCount) throw new HttpError(404, 'collection not found or not owned by you');
    } else {
      const ins = await client.query(
        `INSERT INTO collections(merchant_id, title, handle, description, image)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [merchantId, input.title, handle, input.description ?? '', input.image ?? ''],
      );
      cid = ins.rows[0].id;
    }
    if (input.productIds) {
      await client.query('DELETE FROM collection_products WHERE collection_id = $1', [cid]);
      for (const [i, pid] of input.productIds.entries()) {
        // Only the merchant's own products — a collection can't reach across stores.
        await client.query(
          `INSERT INTO collection_products(collection_id, product_id, position)
           SELECT $1, id, $2 FROM products WHERE id = $3 AND merchant_id = $4
           ON CONFLICT DO NOTHING`,
          [cid, i, pid, merchantId],
        );
      }
    }
    return cid!;
  });
  const { rows } = await query('SELECT * FROM collections WHERE id = $1', [collectionId]);
  return map(rows[0]);
}

export async function deleteCollection(merchantId: string, id: string): Promise<void> {
  const res = await query('DELETE FROM collections WHERE id=$1 AND merchant_id=$2', [id, merchantId]);
  if (!res.rowCount) throw new HttpError(404, 'collection not found or not owned by you');
}

export async function collectionProductIds(collectionId: string): Promise<string[]> {
  const { rows } = await query<{ product_id: string }>(
    'SELECT product_id FROM collection_products WHERE collection_id=$1 ORDER BY position',
    [collectionId],
  );
  return rows.map((r) => r.product_id);
}
