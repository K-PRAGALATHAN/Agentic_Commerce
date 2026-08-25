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

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
