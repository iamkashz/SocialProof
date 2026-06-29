"""Shared model fallback ladder + retry helper for LlmAgent-shaped calls.

Both `narrator_agent` and `handle_discovery_agent` make direct genai client
calls (rather than going through ADK's `LlmAgent`) so they can:
  - walk a fallback ladder when one model hits 429/503
  - enforce strict output schemas without ADK's tool-calling machinery
  - keep the failure mode (raise → server emits a `warning` frame) consistent

The ladder is in one place so adding/removing a model doesn't need to be
done twice.
"""

from __future__ import annotations

import logging
from typing import Any

from google import genai

logger = logging.getLogger(__name__)

# Ordered from preferred → fallback. Each has its own free-tier quota so
# burning one doesn't burn the next. The 3.x line is newest; the 2.x line
# is the proven fallback; Gemma is the last-resort open model.
MODEL_LADDER: tuple[str, ...] = (
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemma-4-26b-a4b-it",
)


def is_retryable(exc: Exception) -> bool:
    msg = str(exc)
    return (
        "RESOURCE_EXHAUSTED" in msg
        or "429" in msg
        or "503" in msg
        or "UNAVAILABLE" in msg
    )


async def generate_with_ladder(
    prompt: str,
    *,
    label: str = "llm",
    response_mime_type: str | None = None,
    response_schema: Any | None = None,
) -> str:
    """Try each model in MODEL_LADDER until one succeeds.

    Raises the last exception if every model fails — caller is expected to
    convert that into a user-facing `warning` frame.

    Args:
        prompt: The full prompt to send.
        label: Used for log lines so we can tell which agent is calling.
        response_mime_type: Pass "application/json" to force structured
            output. Models that don't honor it just return prose.
        response_schema: Optional pydantic/dict schema for structured output.
    """
    client = genai.Client()
    config: dict[str, Any] = {}
    if response_mime_type:
        config["response_mime_type"] = response_mime_type
    if response_schema is not None:
        config["response_schema"] = response_schema

    last_exc: Exception | None = None
    for model_name in MODEL_LADDER:
        try:
            response = await client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config or None,
            )
            text = (response.text or "").strip()
            if text:
                logger.info("%s: succeeded with %s", label, model_name)
                return text
        except Exception as exc:
            last_exc = exc
            if is_retryable(exc):
                logger.warning(
                    "%s: %s returned retryable error, trying next model",
                    label,
                    model_name,
                )
                continue
            logger.error("%s: %s returned non-retryable error: %s", label, model_name, exc)
            break

    if last_exc is not None:
        raise last_exc
    raise RuntimeError(f"{label}: no model produced output")
