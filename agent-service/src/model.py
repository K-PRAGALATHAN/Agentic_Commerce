"""OpenRouter model client with a graceful keyless fallback.

Credential isolation note: this module only ever receives the user's MESSAGE and
tool RESULTS. It never sees the user's JWT, password, or Razorpay secret — those
live in the tools layer, not in the prompt.
"""
import json
import os
import re
from typing import Any

import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
MODEL = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")


def is_available() -> bool:
    return bool(API_KEY)


# USD per 1M tokens (input, output). Extend as models are added.
PRICING = {
    "openai/gpt-5.6-luna": (0.20, 1.20),
    "openai/gpt-4o-mini": (0.15, 0.60),
}
USD_TO_INR = 84.0


def estimate_cost_inr(model_id: str, tokens_in: int, tokens_out: int) -> float:
    pin, pout = PRICING.get(model_id, (0.0, 0.0))
    usd = (tokens_in / 1_000_000) * pin + (tokens_out / 1_000_000) * pout
    return round(usd * USD_TO_INR, 6)


async def chat(messages: list[dict], temperature: float = 0.3) -> dict:
    """Call the model. Returns {'text', 'model', 'tokens_in', 'tokens_out'}.

    Raises if no key — callers should check is_available() and use the fallback.
    """
    if not API_KEY:
        raise RuntimeError("no OpenRouter key")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json={"model": MODEL, "messages": messages, "temperature": temperature},
        )
        r.raise_for_status()
        data = r.json()
    usage = data.get("usage", {})
    return {
        "text": data["choices"][0]["message"]["content"],
        "model": MODEL,
        "tokens_in": usage.get("prompt_tokens", 0),
        "tokens_out": usage.get("completion_tokens", 0),
    }


def extract_json(text: str) -> dict[str, Any] | None:
    """Pull the first JSON object out of a model reply."""
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
