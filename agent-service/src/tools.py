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
    def __init__(self, token: str):
        self._token = token  # stays here, never returned to the model
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
        return await self._get("/agent/context")  # {preferences, recentOrders, memory, wiki}

    async def upsell(self, product_id: str) -> dict | None:
        return (await self._get(f"/catalog/{product_id}/upsell")).get("upsell")

    async def cross_sell(self, product_id: str) -> list[dict]:
        return (await self._get(f"/catalog/{product_id}/cross-sell")).get("crossSell", [])

    # --- action tools (backend enforces guardrails) ---
    async def add_to_cart(self, product_id: str, qty: int = 1) -> dict:
        return await self._post("/cart/items", {"productId": product_id, "qty": qty})

    async def get_cart(self) -> dict:
        return (await self._get("/cart")).get("cart", {})

    async def checkout(self, confirm_over_limit: bool = False) -> dict:
        body = {"confirmOverLimit": True} if confirm_over_limit else {}
        return await self._post("/orders/checkout", body)

    # --- telemetry (fire-and-forget: scheduled, not awaited in the response path) ---
    async def log_model_cost(self, run_id: str, model: str, tokens_in: int, tokens_out: int, cost: float = 0.0) -> None:
        _schedule(self._fire("/agent/model-cost", {"runId": run_id, "model": model, "tokensIn": tokens_in, "tokensOut": tokens_out, "cost": cost}))

    async def log_run(self, run_id: str, agent: str, inp, out, status: str = "ok") -> None:
        _schedule(self._fire("/agent/run", {"runId": run_id, "agent": agent, "input": inp, "output": out, "status": status}))

    async def remember(self, role: str, content: str) -> None:
        _schedule(self._fire("/agent/memory", {"role": role, "content": content}))
