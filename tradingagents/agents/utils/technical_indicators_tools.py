import re
from langchain_core.tools import tool
from typing import Annotated
from tradingagents.dataflows.interface import route_to_vendor


_ASTOCK_CODE_RE = re.compile(r'^(SH|SZ)?\d{6}(\.(SS|SZ))?$')

@tool
def get_indicators(
    symbol: Annotated[str, "6-digit A-stock code (e.g. 600379). Must be numeric, NOT company name or Chinese text"],
    indicator: Annotated[str, "technical indicator to get the analysis and report of"],
    curr_date: Annotated[str, "The current trading date you are trading on, YYYY-mm-dd"],
    look_back_days: Annotated[int, "how many days to look back"] = 30,
) -> str:
    """
    Retrieve a single technical indicator for a given stock code.
    Uses the configured technical_indicators vendor.
    Args:
        symbol (str): 6-digit A-stock code, e.g. 600379, 300750. Must be the numeric code, not the company name.
        indicator (str): A single technical indicator name, e.g. 'rsi', 'macd'. Call this tool once per indicator.
        curr_date (str): The current trading date you are trading on, YYYY-mm-dd
        look_back_days (int): How many days to look back, default is 30
    Returns:
        str: A formatted dataframe containing the technical indicators for the specified stock code and indicator.
    """
    # Validate symbol is a numeric stock code, not a Chinese concept name
    if not _ASTOCK_CODE_RE.match(symbol.strip().upper()):
        if any('\u4e00' <= ch <= '\u9fff' for ch in symbol):
            raise ValueError(
                f"[get_indicators] 参数错误: '{symbol}' 不是股票代码，而是中文名称或概念题材。"
                f"请使用6位数字股票代码（如 600519），不要传入中文名称。"
            )
    # LLMs sometimes pass multiple indicators as a comma-separated string;
    # split and process each individually.
    indicators = [i.strip().lower() for i in indicator.split(",") if i.strip()]
    results = []
    for ind in indicators:
        try:
            results.append(route_to_vendor("get_indicators", symbol, ind, curr_date, look_back_days))
        except ValueError as e:
            results.append(str(e))
    return "\n\n".join(results)
