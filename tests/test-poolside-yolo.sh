#!/usr/bin/env bash
# Tests for poolside-yolo: doctor shape, zero-spend gate, model default, binary
# resolution, gateway routing env vars, login passthrough.
# Hermetic — stubs the pool binary and gateway; no network, no real pool.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$HERE/../poolside-yolo"
ROOT="$(mktemp -d)"
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

# Stub pool binary that records argv/env and prints a version.
STUB="$ROOT/pool"
ARGS_OUT="$ROOT/pool-args"
ENV_OUT="$ROOT/pool-env"
cat >"$STUB" <<EOF
#!/bin/sh
if [ "\$1" = "--version" ]; then echo "1.0.14"; exit 0; fi
printf '%s\n' "\$@" > "$ARGS_OUT"
printf 'BASE=%s\nMODEL=%s\nKEY=%s\n' "\$POOLSIDE_STANDALONE_BASE_URL" "\$POOLSIDE_STANDALONE_MODEL" "\$POOLSIDE_API_KEY" > "$ENV_OUT"
echo STUB-RAN
EOF
chmod +x "$STUB"

# Stub gateway: a tiny HTTP server answering /health/liveliness on a free port.
PORT=4998
python3 - "$PORT" <<'PY' &
import http.server, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('/health/liveliness'):
            self.send_response(200); self.end_headers(); self.wfile.write(b'"alive"')
        else:
            self.send_response(404); self.end_headers()
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
PY
GW_PID=$!
trap 'rm -rf "$ROOT"; kill $GW_PID 2>/dev/null' EXIT
sleep 1

base_env() {
  export POOL_BIN="$STUB"
  export POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:$PORT/v1"
  export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
  unset POOLSIDE_API_KEY POOLSIDE_STANDALONE_BASE_URL POOLSIDE_STANDALONE_MODEL 2>/dev/null || true
}
base_env

# 1. doctor --json is valid JSON with the expected shape
DJSON="$("$WRAPPER" --doctor --json)"
echo "$DJSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['schema']=='poolside-yolo/doctor-v1'; assert d['ok'] is True; assert d['autonomous'] is True; assert d['gatewayUp'] is True; assert d['zeroSpendActive'] is False; assert d['binary'].endswith('pool'); assert d['defaultModel']=='glm-coding'" \
  && ok "doctor --json shape" || no "doctor --json shape"

# 2. zero-spend marker => exit 73, pool never runs
: > "$ROOT/NO_PAID_SPEND"
rm -f "$ARGS_OUT"
set +e; "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 73 ] && [ ! -f "$ARGS_OUT" ]; } && ok "zero-spend blocks (73, no spawn)" || no "zero-spend blocks (got $code, args=$( [ -f "$ARGS_OUT" ] && echo present || echo absent ))"
rm -f "$ROOT/NO_PAID_SPEND"

# 3. bare task string routed through `exec -p ... --unsafe-auto-allow -o json`
rm -f "$ARGS_OUT" "$ENV_OUT"
"$WRAPPER" "build me X" >/dev/null 2>&1 || true
grep -qx "exec" "$ARGS_OUT" && grep -q -- "--unsafe-auto-allow" "$ARGS_OUT" && grep -q "build me X" "$ARGS_OUT" \
  && ok "bare prompt -> autonomous exec" || no "bare prompt -> autonomous exec ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 4. gateway env vars point at the Hermes gateway with the default model
grep -q "BASE=http://127.0.0.1:$PORT/v1" "$ENV_OUT" && grep -q "MODEL=glm-coding" "$ENV_OUT" \
  && ok "routes through Hermes gateway with default model" || no "gateway routing env ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 5. no args => autonomous interactive TUI (--mode allow-all)
rm -f "$ARGS_OUT"
"$WRAPPER" >/dev/null 2>&1 || true
grep -q -- "--mode" "$ARGS_OUT" && grep -q "allow-all" "$ARGS_OUT" && ok "bare invocation -> --mode allow-all" || no "bare invocation -> --mode allow-all ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6. `login` passes through untouched, without the gateway env shadowing real auth
rm -f "$ARGS_OUT" "$ENV_OUT"
"$WRAPPER" login >/dev/null 2>&1 || true
grep -qx "login" "$ARGS_OUT" 2>/dev/null && ok "login passthrough" || no "login passthrough ($(cat "$ARGS_OUT" 2>/dev/null))"

# 6b. a flag-led invocation still gets forced into autonomous mode (no silent
#     drop into pool's default approval-prompt TUI)
rm -f "$ARGS_OUT"
"$WRAPPER" -C /tmp >/dev/null 2>&1 || true
grep -q -- "--mode" "$ARGS_OUT" && grep -q "allow-all" "$ARGS_OUT" && grep -q -- "-C" "$ARGS_OUT" \
  && ok "flag-led invocation forces --mode allow-all" || no "flag-led invocation forces --mode allow-all ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6c. an explicit --mode is respected (no double --mode)
rm -f "$ARGS_OUT"
"$WRAPPER" --mode accept-edits >/dev/null 2>&1 || true
[ "$(grep -c -- "--mode" "$ARGS_OUT")" -eq 1 ] && grep -q "accept-edits" "$ARGS_OUT" \
  && ok "respects explicit --mode" || no "respects explicit --mode ($(tr '\n' ' ' < "$ARGS_OUT"))"

# 7. gateway down => exit 69
export POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:4997/v1"  # nothing listening
set +e; "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 69 ] && ok "gateway-down guard (69)" || no "gateway-down guard (got $code)"
base_env

# 8. missing binary => 127
export POOL_BIN="$ROOT/does-not-exist"
set +e; "$WRAPPER" --doctor >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 127 ] && ok "missing-binary doctor (127)" || no "missing-binary doctor (got $code)"

echo "poolside-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
