#!/usr/bin/env bash
# deploy-cloudflare-with-lock.sh - serialize hermes-control-plane production deploys
# across the many independent agents (each with their own locally-authenticated
# `wrangler` session) working this repo concurrently.
#
# There is no CI-based deploy pipeline (no Cloudflare secrets exist in GitHub Actions),
# so every deploy tonight was a bare local `npm run deploy:cloudflare` from whichever
# agent's machine got there first, with nothing stopping two agents from deploying at
# the same time. That's a real, observed cause of inconsistent live behavior (a browser
# loading a JS bundle from one deploy while the server-side routes reflect a different,
# later deploy). This wraps the existing deploy scripts in a lock built on GitHub's own
# Deployments API (already authenticated via `gh`, no new secrets required, and creating
# a deployment record is an atomic server-side operation - no git-push race).
#
#   deploy-cloudflare-with-lock.sh            # acquire lock, deploy, release lock
#   deploy-cloudflare-with-lock.sh --status   # report current lock state, exit 0/1
set -euo pipefail

REPO="${DEPLOY_LOCK_REPO:-IgorGanapolsky/mac-yolo-safeguards}"
ENVIRONMENT="${DEPLOY_LOCK_ENVIRONMENT:-hermes-control-plane-production}"
STALE_AFTER_MINUTES="${DEPLOY_LOCK_STALE_MINUTES:-20}"
REF="${DEPLOY_LOCK_REF:-main}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_active_lock() {
  DEPLOY_LOCK_REPO="$REPO" DEPLOY_LOCK_ENVIRONMENT="$ENVIRONMENT" \
    DEPLOY_LOCK_STALE_MINUTES="$STALE_AFTER_MINUTES" GH_TOKEN="$GH_TOKEN" \
    node "$SCRIPT_DIR/deploy-lock-check.mjs"
}

GH_TOKEN="$(gh auth token)"
export GH_TOKEN

if [[ "${1:-}" == "--status" ]]; then
  if lock="$(find_active_lock)"; then
    echo "LOCKED: $lock"
    exit 1
  else
    echo "UNLOCKED"
    exit 0
  fi
fi

if lock="$(find_active_lock)"; then
  echo "Another deploy is already in progress, refusing to race it:" >&2
  echo "$lock" >&2
  echo "If this is stale (a crashed process older than ${STALE_AFTER_MINUTES}m would have been ignored already)," >&2
  echo "wait for it to resolve or investigate before forcing anything." >&2
  exit 1
fi

DEPLOYMENT_ID="$(gh api -X POST "repos/${REPO}/deployments" \
  -f "ref=${REF}" \
  -f "environment=${ENVIRONMENT}" \
  -F "auto_merge=false" \
  -f "description=hermes-control-plane deploy lock, held by $(whoami)@$(hostname -s)" \
  --jq '.id')"

echo "Acquired deploy lock (deployment id ${DEPLOYMENT_ID})."

gh api -X POST "repos/${REPO}/deployments/${DEPLOYMENT_ID}/statuses" \
  -f "state=in_progress" \
  -f "description=Running predeploy:cloudflare + deploy:cloudflare" >/dev/null

resolve_lock() {
  local final_state="$1"
  gh api -X POST "repos/${REPO}/deployments/${DEPLOYMENT_ID}/statuses" \
    -f "state=${final_state}" \
    -f "description=Deploy ${final_state}" >/dev/null 2>&1 || true
  echo "Released deploy lock (deployment id ${DEPLOYMENT_ID}) as ${final_state}."
}
trap 'resolve_lock failure' ERR
trap 'resolve_lock failure' INT TERM

if [[ "${DEPLOY_LOCK_DRY_RUN:-0}" == "1" ]]; then
  echo "[dry-run] would run: npm run predeploy:cloudflare && npm run deploy:cloudflare"
  bash -c "${DEPLOY_LOCK_DRY_RUN_HOOK:-true}"
else
  cd "$(dirname "$0")/../apps/hermes-control-plane"
  npm run predeploy:cloudflare
  npm run deploy:cloudflare
fi

trap - ERR INT TERM
resolve_lock success
