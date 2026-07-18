#!/usr/bin/env bash
# Hermetic tests for `tinker-yolo ask` (one-shot Inkling inference escalation).
# No network, no real Tinker — the venv python is stubbed. The live Inkling
# completion + tool-call are proven with real runs, not here.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TINKER="$HERE/../tinker-yolo"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

export TINKER_VENV="$ROOT/venv"
export TINKER_STATE_DIR="$ROOT/state"
export HERMES_ENV_PATH="$ROOT/.env"
export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
: > "$ROOT/.env"
# neutralize the real Keychain lookup (load_key honors TINKER_SECURITY_BIN)
printf '#!/bin/sh\nexit 1\n' > "$ROOT/security"; chmod +x "$ROOT/security"
export TINKER_SECURITY_BIN="$ROOT/security"

APPROVE=(--approve-paid --max-cost-usd 1)

# 1: no prompt -> usage error 2
set +e; "$TINKER" ask "${APPROVE[@]}" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 2 ] && ok "ask no-prompt 2" || no "ask no-prompt (got $c)"

# 2: zero-spend marker blocks ask with 73 before any python runs
: > "$ROOT/NO_PAID_SPEND"
set +e; "$TINKER" ask "${APPROVE[@]}" "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 73 ] && ok "ask zero-spend 73" || no "ask zero-spend (got $c)"
rm -f "$ROOT/NO_PAID_SPEND"

# 3: missing venv -> 127
set +e; "$TINKER" ask "${APPROVE[@]}" "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 127 ] && ok "ask missing-venv 127" || no "ask missing-venv (got $c)"
mkdir -p "$ROOT/venv/bin"; printf '#!/bin/sh\nexit 0\n' > "$ROOT/venv/bin/python"; chmod +x "$ROOT/venv/bin/python"

# 4: metered without --approve-paid -> 64
set +e; "$TINKER" ask --max-cost-usd 1 "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 64 ] && ok "ask requires --approve-paid 64" || no "ask approve-paid gate (got $c)"

# 5: --approve-paid without a valid cost cap -> 64
set +e; "$TINKER" ask --approve-paid "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 64 ] && ok "ask requires cost cap 64" || no "ask cost-cap gate (got $c)"

# 6: estimate above cap -> 78, no provider call
set +e; "$TINKER" ask --approve-paid --max-cost-usd 0.01 --max-tokens 32768 "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 78 ] && ok "ask over-cap 78" || no "ask over-cap (got $c)"

# 7: missing Tinker auth -> 77, no provider call
set +e; "$TINKER" ask "${APPROVE[@]}" "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 77 ] && ok "ask missing-auth 77" || no "ask missing-auth (got $c)"

# 8: flags + prompt land in env for the venv runner (stub dumps env), receipt written
printf 'TINKER_API_KEY=test-key-not-real\n' > "$ROOT/.env"
printf '#!/bin/sh\nprintenv > "%s"\n' "$ROOT/ask-env" > "$ROOT/venv/bin/python"; chmod +x "$ROOT/venv/bin/python"
"$TINKER" ask "${APPROVE[@]}" --effort 0.5 --max-tokens 77 --tool-demo --json hello world >/dev/null 2>&1 || true
{ grep -q '^TINKER_ASK_PROMPT=hello world$' "$ROOT/ask-env" \
  && grep -q '^TINKER_ASK_EFFORT=0.5$' "$ROOT/ask-env" \
  && grep -q '^TINKER_ASK_MAX_TOKENS=77$' "$ROOT/ask-env" \
  && grep -q '^TINKER_ASK_TOOL_DEMO=1$' "$ROOT/ask-env" \
  && grep -q '^TINKER_ASK_JSON=1$' "$ROOT/ask-env" \
  && grep -q '^TINKER_ASK_MODEL=thinkingmachines/Inkling$' "$ROOT/ask-env"; } \
  && ok "ask env plumbing" || no "ask env plumbing"
grep -q '"schema": "tinker-yolo/ask-receipt-v1"' "$ROOT/state/receipts/latest-ask.json" 2>/dev/null \
  && ok "ask receipt written" || no "ask receipt written"

# 9: TINKER_ASK_MODEL override is respected
TINKER_ASK_MODEL="some/Other" "$TINKER" ask "${APPROVE[@]}" ping >/dev/null 2>&1 || true
grep -q '^TINKER_ASK_MODEL=some/Other$' "$ROOT/ask-env" \
  && ok "ask model override" || no "ask model override"

# 10: unknown option -> 2; ask appears in usage
set +e; "$TINKER" ask --bogus "hello" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 2 ] && ok "ask unknown option 2" || no "ask unknown option (got $c)"
"$TINKER" status 2>/dev/null | grep -q 'ask "prompt"' && ok "ask in usage menu" || no "ask in usage menu"

echo "tinker-yolo ask tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
