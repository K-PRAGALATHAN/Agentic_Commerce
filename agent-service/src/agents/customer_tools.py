"""The customer agent's tools.

Every one is a thin wrapper over a backend route the logged-in user could call
themselves. That is the whole authority model: the agent borrows the user's
token and therefore inherits exactly the user's permissions — never more. The
backend re-checks on every write, so a hallucinated tool call cannot become an
unauthorised action.
"""
from .. import model, resolver
from ..harness import memory
from ..harness.loop import Registry, Tool


def build(tools, user_id: str | None = None, run_id: str | None = None) -> Registry:
    r = Registry()
    # Which chat this is. The trade-up hold lives in per-conversation working
    # memory, so it survives to the next turn and no further.
    convo = getattr(tools, "conversation_id", None)

    # No identity means no gate. That is the correct direction to fail: a caller
    # we cannot place in a conversation must never be able to hold a customer's
    # add hostage, because nothing would ever release it.
    gate_on = bool(user_id and run_id)

    def _slim(products: list[dict]) -> list[dict]:
        return [
            {"id": p["id"], "name": p["name"], "price_rupees": p["pricePaise"] / 100,
             "rating": p.get("rating"), "category": p.get("category"), "stock": p.get("stock"),
             # Several independent merchants sell here. Who takes the money is
             # part of the offer, so the assistant is never in a position to
             # describe a product without being able to say whose it is.
             "sold_by": p.get("sellerName")}
            for p in products[:12]
        ]

    async def search_products(query: str = "", max_rupees: float | None = None, name_only: bool = False):
        """Layered search: literal, then resolved categories, then keyword groups.

        A literal match alone is not enough. "fruits" is nobody's product name and
        nobody's category — the category is "groceries" — so a bare ILIKE returns
        nothing while the shelf is full. Each layer is only tried when the one
        before it found nothing, so the precise answer always wins.
        """
        max_paise = int(max_rupees * 100) if max_rupees else None

        # 1. Literal.
        products = await tools.search_products(query, max_paise, name_only=name_only)
        layer = "literal"

        if not products and query:
            categories = [c["category"] for c in await tools.clusters()]
            cats, keywords = resolver.resolve(query, categories)

            # 2. Keyword groups first — they are the precise ones, and scoping them
            #    to a category stops "apple" matching the brand in "Apple AirPods".
            if keywords:
                seen: set = set()
                merged: list[dict] = []
                for kw in keywords:
                    for p in await tools.search_products(kw, max_paise,
                                                         categories=(cats or None), name_only=True):
                        if p["id"] not in seen:
                            seen.add(p["id"])
                            merged.append(p)
                if merged:
                    products, layer = merged, "keyword"

            # 3. Broad category sweep for coarse terms with no keyword group.
            if not products and cats:
                products = await tools.search_products("", max_paise, categories=cats)
                layer = "category"

        # Cards for the UI travel out-of-band so the model isn't asked to
        # reproduce product JSON in its prose.
        return {"products": _slim(products), "matched_via": layer,
                "_ui": {"options": products[:6]}}

    async def list_categories():
        """What the store actually calls things — grounding, so the model stops
        guessing category names that do not exist."""
        return {"categories": [
            {"category": c["category"], "products": c["count"]} for c in await tools.clusters()
        ]}

    async def product_detail(product_id: str):
        p = await tools.product_detail(product_id)
        return {
            "id": p.get("id"), "name": p.get("name"), "description": p.get("description"),
            "price_rupees": p.get("pricePaise", 0) / 100,
            "sold_by": p.get("sellerName"),
            "variants": [
                {"variant_id": v["id"], "title": v["title"],
                 "price_rupees": v["pricePaise"] / 100, "stock": v["stock"]}
                for v in (p.get("variants") or [])
            ],
        }

    async def browse_collections():
        return {"collections": await tools.collections()}

    async def list_stores():
        """Who sells on this marketplace.

        Several independent merchants share one catalogue. A customer asking
        "which shops are there" or "what does Nova Tech sell" is asking about
        the seller, not the product, and without this the agent could only
        answer from the seller name attached to individual search hits.
        """
        return {"stores": [
            {"slug": s["slug"], "name": s["storeName"], "sells": s["tagline"],
             "products": s["productCount"], "rating": s["rating"],
             "categories": s.get("categories", []), "location": s.get("location", "")}
            for s in await tools.stores()
        ]}

    async def store_products(slug: str, max_rupees: float | None = None):
        """Everything one named store sells, optionally under a price."""
        data = await tools.store(slug)
        items = data.get("products", [])
        if max_rupees is not None:
            items = [p for p in items if p["pricePaise"] <= max_rupees * 100]
        info = data.get("store", {})
        return {
            "store": {"name": info.get("storeName"), "sells": info.get("tagline"),
                      "about": info.get("about")},
            "products": _slim(items),
            # Same out-of-band card payload as search_products. Without it a
            # store-scoped question answered in prose only, while the identical
            # question phrased as a search came back with pictures.
            "_ui": {"options": items[:6]},
        }

    async def list_carts():
        carts = await tools.list_carts()
        return {"carts": [{"cart_id": c["id"], "name": c["name"], "is_universal": c["isDefault"],
                          "items": c["itemCount"], "total_rupees": c["totalPaise"] / 100} for c in carts]}

    async def create_cart(name: str):
        res = await tools.create_cart(name)
        c = res.get("cart", {})
        return {"created": {"cart_id": c.get("id"), "name": c.get("name")}}

    async def move_between_carts(variant_id: str, to_cart_id: str, from_cart_id: str | None = None):
        res = await tools.move_item(variant_id, to_cart_id, from_cart_id)
        c = res.get("cart", res)
        return {"moved": True, "cart": c.get("name"), "items": len(c.get("items", []))}

    async def _commit_add(product_id, variant_id, qty, cart_id):
        if gate_on:
            memory.clear_scratch(user_id, "held_add", convo)
        cart = await tools.add_to_cart(product_id=product_id, variant_id=variant_id, qty=qty, cart_id=cart_id)
        c = cart.get("cart", cart)
        return {
            "added": True,
            "cart": c.get("name"),
            "items": [{"name": i["name"], "variant": i.get("variantTitle"), "qty": i["qty"]} for i in c.get("items", [])],
            "total_rupees": c.get("totalPaise", 0) / 100,
            "_ui": {"cartTotalPaise": c.get("totalPaise", 0)},
        }

    async def _ceiling():
        """The most we may suggest: the customer's own spend limit.

        This deliberately does NOT take a budget from the model. An earlier
        version accepted one, and the model supplied a figure whether or not
        anybody had said a number — 100 against an 89.99 product — which put the
        ceiling under the next shelf and silently switched the trade-up off. A
        hallucinated argument that disables a feature without erroring is worse
        than no argument.

        The limit is per ORDER, not per item, so using it whole is slightly
        generous once there is something in the basket. Subtracting the cart
        total would cost a round trip on every settle, and the ratio cap in the
        SQL is doing the real work, so the looser reading is accepted.
        """
        try:
            prefs = (await tools.get_context()).get("preferences") or {}
            limit = prefs.get("spendLimitPaise")
            return int(limit) if limit else None
        except Exception:
            return None

    async def add_to_cart(product_id: str | None = None, variant_id: str | None = None,
                          qty: int = 1, cart_id: str | None = None):
        """Add an item - or hold it once, to show the customer the next step up.

        Modelled on `checkout`, which does not fail when it is over the spend
        limit but returns `gated` for the model to explain. Here, the first time
        a customer settles on something the add is HELD and one alternative comes
        back instead. Ask again and it goes through: a gate that cannot be walked
        past is not a suggestion, it is a refusal.
        """
        # Topping up a quantity is not settling on a product, and a gift list is a
        # poor place to sell. Neither is gated.
        #
        # "A named cart" is not the same as "cart_id was passed": the model often
        # passes the universal cart's own id, and treating that as a named list
        # would have skipped the gate on ordinary adds. Check what it points at.
        named_cart = False
        if cart_id:
            try:
                named_cart = any(c["id"] == cart_id and not c.get("isDefault")
                                 for c in await tools.list_carts())
            except Exception:
                named_cart = True  # cannot tell: leave the customer alone
        if not gate_on or qty > 1 or named_cart:
            return await _commit_add(product_id, variant_id, qty, cart_id)

        anchor = product_id
        if not anchor and variant_id:
            # Variant adds are the norm for anything with sizes; without this the
            # gate would have a hole exactly where those products live.
            anchor = (await tools.variant(variant_id)).get("productId")
        if not anchor:
            return await _commit_add(product_id, variant_id, qty, cart_id)

        key = "pitched:" + anchor
        held = memory.get_scratch(user_id, key, None, convo)

        # Same turn, already held. Return the identical answer and say so.
        #
        # This keys on run_id ALONE, never on which item was named. A model that
        # wants to push through can re-call with product_id where it first sent
        # variant_id, and any identity check would wave it straight through.
        if held and held.get("run_id") == run_id:
            return dict(held["payload"],
                        note="Still held this turn. Stop calling add_to_cart and put the "
                             "choice to the customer - they have to ask again.")

        # A later turn, and this was held: they came back for it. Honour that
        # without argument, whatever they named.
        if held:
            memory.clear_scratch(user_id, key, convo)
            return await _commit_add(product_id, variant_id, qty, cart_id)

        step = await tools.upsell(anchor, ceiling_paise=await _ceiling())
        if not step:
            # Top of the ladder, or nothing within reach of the price. There is
            # no case to make, so none is made.
            return await _commit_add(product_id, variant_id, qty, cart_id)

        base = await tools.product_detail(anchor)
        payload = {
            "held": True,
            "added": False,
            "cart_unchanged": True,
            "held_item": {"product_id": product_id, "variant_id": variant_id,
                          "qty": qty, "name": base.get("name")},
            "step_up": {"id": step["id"], "name": step["name"],
                        "price_rupees": step["pricePaise"] / 100,
                        "rating": step.get("rating"), "why": step.get("reason")},
            # Rendered by the same card path as search results. "upsell" is the
            # exact string AiPanel labels on - do not invent a new kind.
            "_ui": {"suggested": [dict(step, suggestReason=step.get("reason"),
                                       suggestKind="upsell")]},
        }
        # Mark the SUGGESTION as pitched too, so accepting it adds it straight
        # away rather than triggering a trade-up on the trade-up.
        for k in (anchor, step["id"]):
            memory.set_scratch(user_id, "pitched:" + k, {"run_id": run_id, "payload": payload}, convo)
        # A single flag checkout can read. The per-product keys answer "have we
        # pitched this?"; this one answers "is the customer mid-decision?", and
        # only the second question is checkout's business.
        memory.set_scratch(user_id, "held_add", base.get("name") or "that item", convo)
        return payload

    async def view_cart(cart_id: str | None = None):
        c = await tools.get_cart(cart_id)
        return {
            "cart": c.get("name"),
            "items": [{"name": i["name"], "variant": i.get("variantTitle"), "qty": i["qty"],
                       "price_rupees": i["pricePaise"] / 100} for i in c.get("items", [])],
            "total_rupees": c.get("totalPaise", 0) / 100,
        }

    async def checkout(confirm_over_limit: bool = False, discount_code: str | None = None,
                       cart_id: str | None = None):
        # Refuse while an add is held. The customer believes they are buying the
        # thing they just named; it is not in the basket, so this would charge
        # them for whatever else is. The prompt says not to, and the model does
        # anyway when asked to "add it and check out" in one breath — which is
        # exactly why this is a check and not a sentence.
        pending = memory.get_scratch(user_id, "held_add", None, convo) if gate_on else None
        if pending:
            return {
                "blocked": True,
                "reason": f"{pending} has not been added yet - you offered them something "
                          f"else first and they have not answered. Settle that before buying.",
                "cart_unchanged": True,
            }
        res = await tools.checkout(confirm_over_limit=confirm_over_limit,
                                   discount_code=discount_code, cart_id=cart_id)
        if res.get("gated"):
            g = res.get("guard", {})
            # A refusal is a normal outcome, and it is explainable: the model is
            # given the numbers so it can say WHY, not just that it failed.
            return {
                "gated": True,
                "total_rupees": g.get("totalPaise", 0) / 100,
                "limit_rupees": g.get("effectiveLimitPaise", 0) / 100,
                "reason": g.get("reason"),
                "_ui": {"confirmPay": True, "guard": g},
            }
        if res.get("_status", 200) >= 400 or res.get("error"):
            return {"error": res.get("error", "checkout failed"), "cart_preserved": True}
        order = res.get("order", {})
        return {
            "ordered": True, "order_id": order.get("id"),
            "charged_rupees": order.get("totalPaise", 0) / 100,
            "discount": (res.get("discount") or {}).get("reason"),
            "_ui": {"order": order, "razorpayOrderId": res.get("razorpayOrderId"),
                    "razorpayKeyId": res.get("razorpayKeyId")},
        }

    async def upsell(product_id: str):
        u = await tools.upsell(product_id)
        if not u:
            return {"upsell": None, "note": "nothing better in this category"}
        return {
            "upsell": {"id": u["id"], "name": u["name"],
                       "price_rupees": u["pricePaise"] / 100,
                       "rating": u.get("rating"), "why": u.get("reason")},
            # The card travels out-of-band, exactly as search results do. Naming
            # a product in prose and leaving the customer to picture it is the
            # weakest possible way to suggest something: no photograph, no
            # rating, and nothing to press.
            "_ui": {"suggested": [{**u, "suggestReason": u.get("reason"), "suggestKind": "upsell"}]},
        }

    async def cross_sell(product_id: str):
        """Things that go WITH this product.

        Silent while an add is held: the customer is mid-decision about which of
        two things to buy, and answering a question they have not reached yet is
        how a helpful assistant turns into a pushy one.

        The backend answers from evidence — co-purchase, co-view, a curated map —
        and returns NOTHING when nothing clears the bar. On a young catalogue that
        is often, so when it comes back empty we ask the model once, grounded in
        real candidates. It is allowed to answer "nothing fits", and frequently
        should: a laptop paired with a lunch box costs more trust than a missed
        suggestion.
        """
        if gate_on and memory.get_scratch(user_id, "held_add", None, convo):
            return {"goes_well_with": [],
                    "note": "An add is still held - settle that with the customer first."}

        items = await tools.cross_sell(product_id)
        if items:
            return {
                "goes_well_with": [
                    {"id": p["id"], "name": p["name"], "price_rupees": p["pricePaise"] / 100,
                     "category": p.get("category"), "why": p.get("reason")}
                    for p in items
                ],
                "_ui": {"suggested": [
                    {**p, "suggestReason": p.get("reason"), "suggestKind": "cross"} for p in items
                ]},
            }

        if not model.is_available():
            return {"goes_well_with": []}

        base = await tools.product_detail(product_id)
        if not base.get("id"):
            return {"goes_well_with": []}

        # Candidates from OTHER categories only — same-category items are
        # substitutes, and the whole point here is what accompanies the product.
        pool = [
            p for p in await tools.search_products("", None)
            if p.get("category") != base.get("category") and p["id"] != product_id
        ][:20]
        if not pool:
            return {"goes_well_with": []}

        listing = "\n".join(
            f'{p["id"]} | {p["name"]} | {p.get("category")} | Rs {p["pricePaise"] / 100:.0f}'
            for p in pool
        )
        try:
            res = await model.chat([
                {"role": "system", "content": (
                    "Pick at most ONE product from the list that a customer buying the given "
                    "product would genuinely also want — something used WITH it, not instead "
                    "of it. Most products have no good pairing; returning none is the right "
                    "answer far more often than forcing one.\n"
                    'Return JSON only: {"id": "<id or empty>", "why": "<short reason, plain '
                    'words a shopper would use>"}'
                )},
                {"role": "user", "content":
                    f'Customer is buying: {base.get("name")} ({base.get("category")})\n\n'
                    f"Candidates (id | name | category | price):\n{listing}"},
            ], temperature=0)
            await tools.log_model_cost(
                "cross_sell", res["model"], res["tokens_in"], res["tokens_out"],
                model.estimate_cost_inr(res["model"], res["tokens_in"], res["tokens_out"]),
            )
            data = model.extract_json(res["text"]) or {}
            pick = next((p for p in pool if p["id"] == data.get("id")), None)
            if not pick:
                return {"goes_well_with": []}
            why = str(data.get("why", ""))[:120] or f'goes well with {base.get("name")}'
            return {
                "goes_well_with": [{
                    "id": pick["id"], "name": pick["name"],
                    "price_rupees": pick["pricePaise"] / 100,
                    "category": pick.get("category"),
                    "why": why,
                }],
                "_ui": {"suggested": [{**pick, "suggestReason": why, "suggestKind": "cross"}]},
            }
        except Exception:
            return {"goes_well_with": []}

    async def order_history():
        ctx = await tools.get_context()
        return {"recent_orders": [
            {"id": o["id"][:8], "total_rupees": int(o["totalPaise"]) / 100, "status": o["status"]}
            for o in ctx.get("recentOrders", [])
        ]}

    def num(desc: str):
        return {"type": "number", "description": desc}

    def txt(desc: str):
        return {"type": "string", "description": desc}

    r.add(Tool("search_products",
               "Search the catalogue by keyword, optionally under a price ceiling. Handles "
               "everyday words like 'fruits' or 'gadgets' by resolving them to the store's "
               "own categories. Use for finding things to buy, not for policy questions.",
               {"type": "object", "properties": {
                   "query": txt("Product keyword, e.g. 'blue shirt'"),
                   "max_rupees": num("Price ceiling in rupees"),
                   "name_only": {"type": "boolean", "description": "Match the product name only — avoids brand false-positives"},
               }, "required": []}, search_products))

    r.add(Tool("product_detail",
               "Full detail for one product INCLUDING its variants. Call this before adding "
               "anything that comes in sizes or colours, so you add the right variant.",
               {"type": "object", "properties": {"product_id": txt("Product id from a search result")},
                "required": ["product_id"]}, product_detail))

    r.add(Tool("browse_collections", "List the store's collections (curated product groups).",
               {"type": "object", "properties": {}, "required": []}, browse_collections))

    r.add(Tool("list_stores",
               "The independent stores selling on this marketplace, with what each one "
               "sells and how many products it has. Use it when the customer asks who "
               "they are buying from, which shops exist, or wants to shop one store.",
               {"type": "object", "properties": {}, "required": []}, list_stores))

    r.add(Tool("store_products",
               "What one named store sells. Call list_stores first to get the slug. "
               "Use this instead of search_products when the customer has named a shop.",
               {"type": "object", "properties": {
                   "slug": {"type": "string", "description": "store slug from list_stores"},
                   "max_rupees": {"type": "number"},
               }, "required": ["slug"]}, store_products))

    r.add(Tool("list_categories",
               "Every category the store actually stocks, with product counts. Call this "
               "before telling a customer something is unavailable — the store may simply "
               "file it under a different name.",
               {"type": "object", "properties": {}, "required": []}, list_categories))

    r.add(Tool("add_to_cart",
               "Add an item to the cart. Pass variant_id when the product has variants, "
               "otherwise product_id and the default variant is used. The FIRST time a "
               "customer settles on something this may come back with held: true and one "
               "alternative a step up in price, INSTEAD of adding - that is a normal "
               "answer, not an error. Put it to them; if they want the original, call "
               "this again and it will go through.",
               {"type": "object", "properties": {
                   "product_id": txt("Product id"), "variant_id": txt("Variant id (preferred)"),
                   "qty": {"type": "integer", "description": "Quantity, default 1"},
                   "cart_id": txt("Target cart id. Omit to use the universal cart."),
               }, "required": []}, add_to_cart, writes=True))

    r.add(Tool("view_cart", "Show what is in a cart and its total. Omit cart_id for the universal cart.",
               {"type": "object", "properties": {"cart_id": txt("Cart id, omit for the universal cart")},
                "required": []}, view_cart))

    r.add(Tool("list_carts",
               "All of the customer's carts. Call this before adding to a NAMED cart, and "
               "whenever they refer to a cart by name, so you use the right id.",
               {"type": "object", "properties": {}, "required": []}, list_carts))

    r.add(Tool("create_cart", "Create a new named cart, e.g. 'Gift list'.",
               {"type": "object", "properties": {"name": txt("What to call it")},
                "required": ["name"]}, create_cart, writes=True))

    r.add(Tool("move_between_carts", "Move one item from one cart to another.",
               {"type": "object", "properties": {
                   "variant_id": txt("The variant to move"),
                   "to_cart_id": txt("Destination cart id"),
                   "from_cart_id": txt("Source cart id, omit for the universal cart"),
               }, "required": ["variant_id", "to_cart_id"]}, move_between_carts, writes=True))

    r.add(Tool("checkout",
               "Create the order and start payment. May be refused when the total is over the "
               "user's spend limit — if so, tell them the numbers and ask before retrying with "
               "confirm_over_limit. Never set confirm_over_limit unless the user explicitly agreed.",
               {"type": "object", "properties": {
                   "confirm_over_limit": {"type": "boolean", "description": "Only after the user explicitly consents"},
                   "discount_code": txt("A discount code the user supplied"),
                   "cart_id": txt("Which cart to buy. Omit for the universal cart."),
               }, "required": []}, checkout, writes=True))

    r.add(Tool("upsell",
               "A BETTER version of this product — same category, higher rated, a step up in "
               "price. Returns the reason, which you should pass on to the customer.",
               {"type": "object", "properties": {"product_id": txt("Product id")}, "required": ["product_id"]}, upsell))

    r.add(Tool("cross_sell",
               "Something that goes WITH this product — used alongside it, not instead of "
               "it. Often returns nothing, and that is a real answer: say nothing rather "
               "than offer a poor match.",
               {"type": "object", "properties": {"product_id": txt("Product id")}, "required": ["product_id"]}, cross_sell))

    r.add(Tool("order_history", "The user's recent orders.",
               {"type": "object", "properties": {}, "required": []}, order_history))

    return r
