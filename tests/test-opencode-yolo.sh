#!/usr/bin/env bash
# Tests for opencode-yolo: doctor shape, zero-spend gate, model default, binary resolution.
# Hermetic — stubs the opencode binary and gateway; no network, no real opencode.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$HERE/../opencode-yolo"
ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

# Stub opencode binary that records argv and prints a version.
STUB="$ROOT/opencode"
ARGS_OUT="$ROOT/opencode-args"
cat >"$STUB" <<EOF
#!/bin/sh
if [ "\$1" = "--version" ]; then echo "9.9.9"; exit 0; fi
printf '%s\n' "\$@" > "$ARGS_OUT"
echo STUB-RAN
EOF
chmod +x "$STUB"

# Stub gateway: a tiny HTTP server answering /health/liveliness on a free port.
PORT=4999
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
  export OPENCODE_BIN="$STUB"
  export OPENCODE_YOLO_GATEWAY_URL="http://127.0.0.1:$PORT/v1"
  export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
  export OPENCODE_YOLO_HOME="$ROOT/oc-home"
}
base_env

# 1. doctor --json is valid JSON with the expected shape
DJSON="$("$WRAPPER" --doctor --json)"
echo "$DJSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['schema']=='opencode-yolo/doctor-v1'; assert d['ok'] is True; assert d['autonomous'] is True; assert d['gatewayUp'] is True; assert d['zeroSpendActive'] is False; assert d['binary'].endswith('opencode')" \
  && ok "doctor --json shape" || no "doctor --json shape"

# 2. zero-spend marker => exit 73, opencode never runs
: > "$ROOT/NO_PAID_SPEND"
rm -f "$ARGS_OUT"
set +e; "$WRAPPER" run "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 73 ] && [ ! -f "$ARGS_OUT" ]; } && ok "zero-spend blocks (73, no spawn)" || no "zero-spend blocks (got $code, args=$( [ -f "$ARGS_OUT" ] && echo present || echo absent ))"
rm -f "$ROOT/NO_PAID_SPEND"

# 3. default model injected when caller omits -m
rm -f "$ARGS_OUT"
"$WRAPPER" run "hi" >/dev/null 2>&1 || true
grep -q -- "--model" "$ARGS_OUT" && grep -q "hermes/glm-coding" "$ARGS_OUT" && ok "injects default model" || no "injects default model ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 4. caller -m is respected (no double --model)
rm -f "$ARGS_OUT"
"$WRAPPER" run -m hermes/kimi-code "hi" >/dev/null 2>&1 || true
[ "$(grep -c -- "--model" "$ARGS_OUT")" -eq 0 ] && grep -q "kimi-code" "$ARGS_OUT" && ok "respects explicit -m" || no "respects explicit -m ($(tr '\n' ' ' < "$ARGS_OUT"))"

# 5. gateway down => exit 69
export OPENCODE_YOLO_GATEWAY_URL="http://127.0.0.1:4998/v1"  # nothing listening
set +e; "$WRAPPER" run "hi" >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 69 ] && ok "gateway-down guard (69)" || no "gateway-down guard (got $code)"
base_env

# 6. missing binary => 127
export OPENCODE_BIN="$ROOT/does-not-exist"
set +e; "$WRAPPER" --doctor >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 127 ] && ok "missing-binary doctor (127)" || no "missing-binary doctor (got $code)"

echo "opencode-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
