import { query } from '../adapters/db/pool.js';

// Shared knowledge for AGENT CONSISTENCY — every agent tells the same story about
// the store (policies, facts). If the wiki ever drifts from DB truth, DB wins.

export async function listWiki(): Promise<{ key: string; title: string; content: string }[]> {
  const { rows } = await query('SELECT key, title, content FROM wiki ORDER BY key');
  return rows as any;
}

export async function getWiki(key: string): Promise<{ key: string; title: string; content: string } | null> {
  const { rows } = await query('SELECT key, title, content FROM wiki WHERE key = $1', [key]);
  return (rows[0] as any) ?? null;
}

export async function upsertWiki(key: string, title: string, content: string): Promise<void> {
  await query(
    `INSERT INTO wiki(key, title, content, updated_at) VALUES ($1,$2,$3, now())
     ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = now()`,
    [key, title, content],
  );
}
