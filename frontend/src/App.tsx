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
  | { type: "complete"; result: AnalysisResult }
  | { type: "error"; message: string };

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
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [historyRefreshCounter, setHistoryRefreshCounter] = useState(0);

  // Track completed results keyed by task id so we can show them on demand
  const [completedResults, setCompletedResults] = useState<Record<string, AnalysisResult>>({});

  // Poll task list only when there are active tasks
  const [shouldPoll, setShouldPoll] = useState(true);
  useEffect(() => {
    const hasActive = tasks.some(t => t.status === "running" || t.status === "pending");
    setShouldPoll(hasActive);
  }, [tasks]);

  useEffect(() => {
    if (!shouldPoll) return;
    const poll = () => {
      listTasks().then(setTasks).catch(() => {});
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, [shouldPoll]);

  const activeRunningTask = useMemo(() => findRunningTask(tasks), [tasks]);
  const latestCompletedTask = useMemo(() => findLatestCompleted(tasks), [tasks]);
  const hasPending = useMemo(() => tasks.some(t => t.status === "pending"), [tasks]);

  const [displayName, setDisplayName] = useState("");

  // ── Progress polling (always on when a running task exists) ──
  const [progress, setProgress] = useState<ProgressState | null>(null);

  // Keep progress polling alive regardless of the current view
  const prevRunningIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!activeRunningTask) {
      if (prevRunningIdRef.current) {
        setProgress(null);
        prevRunningIdRef.current = undefined;
      }
      return;
    }
    prevRunningIdRef.current = activeRunningTask.id;

    setDisplayName(prev => prev || activeRunningTask.displayName || activeRunningTask.ticker);

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

  // ── Auto-collect completed results ──
  const prevCompleteIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const completedTasks = tasks.filter(t => t.status === "complete");
    for (const t of completedTasks) {
      if (prevCompleteIdsRef.current.has(t.id)) continue;
      prevCompleteIdsRef.current.add(t.id);
      getTaskResult(t.id).then(res => {
        if (res.status === "complete" && res.result) {
          setCompletedResults(prev => ({
            ...prev,
            [t.id]: res.result as AnalysisResult,
          }));
        }
      }).catch(() => {});
    }
  }, [tasks]);

  // ── Auto-complete: when all running tasks finish → auto-show result + refresh history ──
  const prevRunningIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const runningIds = new Set(tasks.filter(t => t.status === "running").map(t => t.id));
    // Detect transition: was running → now nothing running
    if (prevRunningIdsRef.current.size > 0 && runningIds.size === 0 && !hasPending) {
      // Auto-switch to the latest completed result
      const latest = findLatestCompleted(tasks);
      if (latest && completedResults[latest.id]) {
        setState({ type: "complete", result: completedResults[latest.id] });
      }
      // Refresh sidebar history
      setHistoryRefreshCounter(c => c + 1);
    }
    prevRunningIdsRef.current = runningIds;
  }, [tasks, completedResults, hasPending]);

  const historyPathRef = useRef<string>("");

  const handleLoadHistory = useCallback(async (path: string) => {
    historyPathRef.current = path;
    try {
      const result = await loadHistory(path);
      setState({ type: "complete", result });
    } catch (e: any) {
      setState({ type: "error", message: e.message || "加载历史报告失败" });
    }
  }, []);

  const handleStartMultiple = useCallback(async (tickers: string[], baseConfig: Omit<AnalysisConfig, "ticker">) => {
    setDisplayName("");
    setProgress(null);
    if (tickers.length > 0) {
      try {
        const m = await import("@/lib/api");
        const resolved = await m.resolveTickerWithName(tickers[0]);
        if (resolved.displayName && resolved.displayName !== tickers[0]) {
          setDisplayName(resolved.displayName);
        }
      } catch {}
    }
    // Switch to running view — progress polling will pick it up
    setState({ type: "loading", target: "analysis" });
    for (const ticker of tickers) {
      try {
        await startAnalysis({ ticker, ...baseConfig });
      } catch {}
    }
  }, []);

  const handleShowProgress = useCallback((taskId: string) => {
    setState({ type: "running", taskId });
  }, []);

  const handleShowResult = useCallback((taskId: string) => {
    const result = completedResults[taskId];
    if (result) {
      setState({ type: "complete", result });
    }
  }, [completedResults]);

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
  }, [activeRunningTask]);

  const handleBackToIdle = useCallback(() => {
    setState({ type: "idle" });
  }, []);

  // ── Render ──
  const renderMainContent = () => {
    switch (state.type) {
      case "idle":
        return <WelcomeScreen />;
      case "loading":
        return <LoadingScreen label={state.target === "history" ? "正在加载历史报告…" : "正在启动分析…"} />;
      case "running":
        return progress
          ? <ProgressPanel progress={progress} displayName={displayName || progress.analysisId} />
          : <LoadingScreen label="正在启动分析…" />;
      case "complete":
        return <ReportViewer result={state.result} historyPath={historyPathRef.current} onBack={handleBackToIdle} />;
      case "error":
        return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fadeIn">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl mb-4">❌</div>
            <div className="text-base text-red-400 mb-6">{state.message}</div>
            <button onClick={() => setState({ type: "idle" })}
              className="px-5 py-2 rounded-lg bg-[#111] border border-[#222] text-sm text-[#888] hover:text-[#f0ede8] hover:border-[#444] transition-all cursor-pointer"
            >重新开始</button>
          </div>
        );
      default:
        return <WelcomeScreen />;
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <aside className="w-72 flex-shrink-0">
        <Sidebar
          isRunning={!!activeRunningTask}
          tasks={tasks}
          runningProgress={progress}
          runningDisplayName={displayName}
          historyRefreshCounter={historyRefreshCounter}
          onStartMultiple={handleStartMultiple}
          onStopAnalysis={handleStop}
          onLoadHistory={handleLoadHistory}
          onCancelTask={handleCancelTask}
          onShowProgress={handleShowProgress}
          onShowResult={handleShowResult}
        />
      </aside>
      <main className="flex-1 overflow-auto relative">
        <div className="p-6 lg:p-10 min-h-full">
          {renderMainContent()}
        </div>
      </main>
    </div>
  );
}
