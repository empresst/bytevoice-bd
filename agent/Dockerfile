
# syntax=docker/dockerfile:1

ARG PYTHON_VERSION=3.14
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base

ENV PYTHONUNBUFFERED=1
ENV UV_COMPILE_BYTECODE=1
ENV HF_HOME=/app/.cache/huggingface
ENV TORCH_HOME=/app/.cache/torch
ENV PRISMA_BINARY_CACHE_DIR=/app/.cache/prisma-python/binaries

# --- Build stage ---
FROM base AS build


RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    python3-dev \
    nodejs \
    npm \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PRISMA_USE_NODEJS_BIN=1

# Install dependencies
COPY pyproject.toml uv.lock ./
RUN mkdir -p src
RUN uv sync --locked

# Download LiveKit model files
RUN uv run --module livekit.agents download-files

# Copy application code and Prisma schema
COPY . .

# Generate Prisma client and fetch the engine
RUN uv run prisma generate
RUN uv run prisma py fetch

# Verify the query engine is in the expected cache
RUN find /app/.cache/prisma-python/binaries \
    -name 'prisma-query-engine-debian-openssl-3.0.x' \
    -type f -print

# --- Production stage ---
FROM base

ARG UID=10001

RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

# Copy application, virtual environment, and Prisma binary cache
COPY --from=build --chown=appuser:appuser /app /app

WORKDIR /app
USER appuser

CMD ["uv", "run", "src/agent.py", "start"]
