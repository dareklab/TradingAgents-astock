# TradingAgents-Astock 代码库分析报告

> 生成日期: 2026-06-08

---

## 一、项目概览

**TradingAgents-Astock** 是 [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) (65K Stars) 的 A 股深度特化 fork。多 Agent 投研框架，7 个 Analyst 角色通过 Bull/Bear 辩论 + 三方风险辩论生成投资报告。

- **仓库**: <https://github.com/simonlin1212/TradingAgents-astock>
- **协议**: Apache 2.0
- **版本**: 0.2.11
- **Python**: >=3.10

### 核心架构流程

```
用户输入股票(中文名/代码)
  ↓
7 位 Analyst（并行/顺序数据采集）
  ↓
质量门控（硬校验 + LLM 复审）
  ↓
Bull  ↔  Bear 辩论（多轮来回）
  ↓
Research Manager（裁决 → 投资计划）
  ↓
Trader（转交易提案）
  ↓
Aggressive ↔ Conservative ↔ Neutral 风险辩论
  ↓
Portfolio Manager（最终决策）
```

---

## 二、目录结构总览

```text
tradingagents/
├── dataflows/          # 数据层 — 所有数据源直连
├── agents/             # Agent 层 — 7 分析师 + 辩论 + 风控
│   ├── analysts/       #   7 位分析师
│   ├── researchers/    #   Bull/Bear 研究员
│   ├── risk_mgmt/      #   三方风控辩论
│   ├── managers/       #   Research Manager + Portfolio Manager
│   ├── trader/         #   Trader
│   └── utils/          #   工具函数 + Tool 定义
├── graph/              # LangGraph 流程编排
└── llm_clients/        # LLM 客户端工厂

web/                    # Streamlit Web UI
cli/                    # Typer CLI 入口
tests/                  # 测试
examples/               # 示例
scripts/                # 工具脚本
```

---

## 三、数据层: `tradingagents/dataflows/`

### 3.1 数据源矩阵

| 来源 | 协议 | 数据 | 主要函数 |
|------|------|------|---------|
| mootdx | TCP 7709 | OHLCV K线、财务快照、F10 文本、股票代码映射 | `get_kline`, `get_finance`, `_build_name_code_map` |
| 腾讯财经 | HTTP GBK (qt.gtimg.cn) | PE/PB/市值/换手率 | `_get_realtime_quote` |
| 东方财富 push2 | HTTP (push2.eastmoney.com) | 实时行情、资金流(分钟+日级)、板块列表、个股信息 | `get_fund_flow`, `get_stock_info` |
| 东方财富 push2his | HTTP | 历史资金流/板块资金 | 历史资金流查询 |
| 东方财富 datacenter-web | HTTP (datacenter-web.eastmoney.com) | 龙虎榜、限售解禁、板块行情 | `get_dragon_tiger_board`, `get_lockup_expiry` |
| 东方财富 np-weblist | HTTP | 滚动新闻 | `get_news` |
| 新浪财经 | HTTP (money.finance.sina.com.cn) | K线历史回备、财报三表 | `get_kline_sina`, `get_financial_statements` |
| 同花顺 10jqka | HTTP | EPS一致预期、热股题材、北向资金 | `get_profit_forecast`, `get_hot_stocks`, `get_northbound_flow` |
| 财联社 cls.cn | HTTP | 全球财经快讯 | `get_global_news` |
| 百度股市通 | HTTP (gushitong.baidu.com) | 概念板块归属 | `get_concept_blocks` |

### 3.2 关键文件

| 文件 | 行数 | 作用 |
|------|------|------|
| `a_stock.py` | 2208 | **核心数据模块**。所有 A 股 API 直连实现，15+ 公开导出函数。包含东财限流机制 `_em_get()`（模块级串行 + 0.1~0.5s 随机抖动 + `requests.Session` 复用） |
| `interface.py` | — | **Vendor 路由层**。`route_to_vendor(method, *args)` 根据配置选择实现，支持 AlphaVantage 限流自动 fallback |
| `config.py` | — | 全局单例配置，读写 `DEFAULT_CONFIG` |
| `utils.py` | — | `safe_ticker_component` 路径安全校验（中文自动转 6 位代码）、`resolve_ticker`、日期工具 |

### 3.3 安全机制

- **`safe_ticker_component`**: 路径注入防护。检测中文名 → 自动调用 `resolve_ticker` 转 6 位代码 → 正则校验 `^[A-Za-z0-9._\^\-]+$` → 最大 32 字符
- **东财限流 `_em_get()`**: 所有东财请求串行化（默认 1.0s 间隔，环境变量 `EM_MIN_INTERVAL` 可调）+ 随机抖动，防止批量分析时封 IP
- **`_normalize_ticker`**: 统一处理 `SH688017` / `688017.SH` / `sh688017` 等格式变体

### 3.4 可选 Vendor

| 模块 | 文件群 | 作用 |
|------|--------|------|
| Alpha Vantage | `alpha_vantage*.py` (5 文件) | 美股/全球市场 K线、指标、基本面、新闻 |
| YFinance | `y_finance.py`, `yfinance_news.py` | 美股/全球市场 K线、指标、基本面、内部人交易、新闻 |

---

## 四、Agent 层: `tradingagents/agents/`

### 4.1 7 位 Analyst

| 文件 | 角色 | 绑定 Tools | A 股特化提示 |
|------|------|-------------|-------------|
| `market_analyst.py` (107行) | 技术分析师 | `get_stock_data`, `get_indicators` | 涨跌停/T+1/北向资金/换手率/量在价先 |
| `social_media_analyst.py` (70行) | 情绪/题材分析师 | `get_hot_stocks`, `get_northbound_flow`, `get_concept_blocks`, `get_fund_flow` | 游资接力量化、题材轮动周期、情绪-技术共振 |
| `news_analyst.py` (76行) | 新闻分析师 | `get_news`, `get_global_news` | 新华社/三大报/龙虎榜/财报公告/监管问询 |
| `fundamentals_analyst.py` (93行) | 基本面分析师 | `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement` | PE 消化年限(PEG)、30x 锚定、跨财报季趋势 |
| `policy_analyst.py` (85行) | 政策分析师 | `get_news`（关键词筛选） | 国务院/部委/产业政策/货币政策/监管动态全链条 |
| `hot_money_tracker.py` (108行) | 游资追踪师 | `get_fund_flow`, `get_dragon_tiger_board`, `get_hot_stocks`, `get_concept_blocks` | 游资席位画像、接力模型、散户参与度反向指标 |
| `lockup_watcher.py` (91行) | 解禁监控师 | `get_insider_transactions`, `get_news`, `get_fundamentals`, `get_lockup_expiry` | 解禁类型/规模/减持新规/动力评估 |

每个 Analyst 均采用统一的 LangChain 模式:
1. `ChatPromptTemplate` + `bind_tools` 构建 chain
2. System prompt 包含 A 股特化规则 + 必采清单
3. 工具调用循环由 `ConditionalLogic.should_continue_*` 控制
4. 执行后消息由 `create_msg_delete` 清空（解决 Anthropic 上下文膨胀问题）

### 4.2 质量门控: `quality_gate.py`

- **硬校验（代码层）**: 内容长度、失败标记检测、汇总表格、缺失项计数 → A/B/C/D/F 评级
- **LLM 复审（GPT 层）**: 调用 LLM 逐分析师审核数据时效/缺失项/整体可信度 → 生成 `data_quality_summary`
- 如果 D/F 评级 > 3 个，跳过 LLM 复审直接标记

### 4.3 辩论层

| 文件 | 角色 | 逻辑 |
|------|------|------|
| `bull_researcher.py` | Bull 方 | 引用 7 份报告构建看多论点，针对 Bear 最后一次论点反驳 |
| `bear_researcher.py` | Bear 方 | 引用 7 份报告构建看空论点，针对 Bull 最后一次论点反驳 |
| `research_manager.py` | 辩论法官 | `with_structured_output(InvestmentPlan)` 生成最终投资计划（含 5 档评级 + 支持位/阻力位/仓位） |

### 4.4 交易与风控

| 文件 | 角色 | 逻辑 |
|------|------|------|
| `trader.py` | 交易员 | 将投资计划 → 具体交易提案（入场价/止损/仓位/T+1约束），`TraderProposal` schema |
| `aggressive_debator.py` | 激进风控 | 容忍高风险高回报，倾向高仓位 |
| `conservative_debator.py` | 保守风控 | 优先避免损失，倾向轻仓/空仓 |
| `neutral_debator.py` | 中立风控 | 平衡视角，侧重仓位管理 vs 方向 |
| `portfolio_manager.py` | 风控法官 | `with_structured_output(PMDecision)` 生成最终决策（5 档评级 + 决策理由） |

辩论轮次受 `default_config.py` 控制：
```python
"max_debate_rounds": 1,          # Bull↔Bear 来回次数
"max_risk_discuss_rounds": 1,    # 三方风控循环次数
```

### 4.5 工具定义

所有 Tool 通过 `@tool` 装饰器定义在 `utils/` 下，通过 `route_to_vendor` 路由到具体实现：

| 文件 | Tools 数量 | 包含 |
|------|-----------|------|
| `core_stock_tools.py` | 1 | `get_stock_data` |
| `technical_indicators_tools.py` | 1 | `get_indicators` |
| `fundamental_data_tools.py` | 4 | `get_fundamentals`, `get_balance_sheet`, `get_cashflow`, `get_income_statement` |
| `news_data_tools.py` | 3 | `get_news`, `get_global_news`, `get_insider_transactions` |
| `signal_data_tools.py` | 8 | `get_profit_forecast`, `get_hot_stocks`, `get_northbound_flow`, `get_concept_blocks`, `get_fund_flow`, `get_dragon_tiger_board`, `get_lockup_expiry`, `get_industry_comparison` |

### 4.6 基础设施

| 文件 | 作用 |
|------|------|
| `agent_utils.py` | 工具函数导入 + `build_instrument_context` / `get_language_instruction` / `create_msg_delete` |
| `agent_states.py` | TypedDict: `AgentState`(13 字段, 含 7 个报告 + 辩论状态 + 投资计划 + 风控状态) |
| `structured.py` | `bind_structured` + `invoke_structured_or_freetext` — 结构化输出统一模式 |
| `rating.py` | 5 档评级 (Buy/Overweight/Hold/Underweight/Sell) + 中英文启发式解析 |
| `memory.py` | `TradingMemoryLog` — 同股票跨次运行记忆 |
| `schemas.py` | Pydantic output schema (InvestmentPlan/PMDecision/TraderProposal) |

---

## 五、流程编排: `tradingagents/graph/`

### 5.1 主入口: `trading_graph.py` (433行)

`TradingAgentsGraph` 类：

```python
analyze_stock(ticker, date) → (final_state, signal)
  ├── 前置: 交易日计算 (resolve_analysis_date)
  ├── 检查点恢复 (checkpoint_enabled)
  └── _run_graph():
       ├── 注入 memory 上下文 (past_context)
       ├── stream / invoke 执行图
       ├── 写入日志 JSON + memory
       └── 清除检查点
```

### 5.2 子组件

| 文件 | 作用 |
|------|------|
| `setup.py` (212行) | **图构造**：根据 `selected_analysts` 动态组装节点。分析师(顺序) → 质量门控 → 辩论循环 → Trader → 风控循环 → PM → END |
| `conditional_logic.py` | 条件路由：分析师 tool_call 循环、辩论轮次判定 |
| `propagation.py` | 状态初始化：`create_initial_state` + `get_graph_args` |
| `checkpointer.py` | LangGraph 检查点：`thread_id(ticker, date)` → 同参数恢复 |
| `signal_processing.py` | 从完整决策文本解析核心信号 (Buy/Sell/Hold) |
| `reflection.py` | 反思节点（预留，未集成主流程） |

### 5.3 完整节点流

```
START → [Market → Social → News → Fundamentals → Policy → Hot_Money → Lockup]
         (顺序执行，每个含工具调用循环)
  → Quality Gate (硬校验 + LLM 复审)
  → Bull → Bear → Bull → ... → Research Manager (辩论循环)
  → Trader
  → Aggressive → Conservative → Neutral → ... → Portfolio Manager (风控循环)
  → END
```

---

## 六、LLM 客户端: `tradingagents/llm_clients/`

| 文件 | 作用 |
|------|------|
| `factory.py` | `create_llm_client(provider, model, ...)` — 工厂模式创建客户端 |
| `base_client.py` | `BaseLLMClient` 抽象基类 |
| `openai_client.py` | OpenAI 兼容 API 封装（含 reasoning_effort 参数） |
| `anthropic_client.py` | Anthropic 封装（含 thinking_budget） |
| `google_client.py` | Google Gemini 封装（含 thinking_level） |
| `azure_client.py` | Azure OpenAI 封装 |
| `model_catalog.py` | 各供应商模型选项列表（`MODEL_OPTIONS`） |
| `validators.py` | API Key / 模型校验 |

---

## 七、Web UI: `web/`

| 文件 | 作用 |
|------|------|
| `launch.py` | `subprocess.run("streamlit run app.py")` 启动入口 |
| `app.py` (398行) | **主页面**：4 种状态(空闲/加载中/运行中/完成)、自定义深色 CSS 主题(暗黑+橙色强调) |
| `sidebar.py` | 股票输入 → `resolve_ticker` 解析、日期选择、LLM 供应商/模型选择、历史记录列表 |
| `report_viewer.py` | 报告渲染：标签页(Ticker / 分析报告 / 最终决策 / 日志/JSON) |
| `progress_panel.py` | 进度面板：阶段状态指示器、进度条、停止按钮、LLM/工具/Tokens 统计、数据健康 |
| `runner.py` | 后台线程执行 + 流式检测完成阶段 → 填充 ProgressTracker |
| `progress.py` | `ProgressTracker` — 线程安全的状态追踪器(15 个阶段) |
| `history.py` | 扫描 `~/.tradingagents/logs/` → 加载历史 JSON → `parse_rating` 提取信号 |
| `pdf_export.py` | PDF 导出 |

### Web UI 状态机

```
空闲(欢迎界面)
  → 点击"开始分析" → placeholder(2s 加载动画)
  → 运行中(rerun 轮询进度面板, 2s间隔)
  → 完成(报告渲染) / 错误(显示错误原因) / 中止(用户停止)
```

---

## 八、CLI: `cli/`

| 文件 | 作用 |
|------|------|
| `main.py` | Typer CLI，交互式选择分析师/LLM → Rich 实时面板(agent 状态/报告轮询/统计/数据健康) |
| `config.py` | 配置持久化 (JSON) |
| `announcements.py` | 启动时取仓库公告 |
| `stats_handler.py` | `StatsCallbackHandler` — LLM 调用/工具调用/Tokens 统计回调 |
| `utils.py` | CLI 辅助 (Rich Console 渲染) |

---

## 九、配置系统

`tradingagents/default_config.py` 定义 `DEFAULT_CONFIG`：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `llm_provider` | `"openai"` | LLM 供应商 |
| `deep_think_llm` | `"o3-mini"` | 深度推理模型（辩论/决策） |
| `quick_think_llm` | `"gpt-4o-mini"` | 快速模型（分析师/日常） |
| `data_cache_dir` | `~/.tradingagents/cache` | 数据缓存目录 |
| `results_dir` | `~/.tradingagents/logs` | 结果日志目录 |
| `output_language` | `"Chinese"` | 报告输出语言 |
| `max_debate_rounds` | 1 | Bull↔Bear 辩论轮次 |
| `max_risk_discuss_rounds` | 1 | 三方风控辩论轮次 |
| `checkpoint_enabled` | false | 检查点续跑 |
| `data_vendors` | `{category: "a_stock", ...}` | 各类数据 vendor 配置 |
| `tool_vendors` | `{}` | 单 tool 覆盖（优先级高于 category） |

---

## 十、测试: `tests/`

| 文件 | 测试内容 |
|------|---------|
| `test_safe_ticker_component.py` | 路径安全 + 中文自动转码 |
| `test_ticker_symbol_handling.py` | ticker 格式变体处理 |
| `test_structured_agents.py` | 结构化输出 agents |
| `test_checkpoint_resume.py` | 检查点续跑机制 |
| `test_signal_processing.py` | 信号解析 |
| `test_model_validation.py` | 模型校验 |
| `test_deepseek_reasoning.py` | DeepSeek 推理兼容 |
| `test_google_api_key.py` | Google API key 检测 |
| `test_memory_log.py` | 记忆日志功能 |

---

## 十一、已知问题与注意事项

### 依赖冲突
- mootdx 锁死 `httpx==0.25.2`，与 `langchain-google-genai` 的 `httpx>=0.28.1` 冲突
- 缓解方案: google-genai 移至可选依赖 `[google]`，`pip install -e .` 不冲突

### 数据源状态
- **百度 PAE 资金流接口**已下线（v0.2.7 迁移至东财 push2）
- **akshare** 已完全移除（v0.2.5 起直连 HTTP）
- **东财接口防封**: 所有东财请求走 `_em_get()`（1.0s 间隔 + 随机抖动），批量场景可设 `EM_MIN_INTERVAL=1.5~2`

### 模型兼容
- deepseek-v4-flash 等模型 tool call 可能返回中文股票名 → `safe_ticker_component` 兜底转码

### 开发规范
- 改动前跑 `python -m pytest tests/ -v`
- `safe_ticker_component` 是安全边界
- 新增东财端点必须走 `_em_get()`
- 数据层新增接口遵循 `interface.py` 的 vendor 路由模式
- 避免引入新的第三方数据库依赖（保持零外部数据库）

---

## 十二、相关项目

- [a-stock-data](https://github.com/simonlin1212/a-stock-data) — A 股 MCP 数据服务
- [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) — 上游原版框架

---

> 本分析由 Codex CLI 自动生成，基于 v0.2.11 代码库。
