import { useState, useCallback, useEffect, useRef } from "react";
import Sidebar from "@/components/sidebar";
import WelcomeScreen from "@/components/welcome-screen";
import LoadingScreen from "@/components/loading-screen";
import ProgressPanel from "@/components/progress-panel";
import ReportViewer from "@/components/report-viewer";
import { loadHistory } from "@/lib/api";
import { useAnalysis } from "@/hooks/use-analysis";
import type { AnalysisConfig, AnalysisResult } from "@/lib/types";

type AppState =
  | { type: "idle" }
  | { type: "loading"; target: "history" | "analysis" }
  | { type: "running" }
  | { type: "complete"; result: AnalysisResult }
  | { type: "error"; message: string };

export default function App() {
  const [state, setState] = useState<AppState>({ type: "idle" });
  const [displayName, setDisplayName] = useState("");

  const { progress, result, error, isRunning, start, stop, taskId } = useAnalysis();



  useEffect(() => {
    if (result) setState({ type: "complete", result });
  }, [result]);

  useEffect(() => {
    if (error) setState(prev => prev.type === "complete" ? prev : { type: "error", message: error });
  }, [error]);

  useEffect(() => {
    if (isRunning) setState({ type: "running" });
    else if (!result && !error) setState(prev => (prev.type === "running" || prev.type === "loading") ? { type: "idle" } : prev);
  }, [isRunning, result, error]);

  const handleStart = useCallback((config: AnalysisConfig) => {
    setState({ type: "loading", target: "analysis" });
    setDisplayName(config.ticker);
    // Resolve stock name for better display
    import("@/lib/api").then(api => api.resolveTickerWithName(config.ticker)).then(({ displayName }) => {
      if (displayName && displayName !== config.ticker) setDisplayName(displayName);
    }).catch(() => {});
    start(config);
  }, [start]);

  const handleStop = useCallback(() => { stop(); setState({ type: "idle" }); }, [stop]);

  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const historyPathRef = useRef<string>("");

  const handleLoadHistory = useCallback(async (path: string) => {
    historyPathRef.current = path;
    setIsHistoryLoading(true);
    // 等待至少 500ms 确保 Loading 动画可见后再发起请求
    const [result] = await Promise.all([
      loadHistory(path),
      new Promise(r => setTimeout(r, 800)),
    ]);
    setState({ type: "complete", result });
    setIsHistoryLoading(false);
  }, []);

  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <aside className="w-72 flex-shrink-0">
        <Sidebar isRunning={isRunning} onStartAnalysis={handleStart} onStopAnalysis={handleStop} onLoadHistory={handleLoadHistory} />
      </aside>
      <main className="flex-1 overflow-auto relative">
        {/* Loading overlay for history */}
        {isHistoryLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-sm">
            <LoadingScreen label="正在加载历史报告…" />
          </div>
        )}
        <div className="p-6 lg:p-10 min-h-full">
          {state.type === "idle" && <WelcomeScreen />}
          {state.type === "loading" && state.target !== "history" && <LoadingScreen label="正在启动分析…" />}
          {state.type === "running" && (progress ? <ProgressPanel progress={progress} displayName={displayName} /> : <LoadingScreen label="正在启动分析…" />)}
          {state.type === "complete" && <ReportViewer result={state.result} historyPath={historyPathRef.current} />}
          {state.type === "error" && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fadeIn">
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl mb-4">❌</div>
              <div className="text-base text-red-400 mb-6">{state.message}</div>
              <button onClick={() => setState({ type: "idle" })} className="px-5 py-2 rounded-lg bg-[#111] border border-[#222] text-sm text-[#888] hover:text-[#f0ede8] hover:border-[#444] transition-all cursor-pointer">
                重新开始
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
