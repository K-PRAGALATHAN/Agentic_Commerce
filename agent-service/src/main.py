"""Agent service (Phase 3) — a single conversational agent over the backend tools.

/chat receives the user's message + their JWT (Authorization header). The token is
used to call the backend (credential isolation: it never enters a model prompt).
"""
import os

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import agent, model
from .tools import Tools

app = FastAPI(title="Agentic Commerce — Agent Service", version="0.3.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:4000")


class ChatIn(BaseModel):
    message: str


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
    tools = Tools(token)
    try:
        user = await tools.me()  # validates the token + gets the identity
    except httpx.HTTPStatusError:
        raise HTTPException(status_code=401, detail="invalid token")
    if not user.get("id"):
        raise HTTPException(status_code=401, detail="could not resolve user")
    return await agent.handle(user["id"], body.message, tools)
