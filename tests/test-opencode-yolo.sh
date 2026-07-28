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

# 5. gateway down => exit 69 (WAIT=0 opts out of the readiness wait so this is instant)
export OPENCODE_YOLO_GATEWAY_URL="http://127.0.0.1:4998/v1"  # nothing listening
set +e; OPENCODE_YOLO_GATEWAY_WAIT=0 "$WRAPPER" run "hi" >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 69 ] && ok "gateway-down guard (69)" || no "gateway-down guard (got $code)"
base_env

# 5a. A gateway that is merely BOOTING must be waited for, not declared dead. litellm
#     takes ~84s from exec to accepting connections (uvicorn binds the socket only
#     AFTER lifespan startup), so a single liveness probe reported "down" for ~90s
#     after every restart and the agent died on `connection refused`. Start a stub that
#     begins listening only AFTER the wrapper is already waiting.
LATE_PORT=4993
# `port_open` uses bash /dev/tcp so this needs no nc/lsof on any runner.
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }
if port_open "$LATE_PORT"; then
  # A stub leaked by an earlier run would already be listening, the wrapper would
  # succeed without ever waiting, and this test would pass while proving NOTHING.
  # Verified 2026-07-28: the first version of this test leaked its server and then
  # passed against a deliberately un-fixed wrapper. Fail loudly instead.
  no "booting-gateway precondition: port $LATE_PORT already open (stale stub) — result would be vacuous"
else
  cat >"$ROOT/late-stub.py" <<'PY'
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
  # `exec` so $! IS the python process — a bare subshell leaks the server on kill.
  ( sleep 4; exec python3 "$ROOT/late-stub.py" "$LATE_PORT" ) & LATE_PID=$!
  disown $LATE_PID 2>/dev/null || true
  rm -f "$ARGS_OUT"
  set +e
  OPENCODE_YOLO_GATEWAY_URL="http://127.0.0.1:$LATE_PORT/v1" OPENCODE_YOLO_GATEWAY_WAIT=40 \
    "$WRAPPER" run "hi" >/dev/null 2>&1; code=$?
  set -e
  { [ "$code" -eq 0 ] && [ -f "$ARGS_OUT" ]; } \
    && ok "waits for a booting gateway instead of failing (recovers)" \
    || no "waits for a booting gateway (got $code, spawned=$([ -f "$ARGS_OUT" ] && echo yes || echo no))"
  kill $LATE_PID 2>/dev/null || true
  for _ in 1 2 3 4 5; do port_open "$LATE_PORT" || break; sleep 1; done
  port_open "$LATE_PORT" \
    && no "booting-gateway stub leaked on port $LATE_PORT (would make the next run vacuous)" \
    || ok "booting-gateway stub cleaned up"
fi
base_env

# 5b. The readiness wait must NEVER poke launchd for a gateway that isn't the local
#     fleet one — a stub/remote URL must not cause a real service restart.
export OPENCODE_YOLO_GATEWAY_URL="http://127.0.0.1:4998/v1"
set +e; out="$(OPENCODE_YOLO_GATEWAY_WAIT=0 "$WRAPPER" run "hi" 2>&1)"; set -e
echo "$out" | grep -q "asked launchd to start" \
  && no "kickstarted launchd for a non-fleet gateway URL" \
  || ok "never kickstarts launchd for a non-fleet gateway URL"
base_env

# 6. missing binary => 127
export OPENCODE_BIN="$ROOT/does-not-exist"
set +e; "$WRAPPER" --doctor >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 127 ] && ok "missing-binary doctor (127)" || no "missing-binary doctor (got $code)"

# 7. cloud models declare image input. Without attachment+modalities opencode's own Read
#    tool silently swaps the image for the text "ERROR: ... does not support image input",
#    so the model answers "I can't see images" and nothing surfaces as an error. The local
#    model stays text-only: a deliberately local run must not be upgraded to the cloud.
base_env
"$WRAPPER" run "hi" >/dev/null 2>&1 || true
python3 - "$ROOT/oc-home/opencode.json" <<'PY' && ok "cloud models accept image attachments" || no "cloud models accept image attachments"
import json, sys
models = json.load(open(sys.argv[1]))["provider"]["hermes"]["models"]
for name in ("glm-coding", "glm-turbo", "opencode-go-glm", "kimi-code", "glm-vision"):
    m = models[name]
    assert m.get("attachment") is True, f"{name} missing attachment:true"
    assert "image" in m["modalities"]["input"], f"{name} missing image modality"
assert not models["hermes-local"].get("attachment"), "hermes-local must stay text-only"
PY

# 8. LSP is on by default. opencode ships 25+ servers but defaults them OFF — the TUI logged
#    "all LSPs are disabled" on 2026-07-25, i.e. the agent edited this TypeScript/React Native
#    app with no type diagnostics coming back. Measured cost of enabling: ~7s per run.
base_env
"$WRAPPER" run "hi" >/dev/null 2>&1 || true
python3 -c "
import json,sys
assert json.load(open('$ROOT/oc-home/opencode.json'))['lsp'] is True
" && ok "lsp enabled by default" || no "lsp enabled by default"

OPENCODE_YOLO_NO_LSP=1 "$WRAPPER" run "hi" >/dev/null 2>&1 || true
python3 -c "
import json,sys
assert json.load(open('$ROOT/oc-home/opencode.json'))['lsp'] is False
" && ok "OPENCODE_YOLO_NO_LSP=1 escape hatch" || no "OPENCODE_YOLO_NO_LSP=1 escape hatch"

# 9. Expo/EAS MCP is wired, and stays opt-out-able: it is a REMOTE server behind an OAuth
#    browser flow, so headless/cron runs must be able to drop it (it logs needs_auth until a
#    human authorizes an Expo account).
OPENCODE_YOLO_NO_EXPO_MCP=1 "$WRAPPER" run "hi" >/dev/null 2>&1 || true
python3 -c "
import json
assert 'expo' not in json.load(open('$ROOT/oc-home/opencode.json'))['mcp']
" && ok "OPENCODE_YOLO_NO_EXPO_MCP=1 drops the remote server" || no "OPENCODE_YOLO_NO_EXPO_MCP=1 drops the remote server"

base_env
"$WRAPPER" run "hi" >/dev/null 2>&1 || true
python3 -c "
import json
e=json.load(open('$ROOT/oc-home/opencode.json'))['mcp']['expo']
assert e['type']=='remote' and e['url']=='https://mcp.expo.dev/mcp' and e['enabled'] is True
" && ok "expo MCP wired by default" || no "expo MCP wired by default"

# 10. USB auto-forwarding is opt-in. sim-runaway-guard.sh used to re-create adb reverse
#     tcp:8642/8765 on every tick, so the phone kept seeing a USB loopback route (and a live
#     reverse masks real tailnet state) even after the transport was moved to Tailscale.
grep -q 'HERMES_ALLOW_USB_REVERSE' "$HERE/../sim-runaway-guard.sh" &&
  grep -q 'ADB_BIN=""' "$HERE/../sim-runaway-guard.sh" &&
  ok "guard USB auto-forward is opt-in" || no "guard USB auto-forward is opt-in"

echo "opencode-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
