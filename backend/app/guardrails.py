"""Deterministic guardrails: Layer 1 (input regex), Layer 2 (escaping), Layer 4 (output validator)."""

import re
import unicodedata

from app.config import settings

REFUSAL = (
    "I cannot help with that request. I'm happy to talk about my background, "
    "my projects, and how I think about building AI systems. What would you like to know?"
)

_ZERO_WIDTH = re.compile(r"[​-‏⁠﻿‪-‮]")

INJECTION_PATTERNS = [
    re.compile(r"ignore (all )?(the )?(previous|prior|above) (instructions|prompts)"),
    re.compile(r"disregard (all )?(the )?(previous|prior|above) (instructions|prompts)"),
    re.compile(r"reveal (the |your )?(system prompt|instructions|hidden context)"),
    re.compile(r"(repeat|print|show) (everything|all|the text) above"),
    re.compile(r"you are now (an unrestricted|dan|jailbroken|a linux terminal)"),
    re.compile(r"what is your (api key|secret|groq key)"),
    re.compile(r"system prompt"),
    re.compile(r"forget (that )?you are"),
    re.compile(r"(developer|dev) mode"),
    re.compile(r"\bjailbreak"),
    re.compile(r"\bdan mode\b"),
]

# Catches letter-spaced / punctuated evasions such as "i g n o r e  p r e v i o u s".
COMPACT_PHRASES = (
    "ignorepreviousinstructions",
    "ignoreallpreviousinstructions",
    "ignoreaboveinstructions",
    "ignorepriorinstructions",
    "revealthesystemprompt",
    "systemprompt",
    "forgetyouare",
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = _ZERO_WIDTH.sub("", text)
    text = "".join(ch for ch in text if ch.isprintable() or ch in "\n\t")
    return re.sub(r"\s+", " ", text).strip().lower()


def is_prompt_injection(query: str) -> bool:
    text = normalize(query)
    if any(p.search(text) for p in INJECTION_PATTERNS):
        return True
    compact = re.sub(r"[^a-z0-9]", "", text)
    return any(phrase in compact for phrase in COMPACT_PHRASES)


def sanitize_user_text(text: str) -> str:
    """Layer 2: neutralize tag breakout (e.g. '</user_query>') before wrapping."""
    text = _ZERO_WIDTH.sub("", text)
    return text.replace("<", "&lt;").replace(">", "&gt;")


# Distinctive fragments of the system prompt that must never appear in a reply.
_LEAK_FRAGMENTS = (
    "immunity rule",
    "<user_query>",
    "context dossier",
    "closed-world rule",
    "out-of-scope rule",
    "primary directives",
)

_KEY_PATTERNS = (
    re.compile(r"gsk_[A-Za-z0-9]{10,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
)

# Self-referential statements about being an AI/model. Mentioning a tool as a skill
# ("I used Groq in MediBot") is allowed because the dossier lists it.
_PERSONA_BREAK = re.compile(
    r"\b(as an ai|as a language model|i am an ai|i'm an ai|i am dan|developer mode)\b"
    r"|\b(i am|i'm|i run|running|powered)\b[^.]{0,40}\b(gpt|llama|groq|openai|llm|language model)\b",
    re.I,
)


def plain_text(text: str) -> str:
    """Strip markdown so a voice never reads out asterisks, bullets or headings."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)  # [label](url) -> label
    text = text.replace("`", "")
    text = re.sub(r"(\*{1,3}|_{2,3})(.+?)\1", r"\2", text)  # **bold**, *italic*, __bold__
    lines = []
    for raw in text.splitlines():
        line = re.sub(r"^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+|>\s*)", "", raw).strip()
        line = line.replace("*", "").replace("#", "")
        if not line:
            continue
        # Bullet lines usually have no full stop: add one so the voice pauses between them.
        lines.append(line if line[-1] in ".!?:" else line + ".")
    out = " ".join(lines)
    out = out.replace("‑", "-")  # non-breaking hyphen is read oddly by some voices
    return re.sub(r"\s+", " ", out).strip()


def _truncate_at_sentence(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "), cut.rfind("."))
    return cut[: end + 1] if end > 0 else cut


def validate_output(reply: str, secret_values: list[str] | None = None) -> str | None:
    """Layer 4: return a safe reply, or None if the output must be replaced by the refusal."""
    lowered = reply.lower()
    if any(fragment in lowered for fragment in _LEAK_FRAGMENTS):
        return None
    if any(p.search(reply) for p in _KEY_PATTERNS):
        return None
    for secret in secret_values or []:
        if len(secret) >= 8 and secret in reply:
            return None
    if _PERSONA_BREAK.search(reply):
        return None
    return _truncate_at_sentence(reply.strip(), settings.max_reply_chars)
