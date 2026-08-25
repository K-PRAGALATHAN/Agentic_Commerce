# Agentic-Commerce Protocols — how this project maps to them

The global protocol race (ACP, AP2, UAP, x402) defines how AI agents transact. This build
*emulates the shape* of the relevant ones on top of Razorpay test APIs.

| Protocol | What it is | How we implement / surface it |
|---|---|---|
| **ACP** — Agentic Commerce Protocol | A machine-readable checkout so an AI buyer can read a catalog and transact | `GET /acp/catalog` returns a clean, structured product feed (`protocol`, `currency`, `items[]` with `price.amount_paise`, `availability`). The agent consumes catalog + checkout via the backend tools. |
| **AP2** — Agent Payments Protocol | Cryptographic **mandates** proving a human authorized what the agent spent | **Intent Mandate** ≈ `intent_ledger` entry + limit snapshot (written before money moves). **Cart Mandate** ≈ `checkout_ledger` entry at checkout. Both are hash-chained (tamper-evident) and labelled as mandates in the Observability panel. |
| **UAP** — Unified Agent Protocol (NPCI) | Consent + **per-merchant spending limit** as a standard (like UPI Reserve Pay) | The guardrail enforces a spend limit (user / session / merchant scope) **before** any charge; over-limit routes to conversational confirmation. Editable in Settings. |
| **x402** — HTTP 402 pay-per-request | Agents paying per API call inside the HTTP handshake (crypto-flavoured) | **Documented, not built** — out of scope for a merchant-side checkout. Noted here for completeness. |

## Why this shape
The market converged on **"AI discovers, the merchant's own checkout closes the sale."** So we expose an
ACP-style feed for discovery, keep the money movement in our own Razorpay layer, and make consent +
accountability first-class via the guardrail (UAP) and the hash-chained mandate ledgers (AP2).

## Not cryptographic (yet)
AP2's real mandates are cryptographically signed. Here they're **hash-chained** (SHA-256 chain, tamper-evident)
rather than public-key signed — enough to prove integrity and ordering for the demo. Signing is a future upgrade.
