import { Router } from 'express';
import { z } from 'zod';
import { signup, login, me } from '../../../application/auth.js';
import { warmSession } from '../../redis/redis.js';
import { getCart } from '../../../application/cart.js';
import { listOrders } from '../../../application/orders.js';
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
