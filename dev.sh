#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ── Port cleanup ──────────────────────────────────────────────────────────────
# Kill any leftover processes on ports 8000 and 5173 from previous runs.
for port in 8000 5173; do
    pid=$(lsof -ti:"$port" 2>/dev/null) && kill "$pid" 2>/dev/null && echo "  Freed port $port (PID $pid)"
done

# Detect the correct Python (prefer Homebrew over system default)
PYTHON=""
for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
    if [ -x "$candidate" ]; then
        if "$candidate" -c "import fastapi" 2>/dev/null; then
            PYTHON="$candidate"
            break
        fi
    fi
done

# Fallback: try to find any python3 that has fastapi
if [ -z "$PYTHON" ]; then
    PYTHON=$(command -v python3)
    echo "⚠️  fastapi not found in default Python. Installing dependencies..."
    "$PYTHON" -m pip install -e . 2>&1 | tail -1
fi

PIP="$PYTHON -m pip"

echo "=============================================="
echo "  TradingAgents-Astock Dev Servers"
echo "  Python: $PYTHON"
echo "=============================================="

# 1. Ensure mootdx servers are configured
echo ""
echo "[1/3] Checking A-stock data gateway (mootdx)..."
if [ -f "$HOME/.mootdx/config.json" ]; then
  BESTIP=$("$PYTHON" -c "
import json
cfg = json.load(open('$HOME/.mootdx/config.json'))
hq = cfg.get('BESTIP', {}).get('HQ', '')
print('configured' if hq else 'empty')
" 2>/dev/null)
  if [ "$BESTIP" = "empty" ]; then
    echo "  → Config exists but BESTIP empty, running bestip (may take 30s)..."
    timeout 30 "$PYTHON" -m mootdx bestip 2>&1 | tail -1
  else
    echo "  ✓ mootdx already configured"
  fi
else
  echo "  → No config found, running bestip..."
  timeout 30 "$PYTHON" -m mootdx bestip 2>&1 | tail -1
fi

# 2. Start backend API
echo ""
echo "[2/3] Starting Backend API (port 8000)..."
"$PYTHON" -u backend/main.py &
BACKEND_PID=$!

# 3. Start frontend dev server
echo ""
echo "[3/3] Starting Frontend Dev Server (port 5173)..."
cd frontend
pnpm dev &
FRONTEND_PID=$!

cd "$PROJECT_DIR"
sleep 3

echo ""
echo "=============================================="
echo "  🚀  Both servers are running"
echo "=============================================="
echo "  Python:   $PYTHON"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000"
echo "  API Docs: http://localhost:8000/docs"
echo "=============================================="
echo "  Press Ctrl+C to stop both servers"
echo "=============================================="
echo ""

cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait 2>/dev/null
    echo "Done."
}

trap cleanup INT TERM
wait
