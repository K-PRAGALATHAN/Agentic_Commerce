import { query } from '../adapters/db/pool.js';
import { config } from '../config/env.js';

// The "bounded" half of the rubric. Preferences are ABAC attributes on the user;
// the guardrail checks a total against the tightest applicable limit BEFORE money moves.

export type BuyingMode = 'direct' | 'conversational';
export type RankingPref = 'cost' | 'quality' | 'default';

export interface UserPrefs {
  spendLimitPaise: number;
  buyingMode: BuyingMode;
  rankingPref: RankingPref;
  rankingWeight: 'low' | 'medium' | 'high';
}

const DEFAULTS: UserPrefs = {
  spendLimitPaise: 100000, // ₹1000
  buyingMode: 'conversational',
  rankingPref: 'default',
  rankingWeight: 'medium',
};

export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const { rows } = await query<{ key: string; value: any }>(
    'SELECT key, value FROM user_attributes WHERE user_id = $1',
    [userId],
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    spendLimitPaise: Number(map.get('spend_limit_paise') ?? DEFAULTS.spendLimitPaise),
    buyingMode: (map.get('buying_mode') ?? DEFAULTS.buyingMode) as BuyingMode,
    rankingPref: (map.get('ranking_pref') ?? DEFAULTS.rankingPref) as RankingPref,
    rankingWeight: (map.get('ranking_weight') ?? DEFAULTS.rankingWeight) as UserPrefs['rankingWeight'],
  };
}

export async function updateUserPrefs(userId: string, patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const entries: [string, unknown][] = [];
  if (patch.spendLimitPaise !== undefined) entries.push(['spend_limit_paise', patch.spendLimitPaise]);
  if (patch.buyingMode !== undefined) entries.push(['buying_mode', patch.buyingMode]);
  if (patch.rankingPref !== undefined) entries.push(['ranking_pref', patch.rankingPref]);
  if (patch.rankingWeight !== undefined) entries.push(['ranking_weight', patch.rankingWeight]);
  for (const [key, value] of entries) {
    await query(
      `INSERT INTO user_attributes(user_id, key, value) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [userId, key, JSON.stringify(value)],
    );
  }
  return getUserPrefs(userId);
}

export interface LimitCheck {
  allowed: boolean;
  totalPaise: number;
  userLimitPaise: number;
  merchantLimitPaise: number;
  sessionLimitPaise: number | null;
  effectiveLimitPaise: number; // the tightest applicable limit
  reason: string;
}

// Effective limit = the tightest of user / merchant / (optional) session limit.
// Mirrors Razorpay/NPCI UPI Reserve Pay's consent + per-merchant limit model.
export async function checkSpendLimit(
  userId: string,
  totalPaise: number,
  sessionLimitPaise?: number,
): Promise<LimitCheck> {
  const prefs = await getUserPrefs(userId);
  const merchantLimitPaise = config.guardrail.merchantMaxOrderPaise;
  const candidates = [prefs.spendLimitPaise, merchantLimitPaise];
  if (typeof sessionLimitPaise === 'number') candidates.push(sessionLimitPaise);
  const effectiveLimitPaise = Math.min(...candidates);
  const allowed = totalPaise <= effectiveLimitPaise;
  return {
    allowed,
    totalPaise,
    userLimitPaise: prefs.spendLimitPaise,
    merchantLimitPaise,
    sessionLimitPaise: sessionLimitPaise ?? null,
    effectiveLimitPaise,
    reason: allowed
      ? `within limit (₹${(totalPaise / 100).toFixed(0)} ≤ ₹${(effectiveLimitPaise / 100).toFixed(0)})`
      : `over limit (₹${(totalPaise / 100).toFixed(0)} > ₹${(effectiveLimitPaise / 100).toFixed(0)})`,
  };
}
