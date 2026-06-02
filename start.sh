#!/bin/bash
#
# TradingAgents-Astock Docker 启动脚本
# 用法:
#   ./start.sh              # 默认端口 8501
#   PORT=8080 ./start.sh    # 自定义端口
#   ./start.sh stop         # 停止容器
#   ./start.sh logs         # 查看日志
#   ./start.sh rebuild      # 强制重新构建镜像
#

set -euo pipefail

# ── 配置 ──────────────────────────────────────────────
PROJECT_DIR="${PROJECT_DIR:-$HOME/ai-code/trade/TradingAgents-astock}"
IMAGE="trading-agents-astock:latest"
CONTAINER_NAME="trading-agents-web"
PORT="${PORT:-8501}"
ENV_FILE="$PROJECT_DIR/.env"

# ── 颜色 ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*"; }
log_step()  { echo -e "${CYAN}[→]${NC} $*"; }

# ── 前置检查 ──────────────────────────────────────────
preflight() {
    if ! command -v docker &>/dev/null; then
        log_error "Docker 未安装，请先安装 Docker Desktop"
        exit 1
    fi

    if ! docker info &>/dev/null 2>&1; then
        log_error "Docker 未运行，请先启动 Docker Desktop"
        exit 1
    fi

    if [[ ! -f "$ENV_FILE" ]]; then
        log_error ".env 文件不存在: $ENV_FILE"
        exit 1
    fi

    # 检查至少配置了一个 API Key
    if ! grep -qE '^[A-Z_]+_API_KEY=.+' "$ENV_FILE"; then
        log_warn ".env 中未检测到有效的 API Key，请在启动前配置"
    fi
}

# ── 构建镜像 ──────────────────────────────────────────
build_image() {
    local force="${1:-false}"

    if [[ "$force" == "true" ]]; then
        log_step "强制重新构建镜像..."
        cd "$PROJECT_DIR"
        docker compose build --no-cache
        log_info "镜像重新构建完成"
    elif ! docker image inspect "$IMAGE" &>/dev/null 2>&1; then
        log_step "镜像不存在，开始构建（约 5 分钟）..."
        cd "$PROJECT_DIR"
        docker compose build
        log_info "镜像构建完成"
    else
        log_info "镜像已存在，跳过构建"
    fi
}

# ── 停止容器 ──────────────────────────────────────────
stop_container() {
    if docker ps -a --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
        log_step "停止容器 $CONTAINER_NAME..."
        docker rm -f "$CONTAINER_NAME"
        log_info "容器已停止"
    else
        log_info "容器未运行"
    fi
}

# ── 查看日志 ──────────────────────────────────────────
show_logs() {
    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Names}}" | grep -q "$CONTAINER_NAME"; then
        docker logs -f "$CONTAINER_NAME"
    else
        log_error "容器未运行，无法查看日志"
        exit 1
    fi
}

# ── 启动容器 ──────────────────────────────────────────
start_container() {
    # 检查端口占用
    if lsof -i ":$PORT" &>/dev/null 2>&1; then
        log_warn "端口 $PORT 已被占用，尝试停止旧容器..."
        stop_container
        sleep 1
    fi

    log_step "启动容器（端口: ${PORT}）..."

    docker run -d --rm \
        --name "$CONTAINER_NAME" \
        -p "$PORT:8501" \
        --env-file "$ENV_FILE" \
        -v tradingagents_data:/home/appuser/.tradingagents \
        --entrypoint "" \
        "$IMAGE" \
        tradingagents-web

    # 等待 Streamlit 启动
    log_step "等待 Streamlit 就绪..."
    local max_wait=30
    local waited=0
    while [[ $waited -lt $max_wait ]]; do
        if docker logs "$CONTAINER_NAME" 2>/dev/null | grep -q "You can now view your Streamlit app"; then
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done

    if docker ps --filter "name=$CONTAINER_NAME" --format "{{.Status}}" 2>/dev/null | grep -q "Up"; then
        echo ""
        echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║        TradingAgents-Astock 启动成功！          ║${NC}"
        echo -e "${GREEN}╠══════════════════════════════════════════════════╣${NC}"
        echo -e "${GREEN}║${NC}  🌐 访问地址: ${CYAN}http://localhost:$PORT${NC}"
        echo -e "${GREEN}║${NC}  📋 查看日志: ${CYAN}./start.sh logs${NC}"
        echo -e "${GREEN}║${NC}  🛑 停止容器: ${CYAN}./start.sh stop${NC}"
        echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
        echo ""
    else
        log_error "容器启动失败，日志如下："
        echo "---"
        docker logs "$CONTAINER_NAME" 2>/dev/null || true
        echo "---"
        exit 1
    fi
}

# ── 主入口 ────────────────────────────────────────────
main() {
    local cmd="${1:-start}"

    case "$cmd" in
        start)
            preflight
            build_image
            stop_container
            start_container
            ;;
        stop)
            stop_container
            ;;
        logs)
            show_logs
            ;;
        rebuild)
            preflight
            stop_container
            build_image true
            start_container
            ;;
        *)
            echo "用法: $0 {start|stop|logs|rebuild}"
            echo ""
            echo "  start   启动服务（默认，自动构建镜像）"
            echo "  stop    停止并移除容器"
            echo "  logs    查看实时日志"
            echo "  rebuild 强制重新构建镜像并启动"
            echo ""
            echo "环境变量:"
            echo "  PORT=8080    自定义端口（默认 8501）"
            echo "  PROJECT_DIR  项目路径（默认 ~/ai-code/trade/TradingAgents-astock）"
            exit 1
            ;;
    esac
}

main "$@"
