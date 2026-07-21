#!/usr/bin/env bash
# Hermetic tests for kimi-yolo (wraps the official Kimi Code CLI) + tinker-yolo.
# No network, no real Kimi/Tinker — stubs the CLI binary. Real training/agent runs
# are proven live, not here.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KIMI="$HERE/../kimi-yolo"; TINKER="$HERE/../tinker-yolo"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

# Stub kimi binary: --version prints, doctor exits 0, else records argv.
KB="$ROOT/kimi"; ARGS="$ROOT/kimi-args"
cat >"$KB" <<EOF
#!/bin/sh
case "\$1" in
  --version) echo "9.9.9"; exit 0 ;;
  doctor) exit 0 ;;
  *) printf '%s\n' "\$@" > "$ARGS"; echo KIMI-STUB-RAN ;;
esac
EOF
chmod +x "$KB"

kenv(){
  export KIMI_BIN="$KB"
  export KIMI_CODE_HOME="$ROOT/kimi-home"
  export HERMES_ENV_PATH="$ROOT/.env"
  export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
  printf 'KIMI_CODE_API_KEY=sk-kimi-testkey000000000000\n' > "$ROOT/.env"
  # neutralize the real Keychain lookup by forcing PATH security to a no-op stub
  mkdir -p "$ROOT/pathbin"; printf '#!/bin/sh\nexit 1\n' > "$ROOT/pathbin/security"; chmod +x "$ROOT/pathbin/security"
  export PATH="$ROOT/pathbin:$PATH"
}
kenv

# 1: doctor --json shape, wraps official Kimi CLI
"$KIMI" --doctor --json | python3 -c "import json,sys;d=json.load(sys.stdin);assert d['schema']=='kimi-yolo/doctor-v1';assert d['ok'];assert 'Kimi Code CLI' in d['provider'];assert d['binary'].endswith('/kimi');assert d['autonomous'];assert d['configOK']" \
  && ok "kimi-yolo doctor json (official CLI)" || no "kimi-yolo doctor json"

# 2: ensure_config wrote a config.toml with the model + provider
CFG="$ROOT/kimi-home/config.toml"
{ [ -f "$CFG" ] && grep -q 'kimi-for-coding' "$CFG" && grep -q 'api.kimi.com/coding' "$CFG"; } \
  && ok "kimi-yolo self-writes config.toml" || no "kimi-yolo config.toml"

# 3: zero-spend -> 73, kimi never runs
: > "$ROOT/NO_PAID_SPEND"; rm -f "$ARGS"
set +e; "$KIMI" "do a thing" >/dev/null 2>&1; c=$?; set -e
{ [ "$c" = 73 ] && [ ! -f "$ARGS" ]; } && ok "kimi-yolo zero-spend 73" || no "kimi-yolo zero-spend (got $c)"
rm -f "$ROOT/NO_PAID_SPEND"

# 4: a bare task string routes through -p (the CLI positional is a subcommand, not a
#    prompt — kimi-yolo "build X" must become `kimi -p "build X"`, NOT `--yolo build X`)
rm -f "$ARGS"; "$KIMI" "build X" >/dev/null 2>&1 || true
{ grep -q -- "-p" "$ARGS" && grep -q "build X" "$ARGS" && ! grep -q -- "--yolo" "$ARGS"; } \
  && ok "kimi-yolo bare prompt -> -p" || no "kimi-yolo bare prompt ($(tr '\n' ' ' <"$ARGS" 2>/dev/null))"

# 4b: no args -> interactive --yolo TUI
rm -f "$ARGS"; "$KIMI" >/dev/null 2>&1 || true
grep -q -- "--yolo" "$ARGS" && ok "kimi-yolo no-args -> --yolo" || no "kimi-yolo no-args ($(tr '\n' ' ' <"$ARGS"))"

# 4c: a subcommand passes through with --yolo, not -p
rm -f "$ARGS"; "$KIMI" models >/dev/null 2>&1 || true
{ grep -q "models" "$ARGS" && ! grep -q -- "-p" "$ARGS"; } && ok "kimi-yolo subcommand passthrough" || no "kimi-yolo subcommand ($(tr '\n' ' ' <"$ARGS"))"

# 5: explicit -p passes through WITHOUT --yolo (CLI rejects the combo)
rm -f "$ARGS"; "$KIMI" -p "hi" >/dev/null 2>&1 || true
{ grep -q -- "-p" "$ARGS" && ! grep -q -- "--yolo" "$ARGS"; } && ok "kimi-yolo -p no --yolo" || no "kimi-yolo -p ($(tr '\n' ' ' <"$ARGS"))"

# 6: missing binary -> 127
export KIMI_BIN="$ROOT/nope"
set +e; "$KIMI" "x" >/dev/null 2>&1; c=$?; set -e
[ "$c" = 127 ] && ok "kimi-yolo missing-CLI 127" || no "kimi-yolo missing-CLI (got $c)"
kenv

# --- tinker-yolo (private-data + paid gate; no network/provider call) ---
export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
export TINKER_VENV="$ROOT/venv"
export TINKER_STATE_DIR="$ROOT/tinker-state"
export TINKER_DATASET="$ROOT/tinker-state/datasets/conversations.jsonl"
export TINKER_RECEIPT_DIR="$ROOT/tinker-state/receipts"
export TINKER_HARNESS="$HERE/../tools/hermes-tinker-harness.js"
export TINKER_HOST_MEMORY_BYTES=24000000000
export TINKER_HOST_MACHINE="MacBook Pro"
export TINKER_HOST_CHIP="Apple M5"
set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 127 ] && ok "tinker-yolo missing-venv 127" || no "tinker-yolo missing-venv (got $c)"
mkdir -p "$ROOT/venv/bin" "$ROOT/tinker-state/datasets"
TCAP="$ROOT/tinker-provider-call"
cat > "$ROOT/venv/bin/python" <<EOF
#!/bin/sh
if printf '%s\n' "\$1" | grep -q 'build-distill-dataset.py'; then
  shift
  out=''
  while [ "\$#" -gt 0 ]; do
    if [ "\$1" = --out ]; then shift; out="\$1"; break; fi
    shift
  done
  mkdir -p "\$(dirname "\$out")"
  printf '%s\n' '{"messages":[{"role":"user","content":"fixture question"},{"role":"assistant","content":"fixture answer"}]}' > "\$out"
  exit 0
fi
printf 'called=%s approved=%s max=%s\n' "\$*" "\${TINKER_APPROVED_DATA_UPLOAD:-}" "\${TINKER_MAX_COST_USD:-}" > "$TCAP"
exit 0
EOF
chmod +x "$ROOT/venv/bin/python"
: > "$ROOT/NO_PAID_SPEND"
set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 73 ] && ok "tinker-yolo zero-spend 73" || no "tinker-yolo zero-spend (got $c)"
"$TINKER" build
python3 - "$TINKER_DATASET" <<'PY' \
  && ok "tinker-yolo builds private dataset under zero-spend" || no "tinker-yolo private build"
import os, stat, sys
p=sys.argv[1]
assert p.endswith('/tinker-state/datasets/conversations.jsonl')
assert os.path.isfile(p)
assert stat.S_IMODE(os.stat(p).st_mode)==0o600
PY
rm -f "$ROOT/NO_PAID_SPEND"

set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 64 ] && ok "tinker-yolo requires explicit paid/upload consent" || no "tinker-yolo consent gate (got $c)"

"$TINKER" recommend --json | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['host']['memoryGB']==24; assert not d['candidate']['localInferenceFeasible']; assert not d['gates']['baselineReplacementAllowed']" \
  && ok "tinker-yolo recommends remote candidate on 24GB M5" || no "tinker-yolo recommendation"

OLLAMA_ARGS="$ROOT/ollama-args"
export OLLAMA_ARGS
cat > "$ROOT/pathbin/ollama" <<'EOF'
#!/bin/sh
case "$1" in
  list)
    printf '%s\n' 'NAME ID SIZE MODIFIED' \
      'qwen3-hermes-tinker:q4 fixture 5.0GB now' \
      'custom:tag fixture 5.0GB now' \
      'explicit:tag fixture 5.0GB now'
    ;;
  run) printf '%s\n' "$@" > "$OLLAMA_ARGS" ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$ROOT/pathbin/ollama"

rm -f "$OLLAMA_ARGS"; "$TINKER" >/dev/null 2>&1
{ [ "$(sed -n '1p' "$OLLAMA_ARGS")" = run ] && [ "$(sed -n '2p' "$OLLAMA_ARGS")" = qwen3-hermes-tinker:q4 ]; } \
  && ok "tinker-yolo bare invocation defaults to q4" || no "tinker-yolo bare q4 default"

rm -f "$OLLAMA_ARGS"; TINKER_CHAT_MODEL=custom:tag "$TINKER" >/dev/null 2>&1
[ "$(sed -n '2p' "$OLLAMA_ARGS")" = custom:tag ] \
  && ok "tinker-yolo bare invocation honors env override" || no "tinker-yolo bare env override"

rm -f "$OLLAMA_ARGS"; "$TINKER" chat --model explicit:tag >/dev/null 2>&1
[ "$(sed -n '2p' "$OLLAMA_ARGS")" = explicit:tag ] \
  && ok "tinker-yolo chat honors model flag" || no "tinker-yolo chat model flag"

"$TINKER" --help | grep -q 'default qwen3-hermes-tinker:q4' \
  && ok "tinker-yolo help names q4 default" || no "tinker-yolo help q4 default"

printf '%s\n' '{"messages":[{"role":"user","content":"safe fixture"},{"role":"assistant","content":"safe answer"}]}' > "$TINKER_DATASET"
chmod 644 "$TINKER_DATASET"
set +e; "$TINKER" proof --approve-paid --approve-data-upload --max-cost-usd 1 >/dev/null 2>&1; c=$?; set -e
{ [ "$c" = 65 ] && [ ! -f "$TCAP" ]; } && ok "tinker-yolo blocks non-private dataset" || no "tinker-yolo dataset permission gate (got $c)"

printf '%s\n' '{"messages":[{"role":"user","content":"token=fixture_secret_value_123456"},{"role":"assistant","content":"no"}]}' > "$TINKER_DATASET"
chmod 600 "$TINKER_DATASET"
set +e; "$TINKER" proof --approve-paid --approve-data-upload --max-cost-usd 1 >/dev/null 2>&1; c=$?; set -e
{ [ "$c" = 65 ] && [ ! -f "$TCAP" ]; } && ok "tinker-yolo blocks secret-like dataset before upload" || no "tinker-yolo dataset secret gate (got $c)"

printf '%s\n' '{"messages":[{"role":"user","content":"write a bounded parser"},{"role":"assistant","content":"here is the tested parser"}]}' > "$TINKER_DATASET"
chmod 600 "$TINKER_DATASET"
set +e; "$TINKER" proof --approve-paid --approve-data-upload --max-cost-usd 0.000001 >/dev/null 2>&1; c=$?; set -e
{ [ "$c" = 78 ] && [ ! -f "$TCAP" ]; } && ok "tinker-yolo estimate blocks over-cap run" || no "tinker-yolo estimate cap (got $c)"

printf 'TINKER_API_KEY=fixture_value\n' > "$ROOT/.env"
export HERMES_ENV_PATH="$ROOT/.env"
"$TINKER" proof --approve-paid --approve-data-upload --max-cost-usd 1 >/dev/null 2>&1
{ grep -q 'approved=1' "$TCAP" && grep -q 'max=1' "$TCAP"; } \
  && ok "tinker-yolo passes bounded approvals to provider child" || no "tinker-yolo provider env gate"
python3 - "$TINKER_RECEIPT_DIR/latest.json" <<'PY' \
  && ok "tinker-yolo writes private metadata-only receipt" || no "tinker-yolo receipt"
import json, os, stat, sys
p=sys.argv[1]; d=json.load(open(p))
assert stat.S_IMODE(os.stat(p).st_mode)==0o600
assert d['schema']=='tinker-yolo/run-receipt-v1'
assert d['budget']['actualCostUsd'] is None
assert d['hermesBaselineChanged'] is False
assert 'messages' not in json.dumps(d)
PY

set +e; "$TINKER" bogus >/dev/null 2>&1; c=$?; set -e
[ "$c" = 2 ] && ok "tinker-yolo usage error 2" || no "tinker-yolo usage error (got $c)"

echo "kimi/tinker-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
