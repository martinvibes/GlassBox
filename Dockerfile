# GlassBox — single-container deploy. Runs BOTH the Python trading agent and the
# Next.js dashboard, sharing one filesystem exactly like local dev (the dashboard
# reads the agent's audit files off the same disk). Paper mode by default; flip to
# live with env vars (see docs/DEPLOY.md). Works on Railway / Render / Fly.io.

# ── Stage 1: build the Next.js dashboard ─────────────────────────────────────
FROM node:20-bookworm-slim AS web
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 2: runtime (Node + Python, runs agent + dashboard together) ─────────
FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Python trading agent + its deps (incl. anthropic for the Claude brain)
COPY backend/ ./backend/
RUN python3 -m venv /app/backend/.venv \
 && /app/backend/.venv/bin/pip install --no-cache-dir -U pip \
 && /app/backend/.venv/bin/pip install --no-cache-dir -e "/app/backend[llm]"

# Built dashboard (+ node_modules so `next start` resolves identically to local)
COPY --from=web /app/frontend/.next ./frontend/.next
COPY --from=web /app/frontend/node_modules ./frontend/node_modules
COPY --from=web /app/frontend/public ./frontend/public
COPY --from=web /app/frontend/package.json ./frontend/package.json
COPY --from=web /app/frontend/next.config.mjs ./frontend/next.config.mjs

COPY deploy/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Defaults: paper mode, shared data dir (the dashboard reads ../backend/data too)
ENV GLASSBOX_MODE=paper \
    GLASSBOX_DATA_DIR=/app/backend/data \
    GLASSBOX_LLM_MODEL=claude-haiku-4-5-20251001 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

EXPOSE 3000
CMD ["/app/start.sh"]
