# Bangla receptionist agent for LiveKit Cloud.
# Python 3.12 matches the version the agent was developed and tested on.
ARG PYTHON_VERSION=3.12
FROM ghcr.io/astral-sh/uv:python${PYTHON_VERSION}-bookworm-slim AS base
ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    HF_HOME=/app/.cache/huggingface

FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ python3-dev \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN mkdir -p src && uv sync --locked --no-dev
COPY . .
# Bake model files (Silero VAD) into the image so calls don't wait for downloads.
RUN uv run --no-dev src/agent.py download-files

FROM base
# Azure Speech SDK (speech recognition) needs OpenSSL, CA certificates and ALSA on Linux.
RUN apt-get update && apt-get install -y --no-install-recommends libssl3 ca-certificates libasound2 \
  && rm -rf /var/lib/apt/lists/*
ARG UID=10001
RUN adduser --disabled-password --gecos "" --home /app --shell /sbin/nologin --uid "${UID}" appuser
COPY --from=build --chown=appuser:appuser /app /app
WORKDIR /app
USER appuser
CMD ["uv", "run", "--no-dev", "src/agent.py", "start"]
