"""The agent's tools = thin wrappers over the backend API.

CREDENTIAL ISOLATION: the user's JWT is held here and sent as an Authorization
header. It is never placed into a model prompt. Money-moving tools (checkout)
execute in the backend, behind its guardrails — the agent only *requests* them.
"""
import os

import httpx

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000")


class Tools:
    def __init__(self, token: str):
        self._token = token  # stays here, never returned to the model
        self._headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    async def _get(self, path: str) -> dict:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(f"{BACKEND_URL}{path}", headers=self._headers)
            r.raise_for_status()
            return r.json()

    async def _post(self, path: str, body: dict | None = None) -> dict:
        async with httpx.AsyncClient(timeout=20.0) as c:
            r = await c.post(f"{BACKEND_URL}{path}", headers=self._headers, json=body or {})
            # Return body even on non-2xx so the agent can handle gated/failed gracefully.
            try:
                data = r.json()
            except Exception:
                data = {"error": f"HTTP {r.status_code}"}
            data["_status"] = r.status_code
            return data

    async def me(self) -> dict:
        # Resolves + validates the user from their token (401 propagates if invalid).
        return (await self._get("/me")).get("user", {})

    # --- read tools ---
    async def search_products(self, q: str = "", max_paise: int | None = None) -> list[dict]:
        path = f"/catalog?limit=50"
        if q:
            path += f"&q={httpx.QueryParams({'q': q})['q']}"
        if max_paise is not None:
            path += f"&maxPaise={max_paise}"
        return (await self._get(path)).get("products", [])

    async def get_context(self) -> dict:
        return await self._get("/agent/context")  # {preferences, recentOrders}

    # --- action tools (backend enforces guardrails) ---
    async def add_to_cart(self, product_id: str, qty: int = 1) -> dict:
        return await self._post("/cart/items", {"productId": product_id, "qty": qty})

    async def get_cart(self) -> dict:
        return (await self._get("/cart")).get("cart", {})

    async def checkout(self, confirm_over_limit: bool = False) -> dict:
        body = {"confirmOverLimit": True} if confirm_over_limit else {}
        return await self._post("/orders/checkout", body)

    async def log_model_cost(self, run_id: str, model: str, tokens_in: int, tokens_out: int, cost: float = 0.0) -> None:
        try:
            await self._post("/agent/model-cost", {"runId": run_id, "model": model, "tokensIn": tokens_in, "tokensOut": tokens_out, "cost": cost})
        except Exception:
            pass  # telemetry must never break the conversation
