"""Agent service — Phase 0 stub. Boots and reports health.

The multi-agent brain (LangGraph, Temporal, single MCP server, OpenRouter,
mem0 + wiki + knowledge graph) lands in Phases 3–5. For now this only proves
the service comes up in the compose stack and can reach the backend.
"""
import os

import httpx
from fastapi import FastAPI

app = FastAPI(title="Agentic Commerce — Agent Service", version="0.1.0")

BACKEND_URL = os.getenv("BACKEND_URL", "http://backend:4000")


@app.get("/health")
async def health() -> dict:
    backend = "unknown"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(f"{BACKEND_URL}/health")
            backend = "up" if r.status_code == 200 else f"status-{r.status_code}"
    except Exception:
        backend = "unreachable"
    return {"status": "ok", "service": "agent-service", "backend": backend}


@app.get("/")
async def root() -> dict:
    return {"service": "agent-service", "phase": "0 (stub)", "next": "agents arrive in Phase 3"}
