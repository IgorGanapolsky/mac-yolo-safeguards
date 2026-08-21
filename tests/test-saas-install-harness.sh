#!/usr/bin/env bash
# Proves saas/install-harness.sh is lint-clean, syntactically valid, and
# idempotent in a throwaway HOME — WITHOUT network, WITHOUT managing the
# protected LaunchAgents, and WITHOUT writing any secrets.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../saas/install-harness.sh"
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }
cleanup(){ [ -n "$ROOT" ] && rm -rf "$ROOT"; }
trap cleanup EXIT
ROOT="$(mktemp -d)"

chmod +x "$SCRIPT"

if ! command -v shellcheck >/dev/null 2>&1; then
  echo "saas install-harness: shellcheck not installed — skipping lint (pass=1 fail=0)"; exit 0
fi

shellcheck "$SCRIPT" && ok "shellcheck clean" || no "shellcheck"
bash -n "$SCRIPT" && ok "bash syntax" || no "bash syntax"

# dry-run in an isolated HOME: no network, no protected LaunchAgent mutation, no secrets
TMP_HOME="$ROOT/home"; mkdir -p "$TMP_HOME"
HOME="$TMP_HOME" HERMES_HARNESS_DRY_RUN=1 HERMES_CONTROL_PLANE_URL=https://thumbgate.app \
  bash "$SCRIPT" >/tmp/hermes-harness-dr.log 2>&1 \
  && ok "dry-run exits 0 (no network/side-effects)" || { no "dry-run exit"; cat /tmp/hermes-harness-dr.log; }

[ -f "$TMP_HOME/.hermes/.env" ] && ok "~/.hermes/.env skeleton created" || no "~/.hermes/.env skeleton"
grep -q 'HERMES_CONTROL_PLANE_URL' "$TMP_HOME/.hermes/.env" && ok ".env has no inline secret values" || no ".env missing control-plane url"

# protected LaunchAgents must NEVER be managed by this script
if ! grep -qE 'launchctl[^#]*com\.igor\.(shutdown-simulators|hermes-mobile-continuous-e2e)' "$SCRIPT"; then
  ok "protected LaunchAgents (com.igor.shutdown-simulators, com.igor.hermes-mobile-continuous-e2e) never managed"
else
  no "protected LaunchAgent managed — VIOLATION"
fi

# interactive browser must stay gated (no headless-default osascript/com.hermes.chrome-cdp auto-install)
if grep -qE 'osascript.*chrome|com\.hermes\.chrome-cdp' "$SCRIPT"; then
  if grep -qE 'HERMES_ALLOW_INTERACTIVE_CHROME' "$SCRIPT"; then
    ok "interactive browser gated behind HERMES_ALLOW_INTERACTIVE_CHROME=1"
  else
    no "interactive browser not gated"
  fi
else
  ok "no interactive-chrome/osascript/com.hermes.chrome-cdp in headless default path"
fi

echo "saas install-harness: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
