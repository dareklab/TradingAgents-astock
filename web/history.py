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

    Uses the shared 5-tier rating parser first (understands explicit rating
    labels like ``评级：Sell`` / ``**Rating**: Overweight``), then falls
    back to keyword search on the most authoritative fields.

    Returns one of ``Buy`` / ``Sell`` / ``Hold``.
    """
    from tradingagents.agents.utils.rating import parse_rating

    # 5→3 tier mapping
    _FIVE_TO_THREE = {
        "Buy": "Buy", "Overweight": "Buy",
        "Sell": "Sell", "Underweight": "Sell",
        "Hold": "Hold",
    }

    for field in (
        "investment_plan",
        "trader_investment_decision",
        "final_trade_decision",
    ):
        text = state.get(field, "")
        if not text:
            continue
        rating = parse_rating(text)
        if rating in _FIVE_TO_THREE:
            return _FIVE_TO_THREE[rating]

    return "N/A"
