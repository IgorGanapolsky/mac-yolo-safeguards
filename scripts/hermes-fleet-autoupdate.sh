#!/bin/bash
set -u

# Update Hermes only while its interactive CLI is idle, then prove the two
# dynamic capability surfaces that are easiest for a launcher allowlist to hide.
HERMES_AGENT_REPO="${HERMES_AGENT_REPO:-$HOME/.hermes/hermes-agent}"
HERMES_BIN="${HERMES_BIN:-$HOME/.local/bin/hermes}"
CAPABILITY_HEALER="${HERMES_CAPABILITY_HEALER:-$HOME/.local/bin/hermes-capability-heal}"
GIT_BIN="${HERMES_GIT_BIN:-/usr/bin/git}"
LOCK_DIR="${HERMES_UPDATE_LOCK_DIR:-/tmp/com.igor.hermes-fleet-autoupdate.lock}"
NTFY_URL="${HERMES_NTFY_URL:-}"

notify_failure() {
  local title="$1"
  local body="$2"
  if [ -n "$NTFY_URL" ]; then
    /usr/bin/curl -sS -m 8 -H "Title: $title" -H "Priority: high" -d "$body" "$NTFY_URL" >/dev/null 2>&1 || true
  fi
}

interactive_hermes_is_active() {
  case "${HERMES_UPDATER_ASSUME_ACTIVE:-auto}" in
    true) return 0 ;;
    false) return 1 ;;
    auto) /usr/bin/pgrep -f "$HERMES_AGENT_REPO/venv/bin/hermes" >/dev/null 2>&1 ;;
    *) echo "Invalid HERMES_UPDATER_ASSUME_ACTIVE value" >&2; return 0 ;;
  esac
}

source_checkout_is_safe() {
  local dirty=""
  local counts=""
  local ahead=""
  if [ ! -d "$HERMES_AGENT_REPO/.git" ] && [ ! -f "$HERMES_AGENT_REPO/.git" ]; then
    echo "  source update deferred: checkout is not a git worktree"
    return 1
  fi
  dirty="$("$GIT_BIN" -C "$HERMES_AGENT_REPO" status --porcelain=v1 2>/dev/null || true)"
  counts="$("$GIT_BIN" -C "$HERMES_AGENT_REPO" rev-list --left-right --count HEAD...origin/main 2>/dev/null || true)"
  ahead="${counts%%[[:space:]]*}"
  if [ -n "$dirty" ] || ! [[ "$ahead" =~ ^[0-9]+$ ]] || [ "$ahead" -gt 0 ]; then
    echo "  source update deferred: checkout is dirty or ahead (dirty=$([ -n "$dirty" ] && echo yes || echo no), ahead=${ahead:-unknown})"
    return 1
  fi
  return 0
}

LOCK_OWNER_FILE="$LOCK_DIR/owner.pid"
acquire_lock() {
  if /bin/mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" > "$LOCK_OWNER_FILE"
    return 0
  fi
  local owner=""
  if [ -f "$LOCK_OWNER_FILE" ]; then
    owner="$(/bin/cat "$LOCK_OWNER_FILE" 2>/dev/null || true)"
  fi
  if [[ "$owner" =~ ^[0-9]+$ ]] && /bin/kill -0 "$owner" 2>/dev/null; then
    return 1
  fi
  # Only reclaim locks created by this PID-aware implementation. A legacy
  # ownerless lock is left alone for manual one-time migration.
  if [[ "$owner" =~ ^[0-9]+$ ]]; then
    /bin/rm -f "$LOCK_OWNER_FILE"
    /bin/rmdir "$LOCK_DIR" 2>/dev/null || return 1
    /bin/mkdir "$LOCK_DIR" 2>/dev/null || return 1
    printf '%s\n' "$$" > "$LOCK_OWNER_FILE"
    return 0
  fi
  return 1
}

release_lock() {
  local owner=""
  if [ -f "$LOCK_OWNER_FILE" ]; then
    owner="$(/bin/cat "$LOCK_OWNER_FILE" 2>/dev/null || true)"
  fi
  if [ "$owner" = "$$" ]; then
    /bin/rm -f "$LOCK_OWNER_FILE"
    /bin/rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
}

if ! acquire_lock; then
  echo "=== $(/bin/date) Hermes updater skipped: another run owns $LOCK_DIR ==="
  exit 0
fi
trap release_lock EXIT INT TERM

echo "=== $(/bin/date) Hermes updater ==="
if [ ! -x "$HERMES_BIN" ]; then
  echo "Hermes updater failed: CLI is missing at $HERMES_BIN" >&2
  notify_failure "Hermes updater missing CLI" "The scheduled Hermes updater could not find its CLI."
  exit 1
fi

run_status=0
did_update=0
update_check="$("$HERMES_BIN" update --check 2>&1)"
check_status=$?
printf '%s\n' "$update_check"
if [ "$check_status" -ne 0 ]; then
  echo "Hermes update check failed." >&2
  run_status=1
elif printf '%s\n' "$update_check" | /usr/bin/grep -q 'Update available'; then
  if interactive_hermes_is_active; then
    echo "  update deferred: an interactive Hermes CLI is active"
  elif ! source_checkout_is_safe; then
    :
  elif "$HERMES_BIN" update --yes; then
    did_update=1
  else
    echo "Hermes update failed; existing state was preserved." >&2
    run_status=1
  fi
else
  echo "  already current"
fi

if [ "$did_update" -eq 1 ]; then
  /usr/bin/find "$HERMES_AGENT_REPO" -name '__pycache__' -type d -prune -exec /bin/rm -rf {} + 2>/dev/null || true
  /usr/bin/find "$HERMES_AGENT_REPO" -name '*.pyc' -delete 2>/dev/null || true
else
  echo "  bytecode cleanup skipped: no source update was applied"
fi

if ! "$HERMES_AGENT_REPO/venv/bin/python" -c 'import agent.prompt_builder, run_agent' 2>/dev/null; then
  echo "Post-update Hermes import proof failed." >&2
  notify_failure "Hermes import proof failed" "Hermes source changed or drifted and its import proof is red."
  run_status=1
else
  echo "  post-update import proof passed"
fi

if ! "$CAPABILITY_HEALER"; then
  echo "Hermes capability proof failed; inspect the capability-healer receipt." >&2
  notify_failure "Hermes capability proof failed" "Skills or Context7 failed the scheduled deterministic proof."
  run_status=1
else
  echo "  skills and Context7 capability proof passed"
fi

echo "--- done (status=$run_status) ---"
exit "$run_status"
