import { useMemo } from "react";
import { marked } from "marked";
import type { ProgressState } from "@/lib/types";
import { PIPELINE_STAGES } from "@/lib/types";
import { Progress } from "@/components/ui/progress";

function MarkdownContent({ text }: { text: string }) {
  const html = useMemo(() => {
    try {
      const cleaned = text.replace(/<think>.*?<\/think>\s*/gs, "").trim();
      return marked.parse(cleaned, { async: false }) as string;
    } catch {
      return `<pre class="text-sm whitespace-pre-wrap">${text}</pre>`;
    }
  }, [text]);
  return (
    <div
      className="prose-content text-sm leading-relaxed"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface Props {
  progress: ProgressState;
  displayName: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ProgressPanel({ progress, displayName }: Props) {
  const isInitializing = progress.currentStage === "initializing";
  const completed = progress.completedStages.length;
  const total = PIPELINE_STAGES.length;
  const pct = !isInitializing && total > 0 ? completed / total : 0;

  const stageStatus = (id: string): "done" | "active" | "pending" => {
    if (progress.completedStages.includes(id)) return "done";
    if (progress.currentStage === id) return "active";
    return "pending";
  };

  if (isInitializing) {
    return (
      <div className="py-8 animate-fadeIn">
        <div className="text-center mb-8">
          <div className="text-2xl text-[#f0ede8] font-bold tracking-tight mb-2">{displayName} 分析中…</div>
        </div>
        <div className="text-center py-16">
          <div className="relative w-14 h-14 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-[#222]" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#ff5a1f] animate-spin" />
            <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#ff8c42] animate-spin" style={{ animationDuration: "0.6s", animationDirection: "reverse" }} />
          </div>
          <div className="text-base text-[#888] animate-pulse">正在初始化分析环境…</div>
          <div className="text-sm text-[#555] mt-2">加载数据源、连接 LLM 服务</div>
          <div className="text-xs text-[#444] mt-6">{formatTime(progress.elapsed || 0)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-2xl text-[#f0ede8] font-bold tracking-tight mb-2">{displayName} 分析中…</div>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <Progress value={pct * 100} />
        <div className="flex items-center justify-between mt-2 text-xs text-[#555]">
          <span>{completed}/{total} 阶段完成</span>
          <span>{formatTime(progress.elapsed || 0)}</span>
        </div>
      </div>

      {/* Stage visualization */}
      <div className="grid grid-cols-6 gap-3 mb-8">
        {PIPELINE_STAGES.map((s, i) => {
          const status = stageStatus(s.id);
          const isActive = status === "active";
          const isDone = status === "done";
          return (
            <div key={s.id} className="flex flex-col items-center gap-2">
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-500
                ${isDone ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 scale-100" :
                  isActive ? "bg-[#ff5a1f]/15 text-[#ff5a1f] border border-[#ff5a1f]/30 scale-110 shadow-lg shadow-[#ff5a1f]/10" :
                  "bg-[#111] text-[#333] border border-[#1a1a1a]"}
              `}>
                {isDone ? "✓" : s.icon}
              </div>
              <span className={`text-[10px] text-center leading-tight ${
                isDone ? "text-emerald-500" : isActive ? "text-[#f0ede8]" : "text-[#444]"
              }`}>
                {s.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { label: "LLM 调用", value: progress.llmCalls },
          { label: "工具调用", value: progress.toolCalls },
          { label: "输入 Tokens", value: progress.tokensIn?.toLocaleString() || "0" },
          { label: "输出 Tokens", value: progress.tokensOut?.toLocaleString() || "0" },
        ].map(stat => (
          <div key={stat.label} className="text-center p-3 rounded-xl bg-[#0d0d0d] border border-[#1a1a1a]">
            <div className="text-[10px] text-[#555] mb-1">{stat.label}</div>
            <div className="text-lg font-bold text-[#ff5a1f]">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Data health */}
      {progress.dataHealth && (() => {
        const vals = Object.values(progress.dataHealth);
        const fail = vals.filter(v => v.status === "fail").length;
        const partial = vals.filter(v => v.status === "partial").length;
        const ok = vals.filter(v => v.status === "ok").length;
        if (fail > 0 || partial > 0) return (
          <div className="mb-6 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <div className="text-xs text-yellow-400/80">
              📡 数据健康: {ok} 正常{partial > 0 ? `, ${partial} 部分缺失` : ""}{fail > 0 ? `, ${fail} 失败` : ""}
            </div>
          </div>
        );
        return null;
      })()}

      {/* Completed reports */}
      {PIPELINE_STAGES.filter(s => progress.stageReports?.[s.id]).length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] text-[#555] tracking-wider uppercase mb-2">
            已完成报告 ({PIPELINE_STAGES.filter(s => progress.stageReports?.[s.id]).length})
          </div>
          {PIPELINE_STAGES.filter(s => progress.stageReports?.[s.id]).reverse().map(s => {
            const text = progress.stageReports?.[s.id] || "";
            const truncated = text.length > 3000 ? text.slice(0, 3000) + "…" : text;
            return (
              <div key={s.id} className="rounded-xl border border-[#222] bg-[#0d0d0d] overflow-hidden">
                <details className="group">
                  <summary className="flex items-center gap-2 px-4 py-3 text-sm text-[#888] cursor-pointer hover:text-[#f0ede8] hover:bg-[#111] transition-all">
                    <span className="text-base">{s.icon}</span>
                    <span className="font-medium">{s.name}</span>
                    <svg className="ml-auto w-3.5 h-3.5 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </summary>
                  <div className="px-4 pb-4 max-h-96 overflow-y-auto">
                    <MarkdownContent text={truncated} />
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
