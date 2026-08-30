import { query } from '../adapters/db/pool.js';

// Real store analytics from the orders table. Every figure counts only THIS
// merchant's line items, so a shared order never inflates one merchant's numbers
// — the same scoping rule as listMerchantOrders().
const MY_LINES = `
  FROM orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
  LEFT JOIN products p
    ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                   THEN (item->>'productId')::uuid END
  WHERE p.merchant_id = $1`;

const lineValue = `((item->>'pricePaise')::bigint * (item->>'qty')::int)`;

export interface Summary {
  grossPaise: number;
  orders: number;
  paidOrders: number;
  aovPaise: number;
  conversionPct: number;
  unitsSold: number;
}

export async function summary(merchantId: string, days = 30): Promise<Summary> {
  const { rows } = await query<any>(
    `SELECT
       COALESCE(SUM(${lineValue}) FILTER (WHERE o.status='paid'), 0) AS gross,
       COUNT(DISTINCT o.id)                                          AS orders,
       COUNT(DISTINCT o.id) FILTER (WHERE o.status='paid')           AS paid_orders,
       COALESCE(SUM((item->>'qty')::int) FILTER (WHERE o.status='paid'), 0) AS units
     ${MY_LINES} AND o.created_at > now() - ($2 || ' days')::interval`,
    [merchantId, String(days)],
  );
  const r = rows[0];
  const paid = Number(r.paid_orders);
  const orders = Number(r.orders);
  const gross = Number(r.gross);
  return {
    grossPaise: gross,
    orders,
    paidOrders: paid,
    // Average order value over PAID orders only — including unpaid ones would
    // understate what a completed order is actually worth.
    aovPaise: paid ? Math.round(gross / paid) : 0,
    conversionPct: orders ? Math.round((paid / orders) * 1000) / 10 : 0,
    unitsSold: Number(r.units),
  };
}

export async function salesOverTime(merchantId: string, days = 30): Promise<{ day: string; paise: number; orders: number }[]> {
  // generate_series so days with no sales appear as zero rather than vanishing,
  // which would make the chart lie about the shape of the trend.
  const { rows } = await query<any>(
    `WITH days AS (
       SELECT generate_series(date_trunc('day', now()) - ($2 || ' days')::interval,
                              date_trunc('day', now()), '1 day')::date AS d
     ),
     sales AS (
       SELECT date_trunc('day', o.created_at)::date AS d,
              SUM(${lineValue}) AS paise,
              COUNT(DISTINCT o.id) AS orders
       ${MY_LINES} AND o.status = 'paid'
       GROUP BY 1
     )
     SELECT days.d AS day, COALESCE(sales.paise, 0) AS paise, COALESCE(sales.orders, 0) AS orders
       FROM days LEFT JOIN sales ON sales.d = days.d
      ORDER BY days.d`,
    [merchantId, String(days)],
  );
  return rows.map((r) => ({ day: r.day, paise: Number(r.paise), orders: Number(r.orders) }));
}

export async function topProducts(merchantId: string, limit = 10): Promise<any[]> {
  const { rows } = await query<any>(
    `SELECT item->>'productId' AS product_id,
            MAX(item->>'name')  AS name,
            SUM((item->>'qty')::int) AS units,
            SUM(${lineValue})   AS paise
     ${MY_LINES} AND o.status = 'paid'
     GROUP BY 1 ORDER BY paise DESC LIMIT $2`,
    [merchantId, limit],
  );
  return rows.map((r) => ({
    productId: r.product_id, name: r.name, units: Number(r.units), paise: Number(r.paise),
  }));
}

// Products with stock at or below a threshold — the merchant agent's
// low_stock_report tool reads this too.
export async function lowStock(merchantId: string, threshold = 5): Promise<any[]> {
  const { rows } = await query<any>(
    `SELECT v.id AS variant_id, v.title AS variant_title, v.stock, v.sku,
            p.id AS product_id, p.name
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE p.merchant_id = $1 AND p.track_inventory AND v.stock <= $2
      ORDER BY v.stock ASC, p.name`,
    [merchantId, threshold],
  );
  return rows.map((r) => ({
    variantId: r.variant_id, variantTitle: r.variant_title, stock: r.stock,
    sku: r.sku, productId: r.product_id, name: r.name,
  }));
}
