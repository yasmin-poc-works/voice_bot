import asyncio
import logging
from dataclasses import dataclass

from openai import AsyncOpenAI, RateLimitError

from app.config import settings

log = logging.getLogger("voicebot.llm")


class LLMUnavailable(Exception):
    """Both the primary and fallback model failed or returned nothing."""


@dataclass
class LLMResult:
    reply: str
    total_tokens: int
    model: str


_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        # Groq exposes an OpenAI-compatible API, so the OpenAI SDK works with a different base_url.
        _client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url=settings.groq_base_url,
            timeout=settings.llm_timeout_s,
            max_retries=0,
        )
    return _client


async def _call(model: str, system_prompt: str, user_content: str) -> LLMResult:
    resp = await _get_client().chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=settings.temperature,
        max_completion_tokens=settings.max_completion_tokens,
        extra_body={"reasoning_effort": settings.reasoning_effort},
    )
    content = (resp.choices[0].message.content or "").strip()
    if not content:
        # Reasoning tokens can consume the whole completion cap and leave no answer.
        raise ValueError("empty completion")
    total = resp.usage.total_tokens if resp.usage else 0
    return LLMResult(reply=content, total_tokens=total, model=model)


class LLMBusy(LLMUnavailable):
    """Both models are rate limited. `retry_after` is the suggested wait in seconds."""

    def __init__(self, retry_after: float) -> None:
        super().__init__("rate limited")
        self.retry_after = retry_after


def _retry_after(exc: RateLimitError) -> float:
    try:
        return float(exc.response.headers.get("retry-after", "10"))
    except (ValueError, AttributeError):
        return 10.0


async def _try_models(system_prompt: str, user_content: str) -> tuple[LLMResult | None, float | None]:
    """One pass over primary then fallback. Returns (result, shortest_rate_limit_wait)."""
    waits: list[float] = []
    other_failure = False
    for model in (settings.primary_model, settings.fallback_model):
        try:
            return await _call(model, system_prompt, user_content), None
        except RateLimitError as exc:
            waits.append(_retry_after(exc))
            log.warning("LLM rate limited on %s", model)
        except Exception as exc:  # noqa: BLE001 - any failure moves to the next model
            other_failure = True
            log.warning("LLM call failed on %s: %s", model, type(exc).__name__)
    if other_failure or not waits:
        return None, None
    return None, min(waits)


async def generate(system_prompt: str, user_content: str) -> LLMResult:
    """Primary model, then fallback. If both are only rate limited, wait briefly and retry once.

    Never leaks provider errors to callers.
    """
    result, wait = await _try_models(system_prompt, user_content)
    if result:
        return result
    if wait is None:
        raise LLMUnavailable
    if wait > settings.max_rate_limit_wait_s:
        raise LLMBusy(wait)
    await asyncio.sleep(wait + 0.3)
    result, wait = await _try_models(system_prompt, user_content)
    if result:
        return result
    raise LLMBusy(wait or 10.0)
