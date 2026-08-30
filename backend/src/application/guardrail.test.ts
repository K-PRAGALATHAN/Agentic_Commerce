import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pool connects to Postgres at import time, so stub it before importing
// anything that pulls it in.
const rows = vi.hoisted(() => ({ current: [] as { key: string; value: unknown }[] }));
vi.mock('../adapters/db/pool.js', () => ({
  query: vi.fn(async () => ({ rows: rows.current })),
  withTransaction: vi.fn(),
  pool: {},
}));
vi.mock('../config/env.js', () => ({
  config: { guardrail: { merchantMaxOrderPaise: 5_000_000 } }, // ₹50,000
}));

const { checkSpendLimit } = await import('./guardrail.js');

const withUserLimit = (paise: number) => { rows.current = [{ key: 'spend_limit_paise', value: paise }]; };

// The guardrail is the "bounded" half of the rubric. If it silently stops
// rejecting, an agent can spend past the user's limit — so these are the most
// important assertions in the repo.
describe('checkSpendLimit', () => {
  beforeEach(() => { rows.current = []; });

  it('allows a total below the limit', async () => {
    withUserLimit(100000); // ₹1000
    const r = await checkSpendLimit('u1', 50000);
    expect(r.allowed).toBe(true);
    expect(r.effectiveLimitPaise).toBe(100000);
  });

  it('allows a total exactly ON the limit', async () => {
    withUserLimit(100000);
    expect((await checkSpendLimit('u1', 100000)).allowed).toBe(true);
  });

  it('rejects one paise over the limit', async () => {
    withUserLimit(100000);
    const r = await checkSpendLimit('u1', 100001);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('over limit');
  });

  it('uses the TIGHTEST of user, merchant and session limits', async () => {
    withUserLimit(100000);                                  // ₹1000
    const session = await checkSpendLimit('u1', 60000, 50000); // session ₹500 is tighter
    expect(session.effectiveLimitPaise).toBe(50000);
    expect(session.allowed).toBe(false);

    // A looser session limit must not widen the user's own limit.
    const loose = await checkSpendLimit('u1', 200000, 900000);
    expect(loose.effectiveLimitPaise).toBe(100000);
    expect(loose.allowed).toBe(false);
  });

  it('falls back to the merchant ceiling when the user has no attribute set', async () => {
    rows.current = []; // no spend_limit_paise row
    const r = await checkSpendLimit('u1', 150000);
    // default user limit is ₹1000, which is tighter than the ₹50,000 merchant cap
    expect(r.effectiveLimitPaise).toBe(100000);
    expect(r.allowed).toBe(false);
  });

  it('never lets a user limit exceed the merchant ceiling', async () => {
    withUserLimit(99_999_999); // absurd user limit
    const r = await checkSpendLimit('u1', 6_000_000);
    expect(r.effectiveLimitPaise).toBe(5_000_000); // merchant cap wins
    expect(r.allowed).toBe(false);
  });

  it('reports the numbers it decided on, so the refusal is explainable', async () => {
    withUserLimit(100000);
    const r = await checkSpendLimit('u1', 250000);
    expect(r.totalPaise).toBe(250000);
    expect(r.userLimitPaise).toBe(100000);
    expect(r.merchantLimitPaise).toBe(5_000_000);
    expect(r.sessionLimitPaise).toBeNull();
    expect(r.reason).toMatch(/₹2500.*₹1000/);
  });
});
