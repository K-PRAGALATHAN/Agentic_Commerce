"""Assemble a turn and run it.

This is where the four memories come together into the working set the model
actually sees:

    procedural (prompt file)
  + semantic   (wiki, delimited as data)
  + episodic   (recent orders + earlier turns)
  + working    (this conversation)

then the loop runs with the right tool registry for who is asking.
"""
import uuid

from . import customer_tools, merchant_tools
from .. import model
from ..harness import loop, memory, prompts, trace

# Consolidate episodic memory into durable facts every N turns, not every turn —
# summarising constantly would cost more than it saves.
CONSOLIDATE_EVERY = 8


async def handle(user_id: str, message: str, tools, *, is_merchant: bool) -> dict:
    run_id = str(uuid.uuid4())
    role = "merchant" if is_merchant else "customer"
    convo = getattr(tools, "conversation_id", None)

    memory.remember(user_id, "user", message, convo)
    await tools.remember("user", message)

    ctx = await tools.get_context()
    system = "\n\n".join(filter(None, [
        prompts.load(role),
        memory.semantic_block(ctx.get("wiki", [])),
        memory.episodic_block(ctx.get("recentOrders", []), ctx.get("memory", []), ctx.get("facts", [])),
    ]))

    # The customer registry gets an identity so its tools can carry state
    # between turns; the merchant one deliberately does not. A merchant stocking
    # a shelf is not a shopper settling on a purchase, and the narrower signature
    # is the cheapest possible guarantee that the trade-up gate can never reach
    # them.
    registry = (merchant_tools.build(tools) if is_merchant
                else customer_tools.build(tools, user_id=user_id, run_id=run_id))
    messages = [*memory.history(user_id, 6, convo)[:-1], {"role": "user", "content": message}]

    await trace.log(tools, run_id, "orchestrator",
                    {"message": message, "role": role, "prompt_version": prompts.version(role)},
                    {"tools_available": len(registry.tools)})

    result = await loop.run(
        system=system, messages=messages, registry=registry,
        run_id=run_id, tools_client=tools, agent_name=f"{role}_agent",
    )

    await trace.cost(tools, run_id, model.MODEL, result.tokens_in, result.tokens_out,
                     model.estimate_cost_inr(model.MODEL, result.tokens_in, result.tokens_out))

    reply = result.text or "I'm not sure how to help with that yet."
    memory.remember(user_id, "assistant", reply, convo)
    await tools.remember("assistant", reply)

    if memory.bump_turn(user_id, convo) >= CONSOLIDATE_EVERY:
        await _consolidate(user_id, tools, run_id, convo)

    return {
        "reply": reply,
        "kind": _kind(result),
        "data": result.data,
        # The trace the UI shows under "How I decided" — the same steps that went
        # to agent_runs, so what the customer sees matches what was recorded.
        "steps": result.steps,
        "runId": run_id,
    }


def _kind(result: loop.LoopResult) -> str:
    """A coarse label the UI keys its rendering off."""
    d = result.data
    if d.get("confirmPay"):
        return "gated"
    if d.get("order"):
        return "checkout"
    if d.get("cartTotalPaise") is not None:
        return "recommend"
    if d.get("options"):
        return "browse"
    return "general"


async def _consolidate(user_id: str, tools, run_id: str, convo: str | None = None) -> None:
    """Distil recent turns into durable facts (the summariser in the diagram).

    Uses the cheap path and never blocks the reply — if it fails, the next turn
    simply tries again.
    """
    try:
        turns = memory.history(user_id, 12, convo)
        if len(turns) < 4:
            return
        # Named `transcript`, not `convo`: reusing the parameter name here would
        # shadow the conversation id and hand mark_consolidated() the whole
        # transcript as its key, so the counter would never actually reset.
        transcript = "\n".join(f"{t['role']}: {t['content'][:300]}" for t in turns)
        res = await model.chat([
            {"role": "system", "content": prompts.load("summarizer")},
            {"role": "user", "content": transcript},
        ], temperature=0)
        facts = (model.extract_json(res["text"]) or {}).get("facts") or []
        for fact in facts[:3]:
            # Facts are about the PERSON, so they follow them into every future
            # chat. The backend stores role='fact' with a null conversation_id.
            await tools.remember("fact", str(fact)[:300])
        await trace.log(tools, run_id, "summarizer", {"turns": len(turns)}, {"facts": len(facts)})
        memory.mark_consolidated(user_id, convo)
    except Exception:
        pass
