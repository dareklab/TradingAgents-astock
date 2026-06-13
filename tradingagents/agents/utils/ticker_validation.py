"""A-stock code validation for LLM tool parameters.

Rejects Chinese concept names and non-numeric inputs that LLMs sometimes
pass to stock-data tools.  Lives in its own module to avoid circular imports
between agent_utils (which imports tool modules) and the tool modules
themselves.
"""

from __future__ import annotations

import re

# A 6-digit numeric A-stock code, optionally with SH/SZ prefix or .SS/.SZ suffix
_ASTOCK_CODE_RE = re.compile(r'^(SH|SZ)?\d{6}(\.(SS|SZ))?$')

# Chinese character range
_CHINESE_CHARS = set('\u4e00\u4e01\u4e03\u4e07\u4e08\u4e09\u4e09\u4e09')
# Simpler: use a regex to detect any Chinese char
_HAS_CHINESE = re.compile(r'[\u4e00-\u9fff]')


def validate_astock_code(symbol: str, tool_name: str) -> str:
    """Validate that *symbol* is a numeric A-stock code, not a Chinese name or concept.

    Returns the uppercased, stripped code on success.
    Raises ``ValueError`` with a Chinese-langauge message the LLM can understand.
    """
    stripped = symbol.strip().upper()
    if _ASTOCK_CODE_RE.match(stripped):
        return stripped

    if _HAS_CHINESE.search(stripped):
        raise ValueError(
            f"[{tool_name}] 参数错误: '{symbol}' 不是股票代码，而是中文名称或概念题材。"
            f"请使用6位数字股票代码（如 600519），不要传入中文名称。"
        )

    if not stripped.replace(',', '').replace('.', '').isdigit():
        raise ValueError(
            f"[{tool_name}] 参数错误: '{symbol}' 不是有效的股票代码。"
            f"请使用6位数字股票代码（如 600519）。"
        )

    return stripped
