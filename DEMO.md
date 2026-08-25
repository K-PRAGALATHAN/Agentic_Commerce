# 3-Minute Demo Script

> Goal: hit every rubric word — **explainable, bounded, gated, audit trail, one graceful failure** — in one run.
> Prereqs: `start.cmd` running; Razorpay test keys in `.env`. Test cards: use Razorpay's **success** and **failure** test cards.

## 0. Setup (before the audience)
- Open http://localhost:5173.
- Have two accounts ready: a **merchant** and a **customer**.

## 1. Merchant makes the store sellable (30s)
1. Log in as **merchant** → **Merchant** tab.
2. Click **"Seed from internet (Door 1)"** → ~30 products appear.
3. Add one product by hand (**Door 2**) — price in ₹, stored as paise. *"Two doors, one catalog."*

## 2. AI buys — explainable + bounded (60s)
1. Log in as **customer** → **Settings**: set **Spend limit = ₹100**, **Buying mode = conversational**.
2. **AI** tab → type: **"buy me a shirt under ₹700"**.
   - Agent **explains** its pick (rating/price) and suggests an **upsell / cross-sell**. *(explainable)*
   - It asks to confirm. Reply **"confirm"**.
   - It reports **over your ₹100 limit — routed to conversational**. *(bounded + gated)*
3. Reply **"confirm"** again → it overrides with your consent and creates the order.

## 3. Pay — with a graceful failure (45s)
1. **Cart** → **Checkout** → Razorpay test widget opens.
2. Use the **failure test card** → payment declines → the app shows a **graceful recovery** ("cart is intact, try again"). *(one failure handled gracefully)*
3. Checkout again → **success test card** → **"Payment verified and captured"** (verified server-side).

## 4. Show the receipts — audit trail (45s)
1. **Audit** tab:
   - **Audit log** — every action with a human-readable reason (guardrail_block, create_order, payment_captured…).
   - **Agent runs** — the multi-agent trace (orchestrator → search → explainer → upsell → cross-sell → payment).
   - **Ledger** — switch between **Intent Mandate (AP2)** and **Cart Mandate (AP2)**; click **Verify chain** → ✓ valid; (optionally tamper a row in the DB → ✗ broken).
2. Merchant tab → **LLM cost tracker** shows real ₹ spent on the model, and the **refund queue** (money-out is gated behind approval).

## The line to land
> "Every money action here is explainable, bounded, and gated — and it's all provable: a tamper-evident
> audit trail, a multi-agent trace, and one failure handled gracefully. AI discovers; the merchant's own
> Razorpay checkout closes the sale."
