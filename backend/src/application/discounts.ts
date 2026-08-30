import { query } from '../adapters/db/pool.js';
import { Money } from '../domain/money.js';
import type { Paise } from '../domain/money.js';
import { HttpError } from './auth.js';

export interface Discount {
  id: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  active: boolean;
  automatic: boolean;
  minOrderPaise: Paise;
  usageLimit: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
}

const map = (r: any): Discount => ({
  id: r.id,
  code: r.code,
  kind: r.kind,
  value: r.value,
  active: r.active,
  automatic: r.automatic,
  minOrderPaise: Number(r.min_order_paise),
  usageLimit: r.usage_limit,
  usedCount: r.used_count,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
});

export interface DiscountInput {
  code: string;
  kind: 'percent' | 'fixed';
  value: number;          // percent points, or RUPEES for a fixed discount
  active?: boolean;
  automatic?: boolean;
  minOrderRupees?: number;
  usageLimit?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export async function listDiscounts(merchantId: string): Promise<Discount[]> {
  const { rows } = await query('SELECT * FROM discounts WHERE merchant_id=$1 ORDER BY created_at DESC', [merchantId]);
  return rows.map(map);
}

export async function createDiscount(merchantId: string, input: DiscountInput): Promise<Discount> {
  // A fixed discount is entered in rupees but stored in paise, like every other amount.
  const value = input.kind === 'fixed' ? Money.fromRupees(input.value) : Math.round(input.value);
  const { rows } = await query(
    `INSERT INTO discounts(merchant_id, code, kind, value, active, automatic, min_order_paise,
                           usage_limit, starts_at, ends_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      merchantId, input.code.trim().toUpperCase(), input.kind, value,
      input.active ?? true, input.automatic ?? false,
      Money.fromRupees(input.minOrderRupees ?? 0),
      input.usageLimit ?? null, input.startsAt ?? null, input.endsAt ?? null,
    ],
  ).catch((e: any) => {
    if (e?.code === '23505') throw new HttpError(409, 'that discount code already exists');
    throw e;
  });
  return map(rows[0]);
}

export async function deleteDiscount(merchantId: string, id: string): Promise<void> {
  const res = await query('DELETE FROM discounts WHERE id=$1 AND merchant_id=$2', [id, merchantId]);
  if (!res.rowCount) throw new HttpError(404, 'discount not found or not owned by you');
}

export async function toggleDiscount(merchantId: string, id: string, active: boolean): Promise<void> {
  const res = await query('UPDATE discounts SET active=$1 WHERE id=$2 AND merchant_id=$3', [active, id, merchantId]);
  if (!res.rowCount) throw new HttpError(404, 'discount not found or not owned by you');
}

export interface AppliedDiscount {
  discount: Discount;
  amountPaise: Paise;
  reason: string;
}

// Resolve a code (or the best automatic discount) against a subtotal.
// Returns null when nothing applies — never throws for "no discount", because a
// missing code is a normal outcome, not an error.
export async function resolveDiscount(subtotalPaise: Paise, code?: string): Promise<AppliedDiscount | null> {
  const { rows } = code
    ? await query('SELECT * FROM discounts WHERE upper(code) = upper($1)', [code.trim()])
    : await query('SELECT * FROM discounts WHERE automatic = true AND active = true');
  if (!rows.length) return null;

  const now = Date.now();
  const usable = rows.map(map).filter((d) => {
    if (!d.active) return false;
    if (d.startsAt && new Date(d.startsAt).getTime() > now) return false;
    if (d.endsAt && new Date(d.endsAt).getTime() < now) return false;
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return false;
    return subtotalPaise >= d.minOrderPaise;
  });
  if (!usable.length) return null;

  const priced = usable.map((d) => ({
    discount: d,
    // Never discount below zero — a fixed discount larger than the cart caps at the cart.
    amountPaise: Math.min(
      subtotalPaise,
      d.kind === 'percent' ? Math.round((subtotalPaise * d.value) / 100) : d.value,
    ),
  }));
  // If several automatic discounts qualify, the customer gets the best one.
  priced.sort((a, b) => b.amountPaise - a.amountPaise);
  const best = priced[0];
  return {
    ...best,
    reason: best.discount.kind === 'percent'
      ? `${best.discount.code}: ${best.discount.value}% off`
      : `${best.discount.code}: ${Money.format(best.discount.value)} off`,
  };
}

export async function recordDiscountUse(id: string): Promise<void> {
  await query('UPDATE discounts SET used_count = used_count + 1 WHERE id = $1', [id]);
}
