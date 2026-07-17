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
MAX_BRANCH_UPDATES_PER_CYCLE="${RALPH_MAX_BRANCH_UPDATES_PER_CYCLE:-2}"
LOG_DIR="${RALPH_LOG_DIR:-/tmp/ralph-pr-loop}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/ralph-$(date -u +%Y%m%d).log"
PID_FILE="$LOG_DIR/ralph.pid"

if [[ ! "$MAX_BRANCH_UPDATES_PER_CYCLE" =~ ^[0-9]+$ ]]; then
  echo "RALPH_MAX_BRANCH_UPDATES_PER_CYCLE must be a non-negative integer" >&2
  exit 2
fi

PR_ROWS_FILE="$LOG_DIR/pr-rows-$$.tsv"
echo $$ >"$PID_FILE"
trap 'rm -f "$PID_FILE" "$PR_ROWS_FILE"' EXIT

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
  branch_updates=0
  deferred_branch_updates=0

  main_sha=$(gh api "repos/$REPO/commits/main" --jq '.sha[0:8]' 2>/dev/null || echo unknown)
  log "main=$main_sha"

  # Materialize the list so a GitHub API failure remains a hard cycle failure;
  # process substitution would otherwise hide the producer's exit status.
  if ! gh pr list -R "$REPO" --state open --limit 40 --json number,mergeable,mergeStateStatus,isDraft,autoMergeRequest,headRefName,title \
    --jq '.[]|select(.isDraft==false)|"\(.number)\t\(.mergeable)\t\(.mergeStateStatus)\t\(.autoMergeRequest!=null)\t\(.headRefName)\t\(.title[0:60])"' \
    >"$PR_ROWS_FILE" 2>>"$LOG"; then
    log "open PR scan failed"
    exit 1
  fi

  while IFS=$'\t' read -r num mergeable ms auto head title; do
      [[ -z "${num:-}" ]] && continue
      log "PR#$num ms=$ms m=$mergeable auto=$auto head=$head :: $title"

      if [[ "$ms" == "DIRTY" || "$mergeable" == "CONFLICTING" ]]; then
        log "  skip conflict"
        continue
      fi

      # Updating a branch pushes a new commit and fans out CI. Bound that fan-out
      # per cycle so a busy main branch cannot create a runner/credit storm.
      if [[ "$ms" == "BEHIND" ]]; then
        if (( branch_updates >= MAX_BRANCH_UPDATES_PER_CYCLE )); then
          deferred_branch_updates=$((deferred_branch_updates + 1))
          log "  defer update: cycle budget ${branch_updates}/${MAX_BRANCH_UPDATES_PER_CYCLE} exhausted"
        elif gh pr update-branch "$num" -R "$REPO" >>"$LOG" 2>&1; then
          branch_updates=$((branch_updates + 1))
          log "  update-branch ok (${branch_updates}/${MAX_BRANCH_UPDATES_PER_CYCLE})"
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
    done <"$PR_ROWS_FILE"

  log "branch_updates=$branch_updates deferred_branch_updates=$deferred_branch_updates budget=$MAX_BRANCH_UPDATES_PER_CYCLE"

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
