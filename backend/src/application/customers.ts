import { query } from '../adapters/db/pool.js';

// Customers and segments, derived entirely from orders — no new tracking tables.
// "This merchant's customers" means anyone who has ordered one of their products,
// so the same SQL shape as listMerchantOrders is reused: match order line items
// against products this merchant owns.
const OWNS_A_LINE = `
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.items) item
      JOIN products p
        ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                       THEN (item->>'productId')::uuid END
     WHERE p.merchant_id = $1
  )`;

export interface CustomerRow {
  userId: string;
  email: string;
  orders: number;
  paidOrders: number;
  spentPaise: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export async function listCustomers(merchantId: string, segment?: string): Promise<CustomerRow[]> {
  const { rows } = await query<any>(
    `SELECT u.id, u.email,
            COUNT(o.id)                                  AS orders,
            COUNT(o.id) FILTER (WHERE o.status='paid')   AS paid_orders,
            COALESCE(SUM(o.total_paise) FILTER (WHERE o.status='paid'), 0) AS spent,
            MIN(o.created_at) AS first_at,
            MAX(o.created_at) AS last_at
       FROM users u
       JOIN orders o ON o.user_id = u.id
      WHERE ${OWNS_A_LINE}
      GROUP BY u.id, u.email
      ORDER BY spent DESC`,
    [merchantId],
  );
  const all: CustomerRow[] = rows.map((r) => ({
    userId: r.id,
    email: r.email,
    orders: Number(r.orders),
    paidOrders: Number(r.paid_orders),
    spentPaise: Number(r.spent),
    firstOrderAt: r.first_at,
    lastOrderAt: r.last_at,
  }));
  if (!segment) return all;
  if (segment === 'once') return all.filter((c) => c.paidOrders === 1);
  if (segment === 'repeat') return all.filter((c) => c.paidOrders > 1);
  if (segment === 'never') return all.filter((c) => c.paidOrders === 0);
  return all;
}

export interface Segment {
  key: string;
  name: string;
  count: number;
  description: string;
}

// The Shopify default segments, all computable from what we already store.
// "Abandoned checkout" = an order that was created but never paid and is now
// older than 30 minutes — the same signal Shopify uses, from our own data.
export async function listSegments(merchantId: string): Promise<Segment[]> {
  const customers = await listCustomers(merchantId);
  const abandoned = await query<{ n: string }>(
    `SELECT COUNT(DISTINCT o.user_id) AS n
       FROM orders o
      WHERE o.status IN ('created','failed')
        AND o.created_at < now() - interval '30 minutes'
        AND ${OWNS_A_LINE}`,
    [merchantId],
  );
  const registered = await query<{ n: string }>('SELECT COUNT(*) AS n FROM users');

  return [
    { key: 'once', name: 'Purchased at least once', description: 'Customers with exactly one paid order',
      count: customers.filter((c) => c.paidOrders === 1).length },
    { key: 'repeat', name: 'Purchased more than once', description: 'Your returning customers',
      count: customers.filter((c) => c.paidOrders > 1).length },
    { key: 'never', name: "Haven't purchased", description: 'Ordered but never completed a payment',
      count: customers.filter((c) => c.paidOrders === 0).length },
    { key: 'abandoned', name: 'Abandoned checkouts', description: 'Started checkout over 30 minutes ago, never paid',
      count: Number(abandoned.rows[0].n) },
    { key: 'subscribers', name: 'Registered accounts', description: 'Everyone with an account on the store',
      count: Number(registered.rows[0].n) },
  ];
}
