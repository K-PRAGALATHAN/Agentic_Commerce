import { Router } from 'express';
import { z } from 'zod';
import { trackModelCost } from '../../../application/modelCost.js';
import { getUserPrefs } from '../../../application/guardrail.js';
import { listOrders } from '../../../application/orders.js';
import { logAgentRun } from '../../../application/agentRuns.js';
import { getUpsell, getCrossSell } from '../../../application/recommend.js';
import { appendMemory, recentMemory } from '../../../application/agentMemory.js';
import { listWiki } from '../../../application/wiki.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// Endpoints the agent-service calls (authenticated as the user, per-route).
export const agentRouter = Router();

// One convenience call: everything the agent needs for context in a single round-trip
// — preferences, recent orders, persistent memory (Sidekick-style), and the wiki.
agentRouter.get(
  '/agent/context',
  requireAuth,
  asyncHandler(async (req, res) => {
    const [preferences, orders, memory, wiki] = await Promise.all([
      getUserPrefs(req.user!.sub),
      listOrders(req.user!.sub),
      recentMemory(req.user!.sub, 12),
      listWiki(),
    ]);
    res.json({ preferences, recentOrders: orders.slice(0, 5), memory, wiki });
  }),
);

// Persistent agent memory (append after each turn).
agentRouter.post(
  '/agent/memory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { role, content } = z.object({ role: z.string(), content: z.string() }).parse(req.body);
    await appendMemory(req.user!.sub, role, content);
    res.json({ ok: true });
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

// Per-agent trace (the multi-agent coordination record).
agentRouter.post(
  '/agent/run',
  requireAuth,
  asyncHandler(async (req, res) => {
    const r = z
      .object({ runId: z.string(), agent: z.string(), input: z.unknown().optional(), output: z.unknown().optional(), status: z.string().default('ok') })
      .parse(req.body);
    await logAgentRun(r.runId, r.agent, r.input, r.output, r.status);
    res.json({ ok: true });
  }),
);

// Upsell / cross-sell (cross-sell = order co-occurrence = KG seed).
agentRouter.get(
  '/catalog/:id/upsell',
  asyncHandler(async (req, res) => {
    res.json({ upsell: await getUpsell(req.params.id) });
  }),
);

agentRouter.get(
  '/catalog/:id/cross-sell',
  asyncHandler(async (req, res) => {
    res.json({ crossSell: await getCrossSell(req.params.id) });
  }),
);
