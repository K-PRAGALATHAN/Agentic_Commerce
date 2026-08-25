import { Router } from 'express';
import { z } from 'zod';
import { trackModelCost } from '../../../application/modelCost.js';
import { getUserPrefs } from '../../../application/guardrail.js';
import { listOrders } from '../../../application/orders.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// Endpoints the agent-service calls (authenticated as the user, per-route).
export const agentRouter = Router();

// One convenience call: everything the agent needs for context in a single round-trip.
agentRouter.get(
  '/agent/context',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [preferences, orders] = await Promise.all([getUserPrefs(req.user!.sub), listOrders(req.user!.sub)]);
    res.json({ preferences, recentOrders: orders.slice(0, 5) });
  }),
);

// The agent logs model usage so the merchant LLM-cost tracker is real.
agentRouter.post(
  '/agent/model-cost',
  requireAuth,
  asyncHandler(async (req, res) => {
    const c = z
      .object({
        runId: z.string().optional(),
        model: z.string(),
        tokensIn: z.number().int().nonnegative(),
        tokensOut: z.number().int().nonnegative(),
        cost: z.number().nonnegative().default(0),
      })
      .parse(req.body);
    await trackModelCost({ runId: c.runId, model: c.model, tokensIn: c.tokensIn, tokensOut: c.tokensOut, cost: c.cost });
    res.json({ ok: true });
  }),
);
