"""Render the completed analysis report with expandable sections and PDF download."""

from __future__ import annotations

import re
from typing import Any

import streamlit as st

from tradingagents.dataflows.a_stock import get_stock_display_name
from web.pdf_export import generate_markdown, generate_pdf


def _strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL).strip()


def _signal_style(signal: str) -> tuple[str, str]:
    """Map a 5-tier or 3-tier rating to (colour, Chinese label)."""
    s = signal.upper()
    if "BUY" in s or "OVERWEIGHT" in s:
        return "#22c55e", "买入"
    if "SELL" in s or "UNDERWEIGHT" in s:
        return "#ef4444", "卖出"
    return "#fbbf24", "持有"


_ANALYST_SECTIONS = [
    ("market_report", "📊 技术分析"),
    ("sentiment_report", "💬 市场情绪"),
    ("news_report", "📰 新闻舆情"),
    ("fundamentals_report", "📋 基本面"),
    ("policy_report", "🏛️ 政策分析"),
    ("hot_money_report", "🔥 游资追踪"),
    ("lockup_report", "🔒 解禁/减持"),
]


def render_report(
    final_state: dict[str, Any],
    ticker: str,
    trade_date: str,
    signal: str,
    elapsed: float | None = None,
) -> None:
    """Render the full analysis report."""

    color, cn_signal = _signal_style(signal)
    display_name = get_stock_display_name(ticker)
    date_compact = trade_date.replace("-", "")

    stats_html = ""
    if elapsed is not None:
        m, s = divmod(int(elapsed), 60)
        stats_html = f'<div style="font-size:0.9rem; color:#888; margin-top:0.3rem;">耗时 {m}:{s:02d}</div>'

    st.markdown(
        f"""
        <div style="
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 1px solid #333;
            border-radius: 16px;
            padding: 2rem;
            text-align: center;
            margin: 1rem 0 2rem;
        ">
            <div style="font-size:0.9rem; color:#888; letter-spacing:2px;">TRADING SIGNAL</div>
            <div style="font-size:3.5rem; font-weight:900; color:{color}; margin:0.3rem 0;">
                {signal.upper()}
            </div>
            <div style="font-size:1.2rem; color:#f5f1eb;">
                {display_name} · {trade_date}
            </div>
            {stats_html}
        </div>
        """,
        unsafe_allow_html=True,
    )

    st.caption("⚠️ 本报告由 AI 自动生成，仅供学习研究，不构成投资建议。")

    # Download buttons — use st.link_button as a diagnostic first
    md_text = generate_markdown(final_state, ticker, trade_date, signal)
    import base64 as _b64

    col1, col2, col3 = st.columns([0.6, 0.6, 4])
    with col1:
        b64 = _b64.b64encode(md_text.encode("utf-8")).decode()
        href = f"data:text/markdown;base64,{b64}"
        st.link_button("下载 MD", url=href, help="下载 Markdown 报告")
    with col2:
        try:
            pdf_bytes = generate_pdf(final_state, ticker, trade_date, signal)
            b64 = _b64.b64encode(pdf_bytes).decode()
            href = f"data:application/pdf;base64,{b64}"
            st.link_button("下载 PDF", url=href, help="下载 PDF 报告")
        except Exception:
            pass

    st.markdown("---")

    inv_plan = final_state.get("investment_plan", "")
    if inv_plan:
        st.markdown("### 👔 最终投资建议")
        st.markdown(_strip_think(str(inv_plan)))
        st.markdown("---")

    st.markdown("### 📊 分析师报告")

    for key, title in _ANALYST_SECTIONS:
        content = final_state.get(key, "")
        if not content:
            continue
        with st.expander(title, expanded=False):
            st.markdown(_strip_think(str(content)))

    debate = final_state.get("investment_debate_state")
    if debate and isinstance(debate, dict):
        st.markdown("### ⚔️ 多空辩论")
        tab_bull, tab_bear, tab_judge = st.tabs(["多方", "空方", "研究经理"])
        with tab_bull:
            st.markdown(_strip_think(debate.get("bull_history", "") or "无数据"))
        with tab_bear:
            st.markdown(_strip_think(debate.get("bear_history", "") or "无数据"))
        with tab_judge:
            st.markdown(_strip_think(debate.get("judge_decision", "") or "无数据"))

    trader_decision = final_state.get("trader_investment_decision", "")
    if trader_decision:
        with st.expander("💹 交易员决策", expanded=False):
            st.markdown(_strip_think(str(trader_decision)))

    risk = final_state.get("risk_debate_state")
    if risk and isinstance(risk, dict):
        st.markdown("### 🛡️ 风控评估")
        tab_agg, tab_con, tab_neu, tab_rj = st.tabs(["激进", "保守", "中性", "风控决策"])
        with tab_agg:
            st.markdown(_strip_think(risk.get("aggressive_history", "") or "无数据"))
        with tab_con:
            st.markdown(_strip_think(risk.get("conservative_history", "") or "无数据"))
        with tab_neu:
            st.markdown(_strip_think(risk.get("neutral_history", "") or "无数据"))
        with tab_rj:
            st.markdown(_strip_think(risk.get("judge_decision", "") or "无数据"))

    dqs = final_state.get("data_quality_summary", "")
    if dqs:
        with st.expander("✅ 数据质量", expanded=False):
            st.markdown(str(dqs))
