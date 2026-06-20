"""Portfolio Manager: synthesises the risk-analyst debate into the final decision.

Uses LangChain's ``with_structured_output`` so the LLM produces a typed
``PortfolioDecision`` directly, in a single call.  The result is rendered
back to markdown for storage in ``final_trade_decision`` so memory log,
CLI display, and saved reports continue to consume the same shape they do
today.  When a provider does not expose structured output, the agent falls
back gracefully to free-text generation.
"""

from __future__ import annotations

from tradingagents.agents.schemas import PortfolioDecision, PortfolioRating, render_pm_decision
from tradingagents.agents.utils.agent_utils import (
    build_instrument_context,
    get_language_instruction,
)
from tradingagents.agents.utils.structured import (
    bind_structured,
    invoke_structured_or_freetext,
)


def create_portfolio_manager(llm):
    structured_llm = bind_structured(llm, PortfolioDecision, "Portfolio Manager")

    def portfolio_manager_node(state) -> dict:
        instrument_context = build_instrument_context(state["company_of_interest"])

        history = state["risk_debate_state"]["history"]
        risk_debate_state = state["risk_debate_state"]
        research_plan = state["investment_plan"]
        trader_plan = state["trader_investment_plan"]

        past_context = state.get("past_context", "")
        lessons_line = (
            f"- Lessons from prior decisions and outcomes:\n{past_context}\n"
            if past_context
            else ""
        )

        prompt = f"""As a short-term swing trader Portfolio Manager, synthesize the risk analysts' debate and deliver the final trading decision for a **1-3 trading day holding period** (max 5 days).

{instrument_context}

---

**A-Stock Trading Constraints** (must factor into your decision):
- T+1 settlement: shares bought today cannot be sold until the next trading day
- Daily price limits: main board ±10%, STAR/ChiNext ±20%, ST stocks ±5%
- Minimum lot size: 100 shares (1 手) for main board; 200 shares for STAR/ChiNext
- Trading hours: 09:30-11:30, 13:00-15:00 (Beijing time)
- ST/delisting risk: ST or *ST status signals regulatory warning; factor into position sizing
- Margin eligibility: not all A-shares are margin-eligible; assume cash-only unless stated

**Short-Term Swing Trading Rules** (CRITICAL — 3-day horizon, max 5):
- Your holding period is **up to 3 trading days, never more than 5** — prioritise setups with immediate catalysts, not long-term narratives
- Favor high-momentum signals from the Hot Money Tracker, short-term capital flows, and dragon-tiger board activity over slow-moving fundamentals
- Policy catalysts and lockup/block-trade events are especially relevant: they can resolve within your holding window
- Long-term fundamentals (PE mean-reversion, multi-quarter earnings trends) are secondary — only consider them if they align with an immediate catalyst
- Position sizing should reflect the shorter horizon: tighter stops, quicker profit-taking
- If no clear 1-3 day catalyst exists, err toward Hold/Underweight — do not stretch a long-term thesis into a short-term trade

---

**Rating Scale** (use exactly one):
- **Buy**: High-conviction short-term entry — clear catalyst, strong momentum, favourable risk/reward within 3 days
- **Overweight**: Constructive bias but wait for confirmation before adding size
- **Hold**: No compelling short-term edge; stand aside
- **Underweight**: Reduce exposure, lock in short-term profits, or scale out on weakening momentum
- **Sell**: Exit immediately — catalyst failed, momentum reversed, or risk/reward no longer justifies the position

**Context:**
- Research Manager's investment plan: **{research_plan}**
- Trader's transaction proposal: **{trader_plan}**
{lessons_line}
**Risk Analysts Debate History:**
{history}

---

Be decisive and ground every conclusion in specific short-term signals from the analysts.{get_language_instruction()}"""

        result = invoke_structured_or_freetext(
            structured_llm,
            llm,
            prompt,
            render_pm_decision,
            "Portfolio Manager",
            rating_extractor=lambda d: d.rating.value,
        )
        if isinstance(result, tuple):
            final_trade_decision, rating = result
        else:
            final_trade_decision = result
            # On free-text fallback, extract rating from the decision text immediately
            from tradingagents.agents.utils.rating import parse_rating
            rating = parse_rating(final_trade_decision)

        new_risk_debate_state = {
            "judge_decision": final_trade_decision,
            "history": risk_debate_state["history"],
            "aggressive_history": risk_debate_state["aggressive_history"],
            "conservative_history": risk_debate_state["conservative_history"],
            "neutral_history": risk_debate_state["neutral_history"],
            "latest_speaker": "Judge",
            "current_aggressive_response": risk_debate_state["current_aggressive_response"],
            "current_conservative_response": risk_debate_state["current_conservative_response"],
            "current_neutral_response": risk_debate_state["current_neutral_response"],
            "count": risk_debate_state["count"],
        }

        return {
            "risk_debate_state": new_risk_debate_state,
            "final_trade_decision": final_trade_decision,
            "rating": rating,
        }

    return portfolio_manager_node
