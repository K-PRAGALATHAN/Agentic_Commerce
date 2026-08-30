"""LLM Ops: one trace per run.

Every step of every turn lands in `agent_runs` under a shared run_id, with the
latency it took and whether it failed. That table already existed; what it lacked
was timing and an error signal, which are exactly what you need to answer "why
was that slow" or "what broke" after the fact.

Writes are fire-and-forget so observability never sits in the user's response
path — an ops concern must not make the product slower.
"""
from typing import Any


async def log(
    tools_client,
    run_id: str,
    agent: str,
    inp: Any,
    out: Any,
    *,
    latency_ms: int | None = None,
    status: str = "ok",
) -> None:
    payload = out if isinstance(out, dict) else {"result": out}
    if latency_ms is not None:
        payload = {**payload, "_ms": latency_ms}
    try:
        await tools_client.log_run(run_id, agent, inp, payload, status)
    except Exception:
        # Losing a trace row must never break the turn it was describing.
        pass


async def cost(tools_client, run_id: str, model_id: str, tokens_in: int, tokens_out: int, inr: float) -> None:
    try:
        await tools_client.log_model_cost(run_id, model_id, tokens_in, tokens_out, inr)
    except Exception:
        pass
