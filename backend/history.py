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
    2. For empty-string rating or missing rating, parse from final_trade_decision
       or other decision fields using keyword matching (Chinese & English).
    3. Fallback: ``N/A``.

    Returns one of ``Buy`` / ``Sell`` / ``Hold``.
    """
    _FIVE_TO_THREE = {
        "Buy": "Buy", "Overweight": "Buy",
        "Sell": "Sell", "Underweight": "Sell",
        "Hold": "Hold",
    }

    # Priority 1: stored rating that is a known value
    stored_rating = state.get("rating", "")
    if stored_rating and stored_rating in _FIVE_TO_THREE:
        return _FIVE_TO_THREE[stored_rating]

    # Priority 2: parse the first ~500 chars of each decision field for a rating pattern.
    # This avoids false matches from general discussion (e.g. "大股东增持").
    # Prefer "减持"/"卖出" over "增持"/"买入" when both appear, since
    # a cautious rating (减持) is more actionable than incidental mentions.
    _TEXT_SIGNALS: list[tuple[list[str], str]] = [
        (["减持", "卖出", "Sell", "Underweight"], "Sell"),
        (["增持", "买入", "Buy", "Overweight"], "Buy"),
        (["持有", "持仓", "观望", "Hold"], "Hold"),
    ]

    for field in (
        "final_trade_decision",
        "trader_investment_decision",
        "rating",          # in case rating is a Chinese text like "增持"
        "investment_plan",
    ):
        text = state.get(field, "")
        if not text:
            continue
        # Only check first 500 chars where the rating/decision is usually stated
        text = text[:500]
        for keywords, signal in _TEXT_SIGNALS:
            for kw in keywords:
                if kw in text:
                    return signal

    return "N/A"
