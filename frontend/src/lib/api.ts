import type { HistoryEntry, ModelCatalog, AnalysisConfig, AnalysisResult } from "./types";

const API_BASE = "/api";

async function apiGet<T>(path: string): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(err || `HTTP ${resp.status}`);
  }
  return resp.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(err || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export async function resolveTicker(input: string): Promise<string> {
  const data = await apiPost<{ code: string; display_name?: string }>("/resolve-ticker", { input });
  return data.code;
}

export async function resolveTickerWithName(input: string): Promise<{ code: string; displayName: string }> {
  const data = await apiPost<{ code: string; display_name: string }>("/resolve-ticker", { input });
  return { code: data.code, displayName: data.display_name };
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return apiGet<HistoryEntry[]>("/history");
}

export async function loadHistory(path: string): Promise<AnalysisResult> {
  return apiPost<AnalysisResult>("/history/load", { path });
}

export async function getModels(provider: string): Promise<ModelCatalog | null> {
  try {
    return await apiGet<ModelCatalog>(`/models/${provider}`);
  } catch {
    return null;
  }
}

export async function startAnalysis(config: AnalysisConfig): Promise<{ taskId: string }> {
  return apiPost<{ taskId: string }>("/analyze", config);
}

export async function getTask(taskId: string): Promise<TaskInfo> {
  return apiGet<TaskInfo>(`/tasks/${taskId}`);
}

export async function getTaskResult(taskId: string): Promise<{ status: string; result?: AnalysisResult; error?: string }> {
  return apiGet(`/tasks/${taskId}/result`);
}

export async function cancelTask(taskId: string): Promise<void> {
  await apiPost(`/tasks/${taskId}/cancel`, {});
}

export async function listTasks(): Promise<TaskInfo[]> {
  return apiGet<TaskInfo[]>("/tasks");
}

export interface TaskInfo {
  id: string;
  ticker: string;
  tradeDate: string;
  status: string;
  displayName: string;
  createdAt: string;
  elapsed: number;
  completedStages: string[];
  currentStage: string;
  llmCalls: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  progress: Record<string, unknown>;
  error?: string;
}

export async function exportPdf(path: string): Promise<Blob> {
  const resp = await fetch(`${API_BASE}/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(err || `HTTP ${resp.status}`);
  }
  return resp.blob();
}
