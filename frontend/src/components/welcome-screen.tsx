export default function WelcomeScreen() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center px-6 animate-fadeIn">
      {/* Logo area */}
      <div className="mb-8">
        <div className="text-5xl mb-5">📈</div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          <span className="text-[#ff5a1f]">Trading</span>
          <span className="text-[#f0ede8]">Agents</span>
          <span className="text-[#555] mx-1">-</span>
          <span className="text-[#ff5a1f]">Astock</span>
        </h1>
        <p className="text-sm text-[#666] max-w-md mx-auto leading-relaxed">
          A 股多 Agent 投研分析系统
        </p>
      </div>

      {/* Pipeline visualization */}
      <div className="flex items-center gap-1.5 mb-9 flex-wrap justify-center max-w-lg">
        {["分析师", "质量门控", "多空辩论", "风控评估", "最终决策"].map((step, i) => (
          <div key={step} className="flex items-center gap-1.5">
            <div className="px-2.5 py-1 rounded-md bg-[#111] border border-[#222] text-[11px] text-[#777] font-medium whitespace-nowrap">
              {step}
            </div>
            {i < 4 && <span className="text-[#2a2a2a] text-xs">→</span>}
          </div>
        ))}
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 max-w-xl w-full mb-9">
        {[
          { icon: "🔍", title: "输入股票", desc: "6位代码或中文名称" },
          { icon: "🤖", title: "AI 分析", desc: "7位分析师多轮辩论" },
          { icon: "📊", title: "获取报告", desc: "完整投研报告+信号" },
        ].map(card => (
          <div key={card.title} className="p-3.5 rounded-lg bg-[#0d0d0d] border border-[#1e1e1e] hover:border-[#333] transition-all duration-200">
            <div className="text-xl mb-1.5">{card.icon}</div>
            <div className="text-sm font-semibold text-[#e8e6e1] mb-0.5">{card.title}</div>
            <div className="text-[11px] text-[#555]">{card.desc}</div>
          </div>
        ))}
      </div>

      <div className="px-5 py-2.5 rounded-lg border border-dashed border-[#2a2a2a] text-xs text-[#555]">
        ← 在侧边栏输入股票代码开始分析
      </div>

      <div className="mt-10 pt-5 border-t border-[#151515] text-[10px] text-[#333] max-w-md leading-relaxed">
        本报告由 AI 自动生成，仅供学习研究，不构成投资建议
      </div>
    </div>
  );
}
