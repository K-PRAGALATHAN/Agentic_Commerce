"""Agent service (Phase 3) — a single conversational agent over the backend tools.

/chat receives the user's message + their JWT (Authorization header). The token is
used to call the backend (credential isolation: it never enters a model prompt).
"""
import os

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import agent, drafting, model
from .agents import runner
from .tools import Tools

app = FastAPI(title="Agentic Commerce — Agent Service", version="0.3.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:4000")


class ChatIn(BaseModel):
    message: str
    # Which chat this belongs to. Omitted, the user gets one default thread.
    conversationId: str | None = None


class DraftIn(BaseModel):
    name: str
    category: str = ""
    vendor: str = ""
    tags: list[str] = []
    similar: list[dict] = []


@app.get("/health")
async def health() -> dict:
    backend = "unknown"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{BACKEND_URL}/health")
            backend = "up" if r.status_code == 200 else f"status-{r.status_code}"
    except Exception:
        backend = "unreachable"
    return {
        "status": "ok",
        "service": "agent-service",
        "backend": backend,
        "model": "openrouter" if model.is_available() else "rule-based-fallback",
    }


@app.post("/chat")
async def chat(body: ChatIn, authorization: str = Header(default="")) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization[7:]
    tools = Tools(token, body.conversationId)
    try:
        user = await tools.me()  # validates the token + gets the identity
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=401, detail="invalid token")
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="could not resolve user")

    roles = user.get("roles") or []
    is_merchant = "merchant" in roles or "admin" in roles

    # With a model key, run the real tool-calling loop — the model chooses the
    # tools and the step count depends on the request. Without a key, fall back
    # to the deterministic rule-based flow so the app is still demoable offline.
    if model.is_available():
        return await runner.handle(user["id"], body.message, tools, is_merchant=is_merchant)
    if is_merchant:
        return {"reply": "The store assistant needs a model key configured to answer.",
                "kind": "general", "data": {}}
    return await agent.handle(user["id"], body.message, tools)


@app.post("/draft-description")
async def draft_description(body: DraftIn, authorization: str = Header(default="")) -> dict:
    """Draft copy for one product. Returns a suggestion — never writes anything."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    if not model.is_available():
        raise HTTPException(status_code=503, detail="no model configured")
    tools = Tools(authorization[7:])
    try:
        user = await tools.me()
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=401, detail="invalid token")
    roles = user.get("roles") or []
    if "merchant" not in roles and "admin" not in roles:
        raise HTTPException(status_code=403, detail="merchants only")

    result = await drafting.draft(body.model_dump(), body.similar)
    u = result.pop("usage", {})
    if u:
        await tools.log_model_cost("draft", u.get("model", ""), u.get("tokensIn", 0), u.get("tokensOut", 0),
                                   model.estimate_cost_inr(u.get("model", ""), u.get("tokensIn", 0), u.get("tokensOut", 0)))
    return result
