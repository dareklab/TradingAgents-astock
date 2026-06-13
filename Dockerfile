# ── Multi-stage build ──────────────────────────────────────────
# Stage 1: install dependencies into a venv
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build

COPY pyproject.toml .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -c "import tomllib; deps = tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']; print('\n'.join(deps))" > /tmp/reqs.txt && \
    pip install --no-cache-dir -r /tmp/reqs.txt

COPY . .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --no-deps .

# ── Final stage ────────────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRADINGAGENTS_CACHE_DIR=/home/appuser/.tradingagents/cache

# CJK + emoji fonts for report rendering
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends fonts-wqy-microhei fonts-noto-color-emoji && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN useradd --create-home appuser && \
    mkdir -p /home/appuser/.tradingagents/cache && \
    chown -R appuser:appuser /home/appuser/.tradingagents

COPY --from=builder --chown=appuser:appuser /build .

# Pre-configure mootdx on first build (best-effort)
RUN su appuser -c "python -m mootdx bestip" 2>/dev/null || true

USER appuser
WORKDIR /home/appuser/app

EXPOSE 8000

# Default: run web UI (backend API + frontend)
# Override with `docker run --entrypoint tradingagents ...` for CLI mode
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
