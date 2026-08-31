import { Router } from 'express';
import { z } from 'zod';
import { trackModelCost } from '../../../application/modelCost.js';
import { getUserPrefs } from '../../../application/guardrail.js';
import { listOrders } from '../../../application/orders.js';
import { logAgentRun } from '../../../application/agentRuns.js';
import { getUpsell, getCrossSell } from '../../../application/recommend.js';
import { appendMemory, recentMemory, userFacts } from '../../../application/agentMemory.js';
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
    // conversationId scopes the TURNS. Facts, orders and the wiki are about the
    // person and the store, so they follow the customer into every chat.
    const convo = (req.query.conversationId as string | undefined) || null;
    const [preferences, orders, memory, facts, wiki] = await Promise.all([
      getUserPrefs(req.user!.sub),
      listOrders(req.user!.sub),
      recentMemory(req.user!.sub, 12, convo),
      userFacts(req.user!.sub),
      listWiki(),
    ]);
    res.json({ preferences, recentOrders: orders.slice(0, 5), memory, facts, wiki });
  }),
);

// Persistent agent memory (append after each turn).
agentRouter.post(
  '/agent/memory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { role, content, conversationId } = z
      .object({ role: z.string(), content: z.string(), conversationId: z.string().max(64).optional() })
      .parse(req.body);
    await appendMemory(req.user!.sub, role, content, conversationId ?? null);
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
    // The agent passes a ceiling when the customer named a budget or has a
    // spend limit, so a trade-up is never waved at someone who already said
    // what they are willing to pay.
    const ceiling = req.query.ceilingPaise ? Number(req.query.ceilingPaise) : undefined;
    const s = await getUpsell(req.params.id, { ceilingPaise: Number.isFinite(ceiling!) ? ceiling : undefined });
    res.json({ upsell: s ? { ...s.product, reason: s.reason, via: s.via } : null });
  }),
);

agentRouter.get(
  '/catalog/:id/cross-sell',
  asyncHandler(async (req, res) => {
    const items = await getCrossSell(req.params.id);
    res.json({ crossSell: items.map((s) => ({ ...s.product, reason: s.reason, via: s.via })) });
  }),
);
