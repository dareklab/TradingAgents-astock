# 部署指南

## 方式一：Docker 部署（推荐）

### 前提

- 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 构建并启动

```bash
# 构建镜像
docker compose build

# 后台启动
docker compose up -d

# 查看日志
docker compose logs -f

# 访问
open http://localhost:8000
```

### 停止

```bash
docker compose down
```

### 数据持久化

分析结果和缓存数据保存在项目目录下的 `.tradingagents/` 文件夹中。

---

## 方式二：本地开发模式

### 前提

- Python >= 3.10（推荐通过 Homebrew 安装）
- [pnpm](https://pnpm.io/)（用于前端构建）
- LLM API Key（如 DeepSeek、OpenAI 等）

### 一键启动

```bash
./dev.sh
```

### 分步启动

**终端 1 — 后端 API：**

```bash
pip install -e .
python -m mootdx bestip
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**终端 2 — 前端构建（首次需要）：**

```bash
cd frontend
pnpm install
npx vite build
```

构建后的前端由后端自动托管，访问 `http://localhost:8000` 即可。

### 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `TRADINGAGENTS_CACHE_DIR` | 缓存目录 | `~/.tradingagents/cache` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | — |
| `OPENAI_API_KEY` | OpenAI API Key | — |
| `SILICONFLOW_API_KEY` | SiliconFlow API Key | — |

### API 文档

启动后端后访问：

- Swagger UI：http://localhost:8000/docs
- ReDoc：http://localhost:8000/redoc
