#!/usr/bin/env bash
# Production OTA gate (crisis 2026-07-15, amended 2026-07-15 OTA unblock).
#
# PASS when ANY of:
#   1) continuous latest.json e2e=pass
#   2) fresh-user proof JSON e2e/status=pass (npm run e2e:fresh-user)
#   3) stranger cold-start proof (local JSON OR GitHub check
#      "Maestro stranger cold-start (Android emulator)"=success on GITHUB_SHA)
#
# continuous e2e=skipped is NOT pass and is NOT a hard-block by itself when (3)
# succeeds. Prefer CI stranger Maestro green on the publish SHA over waiting for
# a USB continuous cycle that is often skipped (phone awake / lease busy).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LATEST_JSON="${HERMES_CONTINUOUS_LATEST_JSON:-$REPO_ROOT/hermes-mobile/docs/proofs/continuous/latest.json}"
FRESH_JSON="${HERMES_FRESH_USER_PROOF_JSON:-$REPO_ROOT/hermes-mobile/docs/proofs/fresh-user/latest.json}"

if [[ "${HERMES_OTA_FORCE_UNSAFE:-}" == "1" ]]; then
  echo "FATAL: HERMES_OTA_FORCE_UNSAFE=1 is disabled after 2026-07-15 production crisis." >&2
  echo "Prove stranger CI / fresh-user / continuous e2e=pass; do not bypass." >&2
  exit 2
fi

pass_from_json() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  python3 - "$path" <<'PY'
import json, sys
path = sys.argv[1]
try:
    data = json.load(open(path))
except Exception:
    sys.exit(1)
status = (data.get("e2e") or data.get("status") or data.get("result") or "").strip().lower()
sys.exit(0 if status == "pass" else 1)
PY
}

if pass_from_json "$LATEST_JSON"; then
  echo "fresh-user OTA gate: PASS via continuous latest.json e2e=pass ($LATEST_JSON)"
  exit 0
fi

if pass_from_json "$FRESH_JSON"; then
  echo "fresh-user OTA gate: PASS via fresh-user proof ($FRESH_JSON)"
  exit 0
fi

if node "$REPO_ROOT/hermes-mobile/scripts/require-stranger-cold-start-proof.cjs" --hard; then
  echo "fresh-user OTA gate: PASS via stranger cold-start proof (CI check or local JSON)"
  exit 0
fi

echo "fresh-user OTA gate: REFUSE production OTA" >&2
echo "  continuous: $LATEST_JSON (need e2e=pass; e2e=skipped is NOT pass)" >&2
if [[ -f "$LATEST_JSON" ]]; then
  echo "  current:" >&2
  cat "$LATEST_JSON" >&2 || true
else
  echo "  continuous proof file missing" >&2
fi
echo "  fresh-user: $FRESH_JSON (need e2e/status=pass from npm run e2e:fresh-user)" >&2
echo "  stranger: require CI job Maestro stranger cold-start (Android emulator)=success on SHA" >&2
echo "e2e=skipped alone does not unblock; green CI stranger Maestro on the SHA does." >&2
exit 1
