#!/usr/bin/env bash
# Runs the agent + dashboard together in one container. The agent auto-restarts if
# it ever exits; the dashboard runs in the foreground (Railway restarts the container
# if IT dies). Both share /app/backend/data.
set -uo pipefail

DATA_DIR="${GLASSBOX_DATA_DIR:-/app/backend/data}"
mkdir -p "$DATA_DIR"

# ── LIVE: materialize the TWAK keystore from base64 env vars ──────────────────
# A cloud host has no ~/.twak keystore and no macOS keychain. For live mode we
# recreate the two keystore files from Railway's encrypted env vars (the wallet
# stays encrypted; the password is supplied separately as TWAK_WALLET_PASSWORD).
# Paper mode skips this entirely (no keys on the box).
if [ "${GLASSBOX_MODE:-paper}" = "live" ]; then
  TWAK_HOME="${HOME:-/root}/.twak"
  mkdir -p "$TWAK_HOME"; chmod 700 "$TWAK_HOME"
  if [ -n "${TWAK_WALLET_JSON_B64:-}" ]; then
    echo "$TWAK_WALLET_JSON_B64" | base64 -d > "$TWAK_HOME/wallet.json" && chmod 600 "$TWAK_HOME/wallet.json"
    echo "→ wallet keystore restored"
  else
    echo "⚠ LIVE mode but TWAK_WALLET_JSON_B64 is unset — signing will fail."
  fi
  if [ -n "${TWAK_CREDENTIALS_JSON_B64:-}" ]; then
    echo "$TWAK_CREDENTIALS_JSON_B64" | base64 -d > "$TWAK_HOME/credentials.json" && chmod 600 "$TWAK_HOME/credentials.json"
  fi
fi

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
