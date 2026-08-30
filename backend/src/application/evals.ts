import { createHash } from 'node:crypto';
import { query } from '../adapters/db/pool.js';

// LLM Ops storage. The agent service owns the running of evals; this module owns
// recording them and deciding what is allowed to ship.

export interface EvalResult {
  suiteId: string;
  caseId: string;
  promptName?: string;
  promptVersion?: string;
  passed: boolean;
  score?: number | null;
  expected?: string;
  actual?: string;
  detail?: string;
  latencyMs?: number | null;
}

export async function recordEvals(results: EvalResult[]): Promise<{ recorded: number }> {
  for (const r of results) {
    await query(
      `INSERT INTO agent_evals(suite_id, case_id, prompt_name, prompt_version, passed, score,
                               expected, actual, detail, latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        r.suiteId, r.caseId, r.promptName ?? '', r.promptVersion ?? '', r.passed,
        r.score ?? null, (r.expected ?? '').slice(0, 500), (r.actual ?? '').slice(0, 2000),
        (r.detail ?? '').slice(0, 500), r.latencyMs ?? null,
      ],
    );
  }
  return { recorded: results.length };
}

export async function listSuites(limit = 10): Promise<any[]> {
  const { rows } = await query<any>(
    `SELECT suite_id,
            MIN(ts)                                   AS ran_at,
            COUNT(*)                                  AS cases,
            COUNT(*) FILTER (WHERE passed)            AS passed,
            ROUND(AVG(score)::numeric, 2)             AS avg_score,
            MAX(prompt_name)                          AS prompt_name,
            MAX(prompt_version)                       AS prompt_version
       FROM agent_evals
      GROUP BY suite_id
      ORDER BY MIN(ts) DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    suiteId: r.suite_id,
    ranAt: r.ran_at,
    cases: Number(r.cases),
    passed: Number(r.passed),
    avgScore: r.avg_score === null ? null : Number(r.avg_score),
    promptName: r.prompt_name,
    promptVersion: r.prompt_version,
    green: Number(r.passed) === Number(r.cases),
  }));
}

export async function suiteDetail(suiteId: string): Promise<any[]> {
  const { rows } = await query<any>(
    `SELECT case_id, passed, score, expected, actual, detail, latency_ms
       FROM agent_evals WHERE suite_id = $1 ORDER BY case_id`,
    [suiteId],
  );
  return rows.map((r) => ({
    caseId: r.case_id, passed: r.passed,
    score: r.score === null ? null : Number(r.score),
    expected: r.expected, actual: r.actual, detail: r.detail, latencyMs: r.latency_ms,
  }));
}

// --- prompt versions: the Gate → Release path ------------------------------

export async function registerPrompt(name: string, body: string): Promise<{ name: string; version: string; known: boolean }> {
  const version = createHash('sha256').update(body).digest('hex').slice(0, 8);
  const existing = await query('SELECT 1 FROM prompt_versions WHERE name=$1 AND version=$2', [name, version]);
  if (!existing.rowCount) {
    await query('INSERT INTO prompt_versions(name, version, body) VALUES ($1,$2,$3)', [name, version, body]);
  }
  return { name, version, known: !!existing.rowCount };
}

// A version is promoted ONLY on a fully green suite. That is the whole point of
// the gate: a prompt edit cannot reach users on a partial pass, and "it looked
// fine when I tried it" is not evidence.
export async function promoteIfGreen(
  name: string,
  version: string,
  suiteId: string,
): Promise<{ promoted: boolean; reason: string }> {
  const { rows } = await query<any>(
    `SELECT COUNT(*) AS cases, COUNT(*) FILTER (WHERE passed) AS passed
       FROM agent_evals WHERE suite_id = $1`,
    [suiteId],
  );
  const cases = Number(rows[0].cases);
  const passed = Number(rows[0].passed);
  if (!cases) return { promoted: false, reason: 'no eval results for that suite' };
  if (passed !== cases) {
    await query('UPDATE prompt_versions SET passed=false WHERE name=$1 AND version=$2', [name, version]);
    return { promoted: false, reason: `${cases - passed} of ${cases} cases failed — not promoted` };
  }
  await query('UPDATE prompt_versions SET active=false WHERE name=$1 AND active', [name]);
  const upd = await query(
    'UPDATE prompt_versions SET active=true, passed=true WHERE name=$1 AND version=$2',
    [name, version],
  );
  if (!upd.rowCount) return { promoted: false, reason: 'unknown prompt version' };
  return { promoted: true, reason: `all ${cases} cases passed — ${name}@${version} is live` };
}

export async function listPromptVersions(): Promise<any[]> {
  const { rows } = await query<any>(
    `SELECT name, version, active, passed, created_at FROM prompt_versions ORDER BY name, created_at DESC`,
  );
  return rows.map((r) => ({
    name: r.name, version: r.version, active: r.active, passed: r.passed, createdAt: r.created_at,
  }));
}
