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

    Delegates to ``tradingagents.agents.utils.rating.parse_rating`` for all
    text-based extraction, keeping the heuristic consistent across the entire
    codebase.  This function only adds the post-5-tier→3-tier normalisation
    that history display needs.

    Priority:
    1. If a ``rating`` field is a non-empty known value, use it directly.
    2. Otherwise, delegate to ``parse_rating`` on ``final_trade_decision``.
    3. Still no hit? Try ``trader_investment_plan`` / ``investment_plan``.
    4. Fallback: ``N/A``.

    Returns one of ``Buy`` / ``Sell`` / ``Hold``.
    """
    # Priority 1: stored 5-tier rating
    stored_rating = state.get("rating", "")
    if stored_rating:
        s = stored_rating.lower()
        if s in ("buy", "overweight"):
            return "Buy"
        if s in ("sell", "underweight"):
            return "Sell"
        if s == "hold":
            return "Hold"

    # Priority 2: delegate to parse_rating for full text-based extraction
    from tradingagents.agents.utils.rating import parse_rating

    for field in ("final_trade_decision", "trader_investment_plan", "investment_plan"):
        text = state.get(field, "")
        if not text:
            continue
        parsed = parse_rating(text)
        if parsed in ("Buy", "Overweight"):
            return "Buy"
        if parsed in ("Sell", "Underweight"):
            return "Sell"
        if parsed == "Hold":
            return "Hold"

    return "N/A"
