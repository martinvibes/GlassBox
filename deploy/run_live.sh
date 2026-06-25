#!/usr/bin/env bash
# GlassBox — go LIVE on BSC with REAL funds. Self-custody: the wallet signs locally
# via the ~/.twak keystore; the private key never leaves this machine.
#
# The agent stands by (reconcile + risk-exits only, NO entries, NO keep-alive) until
# GLASSBOX_TRADE_AFTER, then trades autonomously inside the risk gate. `caffeinate`
# keeps the Mac awake so it runs through the competition window.
#
# Usage:  bash deploy/run_live.sh        # foreground (keep terminal open)
#         (or load the launchd service — see deploy/com.glassbox.live.plist)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../backend"
# shellcheck disable=SC1091
source .venv/bin/activate

export GLASSBOX_MODE=live
# Start trading exactly at the competition open (07:00 WAT, 22 Jun = 06:00 UTC).
export GLASSBOX_TRADE_AFTER="${GLASSBOX_TRADE_AFTER:-2026-06-22T07:00:00+01:00}"
export GLASSBOX_HEARTBEAT_SECONDS="${GLASSBOX_HEARTBEAT_SECONDS:-60}"  # tighter: faster exit checks

echo "=================================================================="
echo " GlassBox LIVE — real funds on BSC (self-custody, local signing)"
echo " Trading begins : $GLASSBOX_TRADE_AFTER  (standing by until then)"
echo " Heartbeat      : ${GLASSBOX_HEARTBEAT_SECONDS}s"
echo " Stop anytime   : Ctrl-C  (or: launchctl bootout gui/\$UID/com.glassbox.live)"
echo "=================================================================="
# caffeinate -is: keep the system + display awake while the agent runs.
exec caffeinate -is python -m glassbox.orchestrator --mode live
