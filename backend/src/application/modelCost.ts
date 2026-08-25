import { query } from '../adapters/db/pool.js';

// Merchant LLM-cost tracker. Groundwork here; the agent (Phase 3) writes to it on
// every model call so a merchant can see how much they spend on models.

export interface ModelCost {
  merchantId?: string | null;
  runId?: string | null;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export async function trackModelCost(c: ModelCost): Promise<void> {
  await query(
    `INSERT INTO model_cost(merchant_id, run_id, model, tokens_in, tokens_out, cost)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [c.merchantId ?? null, c.runId ?? null, c.model, c.tokensIn, c.tokensOut, c.cost],
  );
}

export async function summarizeModelCost(): Promise<{ totalCost: number; totalCalls: number; byModel: any[] }> {
  const totals = await query<{ total_cost: string; total_calls: string }>(
    'SELECT COALESCE(SUM(cost),0) AS total_cost, COUNT(*) AS total_calls FROM model_cost',
  );
  const byModel = await query(
    `SELECT model, COUNT(*) AS calls, COALESCE(SUM(cost),0) AS cost,
            COALESCE(SUM(tokens_in),0) AS tokens_in, COALESCE(SUM(tokens_out),0) AS tokens_out
       FROM model_cost GROUP BY model ORDER BY cost DESC`,
  );
  return {
    totalCost: Number(totals.rows[0].total_cost),
    totalCalls: Number(totals.rows[0].total_calls),
    byModel: byModel.rows,
  };
}
