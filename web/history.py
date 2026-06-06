"""Manage analysis history by scanning existing log files."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any


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
        # Use file modification time as the analysis timestamp
        mtime = os.path.getmtime(log_file)
        time_str = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M:%S")
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

    Tries English keywords first (BUY/SELL/HOLD), then falls back to
    Chinese keywords (买入/卖出/持有). For Chinese, uses the *last*
    occurrence in the text since debate transcripts discuss both sides
    before reaching a verdict.
    """
    import re

    cn_map = {"买入": "Buy", "卖出": "Sell", "持有": "Hold"}

    for field in (
        "investment_plan",
        "trader_investment_decision",
        "final_trade_decision",
    ):
        text = state.get(field, "")
        if not text:
            continue
        cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)

        # 1) English keywords
        upper = cleaned.upper()
        for keyword in ("BUY", "SELL", "HOLD"):
            if keyword in upper:
                return keyword.capitalize()

        # 2) Chinese keywords — last occurrence = final verdict
        best_pos = -1
        best_signal = None
        for cn, en in cn_map.items():
            pos = cleaned.rfind(cn)
            if pos > best_pos:
                best_pos = pos
                best_signal = en
        if best_signal:
            return best_signal

    return "N/A"
