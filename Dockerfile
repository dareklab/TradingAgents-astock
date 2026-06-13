FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build

COPY pyproject.toml .
RUN pip install --no-cache-dir uvicorn fastapi && \
    python -c "import tomllib; deps = tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']; print('\n'.join(deps))" > /tmp/reqs.txt && \
    pip install --no-cache-dir -r /tmp/reqs.txt

COPY . .
RUN pip install --no-cache-dir --no-deps . && \
    rm -rf /root/.cache/pip

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRADINGAGENTS_CACHE_DIR=/home/appuser/.tradingagents/cache

RUN apt-get update && \
    apt-get install -y --no-install-recommends fonts-wqy-microhei && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN useradd --create-home appuser && \
    mkdir -p /home/appuser/app /home/appuser/.tradingagents/cache && \
    chown -R appuser:appuser /home/appuser

WORKDIR /home/appuser/app
COPY --from=builder --chown=appuser:appuser /build .

RUN su appuser -c "python -m mootdx bestip" 2>/dev/null || true

USER appuser
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
