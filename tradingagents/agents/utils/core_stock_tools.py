import re
from langchain_core.tools import tool
from typing import Annotated
from tradingagents.dataflows.interface import route_to_vendor


# Regex: a 6-digit numeric A-stock code, optionally with SH/SZ/ .SS/ .SZ suffix
_ASTOCK_CODE_RE = re.compile(r'^(SH|SZ)?\d{6}(\.(SS|SZ))?$')

def _validate_astock_code(symbol: str, tool_name: str) -> str:
    """Validate that *symbol* is a numeric A-stock code, not a Chinese name or concept."""
    stripped = symbol.strip().upper()
    if _ASTOCK_CODE_RE.match(stripped):
        return stripped
    # If it contains Chinese characters, it's definitely not a stock code
    if any('\u4e00' <= ch <= '\u9fff' for ch in symbol):
        raise ValueError(
            f"[{tool_name}] 参数错误: '{symbol}' 不是股票代码，而是中文名称或概念题材。"
            f"请使用6位数字股票代码（如 600519），不要传入中文名称。"
        )
    # If it's other non-numeric junk, also reject
    if not stripped.replace(',', '').isdigit():
        raise ValueError(
            f"[{tool_name}] 参数错误: '{symbol}' 不是有效的股票代码。"
            f"请使用6位数字股票代码（如 600519）。"
        )
    return stripped


@tool
def get_stock_data(
    symbol: Annotated[str, "6-digit A-stock code (e.g. 600379). Must be numeric, NOT company name or Chinese text"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
) -> str:
    """
    Retrieve stock price data (OHLCV) for a given stock code.
    Uses the configured core_stock_apis vendor.
    Args:
        symbol (str): 6-digit A-stock code, e.g. 600379, 300750. Must be the numeric code, not the company name.
        start_date (str): Start date in yyyy-mm-dd format
        end_date (str): End date in yyyy-mm-dd format
    Returns:
        str: A formatted dataframe containing the stock price data for the specified stock code in the specified date range.
    """
    symbol = _validate_astock_code(symbol, "get_stock_data")
    return route_to_vendor("get_stock_data", symbol, start_date, end_date)
