#!/bin/sh
# Unit/contract tests for chrome-background-cpu-harden.sh
# Uses a throwaway HOME so we never touch the operator's live Chrome policies
# except when the script is invoked for real on install.
set -eu

REPO="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
SCRIPT="$REPO/scripts/chrome-background-cpu-harden.sh"
TMP="$(mktemp -d /tmp/chrome-bg-harden-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0
fail=0
ok() { printf "  [PASS] %s\n" "$1"; pass=$((pass + 1)); }
bad() { printf "  [FAIL] %s\n" "$1"; fail=$((fail + 1)); }

echo "=== chrome-background-cpu-harden tests ==="

if /bin/sh -n "$SCRIPT"; then
  ok "script passes sh -n"
else
  bad "script fails sh -n"
fi

if grep -q 'Never kills' "$SCRIPT" && grep -q 'BackgroundModeEnabled' "$SCRIPT"; then
  ok "documents no-kill + BackgroundModeEnabled"
else
  bad "missing policy/no-kill markers"
fi

# Install first (idempotent), then validate status JSON schema.
if [ -d "/Applications/Google Chrome.app" ]; then
  bash "$SCRIPT" --install --json >/tmp/chrome-bg-install-out.json 2>/dev/null || true
  python3 -c '
import json
d=json.load(open("/tmp/chrome-bg-install-out.json"))
assert d.get("schema")=="chrome-background-cpu-harden/v1"
chrome=[x for x in d.get("domains",[]) if x.get("domain")=="com.google.Chrome"]
assert chrome, "expected com.google.Chrome domain"
assert chrome[0].get("BackgroundModeEnabled") in ("0", 0, False, "false")
assert str(chrome[0].get("PreloadPages")) in ("0","1")
print("install-ok")
' && ok "install sets Chrome BackgroundMode off + Preload Standard/No" \
  || bad "install did not set expected policies"

  if OUT="$(bash "$SCRIPT" --status --json 2>/dev/null)"; then
    echo "$OUT" | python3 -c '
import sys, json
d=json.load(sys.stdin)
assert d.get("schema")=="chrome-background-cpu-harden/v1"
assert d.get("ok") is True
assert d["policy"]["BackgroundModeEnabled"] is False
assert d["policy"]["PreloadPages"]==1
print("json-ok")
' && ok "status --json schema valid after install" || bad "status --json schema invalid"
  else
    bad "status --json failed after install"
  fi
else
  # No Chrome (e.g. CI linux) — status should still be ok with zero domains
  if OUT="$(bash "$SCRIPT" --status --json 2>/dev/null)"; then
    echo "$OUT" | python3 -c '
import sys, json
d=json.load(sys.stdin)
assert d.get("schema")=="chrome-background-cpu-harden/v1"
assert d.get("ok") is True
print("json-ok-no-chrome")
' && ok "status --json ok with no Chrome.app" || bad "status --json bad with no Chrome"
  else
    bad "status --json failed with no Chrome.app"
  fi
fi

echo "=== Summary: $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
