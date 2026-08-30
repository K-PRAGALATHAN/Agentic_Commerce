import { Router } from 'express';
import { listAudit } from '../../../application/audit.js';
import { listLedger, verifyChain } from '../../../application/ledger.js';
import { listAgentRuns } from '../../../application/agentRuns.js';
import { z } from 'zod';
import { recordEvals, listSuites, suiteDetail, registerPrompt, promoteIfGreen, listPromptVersions } from '../../../application/evals.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errors.js';

// Feeds the UI audit/observability panel (Phase 2 makes it prominent).
// Per-route auth (routers share the '/' mount; router.use would leak).
export const observabilityRouter = Router();

observabilityRouter.get(
  '/observability/audit',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ audit: await listAudit(100) });
  }),
);

observabilityRouter.get(
  '/observability/ledger/:name',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = req.params.name === 'checkout' ? 'checkout_ledger' : 'intent_ledger';
    res.json({ ledger: await listLedger(name, 100) });
  }),
);

observabilityRouter.get(
  '/observability/agent-runs',
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.json({ runs: await listAgentRuns(60) });
  }),
);

observabilityRouter.get(
  '/observability/verify/:name',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = req.params.name === 'checkout' ? 'checkout_ledger' : 'intent_ledger';
    res.json(await verifyChain(name));
  }),
);

// --- LLM Ops: Eval -> Gate -> Release ---------------------------------------
// The agent service runs the golden set and posts the scores here; the backend
// owns the record and the promotion decision.

observabilityRouter.post(
  '/observability/evals',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { results } = z.object({
      results: z.array(z.object({
        suiteId: z.string(), caseId: z.string(),
        promptName: z.string().optional(), promptVersion: z.string().optional(),
        passed: z.boolean(), score: z.number().nullable().optional(),
        expected: z.string().optional(), actual: z.string().optional(),
        detail: z.string().optional(), latencyMs: z.number().int().nullable().optional(),
      })).max(200),
    }).parse(req.body);
    res.json(await recordEvals(results));
  }),
);

observabilityRouter.get(
  '/observability/evals',
  requireAuth,
  asyncHandler(async (_req, res) => res.json({ suites: await listSuites() })),
);

observabilityRouter.get(
  '/observability/evals/:suiteId',
  requireAuth,
  asyncHandler(async (req, res) => res.json({ cases: await suiteDetail(req.params.suiteId) })),
);

observabilityRouter.get(
  '/observability/prompts',
  requireAuth,
  asyncHandler(async (_req, res) => res.json({ prompts: await listPromptVersions() })),
);

observabilityRouter.post(
  '/observability/prompts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, body } = z.object({ name: z.string().max(40), body: z.string().max(20000) }).parse(req.body);
    res.json(await registerPrompt(name, body));
  }),
);

// The gate. A prompt version goes live ONLY on a fully green suite.
observabilityRouter.post(
  '/observability/prompts/promote',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, version, suiteId } = z.object({
      name: z.string().max(40), version: z.string().max(64), suiteId: z.string(),
    }).parse(req.body);
    res.json(await promoteIfGreen(name, version, suiteId));
  }),
);
