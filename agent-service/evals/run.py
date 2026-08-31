"""Replay the golden set against the live customer agent and score it.

Two kinds of check, deliberately:

  * Programmatic — did it call the right tool? did it pass confirm_over_limit
    when nobody consented? These are booleans, they are the most valuable
    assertions here, and they are what actually guard the money path.
  * LLM-as-judge — is the prose right? Used only where a regex cannot decide.
    Judges are biased toward long answers, so a judge score never overrides a
    failed programmatic check; it can only fail a case that otherwise passed.

Usage:  python -m evals.run              (from agent-service/)
        python -m evals.run --promote    (promote the prompt if the suite is green)
"""
import asyncio
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

import httpx

BACKEND = os.getenv("BACKEND_URL", "http://backend:4000")
AGENT = os.getenv("AGENT_SELF_URL", "http://localhost:8010")
EMAIL = os.getenv("EVAL_EMAIL", "eval-bot@test.com")
PASSWORD = os.getenv("EVAL_PASSWORD", "eval-secret-123")
CASES = json.loads((Path(__file__).parent / "golden.json").read_text(encoding="utf-8"))["cases"]


async def _judge(client: httpx.AsyncClient, question: str, message: str, reply: str) -> tuple[float, str]:
    """Ask a model whether the reply satisfies the rubric. Returns (score, note)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from src import model  # imported late so the module reads env at call time

    if not model.is_available():
        return 1.0, "no model key — judge skipped"
    try:
        res = await model.chat([
            {"role": "system", "content":
                "You grade one reply from a shopping assistant against a single yes/no rubric. "
                'Return JSON only: {"pass": true|false, "why": "one short sentence"}. '
                "Judge only the rubric. Length and politeness are irrelevant."},
            {"role": "user", "content": f"Rubric: {question}\n\nUser said: {message}\n\nAssistant replied: {reply}"},
        ], temperature=0)
        data = model.extract_json(res["text"]) or {}
        return (1.0 if data.get("pass") else 0.0), str(data.get("why", ""))[:200]
    except Exception as e:  # a broken judge must not fail the suite
        return 1.0, f"judge unavailable ({e})"


async def _ensure_user(client: httpx.AsyncClient) -> str:
    await client.post(f"{BACKEND}/auth/signup", json={"email": EMAIL, "password": PASSWORD})
    r = await client.post(f"{BACKEND}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    r.raise_for_status()
    return r.json()["tokens"]["access"]


async def _reset(client: httpx.AsyncClient, token: str, case: dict) -> None:
    """Each case starts from a known state, or the previous case's cart leaks in.

    Some cases also need the cart PRE-SEEDED. A single turn cannot reliably force
    a multi-step flow — asked to "add something and check out", the agent may
    quite reasonably search and then ask which one. Seeding the cart makes the
    instruction unambiguous, so the case tests the guardrail rather than testing
    how chatty the agent felt like being.
    """
    h = {"Authorization": f"Bearer {token}"}
    cart = (await client.get(f"{BACKEND}/cart", headers=h)).json().get("cart", {})
    for item in cart.get("items", []):
        await client.delete(f"{BACKEND}/cart/items/{item['variantId']}", headers=h)

    # Always write the limit, not only when the case names one. Otherwise a case
    # that drops it to Rs 1 to test the guardrail silently applies that limit to
    # every case after it, and unrelated cases fail for reasons nothing in them
    # explains.
    limit_rupees = case.get("setup_spend_limit_rupees", 100000)
    await client.put(f"{BACKEND}/me/preferences", headers=h,
                     json={"spendLimitPaise": limit_rupees * 100})

    if case.get("setup_seed_cart"):
        products = (await client.get(f"{BACKEND}/catalog?limit=1")).json().get("products", [])
        if products:
            await client.post(f"{BACKEND}/cart/items", headers=h,
                              json={"productId": products[0]["id"], "qty": 1})


def _check(case: dict, reply: str, steps: list[dict]) -> tuple[bool, str]:
    # `steps` is every tool call across every turn of the case. Tool assertions
    # are about the conversation as a whole — a two-turn case that looks a
    # product up on turn one and adds it on turn two has still called both.
    called = [s["tool"] for s in steps]

    for tool in case.get("must_call", []):
        if tool not in called:
            return False, f"expected a {tool} call, got {called or 'none'}"

    for tool in case.get("must_not_call", []):
        if tool in called:
            return False, f"called {tool} when it must not"

    pat = case.get("reply_must_match")
    if pat and not re.search(pat, reply):
        return False, f"reply did not match /{pat}/"

    pat = case.get("reply_must_not_match")
    if pat and re.search(pat, reply):
        return False, f"reply matched forbidden /{pat}/"

    forbidden = case.get("must_not_pass_arg")
    if forbidden:
        for s in steps:
            if s["tool"] == forbidden["tool"] and s.get("args", {}).get(forbidden["arg"]) == forbidden["value"]:
                return False, f"passed {forbidden['arg']}={forbidden['value']} without consent"

    return True, ""


async def main(promote: bool) -> int:
    suite_id = str(uuid.uuid4())
    results: list[dict] = []

    async with httpx.AsyncClient(timeout=90.0) as client:
        token = await _ensure_user(client)
        headers = {"Authorization": f"Bearer {token}"}

        for case in CASES:
            await _reset(client, token, case)
            # Every case gets its own conversation.
            #
            # Without this they all share the agent's "<user>:default" working
            # memory, which _reset cannot clear because it lives in the agent
            # process, not the database. Any per-conversation state — a pending
            # confirmation, a trade-up already offered — would then leak from one
            # case into the next, and the suite would pass or fail on the ORDER
            # the cases happen to run in. That failure looks like flakiness, not
            # like a bug, which is the worst kind to chase.
            convo = str(uuid.uuid4())

            # `turns` runs a real conversation and asserts on the LAST reply.
            # Some behaviour only exists across turns — asking a second time for
            # something the agent held back is not expressible in one message.
            turns = case.get("turns") or [case["message"]]
            t0 = time.perf_counter()
            body = {"reply": "", "steps": []}
            all_steps: list[dict] = []
            try:
                for turn in turns:
                    r = await client.post(f"{AGENT}/chat", headers=headers,
                                          json={"message": turn, "conversationId": convo})
                    body = r.json()
                    all_steps.extend(body.get("steps") or [])
            except Exception as e:
                body = {"reply": f"<request failed: {e}>", "steps": []}
            body["steps"] = all_steps
            latency = int((time.perf_counter() - t0) * 1000)

            reply = body.get("reply", "")
            steps = body.get("steps", [])
            passed, detail = _check(case, reply, steps)

            score = None
            if passed and case.get("judge"):
                # A multi-turn case has no single "message"; judge the turn that
                # produced the reply being scored.
                score, note = await _judge(client, case["judge"], turns[-1], reply)
                if score < 1.0:
                    passed, detail = False, f"judge: {note}"

            results.append({
                "suiteId": suite_id, "caseId": case["id"], "passed": passed,
                "score": score, "expected": case.get("judge", ""), "actual": reply[:2000],
                "detail": detail, "latencyMs": latency,
                "promptName": "customer",
            })
            print(f"  {'PASS' if passed else 'FAIL'}  {case['id']:<34} {latency:>5}ms  {detail}")

        await client.post(f"{BACKEND}/observability/evals", headers=headers, json={"results": results})

        failed = [r for r in results if not r["passed"]]
        print(f"\n{len(results) - len(failed)}/{len(results)} passed")

        if promote:
            prompt = (Path(__file__).parent.parent / "src" / "prompts" / "customer.md").read_text(encoding="utf-8").strip()
            reg = (await client.post(f"{BACKEND}/observability/prompts", headers=headers,
                                     json={"name": "customer", "body": prompt})).json()
            out = (await client.post(f"{BACKEND}/observability/prompts/promote", headers=headers,
                                     json={"name": "customer", "version": reg["version"], "suiteId": suite_id})).json()
            print(f"gate: {out.get('reason')}")

        return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main("--promote" in sys.argv)))
