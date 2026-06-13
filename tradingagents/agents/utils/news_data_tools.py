from langchain_core.tools import tool
from typing import Annotated
from tradingagents.dataflows.interface import route_to_vendor
from tradingagents.agents.utils.ticker_validation import validate_astock_code



@tool
def get_news(
    ticker: Annotated[str, "6-digit A-stock code (e.g. 600379). Must be numeric, NOT company name or Chinese text"],
    start_date: Annotated[str, "Start date in yyyy-mm-dd format"],
    end_date: Annotated[str, "End date in yyyy-mm-dd format"],
) -> str:
    """
    Retrieve news data for a given stock code.
    Uses the configured news_data vendor.
    Args:
        ticker (str): 6-digit A-stock code, e.g. 600379, 300750. Must be the numeric code, not the company name.
        start_date (str): Start date in yyyy-mm-dd format
        end_date (str): End date in yyyy-mm-dd format
    Returns:
        str: A formatted string containing news data
    """
    try:
        ticker = validate_astock_code(ticker, "get_news")
        return route_to_vendor("get_news", ticker, start_date, end_date)
    except ValueError as e:
        return "[数据获取警告] get_news 参数错误: " + str(e) + "\n请使用正确的6位数字股票代码重试。"

@tool
def get_global_news(
    curr_date: Annotated[str, "Current date in yyyy-mm-dd format"],
    look_back_days: Annotated[int, "Number of days to look back"] = 7,
    limit: Annotated[int, "Maximum number of articles to return"] = 5,
) -> str:
    """
    Retrieve global news data.
    Uses the configured news_data vendor.
    Args:
        curr_date (str): Current date in yyyy-mm-dd format
        look_back_days (int): Number of days to look back (default 7)
        limit (int): Maximum number of articles to return (default 5)
    Returns:
        str: A formatted string containing global news data
    """
    return route_to_vendor("get_global_news", curr_date, look_back_days, limit)

@tool
def get_insider_transactions(
    ticker: Annotated[str, "6-digit A-stock code (e.g. 600379). Must be numeric, NOT company name"],
) -> str:
    """
    Retrieve insider transaction information about a company.
    Uses the configured news_data vendor.
    Args:
        ticker (str): 6-digit A-stock code, e.g. 600379
    Returns:
        str: A report of insider transaction data
    """
    ticker = validate_astock_code(ticker, "get_insider_transactions")
    return route_to_vendor("get_insider_transactions", ticker)
