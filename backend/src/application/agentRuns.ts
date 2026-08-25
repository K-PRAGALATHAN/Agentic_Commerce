import { query } from '../adapters/db/pool.js';

// Per-agent execution trace — the multi-agent coordination record + observability feed.
export async function logAgentRun(runId: string, agent: string, input: unknown, output: unknown, status = 'ok'): Promise<void> {
  await query(
    `INSERT INTO agent_runs(run_id, agent, input, output, status) VALUES ($1,$2,$3,$4,$5)`,
    [runId, agent, JSON.stringify(input ?? null), JSON.stringify(output ?? null), status],
  );
}

export async function listAgentRuns(limit = 60): Promise<any[]> {
  const { rows } = await query(
    `SELECT id, run_id, agent, input, output, status, ts FROM agent_runs ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
