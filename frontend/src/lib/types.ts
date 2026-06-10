// Analysis stage definitions matching progress.py
export interface Stage {
  id: string;
  name: string;
  icon: string;
}

export const PIPELINE_STAGES: Stage[] = [
  { id: "market", name: "技术分析", icon: "📊" },
  { id: "social", name: "情绪分析", icon: "💬" },
  { id: "news", name: "新闻舆情", icon: "📰" },
  { id: "fundamentals", name: "基本面", icon: "📋" },
  { id: "policy", name: "政策分析", icon: "🏛️" },
  { id: "hot_money", name: "游资追踪", icon: "🔥" },
  { id: "lockup", name: "解禁监控", icon: "🔒" },
  { id: "quality_gate", name: "质量门控", icon: "✅" },
  { id: "debate", name: "多空辩论", icon: "⚔️" },
  { id: "trader", name: "交易决策", icon: "💹" },
  { id: "risk", name: "风控评估", icon: "🛡️" },
  { id: "pm", name: "最终决策", icon: "👔" },
];

export const STAGE_IDS = PIPELINE_STAGES.map(s => s.id);

// Progress state from SSE stream
export interface ProgressState {
  analysisId: string;
  stage: string;
  completedStages: string[];
  currentStage: string;
  llmCalls: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  dataHealth: Record<string, { status: string; message: string }>;
  stageReports: Record<string, string>;
  error?: string;
}

// Full analysis result (sent when complete)
export interface AnalysisResult {
  ticker: string;
  tradeDate: string;
  signal: string;
  elapsed: number;
  display_name?: string;
  analysis_time?: string;
  rating?: string;
  state: {
    company_of_interest: string;
    trade_date: string;
    market_report: string;
    sentiment_report: string;
    news_report: string;
    fundamentals_report: string;
    policy_report: string;
    hot_money_report: string;
    lockup_report: string;
    data_quality_summary: string;
    investment_debate_state: DebateState;
    investment_plan: string;
    trader_investment_plan: string;
    risk_debate_state: RiskDebateState;
    final_trade_decision: string;
    past_context: string;
  };
}

export interface DebateState {
  bull_history: string;
  bear_history: string;
  history: string;
  current_response: string;
  judge_decision: string;
  count: number;
}

export interface RiskDebateState {
  aggressive_history: string;
  conservative_history: string;
  neutral_history: string;
  history: string;
  latest_speaker: string;
  current_aggressive_response: string;
  current_conservative_response: string;
  current_neutral_response: string;
  judge_decision: string;
  count: number;
}

export interface HistoryEntry {
  ticker: string;
  date: string;
  time: string;
  path: string;
  signal: string;
  display_name?: string;
}

export interface ModelOption {
  label: string;
  value: string;
}

export interface ModelCatalog {
  quick: ModelOption[];
  deep: ModelOption[];
}

// LLM providers
export const PROVIDERS = [
  { label: "DeepSeek（默认）", value: "deepseek" },
  { label: "MiniMax（国内直连）", value: "minimax" },
  { label: "通义千问 Qwen", value: "qwen" },
  { label: "智谱 GLM", value: "glm" },
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Google Gemini", value: "google" },
  { label: "xAI Grok", value: "xai" },
  { label: "Ollama（本地）", value: "ollama" },
];

export type PageState =
  | { type: "idle" }
  | { type: "loading"; target: "history" | "analysis" }
  | { type: "running"; analysisId: string }
  | { type: "complete"; result: AnalysisResult }
  | { type: "error"; message: string };

export interface AnalysisConfig {
  ticker: string;
  tradeDate: string;
  llmProvider: string;
  quickThinkLlm: string;
  deepThinkLlm: string;
  baseUrl?: string;
}
