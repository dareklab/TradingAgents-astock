import { useState, useCallback, useRef, useEffect } from "react";
import type { AnalysisConfig, AnalysisResult, ProgressState } from "@/lib/types";
import { startAnalysis, getTask, cancelTask, listTasks, type TaskInfo } from "@/lib/api";

const POLL_INTERVAL = 2000; // 2 seconds

export function useAnalysis() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskInfo, setTaskInfo] = useState<TaskInfo | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for task progress
  useEffect(() => {
    if (!taskId) return;

    const poll = async () => {
      try {
        const info = await getTask(taskId);
        setTaskInfo(info);

        // Map task info to ProgressState
        setProgress({
          analysisId: taskId,
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

        if (info.status === "complete") {
          // Clear persisted taskId
          try { localStorage.removeItem("currentTaskId"); } catch {}
          // Fetch the actual result
          // Get result data from the complete state
          const resultRes = await fetch(`/api/tasks/${taskId}/result`).then(r => r.json());
          if (resultRes.status === "complete" && resultRes.result) {
            setResult(resultRes.result as AnalysisResult);
          }
          setIsRunning(false);
          setTaskId(null);
        } else if (info.status === "error") {
          try { localStorage.removeItem("currentTaskId"); } catch {}
          setError(info.error || "分析失败");
          setIsRunning(false);
          setTaskId(null);
        } else if (info.status === "cancelled") {
          try { localStorage.removeItem("currentTaskId"); } catch {}
          setError("用户中止分析");
          setIsRunning(false);
          setTaskId(null);
        }
      } catch {
        // poll failed, keep trying
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL);
    // Also poll immediately
    poll();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [taskId]);

  const start = useCallback(async (config: AnalysisConfig) => {
    setIsRunning(true);
    setProgress(null);
    setResult(null);
    setError(null);

    try {
      const response = await startAnalysis(config);
      setTaskId(response.taskId);
      // Persist taskId so it survives page refresh
      try { localStorage.setItem("currentTaskId", response.taskId); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动分析失败");
      setIsRunning(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (taskId) {
      try {
        await cancelTask(taskId);
      } catch {
        // ignore
      }
    }
    if (pollRef.current) clearInterval(pollRef.current);
    setTaskId(null);
    setIsRunning(false);
    setProgress(null);
  }, [taskId]);

  return { progress, result, error, isRunning, start, stop, taskId, taskInfo };
}
