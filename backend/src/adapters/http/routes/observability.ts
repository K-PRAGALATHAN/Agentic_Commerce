import { Router } from 'express';
import { listAudit } from '../../../application/audit.js';
import { listLedger, verifyChain } from '../../../application/ledger.js';
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
  '/observability/verify/:name',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = req.params.name === 'checkout' ? 'checkout_ledger' : 'intent_ledger';
    res.json(await verifyChain(name));
  }),
);
