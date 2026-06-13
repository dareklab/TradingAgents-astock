# 部署指南

## 方式一：Docker 部署（推荐）

### 前提

- 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- 确保 Apple Silicon Mac 上 Docker 使用 Rosetta 或原生 `linux/arm64` 镜像

### 构建并启动 Web UI

```bash
# 构建镜像
docker compose build

# 后台启动（后端 API + 前端页面）
docker compose up -d

# 查看启动日志
docker compose logs -f

# 访问
open http://localhost:8000
```

### 停止

```bash
docker compose down
```

### CLI 模式

如果需要以命令行方式运行分析（不启动 Web 界面）：

```bash
# 进入容器执行 CLI 命令
docker compose exec tradingagents tradingagents --help

# 或者用 docker run（不依赖 compose）
docker build -t tradingagents .
docker run --rm tradingagents tradingagents --ticker 600000 --date 2026-06-10
```

### 数据持久化

`docker-compose.yml` 定义了一个命名卷 `tradingagents_data`，挂载到容器内的 `~/.tradingagents` 目录，用于持久化以下数据：

- 分析结果日志（历史记录）
- mootdx 行情网关配置（`config.json`）
- 缓存文件

卷的存储位置可通过以下命令查看：

```bash
docker volume inspect tradingagents-astock_tradingagents_data
```

如需清理所有数据：

```bash
docker compose down -v
```

---

## 方式二：本地开发模式

### 前提

- Python >= 3.10（推荐通过 Homebrew 安装）
- [pnpm](https://pnpm.io/)（用于前端开发服务器）
- LLM API Key（如 DeepSeek、OpenAI 等）

### 一键启动

```bash
./dev.sh
```

这会自动完成以下步骤：

1. 检测可用的 Python 环境
2. 安装项目依赖（如缺少）
3. 配置 mootdx A 股数据网关
4. 启动后端 API（端口 8000）
5. 启动前端开发服务器（端口 5173）

### 分别启动

也可以分两个终端分别启动后端和前端：

**终端 1 — 后端 API：**

```bash
cd tradingagents-astock

# 确保依赖已安装
pip install -e .

# 配置数据网关（首次需要）
python -m mootdx bestip

# 启动后端
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**终端 2 — 前端开发服务器：**

```bash
cd tradingagents-astock/frontend

# 安装前端依赖（首次需要）
pnpm install

# 启动开发服务器（热更新）
pnpm dev
```

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `TRADINGAGENTS_CACHE_DIR` | 缓存目录 | `~/.tradingagents/cache` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | — |
| `OPENAI_API_KEY` | OpenAI API Key | — |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key | — |

### API 文档

启动后端后可以访问：

- Swagger UI：http://localhost:8000/docs
- ReDoc：http://localhost:8000/redoc
