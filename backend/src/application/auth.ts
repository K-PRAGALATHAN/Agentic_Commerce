import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, withTransaction } from '../adapters/db/pool.js';
import { config } from '../config/env.js';
import type { Role, User } from '../domain/types.js';

export interface TokenClaims {
  sub: string;
  email: string;
  roles: Role[];
  attributes: Record<string, unknown>;
}

async function loadUser(userId: string): Promise<User> {
  const u = await query<any>('SELECT id, email, created_at FROM users WHERE id = $1', [userId]);
  const roles = await query<{ name: Role }>(
    `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1`,
    [userId],
  );
  const attrs = await query<{ key: string; value: unknown }>(
    'SELECT key, value FROM user_attributes WHERE user_id = $1',
    [userId],
  );
  const attributes: Record<string, unknown> = {};
  for (const a of attrs.rows) attributes[a.key] = a.value;
  return {
    id: u.rows[0].id,
    email: u.rows[0].email,
    roles: roles.rows.map((r) => r.name),
    attributes,
    createdAt: u.rows[0].created_at,
  };
}

export async function signup(email: string, password: string, role: Role = 'customer'): Promise<User> {
  const hash = await bcrypt.hash(password, 10);
  const userId = await withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) throw new HttpError(409, 'email already registered');
    const ins = await client.query('INSERT INTO users(email, password_hash) VALUES ($1,$2) RETURNING id', [
      email,
      hash,
    ]);
    const id = ins.rows[0].id;
    await client.query(
      `INSERT INTO user_roles(user_id, role_id)
       SELECT $1, id FROM roles WHERE name = $2`,
      [id, role],
    );
    // ABAC default: a starting spend limit so guardrails have something to enforce (Phase 2).
    await client.query(
      `INSERT INTO user_attributes(user_id, key, value) VALUES ($1, 'spend_limit_paise', $2)`,
      [id, JSON.stringify(100000)], // ₹1000 default
    );
    return id;
  });
  return loadUser(userId);
}

export async function login(email: string, password: string): Promise<{ user: User; tokens: Tokens }> {
  const res = await query<any>('SELECT id, password_hash FROM users WHERE email = $1', [email]);
  if (!res.rowCount) throw new HttpError(401, 'invalid credentials');
  const ok = await bcrypt.compare(password, res.rows[0].password_hash);
  if (!ok) throw new HttpError(401, 'invalid credentials');
  const user = await loadUser(res.rows[0].id);
  return { user, tokens: issueTokens(user) };
}

export interface Tokens {
  access: string;
  refresh: string;
}

export function issueTokens(user: User): Tokens {
  const claims: TokenClaims = { sub: user.id, email: user.email, roles: user.roles, attributes: user.attributes };
  const access = jwt.sign(claims, config.jwt.secret, { expiresIn: config.jwt.accessTtl });
  const refresh = jwt.sign({ sub: user.id }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshTtl });
  return { access, refresh };
}

export function verifyAccess(token: string): TokenClaims {
  return jwt.verify(token, config.jwt.secret) as TokenClaims;
}

export async function me(userId: string): Promise<User> {
  return loadUser(userId);
}

// --- Password management ---------------------------------------------------
// IMPORTANT: none of these touch users.id. The UUID is the identity that agents,
// memory, orders, and ledgers key on; only the password_hash column changes.
// So a reset re-issues a credential without changing WHO the user is.

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const res = await query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!res.rowCount) throw new HttpError(404, 'user not found');
  const ok = await bcrypt.compare(currentPassword, res.rows[0].password_hash);
  if (!ok) throw new HttpError(400, 'current password is incorrect');
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
}

const RESET_TTL_MS = 15 * 60 * 1000;
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

// Returns the raw token so the caller can deliver it. In production this is EMAILED;
// in dev we surface it in the response (see the route) so there's no email setup needed.
export async function requestPasswordReset(email: string): Promise<string | null> {
  const res = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
  if (!res.rowCount) return null; // caller returns a generic message either way (no user enumeration)
  const token = randomBytes(32).toString('hex');
  await query(
    'INSERT INTO password_resets(user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [res.rows[0].id, hashToken(token), new Date(Date.now() + RESET_TTL_MS)],
  );
  return token;
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 10);
  await withTransaction(async (client) => {
    const row = await client.query(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used = false AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [hashToken(token)],
    );
    if (!row.rowCount) throw new HttpError(400, 'invalid or expired reset token');
    // Same user_id — identity unchanged; only the credential is replaced.
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, row.rows[0].user_id]);
    await client.query('UPDATE password_resets SET used = true WHERE id = $1', [row.rows[0].id]);
  });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
