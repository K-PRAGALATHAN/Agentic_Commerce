# 🛒 Agentic Commerce

> A marketplace where an **AI does the shopping**. A customer describes what they
> want in plain language — or says it out loud — and an agent searches four
> independent stores, explains its pick, argues for a better one, and takes the
> purchase to **Razorpay** checkout. Every money action is **explainable,
> bounded, gated**, and written to a tamper-evident audit trail.

Built for **Track 01 — AI Growth & Agentic Commerce**: *grow the merchant's
revenue, and make them sellable to AI buyers.*

---

## Run it

```bash
start.cmd            # docker compose up: postgres, redis, backend, agent, frontend
```

| | |
|---|---|
| Storefront | http://localhost:5173 |
| Backend API | http://localhost:4000 |
| Agent service | http://localhost:8010 |

Sign in with any account in **[ACCOUNTS.md](ACCOUNTS.md)** — password `demo1234`
for all of them, and the login screen has one-tap buttons for a customer and a
merchant. `riya@demo.shop` has the richest history; `nova@demo.store` runs a
store. Rebuild the demo world at any time:

```bash
docker compose exec backend npx tsx src/scripts/seed-demo.ts
```

**Test mode only.** Razorpay runs on test keys; no real money moves and no KYC is
involved. The safety spine is fully demonstrable without either.

---

## What it does

Say *"we will go with the Puma Future Rider Trainers"* and the assistant:

1. **Searches** the catalogue across every store, resolving everyday words
   ("fruits", "gadgets") to the categories the shops actually use.
2. **Shows what it found** as cards, naming which store each product comes from.
3. **Holds the add** and makes a case for the next shelf up — once. Ask again and
   it goes in without argument.
4. **Suggests a companion** only after something is really in the cart.
5. **Stops at the spend limit**, and cannot be talked past it.
6. **Writes intent to a hash-chained ledger** before any money moves.
7. **Hands off to Razorpay**, verifies the payment server-side, and logs every
   step with its reason.

---

## The bar — every money action is…

| Requirement | How it is met |
|---|---|
| **Explainable** | Every reply says *why*; every action carries a reason in the audit log; the UI shows the agent's own tool trace under "How I decided". |
| **Bounded** | Spend limit enforced server-side, after discount and before money. The agent can only *request* a charge. |
| **Gated** | Intent ledger entry before purchase; over-limit refused until the customer consents; refunds need merchant approval; checkout blocked while an add is unresolved. |
| **Audit trail** | Append-only log plus hash-chained intent and checkout ledgers, verifiable from the UI. |
| **Graceful failure** | A Razorpay failure test card declines on cue; the cart survives intact and the agent says so. |

---

## A marketplace, not a shop

Four independent stores share one catalogue. Every product card names its seller,
every store has its own page with real sales figures, and the assistant can shop
one store by name.

| Store | Sells |
|---|---|
| 🏡 Kalyani Home and Living | Kitchen, furniture, home |
| 🌿 Aster and Vine | Clothing, watches, scent |
| 🧺 Fresh Basket | Groceries |
| ⚡ Nova Tech | Laptops, phones, accessories |

Merchants own their catalogue through the **Products** console — title,
description, price (entered in ₹, stored as integer paise), stock, category,
variants and images — plus their shopfront name, discounts, collections,
inventory, payouts and the wiki the assistant answers policy questions from.

There is exactly **one** catalogue read path, `getCatalog()`, shared by the
storefront, the agent and the machine-readable ACP feed.

---

## The agent

No framework — a small tool-calling harness in `agent-service/src/harness/`,
about four files. Two agents share it: a **customer** agent (15 tools, has a
cart) and a **merchant** agent (10 tools, deliberately has none).

**Four memories**, assembled into every turn:

| | |
|---|---|
| **Working** | This conversation's turns, keyed per chat so a new chat starts clean |
| **Procedural** | The prompt files, versioned and promoted through the eval gate |
| **Semantic** | The merchant's wiki — delimited as *data*, never able to issue instructions |
| **Episodic** | Recent orders, plus durable facts distilled every 8 turns that follow the customer across chats |

**Credential isolation:** the user's JWT lives in the tool layer and never enters
a prompt. The agent borrows the customer's own permissions and nothing more, and
the backend re-checks every write — so a hallucinated tool call cannot become an
unauthorised action.

### Recommendations

Cross-sell is **scored, not cascaded**: co-purchase, then co-view, then a curated
map, and it returns nothing when nothing clears the bar. There is deliberately no
text-similarity tier — similar wording finds *substitutes*, not companions, which
is how a laptop once got offered a lunch box.

Trade-up is the **next shelf up**: cheapest product above the anchor, under +40%,
with rating as a tolerance rather than a requirement — because the top-rated item
in a category can never be traded up by a rule that demands a higher rating.

---

## Voice

Hold **space for two seconds**, or press the microphone. Speech in, the same
agent, speech out — a cascade, not a second assistant, so it inherits every
memory and every guardrail unchanged.

The interesting part is not the speech, it is what the system refuses to do when
it is unsure what it heard:

- Spoken figures are normalised before the turn is sent — but only when something
  says they are counting, so *"the blue one please"* stays a pronoun.
- Any turn with a number, a price or a payment word is **read back** before it is
  acted on.
- **Consent to overspend never comes from audio.** A gated reply is spoken as
  *"you will need to confirm that on screen."*

STT and TTS are the browser's Web Speech API: no key, no per-minute cost, audio
never leaves the machine — and Chrome/Edge only. `listen()` and `speak()` are the
seam if that trade stops being worth it.

---

## LLM Ops

Trace → Observe → Eval → Gate → Release, all visible in the app.

- **Trace** — every tool call, argument and latency to `agent_runs`.
- **Observe** — real token spend in ₹ on the merchant's cost tracker.
- **Eval** — **20 golden cases** with regex assertions *and* an LLM judge, run
  against the live service: `docker compose exec agent-service python evals/run.py`
- **Gate** — a prompt is only promoted if the suite passes. The gate is real; it
  has refused promotions.
- **Release** — versioned prompts in `prompt_versions`.

Each case runs in its own conversation with its own spend limit, because shared
state across cases produces flakiness that looks like nothing at all.

---

## Tech

| Layer | Actually used |
|---|---|
| **Frontend** | React + Vite, TypeScript, hand-written CSS (Shopify-admin shell, warm retail palette) |
| **Backend** | Node.js + Express, hexagonal layering, PostgreSQL, Redis, JWT with refresh-token rotation, RBAC + ABAC |
| **Agent service** | Python + FastAPI, a custom tool-calling harness, OpenRouter (`gpt-4o-mini` by default) |
| **Payments** | Razorpay test APIs — Orders, signature verification, webhooks, refunds, Route payouts with a ledger fallback |
| **Accountability** | Hash-chained append-only Postgres ledgers (intent + checkout) |
| **Infra** | Docker Compose; 13 SQL migrations; 32 tables |

> Earlier drafts of this README listed LangGraph, Temporal, MCP and mem0. **None
> of them are used.** The harness, the tool registry and the four memories are
> written from scratch in this repository — which is the more honest and, for a
> reader trying to understand the system, the more useful claim.

---

## Architecture

```
Frontend (React + Vite)
   │  JSON over HTTP, JWT
Backend (Node/Express)  ── Postgres · Redis · Razorpay · ledgers · audit · guardrail
   │  HTTP, the user's own token
Agent service (Python/FastAPI)  ── harness · tool registry · 4 memories · OpenRouter
```

**Boundary rule:** money, auth and persistence live in the backend; reasoning and
memory live in the agent service. The agent *requests* money actions; the backend
*executes and verifies* them. Every agent tool is a thin wrapper over a route the
logged-in user could have called themselves.

---

## Testing

```bash
docker compose exec backend npx vitest run                 # 19 unit tests
docker compose exec backend npx tsc -p tsconfig.json --noEmit
docker compose exec frontend npx tsc -p tsconfig.json --noEmit
docker compose exec agent-service python evals/run.py      # 20 golden cases
```

Unit tests cover the parts where being wrong is expensive: integer-paise money,
the guardrail, and ledger hash-chain verification.

---

## Documentation

| | |
|---|---|
| [ACCOUNTS.md](ACCOUNTS.md) | Demo logins for every store and customer |
| [DEMO.md](DEMO.md) | A three-minute run through the rubric |
| [PROTOCOLS.md](PROTOCOLS.md) | AP2 mandates and the ACP catalogue feed |
| [plan/](plan/) | Phase plans, including [voice](plan/phase-6-voice-agent.md) and [latency](plan/phase-7-latency.md) |
| [REMAINING.md](REMAINING.md) | Known gaps, kept honest |

---

*AI discovers; the merchant's own checkout closes the sale.*
