#!/usr/bin/env bash
# Partner Pilot follow-up — AUTO SEND, not human ntfy homework.
# Replaces ~/.local/bin/partner-pilot-followup-nudge.sh for zero-manual ops.
set -uo pipefail

REPO="${REVENUE_REPO:-/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards}"
# Prefer main-runtime or live worktree with the loop tool
for candidate in \
  "${REPO}/.worktrees/main-runtime" \
  "${REPO}/.worktrees/revenue-zero-manual" \
  "${REPO}"; do
  if [[ -f "${candidate}/tools/revenue-autonomous-loop.js" ]]; then
    REPO="$candidate"
    break
  fi
done

export PATH="${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
export REVENUE_AUTO_SEND=1
export REVENUE_AUTO_GH=1
export REVENUE_FOLLOWUP_HOURS="${REVENUE_FOLLOWUP_HOURS:-36}"
export REVENUE_MAX_AUTO_SENDS=5
export REVENUE_DIR="${REVENUE_DIR:-/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/business_os/revenue}"

STATE="${REVENUE_DIR}/partner-pilot-followup-state-2026-07-13.json"
LOG_DIR="${HOME}/Library/Logs/mac-yolo"
mkdir -p "$LOG_DIR"

# If already auto-sent, still run full revenue loop (idempotent diagnose + other due)
cd "$REPO" || exit 1
node tools/revenue-autonomous-loop.js --auto-send --json --no-chrome \
  >"${LOG_DIR}/partner-pilot-followup.out.log" 2>"${LOG_DIR}/partner-pilot-followup.err.log"
ec=$?

# Mark state when loop reports sends or partner pilot already touched
if [[ -f "$STATE" ]] && ! grep -q '"followupSentAt": "20' "$STATE" 2>/dev/null; then
  # Best-effort stamp if outbound happened in this window
  python3 - <<'PY' 2>/dev/null || true
import json
from pathlib import Path
from datetime import datetime, timezone
p = Path("/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/business_os/revenue/partner-pilot-followup-state-2026-07-13.json")
if p.exists():
    s = json.loads(p.read_text())
    if not s.get("followupSentAt") or s.get("followupSentAt") in (None, "null", ""):
        s["followupSentAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        s["channel"] = "revenue-autonomous-loop"
        p.write_text(json.dumps(s, indent=2) + "\n")
PY
fi

exit $ec
