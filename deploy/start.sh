#!/usr/bin/env bash
# Runs the agent + dashboard together in one container. The agent auto-restarts if
# it ever exits; the dashboard runs in the foreground (Railway restarts the container
# if IT dies). Both share /app/backend/data.
set -uo pipefail

DATA_DIR="${GLASSBOX_DATA_DIR:-/app/backend/data}"
mkdir -p "$DATA_DIR"

# ── trading agent (auto-restart loop, background) ────────────────────────────
(
  cd /app/backend
  while true; do
    echo "→ GlassBox agent starting (mode=${GLASSBOX_MODE:-paper})"
    PYTHONUNBUFFERED=1 /app/backend/.venv/bin/glassbox --mode "${GLASSBOX_MODE:-paper}" || true
    echo "⚠ agent exited — restarting in 5s"
    sleep 5
  done
) &

# ── dashboard (foreground, serves the public port) ───────────────────────────
echo "→ dashboard on :${PORT:-3000}"
cd /app/frontend
exec node_modules/.bin/next start -p "${PORT:-3000}" -H 0.0.0.0
