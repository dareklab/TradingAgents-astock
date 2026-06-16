#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ── Port cleanup ──────────────────────────────────────────────────────────────
# Kill any leftover processes on ports 8000 and 5173 from previous runs.
for port in 8000 5173; do
    pid=$(lsof -ti:"$port" 2>/dev/null) && kill "$pid" 2>/dev/null && echo "  Freed port $port (PID $pid)"
done

# Detect the correct Python (prefer Homebrew over system default, require >=3.10)
PYTHON=""
for candidate in \
    /opt/homebrew/bin/python3 \
    /opt/homebrew/bin/python3.14 \
    /opt/homebrew/bin/python3.13 \
    /opt/homebrew/bin/python3.12 \
    /opt/homebrew/bin/python3.11 \
    /usr/local/bin/python3.14 \
    /usr/local/bin/python3.13 \
    /usr/local/bin/python3.12 \
    /usr/local/bin/python3.11 \
    /usr/local/bin/python3 \
    /usr/bin/python3; do
    if [ -x "$candidate" ]; then
        # Check Python version >= 3.10
        VER=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
        MAJOR=$(echo "$VER" | cut -d. -f1)
        MINOR=$(echo "$VER" | cut -d. -f2)
        if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 10 ] 2>/dev/null; then
            if "$candidate" -c "import fastapi" 2>/dev/null; then
                PYTHON="$candidate"
                break
            elif [ -z "$PYTHON" ]; then
                # Remember this candidate even if fastapi not yet installed
                PYTHON="$candidate"
            fi
        fi
    fi
done

# Fallback: try to find any python3 >= 3.10
if [ -z "$PYTHON" ]; then
    for candidate in $(command -v python3.14 python3.13 python3.12 python3.11 python3 2>/dev/null); do
        VER=$("$candidate" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
        MAJOR=$(echo "$VER" | cut -d. -f1)
        MINOR=$(echo "$VER" | cut -d. -f2)
        if [ "$MAJOR" -ge 3 ] && [ "$MINOR" -ge 10 ] 2>/dev/null; then
            PYTHON="$candidate"
            break
        fi
    done
fi

if [ -z "$PYTHON" ]; then
    echo "❌  No Python >= 3.10 found. Please install Python 3.10+ via Homebrew:"
    echo "    brew install python@3.11"
    exit 1
fi

# Ensure fastapi is available; install project deps if needed
if ! "$PYTHON" -c "import fastapi" 2>/dev/null; then
    echo "⚠️  fastapi not found in $PYTHON. Installing project dependencies..."
    "$PYTHON" -m pip install -e . 2>&1 | tail -5
fi

PIP="$PYTHON -m pip"

echo "=============================================="
echo "  TradingAgents-Astock Dev Servers"
echo "  Python: $PYTHON"
echo "=============================================="

# 1. Ensure mootdx servers are configured
echo ""
echo "[1/4] Checking A-stock data gateway (mootdx)..."
if [ -f "$HOME/.mootdx/config.json" ]; then
  BESTIP=$("$PYTHON" -c "
import json
cfg = json.load(open('$HOME/.mootdx/config.json'))
hq = cfg.get('BESTIP', {}).get('HQ', '')
print('configured' if hq else 'empty')
" 2>/dev/null)
  if [ "$BESTIP" = "empty" ]; then
    echo "  → Config exists but BESTIP empty, running bestip (may take 30s)..."
    "$PYTHON" -c "
import subprocess, sys
try:
    subprocess.run([sys.executable, '-m', 'mootdx', 'bestip'], timeout=30)
except subprocess.TimeoutExpired:
    print('bestip timed out after 30s, continuing anyway...')
except Exception as e:
    print(f'bestip failed: {e}')
" 2>&1 | tail -1
  else
    echo "  ✓ mootdx already configured"
  fi
else
  echo "  → No config found, running bestip..."
  "$PYTHON" -c "
import subprocess, sys
try:
    subprocess.run([sys.executable, '-m', 'mootdx', 'bestip'], timeout=30)
except subprocess.TimeoutExpired:
    print('bestip timed out after 30s, continuing anyway...')
except Exception as e:
    print(f'bestip failed: {e}')
" 2>&1 | tail -1
fi

# 2. Start backend API
echo ""
echo "[2/4] Starting Backend API (port 8000)..."
"$PYTHON" -u backend/main.py &
BACKEND_PID=$!

# 3. Build & start frontend
echo ""
echo "[3/4] Building frontend..."

# Locate pnpm (corepack shims or global install)
PNPM=""
for candidate in \
    /usr/local/lib/node_modules/corepack/shims/pnpm \
    /opt/homebrew/lib/node_modules/corepack/shims/pnpm \
    "$(command -v pnpm 2>/dev/null)"; do
    if [ -x "$candidate" ]; then
        PNPM="$candidate"
        break
    fi
done

if [ -z "$PNPM" ]; then
    echo "  ⚠️  pnpm not found. Installing via npm..."
    npm install -g pnpm 2>&1 | tail -1
    PNPM="/usr/local/lib/node_modules/corepack/shims/pnpm"
    if [ ! -x "$PNPM" ]; then
        PNPM="$(command -v pnpm 2>/dev/null || echo '')"
    fi
fi

if [ -z "$PNPM" ]; then
    echo "  ❌ Cannot find pnpm. Please install it manually: npm install -g pnpm"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

cd "$PROJECT_DIR/frontend"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "  → Installing frontend dependencies..."
    "$PNPM" install 2>&1 | tail -5
fi

# Build static assets so backend can serve them
echo "  → Building dist..."
"$PNPM" build 2>&1 | tail -5

if [ -d "$PROJECT_DIR/frontend/dist" ]; then
    echo "  ✓ Frontend dist built"
else
    echo "  ⚠️  Frontend dist not found — backend will run API-only"
fi

echo ""
echo "[4/4] Starting Frontend Dev Server (port 5173)..."
"$PNPM" dev &
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
