import { query } from '../adapters/db/pool.js';

// Per-user agent memory, keyed on the user's UUID — the identity, not the
// credential — so it survives password resets and restarts.
//
// Two kinds of row live here, and the difference matters:
//   * turns  — what was said, belonging to ONE conversation
//   * facts  — what the summariser distilled, belonging to the PERSON
// A new chat therefore starts clean but still knows who it is talking to.

export async function appendMemory(
  userId: string,
  role: string,
  content: string,
  conversationId?: string | null,
): Promise<void> {
  // Facts are never tied to a conversation, whatever the caller passes.
  const convo = role === 'fact' ? null : (conversationId ?? null);
  await query(
    'INSERT INTO agent_memory(user_id, role, content, conversation_id) VALUES ($1,$2,$3,$4)',
    [userId, role, content, convo],
  );
}

// Turns from THIS conversation only.
export async function recentMemory(
  userId: string,
  limit = 12,
  conversationId?: string | null,
): Promise<{ role: string; content: string }[]> {
  const { rows } = await query<{ role: string; content: string }>(
    conversationId
      ? `SELECT role, content FROM agent_memory
          WHERE user_id = $1 AND conversation_id = $2 AND role <> 'fact'
          ORDER BY id DESC LIMIT $3`
      : `SELECT role, content FROM agent_memory
          WHERE user_id = $1 AND role <> 'fact'
          ORDER BY id DESC LIMIT $2`,
    conversationId ? [userId, conversationId, limit] : [userId, limit],
  );
  return rows.reverse(); // chronological
}

// Durable facts about this customer, from every conversation they have had.
export async function userFacts(userId: string, limit = 8): Promise<string[]> {
  const { rows } = await query<{ content: string }>(
    "SELECT content FROM agent_memory WHERE user_id = $1 AND role = 'fact' ORDER BY id DESC LIMIT $2",
    [userId, limit],
  );
  return rows.map((r) => r.content);
}
