import { query } from '../adapters/db/pool.js';
import * as razorpay from '../adapters/razorpay/razorpay.js';
import type { Paise } from '../domain/money.js';
import { writeAudit } from './audit.js';
import { HttpError } from './auth.js';

// Splitting a payment between the platform and the merchant who owns the goods.
//
// Razorpay Route does this properly with linked accounts. Route is not enabled
// on every test account, so this module ALWAYS records the split locally and
// treats the Route call as an enhancement. If Route is unavailable the merchant
// still sees an accurate payout balance — the number is honest either way, and
// the demo never depends on an account feature we can't guarantee.

export interface LinkedAccount {
  merchantId: string;
  razorpayAccountId: string | null;
  businessName: string;
  status: 'pending' | 'active' | 'unavailable';
  detail: string;
}

const mapAccount = (r: any): LinkedAccount => ({
  merchantId: r.merchant_id,
  razorpayAccountId: r.razorpay_account_id,
  businessName: r.business_name,
  status: r.status,
  detail: r.detail,
});

export async function getLinkedAccount(merchantId: string): Promise<LinkedAccount | null> {
  const { rows } = await query('SELECT * FROM linked_accounts WHERE merchant_id = $1', [merchantId]);
  return rows.length ? mapAccount(rows[0]) : null;
}

// Onboard the merchant for Route. If the API rejects us — Route not enabled,
// or the account lacks permission — record that plainly rather than failing the
// request: the merchant can still trade, they just settle through the ledger.
export async function linkAccount(
  merchantId: string,
  email: string,
  businessName: string,
): Promise<LinkedAccount> {
  let accountId: string | null = null;
  let status: LinkedAccount['status'] = 'unavailable';
  let detail = '';

  try {
    const account = await razorpay.createLinkedAccount(email, businessName);
    accountId = account.id;
    status = 'active';
    detail = 'Razorpay Route linked account created';
  } catch (e: any) {
    detail = `Route unavailable — settling via the payout ledger (${e?.error?.description ?? e?.message ?? 'unknown'})`;
  }

  const { rows } = await query(
    `INSERT INTO linked_accounts(merchant_id, razorpay_account_id, business_name, status, detail)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (merchant_id) DO UPDATE SET
       razorpay_account_id = EXCLUDED.razorpay_account_id,
       business_name = EXCLUDED.business_name,
       status = EXCLUDED.status,
       detail = EXCLUDED.detail
     RETURNING *`,
    [merchantId, accountId, businessName, status, detail],
  );
  await writeAudit({
    actor: 'merchant', action: 'link_payout_account', target: merchantId,
    reason: detail, verified: status === 'active',
  });
  return mapAccount(rows[0]);
}

export interface Split {
  merchantId: string;
  amountPaise: Paise;
  razorpayAccountId: string | null;
}

// Who earned what on this order, from the order's own line items. Reads the
// stored snapshot rather than today's products, so a later ownership change
// can't rewrite history.
//
// CRITICAL: line items are PRE-discount. Paying merchants the sum of their line
// items would settle more than the customer was actually charged. So each
// merchant's share is prorated against what was really captured, and the last
// merchant absorbs the rounding remainder — the splits must sum to the captured
// amount EXACTLY, never a paise more.
export async function splitForOrder(orderId: string): Promise<Split[]> {
  const { rows } = await query<any>(
    `SELECT p.merchant_id,
            SUM(((item->>'pricePaise')::bigint) * ((item->>'qty')::int)) AS amount,
            MAX(la.razorpay_account_id) AS account_id,
            MAX(o.total_paise)    AS total_paise,
            MAX(o.subtotal_paise) AS subtotal_paise
       FROM orders o
       CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
       JOIN products p
         ON p.id = CASE WHEN item->>'productId' ~ '^[0-9a-f-]{36}$'
                        THEN (item->>'productId')::uuid END
       LEFT JOIN linked_accounts la ON la.merchant_id = p.merchant_id
      WHERE o.id = $1 AND p.merchant_id IS NOT NULL
      GROUP BY p.merchant_id
      ORDER BY p.merchant_id`,
    [orderId],
  );
  if (!rows.length) return [];

  const captured = Number(rows[0].total_paise);
  // subtotal_paise is 0 on rows written before the discount migration; fall back
  // to the line sum so those orders still split correctly.
  const lineSum = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const base = Number(rows[0].subtotal_paise) || lineSum;

  const splits: Split[] = rows.map((r) => ({
    merchantId: r.merchant_id,
    amountPaise: base === captured ? Number(r.amount) : Math.floor((Number(r.amount) * captured) / base),
    razorpayAccountId: r.account_id,
  }));

  // Flooring each share can leave a few paise unallocated; give them to the last
  // merchant so the total reconciles to the captured amount.
  const allocated = splits.reduce((s, x) => s + x.amountPaise, 0);
  splits[splits.length - 1].amountPaise += captured - allocated;
  return splits;
}

// Called after a payment is verified. Idempotent: the unique index on
// (order_id, merchant_id) means a replayed webhook can never pay twice.
export async function settleOrder(orderId: string, razorpayPaymentId: string | null): Promise<Split[]> {
  const splits = await splitForOrder(orderId);

  for (const s of splits) {
    let transferId: string | null = null;
    let mode: 'route' | 'ledger' = 'ledger';
    let status = 'pending';
    let detail = 'recorded in the payout ledger';

    if (s.razorpayAccountId && razorpayPaymentId) {
      try {
        const t = await razorpay.transferToAccount(razorpayPaymentId, s.razorpayAccountId, s.amountPaise);
        transferId = t.id;
        mode = 'route';
        status = t.status ?? 'processed';
        detail = 'transferred via Razorpay Route';
      } catch (e: any) {
        detail = `Route transfer failed, kept in the ledger (${e?.error?.description ?? e?.message ?? 'unknown'})`;
      }
    }

    await query(
      `INSERT INTO transfers(order_id, merchant_id, amount_paise, razorpay_transfer_id, status, mode, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (order_id, merchant_id) DO NOTHING`,
      [orderId, s.merchantId, s.amountPaise, transferId, status, mode, detail],
    );
    await writeAudit({
      actor: 'system', action: 'merchant_payout', target: orderId,
      amountPaise: s.amountPaise, reason: detail, verified: mode === 'route',
    });
  }
  return splits;
}

export interface PayoutBalance {
  totalPaise: Paise;
  settledPaise: Paise;
  pendingPaise: Paise;
  mode: 'route' | 'ledger' | 'none';
  transfers: any[];
}

export async function payoutBalance(merchantId: string): Promise<PayoutBalance> {
  const { rows } = await query<any>(
    `SELECT t.*, o.created_at AS order_at
       FROM transfers t JOIN orders o ON o.id = t.order_id
      WHERE t.merchant_id = $1 ORDER BY t.created_at DESC LIMIT 100`,
    [merchantId],
  );
  const transfers = rows.map((r) => ({
    orderId: r.order_id,
    amountPaise: Number(r.amount_paise),
    status: r.status,
    mode: r.mode,
    detail: r.detail,
    razorpayTransferId: r.razorpay_transfer_id,
    createdAt: r.created_at,
  }));
  const total = transfers.reduce((s, t) => s + t.amountPaise, 0);
  const settled = transfers.filter((t) => t.mode === 'route').reduce((s, t) => s + t.amountPaise, 0);
  return {
    totalPaise: total,
    settledPaise: settled,
    pendingPaise: total - settled,
    mode: transfers.length ? (transfers.some((t) => t.mode === 'route') ? 'route' : 'ledger') : 'none',
    transfers,
  };
}

export function assertMerchant(userId: string | undefined): string {
  if (!userId) throw new HttpError(401, 'unauthenticated');
  return userId;
}
