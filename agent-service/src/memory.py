"""Per-user conversation memory.

Mandatory for an e-commerce agent (money is involved). This is a simple in-process
store keyed by the user's UUID — the SAME identity the backend uses, so memory
survives a password reset (identity != credential). mem0 is a drop-in upgrade in
Phase 5; the interface stays the same.
"""
from collections import defaultdict, deque

_MAX_TURNS = 20
_store: dict[str, deque] = defaultdict(lambda: deque(maxlen=_MAX_TURNS))
# Short-lived per-user context the agent carries between turns (e.g. a pending pick).
_scratch: dict[str, dict] = defaultdict(dict)


def remember(user_id: str, role: str, content: str) -> None:
    _store[user_id].append({"role": role, "content": content})


def history(user_id: str) -> list[dict]:
    return list(_store[user_id])


def set_scratch(user_id: str, key: str, value) -> None:
    _scratch[user_id][key] = value


def get_scratch(user_id: str, key: str, default=None):
    return _scratch[user_id].get(key, default)


def clear_scratch(user_id: str, key: str) -> None:
    _scratch[user_id].pop(key, None)
