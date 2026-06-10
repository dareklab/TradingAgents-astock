import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import Sidebar from "@/components/sidebar";
import WelcomeScreen from "@/components/welcome-screen";
import LoadingScreen from "@/components/loading-screen";
import ProgressPanel from "@/components/progress-panel";
import ReportViewer from "@/components/report-viewer";
import { loadHistory, listTasks, cancelTask, getTask, getTaskResult, startAnalysis, type TaskInfo } from "@/lib/api";
import type { AnalysisConfig, AnalysisResult, ProgressState } from "@/lib/types";

type AppState =
  | { type: "idle" }
  | { type: "loading"; target: "history" | "analysis" }
  | { type: "running"; taskId: string }
  | { type: "complete"; result: AnalysisResult; taskId?: string }
  | { type: "error"; message: string };

// ── Helpers ────────────────────────────────────────────────────────
function findRunningTask(tasks: TaskInfo[]): TaskInfo | undefined {
  return tasks.find(t => t.status === "running");
}

function findLatestCompleted(tasks: TaskInfo[]): TaskInfo | undefined {
  const done = tasks.filter(t => t.status === "complete");
  done.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return done[0];
}

export default function App() {
  const [state, setState] = useState<AppState>({ type: "idle" });

  // Poll task list periodically
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  useEffect(() => {
    const poll = () => {
      listTasks().then(setTasks).catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  // Result and error (set from completed tasks)
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Derive state from the polled task list
  const activeRunningTask = useMemo(() => findRunningTask(tasks), [tasks]);
  const latestCompletedTask = useMemo(() => findLatestCompleted(tasks), [tasks]);
  const hasPending = useMemo(() => tasks.some(t => t.status === "pending"), [tasks]);

  // Display name for currently running task
  const [displayName, setDisplayName] = useState("");

  // When a running task appears, switch to progress view
  useEffect(() => {
    if (activeRunningTask) {
      // Only overwrite displayName if not already resolved by handleStartMultiple
      setDisplayName(prev => prev || activeRunningTask.displayName || activeRunningTask.ticker);
      setState({ type: "running", taskId: activeRunningTask.id });
    } else if (hasPending) {
      setState({ type: "loading", target: "analysis" });
    } else if (!activeRunningTask && tasks.length === 0 && state.type !== "complete" && state.type !== "error") {
      setState({ type: "idle" });
    }
  }, [activeRunningTask, hasPending]);

  // Poll the active running task for detailed progress
  const [progress, setProgress] = useState<ProgressState | null>(null);
  useEffect(() => {
    if (!activeRunningTask) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const info = await getTask(activeRunningTask.id);
        if (cancelled) return;
        setProgress({
          analysisId: activeRunningTask.id,
          stage: info.currentStage,
          completedStages: info.completedStages,
          currentStage: info.currentStage,
          llmCalls: info.llmCalls,
          toolCalls: info.toolCalls,
          tokensIn: info.tokensIn,
          tokensOut: info.tokensOut,
          dataHealth: {},
          stageReports: (info.progress?.stageReports as Record<string, string>) || {},
          elapsed: info.elapsed,
        });
      } catch {}
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [activeRunningTask?.id]);

  // Watch for completion — when running task finishes and a completed task appears
  const prevLatestCompletedIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (latestCompletedTask && !activeRunningTask && !hasPending && state.type !== "complete" && state.type !== "error") {
      // Avoid re-fetching the same completed task
      if (prevLatestCompletedIdRef.current === latestCompletedTask.id) return;
      prevLatestCompletedIdRef.current = latestCompletedTask.id;

      getTaskResult(latestCompletedTask.id).then(res => {
        if (res.status === "complete" && res.result) {
          setResult(res.result as AnalysisResult);
          setState({ type: "complete", result: res.result as AnalysisResult, taskId: latestCompletedTask.id });
        } else if (res.status === "error") {
          setError(res.error || "分析失败");
          setState({ type: "error", message: res.error || "分析失败" });
        }
      }).catch(() => {});
    }
  }, [latestCompletedTask, activeRunningTask, hasPending, state.type]);

  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const historyPathRef = useRef<string>("");

  const handleLoadHistory = useCallback(async (path: string) => {
    historyPathRef.current = path;
    setIsHistoryLoading(true);
    const [result] = await Promise.all([
      loadHistory(path),
      new Promise(r => setTimeout(r, 800)),
    ]);
    setState({ type: "complete", result });
    setIsHistoryLoading(false);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleStartMultiple = useCallback(async (tickers: string[], baseConfig: Omit<AnalysisConfig, "ticker">) => {
    setResult(null);
    setError(null);
    setProgress(null);
    prevLatestCompletedIdRef.current = undefined;
    // Resolve display name for the first ticker
    if (tickers.length > 0) {
      try {
        const m = await import("@/lib/api");
        const resolved = await m.resolveTickerWithName(tickers[0]);
        if (resolved.displayName && resolved.displayName !== tickers[0]) {
          setDisplayName(resolved.displayName);
        }
      } catch {}
    }
    setState({ type: "loading", target: "analysis" });
    // Submit all tickers — backend queues them sequentially
    for (const ticker of tickers) {
      try {
        await startAnalysis({ ticker, ...baseConfig });
      } catch { /* individual submission failure handled by task list */ }
    }
  }, []);

  const handleCancelTask = useCallback(async (tid: string) => {
    try {
      await cancelTask(tid);
    } catch {}
  }, []);

  const handleStop = useCallback(() => {
    if (activeRunningTask) {
      cancelTask(activeRunningTask.id).catch(() => {});
    }
    setState({ type: "idle" });
    setProgress(null);
    setResult(null);
    setError(null);
  }, [activeRunningTask]);

  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <aside className="w-72 flex-shrink-0">
        <Sidebar
          isRunning={state.type === "running" || state.type === "loading"}
          tasks={tasks}
          onStartMultiple={handleStartMultiple}
          onStopAnalysis={handleStop}
          onLoadHistory={handleLoadHistory}
          onCancelTask={handleCancelTask}
        />
      </aside>
      <main className="flex-1 overflow-auto relative">
        {isHistoryLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm">
            <LoadingScreen label="正在加载历史报告…" />
          </div>
        )}
        <div className="p-6 lg:p-10 min-h-full">
          {state.type === "idle" && <WelcomeScreen />}
          {state.type === "loading" && state.target !== "history" && <LoadingScreen label="正在启动分析…" />}
          {state.type === "running" && (progress ? <ProgressPanel progress={progress} displayName={displayName} /> : <LoadingScreen label="正在启动分析…" />)}
          {state.type === "complete" && <ReportViewer result={state.result ?? result!} historyPath={historyPathRef.current} />}
          {state.type === "error" && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl mb-4">❌</div>
              <div className="text-base text-red-400 mb-6">{state.message || error}</div>
              <button onClick={() => { setState({ type: "idle" }); setError(null); setResult(null); }}
                className="px-5 py-2 rounded-lg bg-[#111] border border-[#222] text-sm text-[#888] hover:text-[#f0ede8] hover:border-[#444] transition-all cursor-pointer"
              >
                重新开始
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
