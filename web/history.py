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

    Prioritises the most authoritative field (final_trade_decision), then
    falls back to earlier ones.  Chinese verdict keywords (买入/增持/卖出/
    减持/持有) are checked *before* English keywords because debate
    transcripts often contain "BUY" / "SELL" in argument text while the
    actual conclusion is in Chinese.  For Chinese we use the *last*
    occurrence since debate transcripts discuss both sides before a verdict.
    """
    import re

    cn_map = {
        "买入": "Buy", "增持": "Buy",
        "卖出": "Sell", "减持": "Sell",
        "持有": "Hold",
    }

    # Most authoritative field first
    for field in (
        "final_trade_decision",
        "trader_investment_decision",
        "investment_plan",
    ):
        text = state.get(field, "")
        if not text:
            continue
        cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)

        # 1) Chinese verdict — last occurrence = final conclusion
        best_pos = -1
        best_signal = None
        for cn, en in cn_map.items():
            pos = cleaned.rfind(cn)
            if pos > best_pos:
                best_pos = pos
                best_signal = en
        if best_signal:
            return best_signal

        # 2) English keywords — fallback only
        upper = cleaned.upper()
        for keyword in ("BUY", "SELL", "HOLD"):
            if keyword in upper:
                return keyword.capitalize()

    return "N/A"
