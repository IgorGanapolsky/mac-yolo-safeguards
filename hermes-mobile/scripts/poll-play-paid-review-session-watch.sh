#!/usr/bin/env bash
# 4–6h sparse session watcher for Play paid review (console + public).
# Durable long-term watch is LaunchAgent com.igor.hermes-mobile-play-paid-review-poll.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="${ROOT}/scripts/poll-play-paid-review.sh"
PROOF_DIR="${ROOT}/docs/proofs"
LOG="${PROOF_DIR}/play-paid-review-poll-20260721-continue.log"
STATUS="${PROOF_DIR}/play-paid-review-poll-20260721-continue.status"
PIDF="${PROOF_DIR}/play-paid-review-poll-20260721-continue.pid"
LATEST="${PROOF_DIR}/play-paid-review-latest.json"
INTERVAL="${PLAY_PAID_WATCH_INTERVAL:-900}"
MAX="${PLAY_PAID_WATCH_MAX_SECONDS:-$((6 * 60 * 60))}"

mkdir -p "$PROOF_DIR"
echo "$$" > "$PIDF"
START=$(date +%s)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] SESSION_WATCH_START max=${MAX}s interval=${INTERVAL}s pid=$$" | tee -a "$LOG"
echo RUNNING > "$STATUS"

while true; do
  elapsed=$(( $(date +%s) - START ))
  if (( elapsed > MAX )); then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] WINDOW_EXPIRED elapsed=${elapsed}s" | tee -a "$LOG"
    echo EXPIRED > "$STATUS"
    rm -f "$PIDF"
    exit 2
  fi

  PLAY_PAID_POLL_CONSOLE=1 bash "$SCRIPT" | tee -a "$LOG"
  st="$(python3 -c "import json; print(json.load(open('${LATEST}')).get('status',''))" 2>/dev/null || echo unknown)"
  if [[ "$st" == "live" ]]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] PUBLIC_LIVE" | tee -a "$LOG"
    echo LIVE > "$STATUS"
    rm -f "$PIDF"
    exit 0
  fi
  if [[ "$st" == "needs_action" ]]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] NEEDS_ACTION" | tee -a "$LOG"
    echo NEEDS_ACTION > "$STATUS"
    rm -f "$PIDF"
    exit 3
  fi
  sleep "$INTERVAL"
done
