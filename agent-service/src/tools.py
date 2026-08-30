"""The agent's tools = thin wrappers over the backend API.

CREDENTIAL ISOLATION: the user's JWT is held here and sent as an Authorization
header. It is never placed into a model prompt. Money-moving tools (checkout)
execute in the backend, behind its guardrails — the agent only *requests* them.

PERF: one shared AsyncClient (connection pooling) is reused across calls, and
telemetry writes (trace/cost/memory) are fire-and-forget so they never sit in
the response path.
"""
import asyncio
import os

import httpx

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000")

# Shared connection pool — avoids a fresh TCP+TLS handshake per call.
_client = httpx.AsyncClient(timeout=20.0)

# Keep references to background telemetry tasks so they aren't GC'd mid-flight.
_bg: set = set()


def _schedule(coro) -> None:
    t = asyncio.create_task(coro)
    _bg.add(t)
    t.add_done_callback(_bg.discard)


class Tools:
    def __init__(self, token: str, conversation_id: str | None = None):
        self._token = token  # stays here, never returned to the model
        # Which chat this turn belongs to. Turns are stored against it so a new
        # chat starts clean; facts and orders stay attached to the person.
        self.conversation_id = conversation_id
        self._headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def _get(self, path: str) -> dict:
        r = await _client.get(f"{BACKEND_URL}{path}", headers=self._headers)
        r.raise_for_status()
        return r.json()

    async def _post(self, path: str, body: dict | None = None) -> dict:
        r = await _client.post(f"{BACKEND_URL}{path}", headers=self._headers, json=body or {})
        try:
            data = r.json()
        except Exception:
            data = {"error": f"HTTP {r.status_code}"}
        data["_status"] = r.status_code
        return data

    async def _fire(self, path: str, body: dict) -> None:
        # best-effort background write; never raises into the request path
        try:
            await self._post(path, body)
        except Exception:
            pass

    async def me(self) -> dict:
        return (await self._get("/me")).get("user", {})

    # --- read tools ---
    async def search_products(self, q: str = "", max_paise: int | None = None, categories: list[str] | None = None, name_only: bool = False) -> list[dict]:
        params: dict[str, str] = {"limit": "50"}
        if q:
            params["name" if name_only else "q"] = q  # name_only avoids description false-positives
        if max_paise is not None:
            params["maxPaise"] = str(max_paise)
        if categories:
            params["categories"] = ",".join(categories)
        qs = httpx.QueryParams(params)
        return (await self._get(f"/catalog?{qs}")).get("products", [])

    async def clusters(self) -> list[dict]:
        return (await self._get("/kg/clusters")).get("clusters", [])

    async def get_context(self) -> dict:
        path = "/agent/context"
        if self.conversation_id:
            path += f"?conversationId={self.conversation_id}"
        return await self._get(path)  # {preferences, recentOrders, memory, facts, wiki}

    async def upsell(self, product_id: str) -> dict | None:
        return (await self._get(f"/catalog/{product_id}/upsell")).get("upsell")

    async def cross_sell(self, product_id: str) -> list[dict]:
        return (await self._get(f"/catalog/{product_id}/cross-sell")).get("crossSell", [])

    # --- action tools (backend enforces guardrails) ---
    async def add_to_cart(self, product_id: str | None = None, variant_id: str | None = None,
                          qty: int = 1, cart_id: str | None = None) -> dict:
        # A variant is the sellable unit. When the agent only knows a product
        # (a search result), the backend resolves that product's default variant.
        body: dict = {"qty": qty}
        if variant_id:
            body["variantId"] = variant_id
        else:
            body["productId"] = product_id
        if cart_id:
            body["cartId"] = cart_id
        return await self._post("/cart/items", body)

    async def list_carts(self) -> list[dict]:
        return (await self._get("/carts")).get("carts", [])

    async def create_cart(self, name: str) -> dict:
        return await self._post("/carts", {"name": name})

    async def move_item(self, variant_id: str, to_cart_id: str, from_cart_id: str | None = None) -> dict:
        body = {"variantId": variant_id, "toCartId": to_cart_id}
        if from_cart_id:
            body["fromCartId"] = from_cart_id
        return await self._post("/cart/move", body)

    async def product_detail(self, product_id: str) -> dict:
        """Full product incl. variants — needed before picking a size/colour."""
        return (await self._get(f"/catalog/{product_id}")).get("product", {})

    async def collections(self) -> list[dict]:
        return (await self._get("/collections")).get("collections", [])

    async def get_cart(self, cart_id: str | None = None) -> dict:
        path = f"/cart?cartId={cart_id}" if cart_id else "/cart"
        return (await self._get(path)).get("cart", {})

    async def checkout(self, confirm_over_limit: bool = False, discount_code: str | None = None,
                       cart_id: str | None = None) -> dict:
        body: dict = {}
        if cart_id:
            body["cartId"] = cart_id
        if confirm_over_limit:
            body["confirmOverLimit"] = True
        if discount_code:
            body["discountCode"] = discount_code
        return await self._post("/orders/checkout", body)

    # --- merchant surface (backend enforces the merchant role on all of these) ---
    async def merchant_get(self, path: str) -> dict:
        return await self._get(path)

    async def merchant_post(self, path: str, body: dict | None = None) -> dict:
        return await self._post(path, body)

    async def merchant_put(self, path: str, body: dict) -> dict:
        r = await _client.put(f"{BACKEND_URL}{path}", headers=self._headers, json=body)
        try:
            data = r.json()
        except Exception:
            data = {"error": f"HTTP {r.status_code}"}
        data["_status"] = r.status_code
        return data

    # --- telemetry (fire-and-forget: scheduled, not awaited in the response path) ---
    async def log_model_cost(self, run_id: str, model: str, tokens_in: int, tokens_out: int, cost: float = 0.0) -> None:
        _schedule(self._fire("/agent/model-cost", {"runId": run_id, "model": model, "tokensIn": tokens_in, "tokensOut": tokens_out, "cost": cost}))

    async def log_run(self, run_id: str, agent: str, inp, out, status: str = "ok") -> None:
        _schedule(self._fire("/agent/run", {"runId": run_id, "agent": agent, "input": inp, "output": out, "status": status}))

    async def remember(self, role: str, content: str) -> None:
        body = {"role": role, "content": content}
        if self.conversation_id:
            body["conversationId"] = self.conversation_id
        _schedule(self._fire("/agent/memory", body))
