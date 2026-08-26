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
BROWSE_WORDS = ("list", "show me", "browse", "options", "suggest", "what do you have", "looking for", "recommend")
STOP = {
    "buy", "purchase", "order", "get", "me", "a", "an", "the", "please", "want", "need",
    "find", "show", "under", "below", "less", "than", "for", "with", "to", "i", "some",
    "rs", "rupees", "rupee", "inr", "of", "and", "my",
    # filler / browse words — keep the keyword to the actual product term
    "list", "you", "have", "what", "all", "are", "is", "do", "does", "there", "available",
    "dei", "bro", "man", "can", "could", "would", "give", "tell", "us", "browse", "option",
    "options", "suggest", "recommend", "looking", "any", "them", "see", "know", "your", "we",
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
    # Strip prices, then split on separators for MULTIPLE products ("shirt and shoes").
    stripped = re.sub(r"₹?\s*\d+", " ", text)
    items = []
    for frag in re.split(r"\s+and\s+|,|&", stripped):
        toks = [t for t in re.findall(r"[a-z]+", frag) if t not in STOP]
        kw = " ".join(toks).strip()
        if kw:
            items.append(kw)
    keyword = items[0] if items else ""
    # Browse = "list/show me shirts" → present options, don't auto-buy.
    if any(w in text for w in BROWSE_WORDS) and keyword:
        return {"intent": "browse", "keyword": keyword, "items": items, "max_paise": max_paise}
    # Shop intent needs an explicit signal — a shopping verb or a price ceiling.
    is_shop = any(v in text for v in SHOP_VERBS) or (max_paise is not None)
    return {"intent": "shop" if is_shop else "general", "keyword": keyword, "items": items, "max_paise": max_paise}


async def _parse(message: str, run_id: str, tools: Tools) -> dict:
    rb = _parse_rule_based(message)
    if not model.is_available():
        return rb
    # #3 — trust the rule-based result for CLEAR cases (no LLM round-trip):
    #   a confirmation, or a shop/browse with an extracted keyword.
    if rb["intent"] == "confirm" or (rb["intent"] in ("shop", "browse") and rb.get("keyword")):
        return rb
    # #2 — ambiguous: ONE grounded LLM call returns intent + items + resolved
    # categories + price, so no separate resolver call is needed downstream.
    try:
        cats = [c["category"] for c in await tools.clusters()]
        res = await model.chat([
            {"role": "system", "content": (
                "Classify the shopping message. Return JSON only: {intent:('shop'|'browse'|'general'|'confirm'), "
                "items:[product phrases], categories:[subset of the given list], max_rupees:(number|null)}. "
                "Only use categories from the provided list; [] if none fit."
            )},
            {"role": "user", "content": f"Message: {message}\nAvailable categories: {cats}"},
        ], temperature=0)
        await tools.log_model_cost(run_id, res["model"], res["tokens_in"], res["tokens_out"], model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]))
        data = model.extract_json(res["text"]) or {}
        items = [str(x).strip() for x in (data.get("items") or []) if str(x).strip()]
        rc = [c for c in (data.get("categories") or []) if c in cats]
        return {
            "intent": data.get("intent", "general"),
            "keyword": items[0] if items else "",
            "items": items,
            "categories": rc,
            "max_paise": int(data["max_rupees"] * 100) if data.get("max_rupees") else None,
        }
    except Exception:
        return rb


def _rank(products: list[dict], pref: str) -> list[dict]:
    if pref == "cost":
        return sorted(products, key=lambda p: p["pricePaise"])
    # quality / default: best rating first, cheaper as tiebreak
    return sorted(products, key=lambda p: (-float(p.get("rating") or 0), p["pricePaise"]))


# General term -> real category. Best-effort fallback for keyless mode; the LLM
# resolver (grounded in the live categories) is the primary path.
SYNONYMS = {
    "fruit": "groceries", "fruits": "groceries", "vegetable": "groceries", "vegetables": "groceries",
    "veg": "groceries", "food": "groceries", "grocery": "groceries", "snack": "groceries", "snacks": "groceries",
    "drink": "groceries", "drinks": "groceries", "beverage": "groceries", "beverages": "groceries",
    "perfume": "fragrances", "perfumes": "fragrances", "scent": "fragrances", "cologne": "fragrances",
    "makeup": "beauty", "cosmetic": "beauty", "cosmetics": "beauty", "skincare": "beauty",
    "chair": "furniture", "table": "furniture", "bed": "furniture", "sofa": "furniture", "furnitures": "furniture",
    "clothes": "tops", "clothing": "tops", "apparel": "tops", "wear": "tops",
    "phone": "smartphones", "mobile": "smartphones", "laptop": "laptops",
}


def _synonym_resolve(term: str, cats: list[str]) -> tuple[list[str], list[str]]:
    # Match on WHOLE WORDS, not substrings — otherwise "table" hits inside
    # "vege(table)s" and wrongly maps vegetables -> furniture.
    words = set(re.findall(r"[a-z]+", term.lower()))
    rc: list[str] = []
    for word, cat in SYNONYMS.items():
        if word in words and cat in cats and cat not in rc:
            rc.append(cat)
    for c in cats:  # the term itself IS a category word
        if c.lower() in words and c not in rc:
            rc.append(c)
    return rc, []


async def _resolve(term: str, run_id: str, tools: Tools) -> dict:
    """Map a general term ('fruits') to REAL categories/keywords from the live catalog."""
    cats = [c["category"] for c in await tools.clusters()]
    # Fast path — deterministic synonym/category match, no LLM round-trip.
    rc, kw = _synonym_resolve(term, cats)
    if rc:
        await tools.log_run(run_id, "resolver", {"term": term, "mode": "synonym"}, {"categories": rc, "keywords": kw})
        return {"categories": rc, "keywords": kw}
    # Smart path — LLM maps ambiguous terms, grounded in the real categories.
    if model.is_available() and cats:
        try:
            res = await model.chat([
                {"role": "system", "content": (
                    "Map the user's product query to the store's REAL categories. Return JSON only: "
                    "{\"categories\":[subset of the given list], \"keywords\":[specific product words]}. "
                    "Only use categories from the provided list; [] if none fit."
                )},
                {"role": "user", "content": f"Query: {term}\nAvailable categories: {cats}"},
            ], temperature=0)
            await tools.log_model_cost(run_id, res["model"], res["tokens_in"], res["tokens_out"], model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]))
            data = model.extract_json(res["text"]) or {}
            rc = [c for c in (data.get("categories") or []) if c in cats]
            kw = [str(k).strip() for k in (data.get("keywords") or []) if str(k).strip()]
            if rc or kw:
                await tools.log_run(run_id, "resolver", {"term": term}, {"categories": rc, "keywords": kw})
                return {"categories": rc, "keywords": kw}
        except Exception:
            pass
    # Nothing matched (synonym already tried at the top).
    await tools.log_run(run_id, "resolver", {"term": term, "mode": "none"}, {"categories": [], "keywords": []})
    return {"categories": [], "keywords": []}


async def _find_products(term: str, max_paise, run_id: str, tools: Tools, pre_categories: list[str] | None = None) -> list[dict]:
    """Layered search: literal -> (pre-resolved | resolved) categories -> keywords."""
    products = await tools.search_products(term, max_paise)
    await tools.log_run(run_id, "search", {"keyword": term, "layer": "literal"}, {"matches": len(products)})
    if products:
        return products
    # Categories already resolved by the merged parse call → no extra LLM round-trip.
    if pre_categories:
        products = await tools.search_products("", max_paise, categories=pre_categories)
        await tools.log_run(run_id, "search", {"categories": pre_categories, "layer": "category-pre"}, {"matches": len(products)})
        if products:
            return products
    r = await _resolve(term, run_id, tools)
    if r["categories"]:
        products = await tools.search_products("", max_paise, categories=r["categories"])
        await tools.log_run(run_id, "search", {"categories": r["categories"], "layer": "category"}, {"matches": len(products)})
    if not products and r["keywords"]:
        seen: set = set()
        merged: list[dict] = []
        for kw in r["keywords"]:
            for p in await tools.search_products(kw, max_paise):
                if p["id"] not in seen:
                    seen.add(p["id"])
                    merged.append(p)
        products = merged
        await tools.log_run(run_id, "search", {"keywords": r["keywords"], "layer": "keyword"}, {"matches": len(products)})
    return products


# Template explanation — no LLM round-trip (kept fast; the reason is deterministic).
def _explain(pick: dict, n: int, pref: str) -> str:
    reason = "cheapest match" if pref == "cost" else f"best-rated of {n} matches"
    return (f'I recommend "{pick["name"]}" at {rupees(pick["pricePaise"])} '
            f'({float(pick.get("rating") or 0):.1f}★) — {reason}.')


async def _general(message: str, ctx: dict, run_id: str, tools: Tools) -> dict:
    orders = ctx.get("recentOrders", [])
    wiki = ctx.get("wiki", [])
    mem = ctx.get("memory", [])
    if model.is_available():
        try:
            # Wiki grounds answers so every agent tells the SAME story (consistency).
            facts = "\n".join(f"- {w['title']}: {w['content']}" for w in wiki)
            history = [{"role": m["role"], "content": m["content"]} for m in mem[-6:]]
            res = await model.chat([
                {"role": "system", "content": (
                    "You are a concise shopping assistant for this store. Answer store questions using ONLY these facts; "
                    "if off-topic, gently and wittily steer back to shopping. Brief and brand-safe.\n\nStore facts:\n" + facts
                )},
                *history,
                {"role": "user", "content": message},
            ])
            await tools.log_model_cost(run_id, res["model"], res["tokens_in"], res["tokens_out"], model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]))
            return {"reply": res["text"].strip(), "kind": "general", "data": {}}
        except Exception:
            pass
    # keyless fallback: answer policy questions from the wiki, else a tasteful divert.
    for w in wiki:
        if w["key"] in message.lower() or any(word in message.lower() for word in w["title"].lower().split()):
            return {"reply": f"{w['title']}: {w['content']}", "kind": "general", "data": {}}
    hint = "Try: \"buy me a blue shirt under ₹600\"."
    if orders:
        hint = f"Last time you spent {rupees(int(orders[0]['totalPaise']))} — want something similar? " + hint
    return {"reply": f"I'm your shopping copilot, not a search engine 🙂 — but I'm great at buying things. {hint}", "kind": "general", "data": {}}


async def handle(user_id: str, message: str, tools: Tools) -> dict:
    # Persist the turn to the backend (Sidekick-style memory) around the core logic.
    await tools.remember("user", message)
    out = await _handle(user_id, message, tools)
    await tools.remember("assistant", out.get("reply", ""))
    return out


async def _handle(user_id: str, message: str, tools: Tools) -> dict:
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

    # 2b) Browse — cherry-pick the top products and present as cards (no auto-buy).
    if intent == "browse":
        kw = parsed.get("keyword", "")
        products = await _find_products(kw, parsed.get("max_paise"), run_id, tools, parsed.get("categories"))
        if not products:
            return _reply(user_id, f'I couldn\'t find any "{kw}". Want to try another term?', "no_results")
        top = _rank(products, pref_rank)[:6]
        return _reply(user_id, f'Here are the top {len(top)} {kw} I found — tap any to see details, or "Add to cart".', "browse", {"options": top})

    # 3) Shopping flow — each step logged as an agent run (multi-agent trace).
    keyword = parsed.get("keyword", "")
    items = parsed.get("items") or ([keyword] if keyword else [])
    max_paise = parsed.get("max_paise")
    await tools.log_run(run_id, "orchestrator", {"message": message}, {"intent": intent, "items": items, "max_paise": max_paise})

    # 3a) BATCH multi-product: one accumulation pass, one guardrail, one ledger entry.
    if len(items) > 1:
        return await _batch(user_id, items, max_paise, pref_rank, buying_mode, run_id, tools)

    products = await _find_products(keyword, max_paise, run_id, tools, parsed.get("categories"))
    if not products:
        widen = " (try a higher budget or a different term)" if max_paise else ""
        return _reply(user_id, f'No products matched "{keyword or message}"{widen}. I never guess — want to try another search?', "no_results")

    ranked = _rank(products, pref_rank)
    pick = ranked[0]
    why = _explain(pick, len(products), pref_rank)
    await tools.log_run(run_id, "explainer", {"candidates": len(products), "pref": pref_rank}, {"pick": pick["name"], "price_paise": pick["pricePaise"]})

    # Upsell + cross-sell agents (cross-sell = order co-occurrence = KG seed).
    upsell = await tools.upsell(pick["id"])
    cross = await tools.cross_sell(pick["id"])
    await tools.log_run(run_id, "upsell", {"product": pick["name"]}, {"suggested": upsell["name"] if upsell else None})
    await tools.log_run(run_id, "cross_sell", {"product": pick["name"]}, {"count": len(cross)})
    suggest = ""
    if upsell:
        suggest += f' You could step up to "{upsell["name"]}" ({rupees(upsell["pricePaise"])}).'
    if cross:
        suggest += f' Often bought with it: {", ".join(c["name"] for c in cross[:2])}.'

    await tools.add_to_cart(pick["id"], 1)
    cart = await tools.get_cart()
    total = int(cart.get("totalPaise", pick["pricePaise"]))

    # Product options for the chat to render as cards (carousel).
    options = ranked[:4]

    # Conversational mode: recommend + ask before spending.
    if buying_mode == "conversational":
        memory.set_scratch(user_id, "pending", {"over_limit": False})
        reply = f'{why}{suggest} Added to your cart — your total is {rupees(total)}. Shall I check out? (reply "confirm")'
        return _reply(user_id, reply, "recommend", {"pick": pick, "options": options, "upsell": upsell, "crossSell": cross, "cartTotalPaise": total})

    # Direct mode: proceed to checkout (guardrail decides).
    result = await tools.checkout(confirm_over_limit=False)
    await tools.log_run(run_id, "payment", {"total_paise": total}, {"gated": bool(result.get("gated")), "order": (result.get("order") or {}).get("id")})
    return _checkout_reply(user_id, result, prefix=why + suggest + " ")


async def _batch(user_id, items, max_paise, pref_rank, buying_mode, run_id, tools) -> dict:
    """Buy several products in one pass: search+pick+add each, then ONE checkout.
    Avoids per-product round-trips to the money layer (single guardrail + ledger)."""
    picks, missing = [], []
    for kw in items:
        products = await _find_products(kw, max_paise, run_id, tools)
        if not products:
            missing.append(kw)
            continue
        pick = _rank(products, pref_rank)[0]
        await tools.add_to_cart(pick["id"], 1)
        picks.append(pick)
    await tools.log_run(run_id, "cost_accumulation", {"requested": len(items)}, {"found": len(picks), "missing": missing})

    if not picks:
        return _reply(user_id, f'None of those matched ({", ".join(items)}). Want to try different terms?', "no_results")

    cart = await tools.get_cart()
    total = int(cart.get("totalPaise", 0))
    names = ", ".join(p["name"] for p in picks)
    note = f' (couldn\'t find: {", ".join(missing)})' if missing else ""

    if buying_mode == "conversational":
        memory.set_scratch(user_id, "pending", {"over_limit": False})
        return _reply(user_id, f'Added {len(picks)} item(s): {names}{note}. Total {rupees(total)}. Shall I check out? (reply "confirm")', "recommend", {"picks": picks, "options": picks, "cartTotalPaise": total})

    result = await tools.checkout(confirm_over_limit=False)
    await tools.log_run(run_id, "payment", {"total_paise": total}, {"gated": bool(result.get("gated"))})
    return _checkout_reply(user_id, result, prefix=f"Picked {names}{note}. ")


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
