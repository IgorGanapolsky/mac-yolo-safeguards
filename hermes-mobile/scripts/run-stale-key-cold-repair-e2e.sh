#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FLOW="$APP_DIR/.maestro/stale-key-cold-repair.yaml"
FIXTURE="$SCRIPT_DIR/stale-key-gateway-fixture.js"
PORT="${HERMES_STALE_KEY_E2E_PORT:-8642}"

command -v adb >/dev/null || { echo "adb is required" >&2; exit 1; }
command -v maestro >/dev/null || { echo "maestro is required" >&2; exit 1; }

EMULATOR_ID="$(adb devices | awk '$2 == "device" && $1 ~ /^emulator-/ { print $1; exit }')"
if [[ -z "$EMULATOR_ID" ]]; then
  echo "SKIP: stale-key cold-repair E2E is emulator-only; refusing to control a physical phone" >&2
  exit 75
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/hermes-stale-key-e2e.XXXXXX")"
AUDIT="$TMP_DIR/audit.jsonl"
FIXTURE_LOG="$TMP_DIR/fixture.log"
FIXTURE_PID=""

cleanup() {
  if [[ -n "$FIXTURE_PID" ]]; then
    kill "$FIXTURE_PID" 2>/dev/null || true
    wait "$FIXTURE_PID" 2>/dev/null || true
  fi
  adb -s "$EMULATOR_ID" reverse --remove "tcp:$PORT" >/dev/null 2>&1 || true
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

HERMES_STALE_KEY_E2E_PORT="$PORT" \
HERMES_STALE_KEY_E2E_AUDIT="$AUDIT" \
node "$FIXTURE" >"$FIXTURE_LOG" 2>&1 &
FIXTURE_PID=$!

for _ in {1..40}; do
  curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.25
done
curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null
adb -s "$EMULATOR_ID" reverse "tcp:$PORT" "tcp:$PORT"

(cd "$APP_DIR" && maestro --device "$EMULATOR_ID" test "$FLOW")

node - "$AUDIT" <<'NODE'
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split(/\n+/).filter(Boolean).map(JSON.parse);
const rejected = rows.some((row) => row.status === 401 && row.authenticated === false);
const accepted = rows.filter((row) => row.path === '/api/sessions' && row.status === 200 && row.authenticated === true);
if (!rejected || accepted.length < 2) {
  console.error(JSON.stringify({ rejected, authenticatedSessionProbes: accepted.length }));
  process.exit(1);
}
console.log(JSON.stringify({ rejected, authenticatedSessionProbes: accepted.length }));
NODE
