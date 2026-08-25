import { query } from '../adapters/db/pool.js';
import type { AuditEntry } from '../domain/types.js';

// Every money + agent action funnels through here. Same code path, always logged.
export async function writeAudit(e: AuditEntry): Promise<void> {
  await query(
    `INSERT INTO audit_log(actor, action, target, amount_paise, reason, verified, run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [e.actor, e.action, e.target, e.amountPaise ?? null, e.reason, e.verified ?? null, e.runId ?? null],
  );
}

export async function listAudit(limit = 100): Promise<any[]> {
  const { rows } = await query(
    `SELECT id, actor, action, target, amount_paise, reason, verified, run_id, ts
       FROM audit_log ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows;
}
