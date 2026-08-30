"""The merchant agent's tools.

Same authority model as the customer side: these call merchant-only backend
routes with the merchant's own token, so `requireRole('merchant','admin')` is
what actually protects them. The agent has no privileged path of its own.
"""
from ..harness.loop import Registry, Tool


def build(tools) -> Registry:
    r = Registry()

    async def list_products():
        rows = await tools.merchant_get("/merchant/products")
        return {"products": [
            {"id": p["id"], "name": p["name"], "price_rupees": p["pricePaise"] / 100,
             "stock": p["stock"], "status": p.get("status"), "category": p.get("category")}
            for p in rows.get("products", [])[:40]
        ]}

    async def low_stock():
        d = await tools.merchant_get("/merchant/analytics?days=30")
        return {"low_stock": d.get("lowStock", [])}

    async def sales_summary(days: int = 30):
        d = await tools.merchant_get(f"/merchant/analytics?days={min(days, 365)}")
        s = d.get("summary", {})
        return {
            "days": d.get("days"),
            "gross_rupees": s.get("grossPaise", 0) / 100,
            "paid_orders": s.get("paidOrders"),
            "average_order_rupees": s.get("aovPaise", 0) / 100,
            "conversion_pct": s.get("conversionPct"),
            "units_sold": s.get("unitsSold"),
        }

    async def top_products(days: int = 30):
        d = await tools.merchant_get(f"/merchant/analytics?days={min(days, 365)}")
        return {"top_products": [
            {"name": p["name"], "units": p["units"], "revenue_rupees": p["paise"] / 100}
            for p in d.get("topProducts", [])
        ]}

    async def customer_segments():
        return await tools.merchant_get("/merchant/segments")

    async def adjust_inventory(variant_id: str, stock: int):
        await tools.merchant_post(f"/merchant/inventory/{variant_id}", {"stock": stock})
        return {"ok": True, "variant_id": variant_id, "stock": stock}

    async def create_discount(code: str, kind: str = "percent", value: float = 10,
                              min_order_rupees: float = 0, automatic: bool = False):
        res = await tools.merchant_post("/merchant/discounts", {
            "code": code, "kind": kind, "value": value,
            "minOrderRupees": min_order_rupees, "automatic": automatic,
        })
        if res.get("_status", 200) >= 400:
            return {"error": res.get("error", "could not create discount")}
        return {"created": res.get("discount")}

    async def pending_refunds():
        d = await tools.merchant_get("/merchant/refunds")
        return {"pending": [
            {"id": r["id"], "order": r["order_id"][:8], "amount_rupees": int(r["amount_paise"]) / 100,
             "customer": r["requester_email"], "reason": r["reason"]}
            for r in d.get("requests", [])
        ]}

    async def payout_balance():
        d = await tools.merchant_get("/merchant/payouts")
        b = d.get("balance", {})
        return {
            "earned_rupees": b.get("totalPaise", 0) / 100,
            "settled_rupees": b.get("settledPaise", 0) / 100,
            "held_rupees": b.get("pendingPaise", 0) / 100,
            "mode": b.get("mode"),
        }

    async def update_store_facts(key: str, title: str, content: str):
        res = await tools.merchant_put(f"/merchant/wiki/{key}", {"title": title, "content": content})
        if res.get("_status", 200) >= 400:
            return {"error": res.get("error", "could not save")}
        return {"saved": key}

    def txt(d: str):
        return {"type": "string", "description": d}

    def integer(d: str):
        return {"type": "integer", "description": d}

    r.add(Tool("list_products", "The merchant's products with price, stock and status.",
               {"type": "object", "properties": {}, "required": []}, list_products))
    r.add(Tool("low_stock", "Variants at or below 5 units — what needs restocking.",
               {"type": "object", "properties": {}, "required": []}, low_stock))
    r.add(Tool("sales_summary", "Gross sales, paid orders, average order value and conversion.",
               {"type": "object", "properties": {"days": integer("Look-back window, default 30")},
                "required": []}, sales_summary))
    r.add(Tool("top_products", "Best-selling products by revenue.",
               {"type": "object", "properties": {"days": integer("Look-back window, default 30")},
                "required": []}, top_products))
    r.add(Tool("customer_segments", "Customer counts by segment: one-time, repeat, never purchased, abandoned.",
               {"type": "object", "properties": {}, "required": []}, customer_segments))
    r.add(Tool("adjust_inventory", "Set the stock level of one variant.",
               {"type": "object", "properties": {
                   "variant_id": txt("Variant id from low_stock or list_products"),
                   "stock": integer("New quantity"),
               }, "required": ["variant_id", "stock"]}, adjust_inventory, writes=True))
    r.add(Tool("create_discount",
               "Create a discount code. Confirm the details with the merchant before creating one — "
               "it affects real revenue.",
               {"type": "object", "properties": {
                   "code": txt("The code, e.g. SUMMER10"),
                   "kind": {"type": "string", "enum": ["percent", "fixed"]},
                   "value": {"type": "number", "description": "Percent points, or rupees for a fixed discount"},
                   "min_order_rupees": {"type": "number", "description": "Minimum order value"},
                   "automatic": {"type": "boolean", "description": "Apply without a code being typed"},
               }, "required": ["code"]}, create_discount, writes=True))
    r.add(Tool("pending_refunds", "Refund requests awaiting the merchant's decision.",
               {"type": "object", "properties": {}, "required": []}, pending_refunds))
    r.add(Tool("payout_balance", "How much this merchant has earned, settled and is holding.",
               {"type": "object", "properties": {}, "required": []}, payout_balance))
    r.add(Tool("update_store_facts",
               "Write a store-policy entry the shopping assistant quotes to customers.",
               {"type": "object", "properties": {
                   "key": txt("Slug: lowercase letters, digits and hyphens"),
                   "title": txt("Human title"), "content": txt("The fact itself"),
               }, "required": ["key", "title", "content"]}, update_store_facts, writes=True))

    return r
