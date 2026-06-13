"""Shared helpers for invoking an agent with structured output and a graceful fallback.

The Portfolio Manager, Trader, and Research Manager all follow the same
canonical pattern:

1. At agent creation, wrap the LLM with ``with_structured_output(Schema)``
   so the model returns a typed Pydantic instance. If the provider does
   not support structured output (rare; mostly older Ollama models), the
   wrap is skipped and the agent uses free-text generation instead.
2. At invocation, run the structured call and render the result back to
   markdown. If the structured call itself fails for any reason
   (malformed JSON from a weak model, transient provider issue), fall
   back to a plain ``llm.invoke`` so the pipeline never blocks.

Centralising the pattern here keeps the agent factories small and ensures
all three agents log the same warnings when fallback fires.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


def bind_structured(llm: Any, schema: type[T], agent_name: str) -> Optional[Any]:
    """Return ``llm.with_structured_output(schema)`` or ``None`` if unsupported.

    Logs a warning when the binding fails so the user understands the agent
    will use free-text generation for every call instead of one-shot fallback.
    """
    try:
        return llm.with_structured_output(schema)
    except (NotImplementedError, AttributeError) as exc:
        logger.warning(
            "%s: provider does not support with_structured_output (%s); "
            "falling back to free-text generation",
            agent_name, exc,
        )
        return None


def _extract_rating_from_text(text: str) -> str:
    """Parse a 5-tier rating from free-text output.

    Delegates to ``parse_rating`` from ``tradingagents.agents.utils.rating``
    to keep the heuristic consistent across all call sites (same negation
    detection, same Chinese/English keyword matching, same priority ordering).
    """
    from tradingagents.agents.utils.rating import parse_rating
    return parse_rating(text)


def invoke_structured_or_freetext(
    structured_llm: Optional[Any],
    plain_llm: Any,
    prompt: Any,
    render: Callable[[T], str],
    agent_name: str,
    rating_extractor: Optional[Callable[[T], str]] = None,
) -> str | tuple[str, str]:
    """Run the structured call and render to markdown; fall back to free-text on any failure.

    When ``rating_extractor`` is provided, returns ``(rendered_markdown, rating)``
    so the caller can store the rating directly without re-parsing the markdown.
    Otherwise returns just the rendered markdown for backward compatibility.

    On free-text fallback, the rating is extracted heuristically from the
    response text so ``state["rating"]`` is populated even when structured
    output is unavailable (e.g. DeepSeek V4 thinking mode).
    """
    if structured_llm is not None:
        try:
            result = structured_llm.invoke(prompt)
            rendered = render(result)
            if rating_extractor is not None:
                return rendered, rating_extractor(result)
            return rendered
        except Exception as exc:
            logger.warning(
                "%s: structured-output invocation failed (%s); retrying once as free text",
                agent_name, exc,
            )

    response = plain_llm.invoke(prompt)
    if rating_extractor is not None:
        rating = _extract_rating_from_text(response.content)
        return response.content, rating
    return response.content
