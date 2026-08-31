"""The agent loop: model picks a tool, we execute it, it sees the result.

This is the piece the old `agent.py` never had. There, the pipeline was
hard-coded and the model acted only as a classifier. Here the model decides what
to call and when to stop, which is what makes step count depend on the request.

Three properties are load-bearing and must not be softened:

  1. A hard step cap. A model that keeps re-searching will otherwise burn the
     budget in a tight loop.
  2. Tool errors are returned to the model as data, never raised. A good model
     recovers from "no products matched" by trying a different term; raising
     turns a recoverable situation into a dead run.
  3. The registry is a whitelist. The model can only name a key that exists in
     it, which is the security boundary — not the prompt.
"""
import json
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from . import trace
from .. import model

# Raised from 6. A search that misses on the first phrasing costs three steps to
# recover from — search, list_categories, search again — and settling on a
# product now costs one more, because the add is held to offer a step up. At six
# the agent ran out of budget mid-recovery and told the customer it could not
# find something the catalogue plainly has.
MAX_STEPS = 8
MAX_TOOL_CHARS = 3500


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    run: Callable[..., Awaitable[Any]]
    writes: bool = False  # a write tool still passes the backend's own role checks

    def schema(self) -> dict:
        return {
            "type": "function",
            "function": {"name": self.name, "description": self.description, "parameters": self.parameters},
        }


@dataclass
class Registry:
    tools: dict[str, Tool] = field(default_factory=dict)

    def add(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def schemas(self) -> list[dict]:
        return [t.schema() for t in self.tools.values()]

    def get(self, name: str) -> Tool | None:
        return self.tools.get(name)


@dataclass
class LoopResult:
    text: str
    steps: list[dict]
    data: dict = field(default_factory=dict)
    tokens_in: int = 0
    tokens_out: int = 0


def _truncate(payload: Any) -> str:
    """Tool output is a budget, not a dump.

    Fifty full product rows would crowd out the reasoning they are meant to
    support, so results are cut to a size the model can actually use.
    """
    text = json.dumps(payload, default=str)
    if len(text) <= MAX_TOOL_CHARS:
        return text
    return text[:MAX_TOOL_CHARS] + f'… (truncated, {len(text)} chars total)'


async def run(
    *,
    system: str,
    messages: list[dict],
    registry: Registry,
    run_id: str,
    tools_client,
    agent_name: str,
) -> LoopResult:
    convo: list[dict] = [{"role": "system", "content": system}, *messages]
    steps: list[dict] = []
    data: dict = {}
    tokens_in = tokens_out = 0

    for step in range(MAX_STEPS):
        started = time.perf_counter()
        reply = await model.chat_with_tools(convo, registry.schemas())
        tokens_in += reply.get("tokens_in", 0)
        tokens_out += reply.get("tokens_out", 0)

        calls = reply.get("tool_calls") or []
        if not calls:
            await trace.log(tools_client, run_id, agent_name, {"step": step}, {"finished": True},
                            latency_ms=int((time.perf_counter() - started) * 1000))
            return LoopResult(reply.get("text", ""), steps, data, tokens_in, tokens_out)

        convo.append(reply["raw"])
        for call in calls:
            name = call["name"]
            try:
                args = json.loads(call["arguments"] or "{}")
            except json.JSONDecodeError:
                args = {}

            tool = registry.get(name)
            t0 = time.perf_counter()
            if tool is None:
                # Hallucinated tool name. Tell the model rather than failing.
                result: Any = {"error": f"no such tool: {name}"}
            else:
                try:
                    result = await tool.run(**args)
                except TypeError as e:
                    result = {"error": f"bad arguments for {name}: {e}"}
                except Exception as e:  # noqa: BLE001 — surfaced to the model on purpose
                    result = {"error": str(e)}

            latency = int((time.perf_counter() - t0) * 1000)
            steps.append({"tool": name, "args": args, "ms": latency,
                          "ok": not (isinstance(result, dict) and result.get("error"))})
            # Anything the UI should render travels beside the text, not inside it.
            if isinstance(result, dict) and "_ui" in result:
                for key, value in result.pop("_ui").items():
                    # A plain update() loses data whenever two tools in the same
                    # turn contribute to the same key — and that is the normal
                    # case, not an edge one: settling on a product calls upsell
                    # AND cross_sell, and both offer a card. Lists accumulate;
                    # everything else keeps last-write-wins.
                    if isinstance(value, list) and isinstance(data.get(key), list):
                        data[key] = data[key] + value
                    else:
                        data[key] = value

            await trace.log(tools_client, run_id, name, args, result, latency_ms=latency,
                            status="error" if steps[-1]["ok"] is False else "ok")

            convo.append({"role": "tool", "tool_call_id": call["id"], "content": _truncate(result)})

    # Ran out of steps. Say so plainly instead of pretending to be done.
    return LoopResult(
        "I couldn't finish that in a reasonable number of steps — could you narrow it down?",
        steps, data, tokens_in, tokens_out,
    )
