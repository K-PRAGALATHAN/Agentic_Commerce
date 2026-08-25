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

## Phase 4 — Multi-Agent Orchestration ✅
- 🟡 Orchestration = in-process agent flow with per-step trace (Temporal/LangGraph deferred = documented fallback).
- ✅ Agents: search, explainer, cost-accumulation, guardrail, intent-inference, **upsell**, **cross-sell**, payment, general.
- ✅ **`agent_runs` persisted** + surfaced in Observability.
- ✅ **Batch multi-product** ("a shirt and shoes") — one accumulation pass, one guardrail, one ledger entry.
- ✅ direct vs conversational; no-spec inference (basic).

## Phase 5 — Intelligence Layer ✅
- ✅ **Formal KG store** (`kg_edges`, materialized from orders) powering cross-sell; upsell = same-category next price up; clusters by category.
- ✅ **Wiki** (`wiki` table, merchant-editable) grounds agent answers for consistency.
- ✅ **Persistent memory** (`agent_memory`, DB-backed, Sidekick-style, keyed on UUID). mem0 SDK = optional future swap.
- ✅ **Checkout ledger** on every checkout (Cart Mandate) + refund.

## Phase 6 — Protocols & Polish ✅ (deploy excluded)
- ✅ **ACP** agent-readable catalog feed (`GET /acp/catalog`) + `PROTOCOLS.md`.
- ✅ **AP2 mandate surfacing** in UI; ✅ **UAP** = guardrail; ✅ **x402** documented (PROTOCOLS.md).
- ✅ Glassy polish + **inline product-card carousel & checkout card** in chat (per reference), conversation sidebar + new-chat.
- ✅ `DEMO.md`; ⬜ deploy to AWS/Vercel (**explicitly out of scope**).

## Phase 7 — Hardening ✅
- ✅ **Rate limiting** (auth/reset). ✅ Credential isolation (token/secret never in prompts). ✅ Graceful error paths across agent + payments.
- 🟡 Latency pass + full demo rehearsal (recommended before judging).

---

## Execution order (this pass)
1. Phase 1/2/3 completion: **Razorpay checkout widget** + graceful-failure demo, **refund UI**, **model-cost UI + real cost**. (Highest rubric visibility.)
2. Phase 4: upsell/cross-sell agents, `agent_runs` persistence, batch multi-product.
3. Phase 5: knowledge graph + checkout ledger + wiki.
4. Phase 6: mandate surfacing + demo script + polish.
5. Phase 7: rate limiting + hardening.
