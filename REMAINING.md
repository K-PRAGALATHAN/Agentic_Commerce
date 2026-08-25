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

## Phase 4 — Multi-Agent Orchestration 🟡
- 🟡 Orchestration = in-process agent flow with per-step trace (Temporal/LangGraph deferred = documented fallback).
- ✅ Agents: search, explainer, guardrail, intent-inference, **upsell**, **cross-sell**, payment, general.
- ✅ **`agent_runs` persisted** + surfaced in Observability (multi-agent trace panel).
- ⬜ Batch multi-product buy (one accumulation pass) — single-product path done.
- ✅ direct vs conversational; 🟡 no-spec inference (basic).

## Phase 5 — Intelligence Layer 🟡
- ✅ **KG seed** = order co-occurrence powering cross-sell; upsell = same-category next-price-up.
- ⬜ Formal KG store + clusters; mem0 + Sidekick-style persistence (in-process memory for now).
- ⬜ **Wiki** (shared store/product knowledge for agent consistency).
- ✅ **Checkout ledger** — now written on every checkout (Cart Mandate) + on refund approval.

## Phase 6 — Protocols & Polish 🟡
- ⬜ ACP-style agent-readable catalog/checkout endpoints (documented).
- ✅ **AP2 mandate surfacing** in UI (intent-ledger = Intent Mandate; checkout-ledger = Cart Mandate).
- ⬜ x402 doc note.
- 🟡 Glassy design (wireframe-level; polish pass pending).
- ✅ **3-min demo script** (`DEMO.md`); ⬜ deploy to AWS/Vercel.

## Phase 7 — Hardening & Demo 🟡
- ✅ **Rate limiting** on auth/reset endpoints (in-memory fixed-window).
- ⬜ Full error-path coverage review, latency pass, credential-isolation re-audit, demo rehearsal.

---

## Execution order (this pass)
1. Phase 1/2/3 completion: **Razorpay checkout widget** + graceful-failure demo, **refund UI**, **model-cost UI + real cost**. (Highest rubric visibility.)
2. Phase 4: upsell/cross-sell agents, `agent_runs` persistence, batch multi-product.
3. Phase 5: knowledge graph + checkout ledger + wiki.
4. Phase 6: mandate surfacing + demo script + polish.
5. Phase 7: rate limiting + hardening.
