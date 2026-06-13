"""FastAPI backend server for TradingAgents-Astock Web UI."""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

if load_dotenv:
    load_dotenv(_PROJECT_ROOT / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from backend.task_manager import get_manager
from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.dataflows.a_stock import resolve_ticker, get_stock_display_name
from tradingagents.dataflows.trading_calendar import resolve_analysis_date
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS
from backend.history import get_history, load_analysis, extract_signal
# ── Initialize mootdx server (A-stock data gateway) ──────────────────────────
def _init_mootdx():
    """Ensure mootdx has a valid BESTIP config. Required for stock name→code resolution."""
    import json as _json
    from pathlib import Path as _Path
    
    cfg_path = _Path.home() / ".mootdx" / "config.json"
    if not cfg_path.exists():
        print("mootdx config not found, running bestip...")
        from mootdx.quotes import Quotes
        try:
            _ = Quotes.factory(market="std")
        except Exception as e:
            print(f"mootdx bestip auto-init failed: {e}")
            return
    
    try:
        cfg = _json.loads(cfg_path.read_text(encoding="utf-8"))
        bestip = cfg.get("BESTIP", {})
        hq = bestip.get("HQ", [])
        # Correct format is [ip, port]; if it looks wrong, fix it
        if not hq or len(hq) != 2 or not isinstance(hq[1], int):
            servers = cfg.get("SERVER", {}).get("HQ", [])
            if servers:
                first = servers[0]  # [name, ip, port]
                bestip["HQ"] = [first[1], first[2]]
                cfg["BESTIP"] = bestip
                cfg_path.write_text(_json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"mootdx BESTIP.HQ set to {first[1]}:{first[2]}")
    except Exception as e:
        print(f"mootdx config fix skipped: {e}")

_init_mootdx()
logger = logging.getLogger(__name__)




app = FastAPI(title="TradingAgents-Astock API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve built frontend static files (API routes take priority over this mount)
_frontend_dist = _PROJECT_ROOT / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="frontend_assets")

else:
    logger.warning("Frontend dist not found at %s — API only", _frontend_dist)

# Active analyses managed by TaskManager


# ── Pydantic models ──────────────────────────────────────────────────────────

class ResolveTickerRequest(BaseModel):
    input: str

class AnalyzeRequest(BaseModel):
    ticker: str
    tradeDate: str
    llmProvider: str = "deepseek"
    quickThinkLlm: str = ""
    deepThinkLlm: str = ""
    baseUrl: str | None = None

class LoadHistoryRequest(BaseModel):
    path: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_config(req: AnalyzeRequest) -> dict:
    config = DEFAULT_CONFIG.copy()
    config["llm_provider"] = req.llmProvider
    if req.quickThinkLlm:
        config["quick_think_llm"] = req.quickThinkLlm
    if req.deepThinkLlm:
        config["deep_think_llm"] = req.deepThinkLlm
    if req.baseUrl:
        config["backend_url"] = req.baseUrl
    config["checkpoint_enabled"] = False
    return config


def _serialize_state(final_state: dict) -> dict:
    """Convert final_state to a JSON-safe dict."""
    def _safe(v):
        if isinstance(v, type({}).__class__):
            return {k: _safe(v) for k, v in v.items()}
        return v
    return final_state


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/resolve-ticker")
async def api_resolve_ticker(req: ResolveTickerRequest):
    try:
        code = resolve_ticker(req.input)
        display_name = get_stock_display_name(code)
        return {"code": code, "display_name": display_name}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/models/{provider}")
async def api_models(provider: str):
    if provider in MODEL_OPTIONS:
        raw = MODEL_OPTIONS[provider]
        return {
            "quick": [{"label": t[0], "value": t[1]} for t in raw.get("quick", [])],
            "deep": [{"label": t[0], "value": t[1]} for t in raw.get("deep", [])],
        }
    return {"quick": [], "deep": []}


@app.get("/api/history")
async def api_history():
    entries = get_history()
    result = []
    for e in entries:
        signal = "N/A"
        try:
            state = load_analysis(e["path"])
            signal = extract_signal(state)
        except Exception:
            pass
        try:
            name = get_stock_display_name(e["ticker"])
        except Exception:
            name = e["ticker"]
        result.append({
            "ticker": e["ticker"],
            "date": e["date"],
            "time": e["time"],
            "path": e["path"],
            "signal": signal,
            "display_name": name,
        })
    return result


@app.post("/api/history/load")
async def api_load_history(req: LoadHistoryRequest):
    try:
        state = load_analysis(req.path)
        ticker = Path(req.path).parent.parent.name
        trade_date = Path(req.path).stem.replace("full_states_log_", "")
        signal = extract_signal(state)
        try:
            display_name = get_stock_display_name(ticker)
        except Exception:
            display_name = ticker
        # Get analysis timestamp from file mtime
        import os as _os
        from datetime import datetime, timezone, timedelta
        _CST = timezone(timedelta(hours=8))
        mtime = _os.path.getmtime(req.path)
        analysis_time = datetime.fromtimestamp(mtime, tz=_CST).strftime("%Y-%m-%d %H:%M:%S")
        return {
            "ticker": ticker,
            "tradeDate": trade_date,
            "signal": signal,
            "elapsed": 0,
            "state": _serialize_state(state),
            "display_name": display_name,
            "analysis_time": analysis_time,
        }
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to load history: %s", e, exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/export/pdf")
async def api_export_pdf(req: LoadHistoryRequest):
    """Export an analysis result as PDF bytes."""
    try:
        state = load_analysis(req.path)
        ticker = Path(req.path).parent.parent.name
        trade_date = Path(req.path).stem.replace("full_states_log_", "")
        signal = extract_signal(state)
        from backend.pdf_export import generate_pdf
        import traceback as _tb, sys as _sys
        try:
            pdf_bytes = generate_pdf(state, ticker, trade_date, signal)
        except Exception as pdf_e:
            print(f"[PDF ERROR] {pdf_e}", flush=True)
            _tb.print_exc(file=_sys.stderr)
            raise HTTPException(status_code=400, detail=f"PDF 生成失败: {pdf_e}")
        from fastapi.responses import Response
        import urllib.parse as _up
        display_name = get_stock_display_name(ticker)
        date_compact = trade_date.replace("-", "")
        safe_name = f"{display_name}-{date_compact}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{_up.quote(safe_name)}"
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PDF ROUTE ERROR] {e}", flush=True)
        _tb.print_exc(file=_sys.stderr)
        raise HTTPException(status_code=400, detail=f"导出失败: {e}")


@app.post("/api/analyze/{analysis_id}/stop")
async def api_stop_analysis(analysis_id: str):
    mgr = get_manager()
    if mgr.cancel(analysis_id):
        return {"status": "stopping", "taskId": analysis_id}
    raise HTTPException(status_code=404, detail="Task not found or already finished")


@app.post("/api/analyze")
async def api_analyze(req: AnalyzeRequest):
    """Start an analysis as a background task."""
    config = _make_config(req)
    ticker = req.ticker
    trade_date = req.tradeDate

    mgr = get_manager()
    task = mgr.submit(ticker, trade_date, config)

    return {
        "taskId": task.id,
        "ticker": task.ticker,
        "tradeDate": task.trade_date,
        "status": task.status,
    }

from backend.task_manager import TASK_PENDING, TASK_RUNNING, TASK_COMPLETE, TASK_ERROR, TASK_CANCELLED


@app.get("/api/tasks")
async def api_list_tasks():
    """List all tasks (pending, running, complete, error)."""
    mgr = get_manager()
    return mgr.list_tasks()


@app.get("/api/tasks/{task_id}")
async def api_get_task(task_id: str):
    """Get a single task's current state."""
    mgr = get_manager()
    task = mgr.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.to_dict()


@app.post("/api/tasks/{task_id}/cancel")
async def api_cancel_task(task_id: str):
    """Cancel a running/pending task."""
    mgr = get_manager()
    if mgr.cancel(task_id):
        return {"status": "cancelled", "taskId": task_id}
    raise HTTPException(status_code=404, detail="Task not found or already finished")


@app.get("/api/tasks/{task_id}/result")
async def api_get_task_result(task_id: str):
    """Get the completed result for a task. Blocks until done or error."""
    mgr = get_manager()
    task = mgr.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status in (TASK_PENDING, TASK_RUNNING):
        raise HTTPException(status_code=425, detail="Task still running")
    if task.status == TASK_ERROR:
        return {"status": "error", "error": task.error}
    if task.status == TASK_CANCELLED:
        return {"status": "cancelled"}
    return {"status": "complete", "result": task.result}

# ── Serve frontend (catch-all, must be after all API routes) ──────────────

if _frontend_dist.is_dir():
    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        from fastapi.responses import FileResponse
        file_path = _frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_frontend_dist / "index.html"))

# ── Entry ────────────────────────────────────────────────────────────────────

def main():
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    main()

