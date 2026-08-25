"""Single-agent MVP orchestration (Phase 3).

Flow: understand -> search -> explain the pick -> respect the buying mode ->
checkout within the guardrail -> if over limit, switch to conversational confirm.

Works with OR without an LLM:
  * OPENROUTER_API_KEY set  -> the model does NLU + explanation + general chat.
  * no key                  -> a deterministic rule-based agent runs the same flow,
                               so the whole thing is demoable with no external key.
Money actions stay explainable (a reason on every step), bounded (backend guardrail),
and gated (backend intent ledger) — this agent only orchestrates the backend tools.
"""
import re
import uuid

from . import memory, model
from .tools import Tools

CONFIRM_WORDS = {"yes", "y", "confirm", "ok", "okay", "sure", "proceed", "go ahead", "do it", "buy it"}
SHOP_VERBS = ("buy", "purchase", "order", "get me", "find", "show", "want", "need", "add")
STOP = {
    "buy", "purchase", "order", "get", "me", "a", "an", "the", "please", "want", "need",
    "find", "show", "under", "below", "less", "than", "for", "with", "to", "i", "some",
    "rs", "rupees", "rupee", "inr", "of", "and", "my",
}


def rupees(paise: int) -> str:
    return f"₹{paise / 100:.0f}"


def _parse_rule_based(message: str) -> dict:
    text = message.lower().strip()
    if text in CONFIRM_WORDS or any(text == w for w in CONFIRM_WORDS):
        return {"intent": "confirm"}
    # price ceiling
    max_paise = None
    m = re.search(r"(?:under|below|less than|upto|up to|max|<)\s*₹?\s*(\d+)", text)
    if not m:
        m = re.search(r"₹\s*(\d+)", text)
    if m:
        max_paise = int(m.group(1)) * 100
    # keyword = message minus command/stop words and prices
    cleaned = re.sub(r"₹?\s*\d+", " ", text)
    tokens = [t for t in re.findall(r"[a-z]+", cleaned) if t not in STOP]
    keyword = " ".join(tokens).strip()
    # Shop intent needs an explicit signal — a shopping verb or a price ceiling.
    # A bare sentence with no verb/price is treated as general chat (→ friendly divert).
    is_shop = any(v in text for v in SHOP_VERBS) or (max_paise is not None)
    return {"intent": "shop" if is_shop else "general", "keyword": keyword, "max_paise": max_paise}


async def _parse(message: str, run_id: str, tools: Tools) -> dict:
    if not model.is_available():
        return _parse_rule_based(message)
    prompt = [
        {"role": "system", "content": (
            "Extract shopping intent as JSON only. Fields: intent ('shop'|'general'|'confirm'), "
            "keyword (product words, string), max_rupees (number or null). No prose."
        )},
        {"role": "user", "content": message},
    ]
    try:
        res = await model.chat(prompt, temperature=0)
        await tools.log_model_cost(run_id, res["model"], res["tokens_in"], res["tokens_out"], model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]))
        data = model.extract_json(res["text"]) or {}
        return {
            "intent": data.get("intent", "shop"),
            "keyword": (data.get("keyword") or "").strip(),
            "max_paise": int(data["max_rupees"] * 100) if data.get("max_rupees") else None,
        }
    except Exception:
        return _parse_rule_based(message)


def _rank(products: list[dict], pref: str) -> list[dict]:
    if pref == "cost":
        return sorted(products, key=lambda p: p["pricePaise"])
    # quality / default: best rating first, cheaper as tiebreak
    return sorted(products, key=lambda p: (-float(p.get("rating") or 0), p["pricePaise"]))


async def _explain(pick: dict, n: int, pref: str, run_id: str, tools: Tools) -> str:
    base = (f'I recommend "{pick["name"]}" at {rupees(pick["pricePaise"])} '
            f'({float(pick.get("rating") or 0):.1f}★)')
    reason = "cheapest match" if pref == "cost" else f"best-rated of {n} matches"
    if not model.is_available():
        return f"{base} — {reason}."
    try:
        res = await model.chat([
            {"role": "system", "content": "One friendly sentence on why this product is a good pick. No markdown."},
            {"role": "user", "content": f"Product: {pick['name']}, {rupees(pick['pricePaise'])}, rating {pick.get('rating')}, reason: {reason}."},
        ])
        await tools.log_model_cost(run_id, res["model"], res["tokens_in"], res["tokens_out"], model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]))
        return res["text"].strip()
    except Exception:
        return f"{base} — {reason}."


async def _general(message: str, ctx: dict, run_id: str, tools: Tools) -> dict:
    orders = ctx.get("recentOrders", [])
    if model.is_available():
        try:
            res = await model.chat([
                {"role": "system", "content": "You are a concise shopping assistant for this store. If the message is off-topic, gently and wittily steer back to shopping. Keep it brief and brand-safe."},
                {"role": "user", "content": message},
            ])
            await tools.log_model_cost(run_id, res["model"], res["tokens_in"], res["tokens_out"], model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]))
            return {"reply": res["text"].strip(), "kind": "general", "data": {}}
        except Exception:
            pass
    # keyless fallback: light, tasteful divert + a nudge from history
    hint = "Try: \"buy me a blue shirt under ₹600\"."
    if orders:
        hint = f"Last time you spent {rupees(int(orders[0]['totalPaise']))} — want something similar? " + hint
    return {"reply": f"I'm your shopping copilot, not a search engine 🙂 — but I'm great at buying things. {hint}", "kind": "general", "data": {}}


async def handle(user_id: str, message: str, tools: Tools) -> dict:
    run_id = str(uuid.uuid4())
    memory.remember(user_id, "user", message)
    ctx = await tools.get_context()
    prefs = ctx.get("preferences", {})
    pref_rank = prefs.get("rankingPref", "default")
    buying_mode = prefs.get("buyingMode", "conversational")

    parsed = await _parse(message, run_id, tools)
    intent = parsed.get("intent", "shop")

    # 1) Confirmation of a pending action (conversational or over-limit).
    if intent == "confirm":
        pending = memory.get_scratch(user_id, "pending")
        if not pending:
            return _reply(user_id, "Nothing pending to confirm. What would you like to buy?", "general")
        result = await tools.checkout(confirm_over_limit=pending.get("over_limit", False))
        memory.clear_scratch(user_id, "pending")
        return _checkout_reply(user_id, result)

    # 2) General / off-topic.
    if intent == "general":
        out = await _general(message, ctx, run_id, tools)
        memory.remember(user_id, "assistant", out["reply"])
        return out

    # 3) Shopping flow.
    keyword = parsed.get("keyword", "")
    max_paise = parsed.get("max_paise")
    products = await tools.search_products(keyword, max_paise)
    if not products:
        widen = " (try a higher budget or a different term)" if max_paise else ""
        return _reply(user_id, f'No products matched "{keyword or message}"{widen}. I never guess — want to try another search?', "no_results")

    ranked = _rank(products, pref_rank)
    pick = ranked[0]
    why = await _explain(pick, len(products), pref_rank, run_id, tools)

    await tools.add_to_cart(pick["id"], 1)
    cart = await tools.get_cart()
    total = int(cart.get("totalPaise", pick["pricePaise"]))

    # Conversational mode: recommend + ask before spending.
    if buying_mode == "conversational":
        memory.set_scratch(user_id, "pending", {"over_limit": False})
        reply = f'{why} Added to your cart — your total is {rupees(total)}. Shall I check out? (reply "confirm")'
        return _reply(user_id, reply, "recommend", {"pick": pick, "cartTotalPaise": total})

    # Direct mode: proceed to checkout (guardrail decides).
    result = await tools.checkout(confirm_over_limit=False)
    return _checkout_reply(user_id, result, prefix=why + " ")


def _reply(user_id: str, text: str, kind: str, data: dict | None = None) -> dict:
    memory.remember(user_id, "assistant", text)
    return {"reply": text, "kind": kind, "data": data or {}}


def _checkout_reply(user_id: str, result: dict, prefix: str = "") -> dict:
    if result.get("gated"):
        guard = result.get("guard", {})
        memory.set_scratch(user_id, "pending", {"over_limit": True})
        text = (f'{prefix}That would be {rupees(int(guard.get("totalPaise", 0)))}, which is over your '
                f'limit of {rupees(int(guard.get("effectiveLimitPaise", 0)))}. '
                f'Reply "confirm" to proceed anyway, or raise your limit in Settings.')
        return _reply(user_id, text, "gated", {"guard": guard})
    if result.get("_status", 200) >= 400 or result.get("error"):
        # e.g. Razorpay not configured, empty cart — handled gracefully, no crash.
        return _reply(user_id, f'{prefix}I couldn\'t complete checkout: {result.get("error", "unknown error")}. Your cart is safe — want to try again?', "error")
    order = result.get("order", {})
    text = (f'{prefix}Done ✅ — order {str(order.get("id",""))[:8]} created for {rupees(int(order.get("totalPaise", 0)))}. '
            f'Complete the payment in the app to finish.')
    return _reply(user_id, text, "checkout", {"order": order, "razorpayOrderId": result.get("razorpayOrderId")})
