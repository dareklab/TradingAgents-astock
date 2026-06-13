"""Manage analysis history by scanning existing log files."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# Beijing timezone (UTC+8)
_CST = timezone(timedelta(hours=8))


def _results_dir() -> Path:
    return Path.home() / ".tradingagents" / "logs"


def get_history() -> list[dict[str, str]]:
    """Scan saved analysis logs and return a sorted list (newest first).

    Each entry: {"ticker": "300750", "date": "2026-06-03",
                  "time": "2026-06-03 14:30:52", "path": "/abs/path/...json"}
    """
    root = _results_dir()
    if not root.exists():
        return []

    entries: list[dict[str, str]] = []
    for log_file in root.rglob("full_states_log_*.json"):
        match = re.search(r"full_states_log_(\d{4}-\d{2}-\d{2})\.json$", log_file.name)
        if not match:
            continue
        date = match.group(1)
        ticker = log_file.parent.parent.name
        # Use file modification time as the analysis timestamp (UTC+8)
        mtime = os.path.getmtime(log_file)
        time_str = datetime.fromtimestamp(mtime, tz=_CST).strftime("%Y-%m-%d %H:%M:%S")
        entries.append({
            "ticker": ticker,
            "date": date,
            "time": time_str,
            "mtime": mtime,
            "path": str(log_file),
        })

    # Sort by modification time descending (most recent first)
    entries.sort(key=lambda e: e["mtime"], reverse=True)
    return entries


def load_analysis(path: str) -> dict[str, Any]:
    """Load a saved analysis JSON file."""
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def extract_signal(state: dict[str, Any]) -> str:
    """Extract the short signal (Buy/Sell/Hold) from a final state dict.

    Priority:
    1. If a ``rating`` field is a non-empty known value, use it directly.
    2. Otherwise, use the TradingAgents rating parser on final_trade_decision
       and other decision fields, picking the **last** occurring rating keyword
       (typically the verdict).
    3. Fallback: ``N/A``.

    Returns one of ``Buy`` / ``Sell`` / ``Hold``.
    """
    # Priority 1: stored rating that is a known value
    stored_rating = state.get("rating", "")
    if stored_rating:
        # Normalise 5-tier → 3-tier
        s = stored_rating.lower()
        if s in ("buy", "overweight"):
            return "Buy"
        if s in ("sell", "underweight"):
            return "Sell"
        if s == "hold":
            return "Hold"

    # Priority 2: scan decision fields for the last occurrence of any rating keyword.
    # Uses the same "last occurrence wins" strategy as parse_rating in rating.py.
    # Search order: final_trade_decision (most authoritative) -> trader -> investment_plan
    _CN_MAP = {"买入": "Buy", "增持": "Buy",
               "持有": "Hold", "持仓": "Hold", "观望": "Hold",
               "减持": "Sell", "卖出": "Sell"}
    _EN_RATINGS = ["buy", "overweight", "hold", "underweight", "sell"]

    best_pos = -1
    best_signal = "N/A"

    for field in (
        "final_trade_decision",
        "trader_investment_decision",
        "trader_investment_plan",
        "investment_plan",
    ):
        text = state.get(field, "")
        if not text:
            continue
        text_lower = text.lower()
        text_full = text  # keep original for Chinese keyword search

        # Check Chinese keywords first (more specific)
        for cn, en in _CN_MAP.items():
            pos = text_full.rfind(cn)
            if pos > best_pos:
                # Skip if preceded by negation nearby
                ctx_start = max(0, pos - 12)
                ctx = text_full[ctx_start:pos].strip()
                if any(neg in ctx for neg in ["严禁", "避免", "不建", "不推",
                                               "不要", "不会", "not re"]):
                    continue
                best_pos = pos
                best_signal = en

        # Check English rating keywords
        for rating in _EN_RATINGS:
            pos = text_lower.rfind(rating)
            if pos > best_pos:
                ctx_start = max(0, pos - 12)
                ctx = text_lower[ctx_start:pos].strip()
                if any(neg in ctx for neg in ["avoid", "do not", "should not",
                                               "against", "not re"]):
                    continue
                best_pos = pos
                best_signal = "Buy" if rating in ("buy", "overweight") else (
                    "Sell" if rating in ("sell", "underweight") else "Hold"
                )

    return best_signal
