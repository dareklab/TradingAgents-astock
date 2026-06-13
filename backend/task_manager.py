"""Background task manager for long-running analysis jobs.

Tasks run in a dedicated thread and survive client disconnects.
The frontend can poll task status, list running/pending tasks, and cancel them.
"""

from __future__ import annotations

import asyncio
import functools
import json
import logging
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)
_CST = timezone(timedelta(hours=8))

# ── Task status constants ───────────────────────────────────────────────────

TASK_PENDING = "pending"
TASK_RUNNING = "running"
TASK_COMPLETE = "complete"
TASK_ERROR = "error"
TASK_CANCELLED = "cancelled"


# ── Task model ──────────────────────────────────────────────────────────────

@dataclass
class AnalysisTask:
    """Represents a single analysis task in the background queue."""

    id: str
    ticker: str
    trade_date: str
    config: dict[str, Any]
    created_at: float = field(default_factory=time.time)

    # Mutable state – updated by the worker thread
    status: str = TASK_PENDING
    progress: dict[str, Any] = field(default_factory=dict)
    result: dict[str, Any] | None = None
    error: str | None = None
    cancel_requested: bool = False
    thread: threading.Thread | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @property
    def elapsed(self) -> float:
        return time.time() - self.created_at

    @property
    def display_name(self) -> str:
        return self.progress.get("display_name", self.ticker)

    def to_dict(self) -> dict[str, Any]:
        with self._lock:
            return {
                "id": self.id,
                "ticker": self.ticker,
                "tradeDate": self.trade_date,
                "status": self.status,
                "displayName": self.display_name,
                "createdAt": datetime.fromtimestamp(self.created_at, tz=_CST).isoformat(),
                "elapsed": self.elapsed,
                "progress": self.progress,
                "error": self.error,
                "completedStages": self.progress.get("completedStages", []),
                "currentStage": self.progress.get("currentStage", ""),
                "llmCalls": self.progress.get("llmCalls", 0),
                "toolCalls": self.progress.get("toolCalls", 0),
                "tokensIn": self.progress.get("tokensIn", 0),
                "tokensOut": self.progress.get("tokensOut", 0),
            }

    def update_progress(self, **kwargs):
        with self._lock:
            self.progress.update(kwargs)


# ── Manager ─────────────────────────────────────────────────────────────────

class TaskManager:
    """Thread-safe manager for background analysis tasks with a single-worker queue.

    At most one task runs at a time. Additional tasks are queued as ``pending``
    and auto-started when the current task completes.

    Usage::

        mgr = TaskManager()
        task1 = mgr.submit("600519", "2026-06-09", config)  # starts immediately
        task2 = mgr.submit("000858", "2026-06-09", config)  # queued as pending
        mgr.list_tasks()  # -> [task1.to_dict(), task2.to_dict(), ...]
        mgr.cancel(task1.id)
        # task2 will auto-start after task1 is cancelled
    """

    def __init__(self):
        self._tasks: dict[str, AnalysisTask] = {}
        self._lock = threading.Lock()
        self._worker_event = threading.Event()
        self._worker_thread: threading.Thread | None = None
        # Reset any leftover "running" tasks from a previous server instance
        self._cleanup_orphaned_tasks()
        self._start_worker()

    # ── Worker ─────────────────────────────────────────────────────────

    def _cleanup_orphaned_tasks(self):
        """On startup, reset any tasks stuck in 'running' state.
        
        These are tasks from a previous server instance whose worker threads
        are gone. Mark them as cancelled so the UI can recover.
        """
        with self._lock:
            for task in self._tasks.values():
                if task.status == TASK_RUNNING:
                    task.status = TASK_CANCELLED

    def _start_worker(self):
        """Start the daemon worker thread if not already running."""
        if self._worker_thread is None or not self._worker_thread.is_alive():
            self._worker_thread = threading.Thread(
                target=self._worker_loop,
                daemon=True,
                name="task-worker",
            )
            self._worker_thread.start()

    def _worker_loop(self):
        """Main worker loop: pick one pending task, execute it, repeat."""
        while True:
            task = self._dequeue_next()
            if task is None:
                # No tasks — wait for a new one
                self._worker_event.wait(timeout=5)
                self._worker_event.clear()
                continue

            # Execute the task (blocking call)
            try:
                _run_analysis(task)
            except Exception as e:
                logger.exception("Worker thread crashed for task %s (%s): %s", task.ticker, task.id, e)
                task.status = TASK_ERROR
                task.error = str(e)
                task.update_progress()

    def _dequeue_next(self) -> AnalysisTask | None:
        """Return the oldest pending task, or None."""
        with self._lock:
            pending = [
                t for t in self._tasks.values()
                if t.status == TASK_PENDING and not t.cancel_requested
            ]
            if not pending:
                return None
            # FIFO: oldest creation time first
            pending.sort(key=lambda t: t.created_at)
            task = pending[0]
            task.status = TASK_RUNNING
            return task

    # ── Public API ──────────────────────────────────────────────────────

    def submit(
        self,
        ticker: str,
        trade_date: str,
        config: dict[str, Any],
        display_name: str = "",
    ) -> AnalysisTask:
        """Add a new task to the queue. Starts immediately if nothing is running."""
        task_id = uuid.uuid4().hex[:12]
        task = AnalysisTask(
            id=task_id,
            ticker=ticker,
            trade_date=trade_date,
            config=config,
            status=TASK_PENDING,
        )
        task.update_progress(
            display_name=display_name or ticker,
            currentStage="initializing",
            completedStages=[],
            llmCalls=0, toolCalls=0, tokensIn=0, tokensOut=0,
            elapsed=0,
        )

        with self._lock:
            self._tasks[task_id] = task

        # Wake the worker
        self._worker_event.set()
        self._start_worker()

        return task

    def get(self, task_id: str) -> AnalysisTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def get_result(self, task_id: str) -> dict[str, Any] | None:
        task = self.get(task_id)
        if task and task.status in (TASK_COMPLETE, TASK_ERROR, TASK_CANCELLED):
            return task.result
        return None

    def list_tasks(self) -> list[dict[str, Any]]:
        with self._lock:
            # Return tasks sorted by created_at (FIFO: oldest first, i.e. first submitted = first to run)
            sorted_tasks = sorted(self._tasks.values(), key=lambda t: t.created_at)
            return [t.to_dict() for t in sorted_tasks]

    def cancel(self, task_id: str) -> bool:
        task = self.get(task_id)
        if task and task.status in (TASK_PENDING, TASK_RUNNING):
            task.cancel_requested = True
            task.status = TASK_CANCELLED
            return True
        return False

    def prune(self, max_age_hours: float = 2):
        """Remove completed/errored tasks older than ``max_age_hours``."""
        now = time.time()
        with self._lock:
            to_prune = [
                tid
                for tid, t in self._tasks.items()
                if t.status in (TASK_COMPLETE, TASK_ERROR, TASK_CANCELLED)
                and (now - t.created_at) > max_age_hours * 3600
            ]
            for tid in to_prune:
                del self._tasks[tid]
            return len(to_prune)


# ── Global singleton ────────────────────────────────────────────────────────

_manager: TaskManager | None = None


def get_manager() -> TaskManager:
    global _manager
    if _manager is None:
        _manager = TaskManager()
    return _manager


# ── Worker thread ────────────────────────────────────────────────────────────

_ANALYST_REPORT_KEYS = [
    "market_report", "sentiment_report", "news_report",
    "fundamentals_report", "policy_report", "hot_money_report", "lockup_report",
]


def _strip_think_tags(text: str) -> str:
    return re.sub(r"<think>.*?</think>\s*", "", text, flags=re.DOTALL).strip()


def _run_analysis(task: AnalysisTask):
    """Execute the analysis graph in a background thread.

    This function runs in a daemon thread and updates ``task`` state
    as it progresses.
    """
    from backend.progress import ProgressTracker, PIPELINE_STAGES, STAGE_IDS
    from backend.stats_handler import StatsCallbackHandler
    from tradingagents.dataflows.a_stock import resolve_ticker, get_stock_display_name
    from tradingagents.dataflows.trading_calendar import resolve_analysis_date
    try:
        from tradingagents.graph.trading_graph import TradingAgentsGraph
    except ModuleNotFoundError as e:
        logger.error("Missing module for task %s: %s", task.ticker, e)
        raise

    _REPORT_KEY_TO_STAGE = {s["report_key"]: s["id"] for s in PIPELINE_STAGES}

    tracker = ProgressTracker()
    stats = StatsCallbackHandler()
    trade_date = resolve_analysis_date(task.trade_date)

    def send_progress():
        completed = list(tracker.completed_stages)
        s = stats.get_stats()
        return {
            "completedStages": completed,
            "currentStage": tracker.current_stage,
            "llmCalls": s["llm_calls"],
            "toolCalls": s["tool_calls"],
            "tokensIn": s["tokens_in"],
            "tokensOut": s["tokens_out"],
            "dataHealth": tracker.get_data_health_summary(),
            "stageReports": {k: str(v)[:3000] for k, v in tracker.stage_reports.items()},
            "elapsed": tracker.elapsed,
        }

    progress_emit = functools.partial(send_progress)

    try:
        ta = TradingAgentsGraph(debug=True, config=task.config, callbacks=[stats])
        ta.ticker = task.ticker

        init_state = ta.propagator.create_initial_state(task.ticker, trade_date)
        args = ta.propagator.get_graph_args(callbacks=[stats])

        tracker.is_running = True
        last_chunk: dict = {}

        # Start a heartbeat thread that emits elapsed-time updates every 1s
        # so the frontend sees a live timer even while graph.stream() blocks
        # on the first (or any) chunk.
        _heartbeat_stop = threading.Event()

        def _heartbeat_loop():
            """Update progress.elapsed periodically while the graph runs."""
            while not _heartbeat_stop.is_set():
                _heartbeat_stop.wait(timeout=1.0)
                if _heartbeat_stop.is_set():
                    break
                task.update_progress(**progress_emit())

        heartbeat = threading.Thread(
            target=_heartbeat_loop,
            daemon=True,
            name=f"heartbeat-{task.id[:8]}",
        )


        # Set display_name early so the UI can show it during analysis
        try:
            dn = get_stock_display_name(task.ticker)
        except Exception:
            dn = task.ticker
        tracker.current_stage = "initializing"
        task.update_progress(display_name=dn, **progress_emit())
        heartbeat.start()


        # Execute the graph
        for chunk in ta.graph.stream(init_state, **args):
            if task.cancel_requested:
                task.status = TASK_CANCELLED
                task.update_progress(**progress_emit())
                _heartbeat_stop.set()

                return

            last_chunk = chunk

            # Detect completed stages
            for report_key in _ANALYST_REPORT_KEYS:
                stage_id = _REPORT_KEY_TO_STAGE.get(report_key)
                if stage_id is None:
                    continue
                content = chunk.get(report_key, "")
                if content and tracker.stage_status(stage_id) != "done":
                    tracker.mark_stage_done(stage_id, _strip_think_tags(str(content)))

            dqs = chunk.get("data_quality_summary", "")
            if dqs and tracker.stage_status("quality_gate") != "done":
                tracker.mark_stage_done("quality_gate", str(dqs))

            debate = chunk.get("investment_debate_state")
            if debate and isinstance(debate, dict):
                judge = debate.get("judge_decision", "")
                if judge and tracker.stage_status("debate") != "done":
                    tracker.mark_stage_done("debate", str(judge))

            trader_plan = chunk.get("trader_investment_plan", "")
            if trader_plan and tracker.stage_status("trader") != "done":
                tracker.mark_stage_done("trader", _strip_think_tags(str(trader_plan)))

            risk = chunk.get("risk_debate_state")
            if risk and isinstance(risk, dict):
                risk_judge = risk.get("judge_decision", "")
                if risk_judge and tracker.stage_status("risk") != "done":
                    tracker.mark_stage_done("risk", str(risk_judge))

            final = chunk.get("final_trade_decision", "")
            if final and tracker.stage_status("pm") != "done":
                tracker.mark_stage_done("pm", _strip_think_tags(str(final)))

            # Update active stage
            for sid in STAGE_IDS:
                if tracker.stage_status(sid) == "pending":
                    tracker.mark_stage_active(sid)
                    break

            s = stats.get_stats()
            tracker.update_stats(s["llm_calls"], s["tool_calls"], s["tokens_in"], s["tokens_out"])

            task.update_progress(**progress_emit())

        # Analysis complete
        signal = ta.process_signal(last_chunk.get("rating", "") or last_chunk.get("final_trade_decision", ""))
        ta._log_state(trade_date, last_chunk)
        tracker.mark_complete(last_chunk, signal)

        try:
            display_name = get_stock_display_name(task.ticker)
        except Exception:
            display_name = task.ticker

        analysis_time = datetime.now(_CST).strftime("%Y-%m-%d %H:%M:%S")
        task.result = {
            "ticker": task.ticker,
            "tradeDate": trade_date,
            "signal": signal,
            "elapsed": tracker.elapsed,
            "state": _serialize_state(last_chunk),
            "display_name": display_name,
            "analysis_time": analysis_time,
            "rating": last_chunk.get("rating", ""),
        }
        _heartbeat_stop.set()
        task.status = TASK_COMPLETE
        task.update_progress(display_name=display_name, **progress_emit())

    except Exception as e:
        logger.exception("Analysis failed for %s on %s", task.ticker, trade_date)
        try:
            _heartbeat_stop.set()
        except NameError:
            pass
        task.status = TASK_ERROR
        task.error = str(e)
        task.update_progress(**progress_emit())


def _serialize_state(final_state: dict) -> dict:
    """Deep-copy state to plain JSON-safe dicts."""
    import copy
    return copy.deepcopy(final_state)
