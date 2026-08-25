import { createHash } from 'node:crypto';
import { query } from '../adapters/db/pool.js';

// Hash-chained, append-only ledgers = our tamper-evident "permissioned-ledger alternative".
// hash = SHA256(prev_hash + JSON(payload) + ts). Any tamper breaks the chain.

const GENESIS = '0'.repeat(64);

type LedgerName = 'intent_ledger' | 'checkout_ledger';

// Deterministic JSON (sorted keys) so the hash survives a JSONB round-trip,
// which does NOT preserve key order or whitespace.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(',')}}`;
}

function computeHash(prevHash: string, payload: unknown, ts: string): string {
  return createHash('sha256').update(prevHash + canonical(payload) + ts).digest('hex');
}

async function lastHash(table: LedgerName, userId: string): Promise<string> {
  const { rows } = await query<{ hash: string }>(
    `SELECT hash FROM ${table} WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [userId],
  );
  return rows[0]?.hash ?? GENESIS;
}

export async function writeIntentLedger(
  userId: string,
  payload: unknown,
  limitSnapshot: unknown,
): Promise<{ id: number; hash: string }> {
  const prev = await lastHash('intent_ledger', userId);
  const ts = new Date().toISOString();
  const hash = computeHash(prev, payload, ts);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO intent_ledger(user_id, prev_hash, payload, limit_snapshot, ts, hash)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [userId, prev, JSON.stringify(payload), JSON.stringify(limitSnapshot), ts, hash],
  );
  return { id: rows[0].id, hash };
}

export async function writeCheckoutLedger(userId: string, payload: unknown): Promise<{ id: number; hash: string }> {
  const prev = await lastHash('checkout_ledger', userId);
  const ts = new Date().toISOString();
  const hash = computeHash(prev, payload, ts);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO checkout_ledger(user_id, prev_hash, payload, ts, hash)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [userId, prev, JSON.stringify(payload), ts, hash],
  );
  return { id: rows[0].id, hash };
}

// Re-walk the chain and confirm every hash still matches. Used by the audit panel.
export async function verifyChain(table: LedgerName): Promise<{ ok: boolean; brokenAt?: number; count: number }> {
  const { rows } = await query<any>(
    `SELECT id, user_id, prev_hash, payload, ts, hash FROM ${table} ORDER BY user_id, id ASC`,
  );
  const lastByUser = new Map<string, string>();
  for (const r of rows) {
    const expectedPrev = lastByUser.get(r.user_id) ?? GENESIS;
    const ts = new Date(r.ts).toISOString();
    const recomputed = computeHash(expectedPrev, r.payload, ts);
    if (r.prev_hash !== expectedPrev || recomputed !== r.hash) {
      return { ok: false, brokenAt: r.id, count: rows.length };
    }
    lastByUser.set(r.user_id, r.hash);
  }
  return { ok: true, count: rows.length };
}

export async function listLedger(table: LedgerName, limit = 100): Promise<any[]> {
  const { rows } = await query(
    `SELECT id, user_id, prev_hash, payload, ts, hash FROM ${table} ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
