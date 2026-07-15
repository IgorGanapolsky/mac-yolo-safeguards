#!/usr/bin/env bash
# Fail closed: refuse production OTA unless brand-new-user / continuous E2E proof exists.
# Crisis 2026-07-15 — never publish "fixed" bundles when e2e is skipped/missing/fail.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LATEST_JSON="${HERMES_CONTINUOUS_LATEST_JSON:-$REPO_ROOT/hermes-mobile/docs/proofs/continuous/latest.json}"
FRESH_JSON="${HERMES_FRESH_USER_PROOF_JSON:-$REPO_ROOT/hermes-mobile/docs/proofs/fresh-user/latest.json}"

if [[ "${HERMES_OTA_FORCE_UNSAFE:-}" == "1" ]]; then
  echo "FATAL: HERMES_OTA_FORCE_UNSAFE=1 is disabled after 2026-07-15 production crisis." >&2
  echo "Prove fresh-user or continuous e2e=pass; do not bypass." >&2
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

echo "fresh-user OTA gate: REFUSE production OTA" >&2
echo "  continuous: $LATEST_JSON (need e2e=pass)" >&2
if [[ -f "$LATEST_JSON" ]]; then
  echo "  current:" >&2
  cat "$LATEST_JSON" >&2 || true
else
  echo "  continuous proof file missing (CI runners never see device proofs)" >&2
fi
echo "  fresh-user: $FRESH_JSON (need e2e/status=pass from npm run e2e:fresh-user)" >&2
echo "Run on a Mac with device: npm run e2e:fresh-user  OR  wait for continuous e2e=pass." >&2
exit 1
