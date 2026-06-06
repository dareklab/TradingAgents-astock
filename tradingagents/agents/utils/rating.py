"""Shared 5-tier rating vocabulary and a deterministic heuristic parser.

The same five-tier scale (Buy, Overweight, Hold, Underweight, Sell) is used by:
- The Research Manager (investment plan recommendation)
- The Portfolio Manager (final position decision)
- The signal processor (rating extracted for downstream consumers)
- The memory log (rating tag stored alongside each decision entry)

Centralising it here avoids drift between those call sites.
"""

from __future__ import annotations

import re
from typing import Tuple

# Canonical, ordered 5-tier scale (most bullish to most bearish).
RATINGS_5_TIER: Tuple[str, ...] = (
    "Buy", "Overweight", "Hold", "Underweight", "Sell",
)

_RATING_SET = {r.lower() for r in RATINGS_5_TIER}

# English "Rating: X" / "rating - X" / "Rating: **X**"
_RATING_LABEL_RE = re.compile(r"rating.*?[:\-][\s*]*(\w+)", re.IGNORECASE)

# Chinese rating labels: "评级：卖出" / "最终评级：**卖出**" etc.
_CN_RATING_MAP = {"买入": "Buy", "增持": "Overweight", "持有": "Hold",
                  "减持": "Underweight", "卖出": "Sell"}
_CN_RATING_LABEL_RE = re.compile(r"(?:评级|最终评级|评级为)[：:]\s*\**\s*(\S+?)\s*\**")


def parse_rating(text: str, default: str = "Hold") -> str:
    """Heuristically extract a 5-tier rating from prose text.

    Three-pass strategy:
    1. English "Rating: X" label (tolerant of markdown bold).
    2. Chinese rating labels: "评级：卖出" / "最终评级：**卖出**" / "评级为卖出".
    3. Fall back to the *last* 5-tier rating word found (the verdict
       usually comes last; earlier occurrences are often counter-arguments).

    Returns a Title-cased rating string, or ``default`` if no rating word appears.
    """
    # 1) English "Rating: X" label
    for line in text.splitlines():
        m = _RATING_LABEL_RE.search(line)
        if m and m.group(1).lower() in _RATING_SET:
            return m.group(1).capitalize()

    # 2) Chinese rating labels
    for line in text.splitlines():
        m = _CN_RATING_LABEL_RE.search(line)
        if m:
            cn_word = m.group(1).rstrip("*").strip()
            if cn_word in _CN_RATING_MAP:
                return _CN_RATING_MAP[cn_word]

    # 3) Fallback: last occurrence of any rating word (verdict comes last)
    text_lower = text.lower()
    best_pos = -1
    best_rating = default
    for rating in _RATING_SET:
        pos = text_lower.rfind(rating)
        if pos > best_pos:
            best_pos = pos
            best_rating = rating.capitalize()

    # Also check Chinese keywords (last occurrence)
    for cn, en in _CN_RATING_MAP.items():
        pos = text.rfind(cn)
        if pos > best_pos:
            best_pos = pos
            best_rating = en

    return best_rating
