#!/usr/bin/env bash
# Ralph Loop — autonomous PR merge babysitter (CTO mode)
# Polls open PRs, updates behind branches, enables auto-merge.
# Never force-merges DIRTY/CONFLICTING. Never uses secrets from chat.
#
# Usage:
#   bash tools/ralph-pr-loop.sh --once
#   bash tools/ralph-pr-loop.sh --max-cycles 80
#   RALPH_INTERVAL_SEC=120 bash tools/ralph-pr-loop.sh
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-IgorGanapolsky/mac-yolo-safeguards}"
ONCE=0
MAX=999999
INTERVAL="${RALPH_INTERVAL_SEC:-90}"
LOG_DIR="${RALPH_LOG_DIR:-/tmp/ralph-pr-loop}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/ralph-$(date -u +%Y%m%d).log"
PID_FILE="$LOG_DIR/ralph.pid"
echo $$ >"$PID_FILE"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --once) ONCE=1; shift ;;
    --max-cycles) MAX="$2"; shift 2 ;;
    *) shift ;;
  esac
done

cycle=0
while (( cycle < MAX )); do
  cycle=$((cycle + 1))
  log "=== RALPH CYCLE $cycle ==="

  main_sha=$(gh api "repos/$REPO/commits/main" --jq '.sha[0:8]' 2>/dev/null || echo unknown)
  log "main=$main_sha"

  # Portable (no mapfile): stream PR rows
  gh pr list -R "$REPO" --state open --limit 40 --json number,mergeable,mergeStateStatus,isDraft,autoMergeRequest,headRefName,title \
    --jq '.[]|select(.isDraft==false)|"\(.number)\t\(.mergeable)\t\(.mergeStateStatus)\t\(.autoMergeRequest!=null)\t\(.headRefName)\t\(.title[0:60])"' \
    2>>"$LOG" | while IFS=$'\t' read -r num mergeable ms auto head title; do
      [[ -z "${num:-}" ]] && continue
      log "PR#$num ms=$ms m=$mergeable auto=$auto head=$head :: $title"

      if [[ "$ms" == "DIRTY" || "$mergeable" == "CONFLICTING" ]]; then
        log "  skip conflict"
        continue
      fi

      # Dependabot major/red: only update-branch + auto if mergeable (no special close here)
      if [[ "$ms" == "BEHIND" ]]; then
        if gh pr update-branch "$num" -R "$REPO" >>"$LOG" 2>&1; then
          log "  update-branch ok"
        else
          log "  update-branch failed"
        fi
      fi

      if [[ "$mergeable" == "MERGEABLE" && "$auto" != "true" ]]; then
        if gh pr merge "$num" -R "$REPO" --auto --squash >>"$LOG" 2>&1; then
          log "  auto-merge enabled"
        else
          log "  auto-merge enable failed"
        fi
      fi

      fails=$(gh pr checks "$num" -R "$REPO" 2>/dev/null | awk '/fail/ {print}' | head -3 || true)
      if [[ -n "${fails:-}" ]]; then
        log "  FAIL: $fails"
      fi

      # Required-check snapshot (compact)
      req=$(gh pr checks "$num" -R "$REPO" 2>/dev/null | awk '/Maestro ship-guard|macOS guard kit|Hermes Mobile typecheck/ {print $1":"$2}' | tr '\n' ' ' || true)
      [[ -n "${req:-}" ]] && log "  req: $req"
    done

  log "recent merges:"
  gh pr list -R "$REPO" --state merged --limit 4 --json number,mergedAt,title \
    --jq '.[]|"  #\(.number) \(.mergedAt) \(.title[0:50])"' 2>>"$LOG" | tee -a "$LOG" || true

  open_n=$(gh pr list -R "$REPO" --state open --json number --jq 'length' 2>/dev/null || echo '?')
  log "open_prs=$open_n"

  if (( ONCE == 1 )); then
    log "once mode exit"
    break
  fi
  log "sleep ${INTERVAL}s"
  sleep "$INTERVAL"
done

log "Ralph loop ended cycle=$cycle"
rm -f "$PID_FILE"
