# Remaining Work — per phase (living tracker)

> Snapshot of what's **done** vs **left** in each phase. Updated as work lands.
> Source of truth for scope is `plan/`; this file tracks execution status.
> Last updated: 2026-08-25.

Legend: ✅ done · 🟡 partial · ⬜ not started

---

## Phase 0 — Foundations ✅
- ✅ Monorepo, Docker (postgres/redis/backend/agent/frontend), config, migrations, auth (JWT+RBAC+ABAC), health.
- Leftover: none material.

## Phase 1 — Core Commerce 🟡
- ✅ Catalog two-doors (fetch + merchant CRUD), cart, orders, Razorpay test adapter (order/verify/webhook/refund), audit, Redis warm-up, wireframes.
- ⬜ **Frontend Razorpay checkout widget** — real card payment in the browser (currently checkout only creates the order server-side).
- ⬜ Webhook against a public URL (needs tunnel/deploy → Phase 6/7).

## Phase 2 — Payment Safety Spine 🟡
- ✅ Guardrails (spend limit/mode/ranking, editable), intent ledger before money, refund gating (backend), model-cost table+endpoint, graceful-failure path (backend), audit/ledger panel + chain verify.
- ⬜ **Refund UI** — customer "request refund" + merchant "approve/reject" view (backend done).
- ⬜ **Model-cost UI** section + **real cost calculation** from token usage (currently ₹0 groundwork).
- ⬜ **Live graceful-failure demo** in UI (depends on the payment widget + failure test card).

## Phase 3 — Single-Agent MVP 🟡
- ✅ Single agent, OpenRouter (gpt-5.6-luna) + keyless fallback, search→explain→guardrail→conversational confirm, general/sarcastic divert, error handling, credential isolation, model-cost logging.
- 🟡 Memory: in-process per-user (mem0 pluggable, not wired — needs MEM0_API_KEY).
- ⬜ Agent-initiated **payment completion** (payment link / hand-off to the widget).

## Phase 4 — Multi-Agent Orchestration ⬜
- ⬜ Orchestrator graph (LangGraph; Temporal or the documented fallback = checkpointer + queue).
- ⬜ Agents: search, filter, explainer, **cost-accumulation (batch multi-product)**, guardrail, intent-inference, **upsell**, **cross-sell**, payment, general.
- ⬜ **`agent_runs` persisted** (per-agent trace) + surfaced in observability.
- ⬜ Batch multi-product buy (one accumulation pass, one guardrail, one ledger entry).
- ✅ (already) direct vs conversational modes; 🟡 no-spec inference (basic in Phase 3).

## Phase 5 — Intelligence Layer ⬜
- ⬜ **Knowledge graph** (BOUGHT_WITH / complements / clusters from order history).
- ⬜ Upsell/cross-sell driven by the KG.
- ⬜ **Wiki** (shared store/product knowledge for agent consistency).
- ⬜ Combined memory (mem0 + wiki + Sidekick-style persistence).
- 🟡 **Checkout ledger** — written on refund approval; extend to the conversational checkout path.

## Phase 6 — Protocols & Polish ⬜
- ⬜ ACP-style agent-readable catalog/checkout endpoints (documented).
- ⬜ **UAP/AP2 mandate surfacing** in UI (intent-ledger = intent mandate; checkout-ledger = cart mandate).
- ⬜ x402 doc note.
- ⬜ Glassy design polish from wireframes.
- ⬜ Deploy (AWS/Vercel) + **3-min demo script** hitting every rubric word.

## Phase 7 — Hardening & Demo ⬜
- ⬜ Security review, credential-isolation re-check, **rate limiting** (auth/payment/agent), full error-path coverage.
- ⬜ Latency pass, demo rehearsal + backup recording.

---

## Execution order (this pass)
1. Phase 1/2/3 completion: **Razorpay checkout widget** + graceful-failure demo, **refund UI**, **model-cost UI + real cost**. (Highest rubric visibility.)
2. Phase 4: upsell/cross-sell agents, `agent_runs` persistence, batch multi-product.
3. Phase 5: knowledge graph + checkout ledger + wiki.
4. Phase 6: mandate surfacing + demo script + polish.
5. Phase 7: rate limiting + hardening.
