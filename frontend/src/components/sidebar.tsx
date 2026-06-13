import React, { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible } from "@/components/ui/collapsible";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { resolveTicker, resolveTickerWithName, getHistory, getModels, type TaskInfo } from "@/lib/api";
import type { HistoryEntry, ModelCatalog, AnalysisConfig } from "@/lib/types";
import { PROVIDERS } from "@/lib/types";

const DEFAULT_MODELS: Record<string, { quick: string; deep: string }> = {
  deepseek: { quick: "deepseek-v4-flash", deep: "deepseek-v4-pro" },
  minimax: { quick: "MiniMax-M2.7-highspeed", deep: "MiniMax-M2.7" },
  qwen: { quick: "qwen-turbo-latest", deep: "qwen-plus-latest" },
  glm: { quick: "glm-4-flash", deep: "glm-4-plus" },
  openai: { quick: "gpt-4o-mini", deep: "o3-mini" },
  anthropic: { quick: "claude-3-5-haiku-latest", deep: "claude-3-5-sonnet-latest" },
  google: { quick: "gemini-2.0-flash", deep: "gemini-2.0-pro" },
  xai: { quick: "grok-3-mini", deep: "grok-3" },
  ollama: { quick: "qwen2.5:7b", deep: "qwen2.5:72b" },
};

function GroupedDate({ dateLabel, count, children }: { dateLabel: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="rounded-xl border border-[#1a1a1a] bg-[#0d0d0d] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-xs text-[#888] hover:text-[#f0ede8] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium">{dateLabel}</span>
          <span className="text-[#555]">({count})</span>
        </div>
      </button>
      <div className={cn("transition-all duration-200 overflow-hidden", open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0")}>
        <div className="px-3 pb-3 space-y-1">{children}</div>
      </div>
    </div>
  );
}

interface SidebarProps {
  isRunning: boolean;
  tasks: TaskInfo[];
  runningProgress: { currentStage: string; completedStages: string[]; elapsed: number } | null;
  runningDisplayName: string;
  historyRefreshCounter: number;
  onStartMultiple: (tickers: string[], config: Omit<AnalysisConfig, 'ticker'>) => void;
  onStopAnalysis: () => void;
  onLoadHistory: (path: string) => void;
  onCancelTask: (taskId: string) => void;
  onShowProgress: (taskId: string) => void;
  onShowResult: (taskId: string) => void;
}

export default function Sidebar({
  isRunning,
  tasks,
  runningProgress,
  runningDisplayName,
  historyRefreshCounter,
  onStartMultiple,
  onStopAnalysis,
  onLoadHistory,
  onCancelTask,
  onShowProgress,
  onShowResult,
}: SidebarProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [tickerInput, setTickerInput] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [provider, setProvider] = useState("deepseek");
  const [quickModel, setQuickModel] = useState("");
  const [deepModel, setDeepModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState<ModelCatalog | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [resolving, setResolving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const loadHistoryData = useCallback(() => {
    setIsLoadingHistory(true);
    getHistory().then(h => setHistory(h)).catch(() => {}).finally(() => setIsLoadingHistory(false));
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      getHistory().then(h => setHistory(h)),
      new Promise(r => setTimeout(r, 800)),
    ]);
    setIsRefreshing(false);
  }, []);

  useEffect(() => { loadHistoryData(); }, [loadHistoryData]);
  
  // Refresh history when trigger counter changes (e.g. analysis completes)
  useEffect(() => {
    if (historyRefreshCounter > 0) {
      getHistory().then(h => setHistory(h)).catch(() => {});
    }
  }, [historyRefreshCounter]);



  useEffect(() => {
    getModels(provider).then(m => {
      setModels(m);
      if (m && m.quick.length > 0 && m.deep.length > 0) {
        setQuickModel(m.quick[0]?.value || "");
        setDeepModel(m.deep[0]?.value || "");
      } else {
        const defaults = DEFAULT_MODELS[provider] || DEFAULT_MODELS.deepseek;
        setQuickModel(defaults.quick);
        setDeepModel(defaults.deep);
      }
    });
  }, [provider]);

  const baseConfig = useCallback(() => ({
    tradeDate,
    llmProvider: provider,
    quickThinkLlm: quickModel,
    deepThinkLlm: deepModel,
    baseUrl: baseUrl || undefined,
  }), [tradeDate, provider, quickModel, deepModel, baseUrl]);

  const getTickers = useCallback((): string[] => {
    return tickerInput
      .split(/[,，\n\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }, [tickerInput]);

  const handleStart = useCallback(async () => {
    const tickers = getTickers();
    if (tickers.length === 0) return;
    setError(""); setSuccessMsg(""); setResolving(true);
    try {
      // Resolve all tickers sequentially
      const resolved: { code: string; name: string }[] = [];
      for (const raw of tickers) {
        try {
          const { code, displayName } = await resolveTickerWithName(raw);
          resolved.push({ code, name: displayName || code });
        } catch {
          setError(`无法识别: ${raw}`);
          setResolving(false);
          return;
        }
      }
      const codes = resolved.map(r => r.code);
      const names = resolved.map(r => r.name).join(", ");
      setSuccessMsg(names.length > 20 ? `${codes.length} 只股票` : names);
      onStartMultiple(codes, baseConfig());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "解析失败");
    } finally { setResolving(false); }
  }, [getTickers, baseConfig, onStartMultiple]);

  return (
    <div className="flex h-full flex-col bg-[#0d0d0d] border-r border-[#1a1a1a]">
      {/* Logo */}
      <div className="px-4 pt-5 pb-3 text-center">
        <div className="text-base font-bold tracking-tight">
          <span className="text-[#ff5a1f]">Trading</span>
          <span className="text-[#e8e6e1]">Agents</span>
          <span className="text-[#e8e6e1]">-</span>
          <span className="text-[#ff5a1f]">Astock</span>
        </div>
        <div className="text-[11px] text-[#555] mt-0.5 tracking-wider">A股多Agent投研系统</div>
      </div>

      <div className="mx-4 h-px bg-[#1a1a1a]" />

      {/* New Analysis */}
      <div className="px-4 py-3 space-y-2.5">
        <h4 className="text-xs font-semibold text-[#888] tracking-wider uppercase">新建分析</h4>

        <div className="space-y-2.5">
          <Input
            placeholder="股票代码，多只用逗号分隔"
            value={tickerInput}
            onChange={e => { setTickerInput(e.target.value); setError(""); setSuccessMsg(""); }}
            onKeyDown={e => { if (e.key === "Enter" && tickerInput.trim() && !resolving) { handleStart(); } }}
            disabled={isRunning || resolving}
          />

          <div>
            <span className="block text-xs text-[#888] mb-1 font-medium">数据日期</span>
            <div className="relative">
              <input
                ref={dateInputRef}
                type="date"
                value={tradeDate}
                onChange={e => setTradeDate(e.target.value)}
                disabled={isRunning || resolving}
                className="w-full h-10 rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-[#f0ede8] focus:outline-none focus:border-[#ff5a1f] focus:ring-1 focus:ring-[#ff5a1f]/30 disabled:opacity-40 transition-colors [color-scheme:dark]"
              />
              {/* 透明覆盖层：点击整个区域触发日期选择 */}
              <div
                onClick={() => dateInputRef.current?.showPicker()}
                className="absolute inset-0 cursor-pointer"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              />
            </div>
          </div>

          <Collapsible title="⚙️ 模型配置" defaultOpen={false}>
            <div className="space-y-2.5 pt-1">
              <Select value={provider} onChange={e => { setProvider(e.target.value); setQuickModel(""); setDeepModel(""); }} disabled={isRunning}>
                {PROVIDERS.map(p => (<option key={p.value} value={p.value}>{p.label}</option>))}
              </Select>

              {models ? (
                <>
                  <Select value={quickModel} onChange={e => setQuickModel(e.target.value)} disabled={isRunning}>
                    {models.quick.map(m => (<option key={m.value} value={m.value}>{m.label}</option>))}
                  </Select>
                  <Select value={deepModel} onChange={e => setDeepModel(e.target.value)} disabled={isRunning}>
                    {models.deep.map(m => (<option key={m.value} value={m.value}>{m.label}</option>))}
                  </Select>
                </>
              ) : (
                <>
                  <Input value={quickModel} onChange={e => setQuickModel(e.target.value)} placeholder="快速模型 ID" disabled={isRunning} />
                  <Input value={deepModel} onChange={e => setDeepModel(e.target.value)} placeholder="深度模型 ID" disabled={isRunning} />
                </>
              )}

              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="API Base URL (可选)" disabled={isRunning} />
            </div>
          </Collapsible>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {successMsg && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {successMsg}
            </div>
          )}

          {isRunning ? (
            <Button variant="secondary" className="w-full" onClick={onStopAnalysis}>
              <svg className="w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              停止分析
            </Button>
          ) : (
            <Button className="w-full" disabled={!tickerInput.trim() || resolving} onClick={handleStart}>
              {resolving ? "解析中…" : "开始分析"}
            </Button>
          )}
        </div>
      </div>

      <div className="mx-5 h-px bg-[#1a1a1a]" />

      {/* History */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-xs font-semibold text-[#888] tracking-wider uppercase">历史记录</h4>
          <button onClick={handleRefresh} disabled={isRefreshing} className="text-[#555] hover:text-[#ff5a1f] transition-colors text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">{isRefreshing || isLoadingHistory ? "加载中…" : "刷新"}</button>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-[#444]">暂无历史记录</p>
        ) : (
          <div className="space-y-2.5">
            {(() => {
              // Group by date
              const groups: Record<string, typeof history> = {};
              for (const entry of history) {
                if (!groups[entry.date]) groups[entry.date] = [];
                groups[entry.date].push(entry);
              }
              const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
              return sortedDates.map(date => {
                const entries = groups[date];
                const dateLabel = date.replace(/-/g, '/');
                return (
                  <GroupedDate
                    key={date}
                    dateLabel={dateLabel}
                    count={entries.length}
                  >
                    {entries.map((entry, i) => {
                      const signalBadge = entry.signal !== "N/A" ? (
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                          entry.signal === "Buy" ? "bg-emerald-500/15 text-emerald-400" :
                          entry.signal === "Sell" ? "bg-red-500/15 text-red-400" :
                          "bg-yellow-500/15 text-yellow-400"
                        }`}>{entry.signal}</span>
                      ) : null;
                      const reportName = entry.display_name || entry.ticker;
                      return (
                        <button
                          key={`${entry.ticker}-${entry.date}-${i}`}
                          onClick={() => onLoadHistory(entry.path)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#333] hover:bg-[#111] transition-all cursor-pointer group text-left"
                        >
                          {signalBadge}
                          <span className="text-[#f0ede8] font-medium truncate flex-1">{reportName}</span>
                          <span className="text-[#444] group-hover:text-[#666] transition-colors flex-shrink-0">{entry.time.slice(11, 16)}</span>
                        </button>
                      );
                    })}
                  </GroupedDate>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Task Queue — clickable items */}
      {tasks.length > 0 && (
        <div className="px-4 py-3 border-t border-[#1a1a1a]">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-semibold text-[#888] tracking-wider uppercase">任务队列</h4>
            <span className="text-[10px] text-[#555]">
              {tasks.filter(t => t.status === "running").length} 运行中
              · {tasks.filter(t => t.status === "pending").length} 排队中
            </span>
          </div>
          <div className="space-y-1">
            {tasks.map(t => {
              const isRunning = t.status === "running";
              const isComplete = t.status === "complete";
              const isError = t.status === "error";
              const isPending_ = t.status === "pending";
              const statusIcon = isRunning ? "🔄" :
                isPending_ ? "⏳" :
                isComplete ? "✅" :
                isError ? "❌" : "⏹️";
              const statusText = isRunning ? "分析中" :
                isPending_ ? "排队中" :
                isComplete ? "已完成" :
                isError ? "失败" : "已取消";
              // Running task progress data (from the running task)
              const isThisRunning = isRunning && runningProgress !== null;
              const completedCount = isThisRunning ? runningProgress.completedStages.length : 0;
              const totalStages = 12;
              const progressPct = completedCount / totalStages;
              const elapsedStr = isThisRunning
                ? `${Math.floor((runningProgress.elapsed || 0) / 60)}:${String(Math.floor((runningProgress.elapsed || 0) % 60)).padStart(2, '0')}`
                : "";
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (isRunning) onShowProgress(t.id);
                    else if (isComplete) onShowResult(t.id);
                    else if (isError) onShowResult(t.id);
                  }}
                  className="w-full text-left flex flex-col gap-1 px-2.5 py-2 rounded-lg text-xs bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#333] hover:bg-[#111] transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-shrink-0">{statusIcon}</span>
                    <span className="flex-1 truncate text-[#e8e6e1] font-medium">
                      {t.status === "running" && runningDisplayName ? runningDisplayName : (t.displayName || t.ticker)}
                    </span>
                    <span className="text-[10px] text-[#555] flex-shrink-0">{statusText}</span>
                    {(isRunning || isPending_) && (
                      <span
                        onClick={(e) => { e.stopPropagation(); onCancelTask(t.id); }}
                        className="text-[#444] hover:text-red-400 transition-colors flex-shrink-0 cursor-pointer"
                        title="取消任务"
                      >✕</span>
                    )}
                  </div>
                  {/* Mini progress bar for running task */}
                  {isThisRunning && (
                    <div className="flex items-center gap-2 pl-5">
                      <div className="flex-1 h-1 rounded-full bg-[#1a1a1a] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#ff5a1f] transition-all duration-500"
                          style={{ width: `${Math.max(progressPct * 100, 3)}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-[#555] whitespace-nowrap">
                        {completedCount}/{totalStages} {elapsedStr}
                      </span>
                    </div>
                  )}
                  {isThisRunning && runningProgress.currentStage !== "initializing" && (
                    <div className="pl-5 text-[9px] text-[#666] truncate">
                      {runningProgress.currentStage ? `当前: ${runningProgress.currentStage}` : ""}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-4 h-px bg-[#1a1a1a]" />
      <div className="px-4 py-2.5 text-[9px] text-[#333] text-center leading-relaxed">
        仅供学习研究 · 不构成投资建议
      </div>
    </div>
  );
}
