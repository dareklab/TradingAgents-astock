import { useState, useMemo } from "react";
import { marked } from "marked";
import type { AnalysisResult } from "@/lib/types";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Collapsible } from "@/components/ui/collapsible";
import { exportPdf } from "@/lib/api";

interface Props {
  result: AnalysisResult;
  historyPath?: string;
}

function signalStyle(signal: string): { color: string; bg: string; label: string } {
  const s = signal.toUpperCase();
  if (s.includes("BUY") || s.includes("OVERWEIGHT")) return { color: "#22c55e", bg: "rgba(34,197,94,0.1)", label: "买入" };
  if (s.includes("SELL") || s.includes("UNDERWEIGHT")) return { color: "#ef4444", bg: "rgba(239,68,68,0.1)", label: "卖出" };
  return { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "持有" };
}

function stripThink(text: string): string {
  return text.replace(/<think>.*?<\/think>\s*/gs, "").trim();
}

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return `<pre class="text-sm whitespace-pre-wrap">${text}</pre>`;
  }
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function MarkdownContent({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(stripThink(text)), [text]);
  return (
    <div
      className="prose-content text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const ANALYST_SECTIONS: [string, string, string][] = [
  ["market_report", "📊", "技术分析"],
  ["sentiment_report", "💬", "市场情绪"],
  ["news_report", "📰", "新闻舆情"],
  ["fundamentals_report", "📋", "基本面"],
  ["policy_report", "🏛️", "政策分析"],
  ["hot_money_report", "🔥", "游资追踪"],
  ["lockup_report", "🔒", "解禁/减持"],
];

export default function ReportViewer({ result, historyPath }: Props) {
  const { signal, elapsed, state } = result;
  const sc = signalStyle(signal);
  const [debateTab, setDebateTab] = useState("bull");
  const [riskTab, setRiskTab] = useState("judge");

  const elapsedStr = elapsed ? formatTime(elapsed) : "";

  return (
    <div className="animate-fadeIn space-y-6">
      {/* Signal Card */}
      <div className="relative overflow-hidden rounded-xl border border-[#222] bg-gradient-to-b from-[#0d0d0d] to-[#0a0a0a]">
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-[0.04]" style={{ background: `radial-gradient(circle, ${sc.color}, transparent)`, transform: "translate(20%, -20%)" }} />
        <div className="relative px-6 py-5 flex items-center gap-5">
          {/* Signal */}
          <div className="flex-shrink-0">
            <div className="text-[11px] text-[#555] tracking-[0.15em] mb-0.5 font-semibold">交易信号</div>
            <div className="text-4xl font-bold tracking-tight" style={{ color: sc.color }}>{signal.toUpperCase()}</div>
          </div>
          <div className="w-px h-12 bg-[#222]" />
          {/* Info */}
          <div className="flex-1 text-center">
            <div className="text-lg font-semibold text-[#f0ede8]">
              {result.display_name || result.ticker}
            </div>
            <div className="text-sm text-[#777] mt-1">
              分析时间：{result.analysis_time || state.trade_date}
              {elapsed > 0 && <span className="ml-4 text-[#555]">耗时 {elapsedStr}</span>}
            </div>
          </div>
          {/* Disclaimer */}
          <div className="hidden sm:block flex-shrink-0 text-[10px] text-[#333] leading-relaxed text-right max-w-[130px]">
            AI 自动生成 · 仅供参考
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {historyPath && (
          <button
            onClick={async () => {
              try {
                const blob = await exportPdf(historyPath);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${result.display_name || result.ticker}-${state.trade_date.replace(/-/g, "")}.pdf`;
                a.click(); URL.revokeObjectURL(url);
              } catch {
                // PDF generation failed, inform the user
                alert("PDF 生成失败，请使用 Markdown 导出。");
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111] border border-[#222] text-[11px] text-[#666] hover:text-[#f0ede8] hover:border-[#444] transition-all cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            下载 PDF
          </button>
        )}
        <button
          onClick={() => {
            const md = generateMarkdown(result);
            const blob = new Blob([md], { type: "text/markdown" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `${result.display_name || result.ticker}-${state.trade_date.replace(/-/g, "")}.md`;
            a.click(); URL.revokeObjectURL(url);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#111] border border-[#222] text-[11px] text-[#666] hover:text-[#f0ede8] hover:border-[#444] transition-all cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          下载 Markdown
        </button>
      </div>

      {/* Investment Plan */}
      {state.investment_plan && (
        <div className="p-5 rounded-lg bg-[#0d0d0d] border border-[#222]">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">👔</span>
            <h2 className="text-base font-bold text-[#f0ede8] tracking-tight">最终投资建议</h2>
          </div>
          <div className="pl-7">
            <MarkdownContent text={state.investment_plan} />
          </div>
        </div>
      )}

      {/* Analyst Reports */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">📊</span>
          <h2 className="text-base font-bold text-[#f0ede8] tracking-tight">分析师报告</h2>
        </div>
        <div className="space-y-1.5">
          {ANALYST_SECTIONS.map(([key, icon, title]) => {
            const content = (state as Record<string, string>)[key];
            if (!content) return null;
            return (
              <Collapsible key={key} title={`${icon} ${title}`} className="mb-0">
                <div className="max-h-96 overflow-y-auto">
                  <MarkdownContent text={content} />
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* Bull/Bear Debate */}
      {state.investment_debate_state && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">⚔️</span>
            <h2 className="text-base font-bold text-[#f0ede8] tracking-tight">多空辩论</h2>
          </div>
          <Tabs value={debateTab} onValueChange={setDebateTab}>
            <TabsList>
              <TabsTrigger value="bull">多方</TabsTrigger>
              <TabsTrigger value="bear">空方</TabsTrigger>
              <TabsTrigger value="judge">研究经理</TabsTrigger>
            </TabsList>
            <TabsContent value="bull">
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#222]">
                <MarkdownContent text={state.investment_debate_state.bull_history || "无数据"} />
              </div>
            </TabsContent>
            <TabsContent value="bear">
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#222]">
                <MarkdownContent text={state.investment_debate_state.bear_history || "无数据"} />
              </div>
            </TabsContent>
            <TabsContent value="judge">
              <div className="bg-[#0d0d0d] rounded-xl p-4 border border-[#222]">
                <MarkdownContent text={state.investment_debate_state.judge_decision || "无数据"} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Trader */}
      {state.trader_investment_plan && (
        <div>
          <Collapsible title="💹 交易员决策" className="mb-0">
            <MarkdownContent text={state.trader_investment_plan} />
          </Collapsible>
        </div>
      )}

      {/* Risk */}
      {state.risk_debate_state && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🛡️</span>
            <h2 className="text-base font-bold text-[#f0ede8] tracking-tight">风控评估</h2>
          </div>
          <Tabs value={riskTab} onValueChange={setRiskTab}>
            <TabsList>
              <TabsTrigger value="judge">最终决策</TabsTrigger>
              <TabsTrigger value="aggressive">激进方</TabsTrigger>
              <TabsTrigger value="conservative">保守方</TabsTrigger>
              <TabsTrigger value="neutral">中性方</TabsTrigger>
            </TabsList>
            {(["judge","aggressive","conservative","neutral"] as const).map(k => {
              const contentMap = { aggressive: "aggressive_history", conservative: "conservative_history", neutral: "neutral_history", judge: "judge_decision" } as const;
              const content = state.risk_debate_state![contentMap[k]];
              const isEnPanel = k !== "judge";
              return (
                <TabsContent key={k} value={k}>
                  <div className="bg-[#0d0d0d] rounded-lg p-4 border border-[#222]">
                    {isEnPanel && (
                      <div className="mb-3 text-[10px] text-[#555] px-2.5 py-1 rounded bg-[#151515] border border-[#222] inline-block">
                        🌐 AI 原始分析（英文）
                      </div>
                    )}
                    <MarkdownContent text={content || "无数据"} />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      )}

      {/* Data Quality */}
      {state.data_quality_summary && (
        <div>
          <Collapsible title="✅ 数据质量" className="mb-0">
            <div className="text-sm text-[#888] leading-relaxed">
              <MarkdownContent text={state.data_quality_summary} />
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

function generateMarkdown(result: AnalysisResult): string {
  const { signal, state } = result;
  const displayName = state.company_of_interest;
  const dateCompact = state.trade_date.replace(/-/g, "");
  const lines: string[] = [
    `# ${displayName}-${dateCompact}`, "",
    `- **股票代码**：${state.company_of_interest}`,
    `- **数据日期**：${state.trade_date}`,
    `- **生成时间**：${new Date().toISOString().slice(0, 16)}`,
    `- **交易信号**：**${signal.toUpperCase()}**`, "",
    "> ⚠️ 本报告由 AI 多 Agent 系统自动生成，仅供学习研究与技术演示，不构成任何投资建议。", "", "---", "",
  ];
  const sections: [string, string][] = [
    ["技术分析", state.market_report], ["市场情绪", state.sentiment_report],
    ["新闻舆情", state.news_report], ["基本面", state.fundamentals_report],
    ["政策分析", state.policy_report], ["游资追踪", state.hot_money_report],
    ["解禁/减持", state.lockup_report],
  ];
  for (const [title, content] of sections) {
    if (content) lines.push(`## ${title}`, "", stripThink(content), "");
  }
  return lines.join("\n");
}
