import { Router } from 'express';
import { z } from 'zod';
import { signup, login, me, changePassword, requestPasswordReset, resetPassword } from '../../../application/auth.js';
import { writeAudit } from '../../../application/audit.js';
import { config } from '../../../config/env.js';
import { warmSession } from '../../redis/redis.js';
import { getCart } from '../../../application/cart.js';
import { listOrders } from '../../../application/orders.js';
import { getUserPrefs, updateUserPrefs } from '../../../application/guardrail.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['customer', 'merchant']).optional(),
});

authRouter.post(
  '/auth/signup',
  asyncHandler(async (req, res) => {
    const { email, password, role } = credentials.parse(req.body);
    const user = await signup(email, password, role ?? 'customer');
    res.status(201).json({ user });
  }),
);

authRouter.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const { user, tokens } = await login(email, password);
    // Phase 1: warm hot state on login (cart + recent orders) for fast conversation later.
    const [cart, orders] = await Promise.all([getCart(user.id), listOrders(user.id)]);
    await warmSession(user.id, { cart, recentOrders: orders.slice(0, 5) });
    res.json({ user, tokens });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: await me(req.user!.sub) });
  }),
);

// --- Agent buying preferences (ABAC attributes that drive the guardrail) ---
authRouter.get(
  '/me/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ preferences: await getUserPrefs(req.user!.sub) });
  }),
);

authRouter.put(
  '/me/preferences',
  requireAuth,
  asyncHandler(async (req, res) => {
    const patch = z
      .object({
        spendLimitPaise: z.number().int().positive().optional(),
        buyingMode: z.enum(['direct', 'conversational']).optional(),
        rankingPref: z.enum(['cost', 'quality', 'default']).optional(),
        rankingWeight: z.enum(['low', 'medium', 'high']).optional(),
      })
      .parse(req.body);
    res.json({ preferences: await updateUserPrefs(req.user!.sub, patch) });
  }),
);

// --- Password management ---
// Change password (authenticated user who knows their current password).
authRouter.post(
  '/auth/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string(), newPassword: z.string().min(6) })
      .parse(req.body);
    await changePassword(req.user!.sub, currentPassword, newPassword);
    await writeAudit({ actor: 'user', action: 'change_password', target: req.user!.sub, reason: 'user changed their password' });
    res.json({ ok: true });
  }),
);

// Forgot password → issue a reset token. Always returns a generic message (no user
// enumeration). In production the token is EMAILED; in dev it's returned for convenience.
authRouter.post(
  '/auth/forgot-password',
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const token = await requestPasswordReset(email);
    const body: Record<string, unknown> = { ok: true, message: 'If that email exists, a reset link has been sent.' };
    if (config.nodeEnv !== 'production' && token) body.devToken = token; // dev-only convenience
    res.json(body);
  }),
);

// Reset password using the token from the forgot-password step.
authRouter.post(
  '/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { token, newPassword } = z.object({ token: z.string(), newPassword: z.string().min(6) }).parse(req.body);
    await resetPassword(token, newPassword);
    res.json({ ok: true });
  }),
);
