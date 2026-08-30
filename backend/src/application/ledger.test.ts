import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

const rows = vi.hoisted(() => ({ current: [] as any[] }));
vi.mock('../adapters/db/pool.js', () => ({
  query: vi.fn(async () => ({ rows: rows.current })),
  withTransaction: vi.fn(),
  pool: {},
}));

const { verifyChain } = await import('./ledger.js');

const GENESIS = '0'.repeat(64);

// Mirrors ledger.ts. Duplicated deliberately: if someone changes the hashing
// algorithm, every ledger ever written becomes unverifiable, so that change
// should break a test loudly rather than pass silently.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as any)[k])}`).join(',')}}`;
}
const hash = (prev: string, payload: unknown, ts: string) =>
  createHash('sha256').update(prev + canonical(payload) + ts).digest('hex');

function chain(userId: string, payloads: unknown[]) {
  let prev = GENESIS;
  return payloads.map((payload, i) => {
    const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    const h = hash(prev, payload, ts);
    const row = { id: i + 1, user_id: userId, prev_hash: prev, payload, ts, hash: h };
    prev = h;
    return row;
  });
}

describe('verifyChain', () => {
  beforeEach(() => { rows.current = []; });

  it('accepts an intact chain', async () => {
    rows.current = chain('u1', [{ intent: 'buy', total_paise: 50000 }, { intent: 'buy', total_paise: 12000 }]);
    expect(await verifyChain('intent_ledger')).toEqual({ ok: true, count: 2 });
  });

  it('accepts an empty ledger', async () => {
    expect(await verifyChain('intent_ledger')).toEqual({ ok: true, count: 0 });
  });

  it('detects a tampered payload', async () => {
    const c = chain('u1', [{ total_paise: 50000 }, { total_paise: 12000 }]);
    c[1].payload = { total_paise: 1 }; // someone edited the amount after the fact
    rows.current = c;
    const r = await verifyChain('intent_ledger');
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(2);
  });

  it('detects a deleted row, because the next prev_hash no longer matches', async () => {
    const c = chain('u1', [{ a: 1 }, { b: 2 }, { c: 3 }]);
    rows.current = [c[0], c[2]]; // middle row removed
    const r = await verifyChain('intent_ledger');
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(3);
  });

  it('keeps a separate chain per user', async () => {
    rows.current = [...chain('u1', [{ a: 1 }]), ...chain('u2', [{ b: 2 }])];
    // Each user restarts from genesis, so two independent chains both verify.
    expect((await verifyChain('intent_ledger')).ok).toBe(true);
  });

  // The reason canonical() sorts keys: Postgres JSONB does not preserve key
  // order, so a payload read back in a different order must hash identically.
  it('is insensitive to JSONB key reordering', async () => {
    const c = chain('u1', [{ intent: 'buy', total_paise: 50000, items: [{ qty: 1, id: 'x' }] }]);
    c[0].payload = { total_paise: 50000, items: [{ id: 'x', qty: 1 }], intent: 'buy' } as any;
    rows.current = c;
    expect((await verifyChain('intent_ledger')).ok).toBe(true);
  });
});
