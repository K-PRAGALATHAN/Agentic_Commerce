import { query } from '../adapters/db/pool.js';

// Persistent per-user agent memory (Sidekick-style). Keyed on the user's UUID —
// the identity, not the credential — so it survives password resets and restarts.

export async function appendMemory(userId: string, role: string, content: string): Promise<void> {
  await query('INSERT INTO agent_memory(user_id, role, content) VALUES ($1,$2,$3)', [userId, role, content]);
}

export async function recentMemory(userId: string, limit = 12): Promise<{ role: string; content: string }[]> {
  const { rows } = await query<{ role: string; content: string }>(
    'SELECT role, content FROM agent_memory WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
    [userId, limit],
  );
  return rows.reverse(); // chronological
}
