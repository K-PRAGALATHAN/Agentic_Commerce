# 🛒 Agentic Commerce

> An e-commerce web app where an **AI does the shopping** — a customer chats in plain language, and a team of
> agents searches, recommends, upsells, and completes the purchase through **Razorpay**, with every money
> action **explainable, bounded, and gated**.

Built for **Track 01 — AI Growth & Agentic Commerce**: *grow the merchant's revenue, and make them sellable to AI buyers.*

---

## ✨ What it does

A customer says *"buy me a blue shirt under ₹600"* and the system:

1. Reads their preferences — spending **limit**, **direct vs. conversational** buying, **cost ↔ quality** ranking.
2. **Searches & filters** the catalog, then **explains** the best pick (ratings, reviews, frequently-bought).
3. **Checks the limit** — if over budget, switches to conversational mode to confirm.
4. Writes the intent to a **tamper-evident ledger** *before* any money moves.
5. **Pays via Razorpay** (test mode) and verifies the payment server-side.
6. Logs every step to a **live audit trail** — including one payment failure handled gracefully.

---

## 🎯 The Bar — every money action is…

| Requirement | How it's met |
|---|---|
| **Explainable** | The agent states *why* it chose a product; every action carries a reason in the audit log. |
| **Bounded** | Spending limits (user / session / merchant) enforced **before** any charge. |
| **Gated** | Intent-ledger entry required before purchase; refunds need approval; over-limit is blocked. |
| **Audit trail** | Append-only log + hash-chained intent & checkout ledgers, visible + verifiable in the UI. |
| **Graceful failure** | A Razorpay failure test card triggers a decline on cue; the agent recovers cleanly. |

---

## 🧩 Catalog — two doors, one store

Products enter one `products` table through two paths that share the same normalizer and read path:

- **Internet fetch** — a sync job seeds realistic demo products for fast development.
- **Merchant admin UI** — a non-technical merchant adds / edits / deletes products (the "sellable merchant" story).

Everything downstream reads only through a single `getCatalog()` — the agents never know which door a product came from.

---

## 🤖 The multi-agent system

A **single MCP server** exposes many tools to a coordinated team of agents:

`search` · `filter` · `explainer/recommender` · `cost-accumulation` · `guardrail/limit` ·
`intent-inference` · `upsell` · `cross-sell` · `payment` · `general-query`

Agents are **auth-aware**, **remember the conversation**, and **never see raw credentials** — only the tool
layer touches secrets and money.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React (glassy / iOS-26 style) |
| **Backend** | Node.js (hexagonal architecture), PostgreSQL, Redis, JWT + RBAC/ABAC |
| **Agent service** | Python · LangGraph · Temporal · FastAPI · single MCP server · OpenRouter |
| **Memory** | mem0 (per-user) + Wiki (shared) + Knowledge Graph (product relationships) |
| **Payments** | Razorpay test APIs — Orders, Payment Links, signature verify, webhooks, refunds |
| **Accountability** | Hash-chained, append-only Postgres ledgers (intent + checkout) |
| **Infra** | Docker (local) · AWS / Vercel (deploy) |

---

## 🏗️ Architecture

```
Frontend (React)
   │  HTTPS / JSON (JWT)
Backend (Node.js, hexagonal)  ── PostgreSQL · Redis · Razorpay adapter · ledgers · audit
   │  MCP (single server, many tools)
Agent service (Python)  ── LangGraph + Temporal · OpenRouter · mem0 + Wiki + Knowledge Graph
```

**Boundary rule:** money + auth + persistence live in the backend; reasoning + memory live in the agent
service. The agent *requests* money actions; the backend *executes and verifies* them.

---

## 📌 Scope

**Razorpay test mode only** — no real money, no KYC. The safety spine (limits, ledgers, audit, graceful
failure) is fully demonstrable on test APIs.

---

## 🚧 Status

In active development. See the issues and project board for progress.

---

*Aligned with where the market landed — **AI discovers, the merchant's own checkout closes the sale.***
