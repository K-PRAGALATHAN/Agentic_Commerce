"""Procedural memory: how to act, kept as files rather than string literals.

Prompts on disk are diffable and reviewable, which matters because a prompt edit
is a behaviour change with no compiler to catch it. The version hash lets a trace
record which prompt produced a given run — the Gate → Release half of LLM Ops.
"""
import hashlib
from pathlib import Path

_DIR = Path(__file__).resolve().parent.parent / "prompts"


# Deliberately NOT cached. A promoted prompt has to take effect without a
# process restart, otherwise the Gate -> Release step is a lie. These are a few
# hundred bytes read once per turn — the cost is irrelevant next to a model call.
def load(name: str) -> str:
    path = _DIR / f"{name}.md"
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        # A missing prompt file must not take the service down; the agent still
        # works, just less well, and the trace will show which version ran.
        return "You are a helpful assistant for this store."


def version(name: str) -> str:
    return hashlib.sha256(load(name).encode("utf-8")).hexdigest()[:8]
