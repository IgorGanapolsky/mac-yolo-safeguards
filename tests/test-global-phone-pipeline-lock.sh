#!/usr/bin/env bash
# Ensure phone pipeline locks are GLOBAL (outside any git worktree), so concurrent
# agents cannot install/pair the same USB phone via per-checkout lock files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
assert() {
  local name="$1" cond="$2"
  if eval "$cond"; then
    echo "OK  $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL $name"
    FAIL=$((FAIL + 1))
  fi
}

# --- Node lock module paths ---
eval "$(node -e '
const m = require("./tools/agent-phone-pipeline-lock.js");
const path = require("path");
const os = require("os");
const repo = m.REPO;
console.log("NODE_REPO=" + JSON.stringify(repo));
console.log("NODE_GLOBAL=" + JSON.stringify(m.GLOBAL_PHONE_DIR));
console.log("NODE_INSTALL_LOCK=" + JSON.stringify(m.INSTALL_LOCK));
console.log("NODE_LOCK_DIR=" + JSON.stringify(m.LOCK_DIR));
console.log("NODE_HOME=" + JSON.stringify(os.homedir()));
')"

assert "GLOBAL_PHONE_DIR is set" '[[ -n "$NODE_GLOBAL" ]]'
assert "INSTALL_LOCK lives under GLOBAL_PHONE_DIR" '[[ "$NODE_INSTALL_LOCK" == "$NODE_GLOBAL"* ]]'
assert "LOCK_DIR lives under GLOBAL_PHONE_DIR" '[[ "$NODE_LOCK_DIR" == "$NODE_GLOBAL"* ]]'
assert "GLOBAL_PHONE_DIR is NOT inside this repo" '[[ "$NODE_GLOBAL" != "$NODE_REPO"* ]]'
assert "default GLOBAL_PHONE_DIR contains phone-pipeline" '[[ "$NODE_GLOBAL" == *phone-pipeline* ]]'

# Override via env
OVERRIDE="$(mktemp -d "${TMPDIR:-/tmp}/phone-lock-test.XXXXXX")"
export HERMES_GLOBAL_PHONE_LOCK_DIR="$OVERRIDE"
eval "$(node -e '
const path = require("path");
// re-require after env — module caches; spawn fresh
' >/dev/null)"
OVR_GLOBAL="$(HERMES_GLOBAL_PHONE_LOCK_DIR="$OVERRIDE" node -e 'console.log(require("./tools/agent-phone-pipeline-lock.js").GLOBAL_PHONE_DIR)')"
assert "HERMES_GLOBAL_PHONE_LOCK_DIR override works" '[[ "$OVR_GLOBAL" == "$OVERRIDE" ]]'
rm -rf "$OVERRIDE"
unset HERMES_GLOBAL_PHONE_LOCK_DIR

# --- install-phone-release.sh resolves same global dir ---
SCRIPT="$ROOT/hermes-mobile/scripts/install-phone-release.sh"
assert "install-phone-release.sh exists" '[[ -f "$SCRIPT" ]]'
assert "install script mentions GLOBAL_PHONE_DIR" 'grep -q "GLOBAL_PHONE_DIR" "$SCRIPT"'
assert "install script uses Application Support phone-pipeline" \
  'grep -q "mac-yolo-safeguards/phone-pipeline" "$SCRIPT"'
assert "install script does NOT default LOCK_FILE under HERMES_DIR" \
  '! grep -E "^LOCK_FILE=\"\\\$HERMES_DIR/" "$SCRIPT"'

# --- mutual exclusion smoke (two quick acquires via node) ---
TMP_LOCK="$(mktemp -d "${TMPDIR:-/tmp}/phone-lock-mutex.XXXXXX")"
export HERMES_GLOBAL_PHONE_LOCK_DIR="$TMP_LOCK"
export HERMES_PHONE_PIPELINE_LOCK_WAIT_MS=800

node <<'NODE' &
const { withPhonePipelineLock } = require('./tools/agent-phone-pipeline-lock.js');
withPhonePipelineLock('holder-a', () => {
  const end = Date.now() + 600;
  while (Date.now() < end) { /* hold */ }
});
NODE
HOLDER_PID=$!
sleep 0.15

SKIP_OUT="$(node -e '
const { withPhonePipelineLock } = require("./tools/agent-phone-pipeline-lock.js");
const r = withPhonePipelineLock("holder-b", () => {}, { skipIfBusy: true });
process.stdout.write(JSON.stringify(r));
' 2>/dev/null || echo '{"ran":true,"error":1}')"
wait "$HOLDER_PID" || true
assert "second acquirer skipIfBusy while first holds" '[[ "$SKIP_OUT" == *"\"skipped\":true"* ]] || [[ "$SKIP_OUT" == *"\"ran\":false"* ]]'

rm -rf "$TMP_LOCK"
unset HERMES_GLOBAL_PHONE_LOCK_DIR HERMES_PHONE_PIPELINE_LOCK_WAIT_MS

echo ""
echo "Passed: $PASS  Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
