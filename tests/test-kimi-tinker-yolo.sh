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

# --- tinker-yolo (gate + dispatch; real training proven live) ---
export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"; export TINKER_VENV="$ROOT/venv"
set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 127 ] && ok "tinker-yolo missing-venv 127" || no "tinker-yolo missing-venv (got $c)"
mkdir -p "$ROOT/venv/bin"; printf '#!/bin/sh\nexit 0\n' > "$ROOT/venv/bin/python"; chmod +x "$ROOT/venv/bin/python"
: > "$ROOT/NO_PAID_SPEND"
set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 73 ] && ok "tinker-yolo zero-spend 73" || no "tinker-yolo zero-spend (got $c)"
rm -f "$ROOT/NO_PAID_SPEND"
set +e; "$TINKER" bogus >/dev/null 2>&1; c=$?; set -e
[ "$c" = 2 ] && ok "tinker-yolo usage error 2" || no "tinker-yolo usage error (got $c)"

echo "kimi/tinker-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
