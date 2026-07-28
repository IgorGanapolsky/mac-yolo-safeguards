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
        elif self.path.endswith('/models'):
            # doubles as the stub LOCAL (Ollama-style) endpoint for zero-spend tests
            self.send_response(200); self.end_headers()
            self.wfile.write(b'{"data":[{"id":"glm-coding"},{"id":"qwen3.5:9b-hermes-64k"}]}')
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
  export POOLSIDE_YOLO_LOCAL_URL="http://127.0.0.1:$PORT/v1"
  export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"
  unset POOLSIDE_API_KEY POOLSIDE_STANDALONE_BASE_URL POOLSIDE_STANDALONE_MODEL \
        POOLSIDE_YOLO_LOCAL_MODEL POOLSIDE_YOLO_ZERO_SPEND_STRICT 2>/dev/null || true
}
base_env

# 1. doctor --json is valid JSON with the expected shape
DJSON="$("$WRAPPER" --doctor --json)"
echo "$DJSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['schema']=='poolside-yolo/doctor-v1'; assert d['ok'] is True; assert d['autonomous'] is True; assert d['gatewayUp'] is True; assert d['zeroSpendActive'] is False; assert d['binary'].endswith('pool'); assert d['defaultModel']=='glm-coding'" \
  && ok "doctor --json shape" || no "doctor --json shape"

# 1b. doctor's live model probe costs a real completion, so it must never fire while
#     the fleet zero-spend gate is on. Unknown must surface as null, never as "fine".
: > "$ROOT/NO_PAID_SPEND"
"$WRAPPER" --doctor --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['zeroSpendActive'] is True
assert d['modelServing'] is None, 'made a model call under zero-spend: %r' % d['modelServing']
assert d['modelFellBack'] is None
" && ok "zero-spend suppresses doctor model probe" || no "zero-spend suppresses doctor model probe"
rm -f "$ROOT/NO_PAID_SPEND"

# 2. zero-spend marker: the marker's policy is "no paid provider or metered token
#    execution", so we run LOCALLY (free, unmetered) rather than refusing outright —
#    that is what keeps poolside-yolo usable on the zero-spend mini. It must route at
#    the LOCAL endpoint with a local model, and must never touch the paid gateway.
: > "$ROOT/NO_PAID_SPEND"
rm -f "$ARGS_OUT" "$ENV_OUT"
set +e; "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 0 ] && grep -q "MODEL=qwen3.5:9b-hermes-64k" "$ENV_OUT" 2>/dev/null; } \
  && ok "zero-spend runs LOCALLY on a local model" || no "zero-spend runs LOCALLY (code=$code env=$(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 2b. strict mode restores the old refuse-outright behaviour
rm -f "$ARGS_OUT"
set +e; POOLSIDE_YOLO_ZERO_SPEND_STRICT=1 "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 73 ] && [ ! -f "$ARGS_OUT" ]; } \
  && ok "zero-spend STRICT blocks (73, no spawn)" || no "zero-spend STRICT blocks (got $code)"

# 2c. zero-spend with NO local endpoint must still hard-block — never silently reach
#     for the paid gateway just because local is missing
rm -f "$ARGS_OUT"
set +e; POOLSIDE_YOLO_LOCAL_URL="http://127.0.0.1:4996/v1" "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 73 ] && [ ! -f "$ARGS_OUT" ]; } \
  && ok "zero-spend + no local endpoint blocks (73, no spawn)" || no "zero-spend + no local blocks (got $code)"

# 2d. zero-spend must never fall back to a sub-8B model it cannot tool-call with
rm -f "$ARGS_OUT"
set +e; POOLSIDE_YOLO_LOCAL_MODEL="" POOLSIDE_YOLO_LOCAL_URL="http://127.0.0.1:$PORT/v1" "$WRAPPER" "hi" >/dev/null 2>&1; set -e
grep -q "MODEL=qwen2.5:3b" "$ENV_OUT" 2>/dev/null && no "zero-spend picked a sub-8B model" || ok "zero-spend never picks a sub-8B model"
rm -f "$ROOT/NO_PAID_SPEND"

# 3. bare task string routed through `exec -p ... --unsafe-auto-allow -o json`
rm -f "$ARGS_OUT" "$ENV_OUT"
"$WRAPPER" "build me X" >/dev/null 2>&1 || true
grep -qx "exec" "$ARGS_OUT" && grep -q -- "--unsafe-auto-allow" "$ARGS_OUT" && grep -q "build me X" "$ARGS_OUT" \
  && ok "bare prompt -> autonomous exec" || no "bare prompt -> autonomous exec ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 4. gateway env vars point at the Hermes gateway with the default model
grep -q "BASE=http://127.0.0.1:$PORT/v1" "$ENV_OUT" && grep -q "MODEL=glm-coding" "$ENV_OUT" \
  && ok "routes through Hermes gateway with default model" || no "gateway routing env ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 5. no args => autonomous interactive TUI (--mode always-allow)
#    NOTE: this asserted "allow-all" until 2026-07-27. That is NOT a pool mode, so
#    pool silently fell back to "Always ask" and prompted for every tool while the
#    test stayed green. Assert the exact ID, and see test 9 for the live check that
#    the ID is one pool really advertises.
rm -f "$ARGS_OUT"
"$WRAPPER" >/dev/null 2>&1 || true
grep -q -- "--mode" "$ARGS_OUT" && grep -qx "always-allow" "$ARGS_OUT" && ok "bare invocation -> --mode always-allow" || no "bare invocation -> --mode always-allow ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6. `login` passes through untouched, without the gateway env shadowing real auth
rm -f "$ARGS_OUT" "$ENV_OUT"
"$WRAPPER" login >/dev/null 2>&1 || true
grep -qx "login" "$ARGS_OUT" 2>/dev/null && ok "login passthrough" || no "login passthrough ($(cat "$ARGS_OUT" 2>/dev/null))"

# 6b. a flag-led invocation still gets forced into autonomous mode (no silent
#     drop into pool's default approval-prompt TUI)
rm -f "$ARGS_OUT"
"$WRAPPER" -C /tmp >/dev/null 2>&1 || true
grep -q -- "--mode" "$ARGS_OUT" && grep -qx "always-allow" "$ARGS_OUT" && grep -q -- "-C" "$ARGS_OUT" \
  && ok "flag-led invocation forces --mode always-allow" || no "flag-led invocation forces --mode always-allow ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6c. an explicit --mode is respected (no double --mode)
rm -f "$ARGS_OUT"
"$WRAPPER" --mode accept-edits >/dev/null 2>&1 || true
[ "$(grep -c -- "--mode" "$ARGS_OUT")" -eq 1 ] && grep -q "accept-edits" "$ARGS_OUT" \
  && ok "respects explicit --mode" || no "respects explicit --mode ($(tr '\n' ' ' < "$ARGS_OUT"))"

# 6d. legacy/alias mode names normalize to the real IDs instead of being passed
#     through for pool to silently reject (this is the exact 2026-07-27 bug class)
rm -f "$ARGS_OUT"
"$WRAPPER" --mode allow-all >/dev/null 2>&1 || true
grep -qx "always-allow" "$ARGS_OUT" 2>/dev/null && ! grep -qx "allow-all" "$ARGS_OUT" \
  && ok "alias --mode allow-all -> always-allow" || no "alias --mode allow-all -> always-allow ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

rm -f "$ARGS_OUT"
POOLSIDE_YOLO_MODE=yolo "$WRAPPER" >/dev/null 2>&1 || true
grep -qx "always-allow" "$ARGS_OUT" 2>/dev/null \
  && ok "POOLSIDE_YOLO_MODE alias normalizes" || no "POOLSIDE_YOLO_MODE alias normalizes ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6e. an unknown mode FAILS LOUDLY (exit 2, pool never spawned) rather than letting
#     pool fall back to approval prompts while we claim to be autonomous
rm -f "$ARGS_OUT"
set +e; "$WRAPPER" --mode not-a-real-mode >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 2 ] && [ ! -f "$ARGS_OUT" ]; } \
  && ok "unknown --mode fails loudly (2, no spawn)" || no "unknown --mode fails loudly (got $code)"

rm -f "$ARGS_OUT"
set +e; POOLSIDE_YOLO_MODE=bogus "$WRAPPER" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 2 ] && [ ! -f "$ARGS_OUT" ]; } \
  && ok "unknown POOLSIDE_YOLO_MODE fails loudly (2, no spawn)" || no "unknown POOLSIDE_YOLO_MODE fails loudly (got $code)"

# 7. gateway down => exit 69 (WAIT=0 opts out of the readiness wait so this is instant)
export POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:4997/v1"  # nothing listening
set +e; POOLSIDE_YOLO_GATEWAY_WAIT=0 "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 69 ] && ok "gateway-down guard (69)" || no "gateway-down guard (got $code)"
base_env

# 7a. A gateway that is merely BOOTING must be waited for, not declared dead. This is
#     the 2026-07-28 bug: litellm takes ~84s from exec to accepting connections, so a
#     single liveness probe reported "down" for ~90s after every restart and every
#     pool turn in that window died with `dial tcp 127.0.0.1:4010: connection refused`.
#     Start a stub that only begins listening AFTER the wrapper is already waiting.
LATE_PORT=4995
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
  POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:$LATE_PORT/v1" \
  POOLSIDE_YOLO_GATEWAY_WAIT=40 POOLSIDE_YOLO_NO_ROUTE_CHECK=1 \
    "$WRAPPER" "hi" >/dev/null 2>&1; code=$?
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

# 7b. The readiness wait must NEVER poke launchd for a gateway that isn't the local
#     fleet one — a stub/remote URL must not cause a real service restart.
export POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:4997/v1"
set +e
out="$(POOLSIDE_YOLO_GATEWAY_WAIT=0 "$WRAPPER" "hi" 2>&1)"; set -e
echo "$out" | grep -q "asked launchd to start" \
  && no "kickstarted launchd for a non-fleet gateway URL" \
  || ok "never kickstarts launchd for a non-fleet gateway URL"
base_env

# 7c. Silent degradation must be announced AT LAUNCH, not only by --doctor. When the
#     primary route is out of quota LiteLLM answers with the upstream model id instead
#     of the group name, and the session quietly runs on a weaker model. Stub a gateway
#     that answers glm-coding as something else and assert we say so.
DEG_PORT=4994
python3 - "$DEG_PORT" <<'PY' &
import http.server, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('/health/liveliness'):
            self.send_response(200); self.end_headers(); self.wfile.write(b'"alive"')
        elif self.path.endswith('/models'):
            self.send_response(200); self.end_headers()
            self.wfile.write(b'{"data":[{"id":"glm-coding"}]}')
        else:
            self.send_response(404); self.end_headers()
    def do_POST(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b'{"model":"nvidia/nemotron-3-ultra-550b-a55b:free","choices":[]}')
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
PY
DEG_PID=$!
disown $DEG_PID 2>/dev/null || true   # keep bash from printing "Terminated" noise at cleanup
sleep 1
set +e
out="$(POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:$DEG_PORT/v1" "$WRAPPER" "hi" 2>&1)"
set -e
echo "$out" | grep -q "WARNING you asked for 'glm-coding' but the gateway answered as 'nvidia/nemotron-3-ultra-550b-a55b:free'" \
  && ok "warns at launch when serving a fallback model" || no "warns at launch on fallback ($(echo "$out" | tr '\n' ' ' | head -c 200))"

# 7d. ...and the warning is suppressible, and never blocks the run.
rm -f "$ARGS_OUT"
set +e
out="$(POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:$DEG_PORT/v1" POOLSIDE_YOLO_NO_ROUTE_CHECK=1 "$WRAPPER" "hi" 2>&1)"
code=$?
set -e
{ [ "$code" -eq 0 ] && [ -f "$ARGS_OUT" ] && ! echo "$out" | grep -q "WARNING you asked for"; } \
  && ok "POOLSIDE_YOLO_NO_ROUTE_CHECK silences the probe (still runs)" \
  || no "NO_ROUTE_CHECK silences the probe (got $code)"
kill $DEG_PID 2>/dev/null || true
base_env

# 8. missing binary => 127
export POOL_BIN="$ROOT/does-not-exist"
set +e; "$WRAPPER" --doctor >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 127 ] && ok "missing-binary doctor (127)" || no "missing-binary doctor (got $code)"
base_env

# 9. LIVE: the autonomy mode this wrapper passes must be a mode the REAL installed
#    pool advertises. A stub can only prove we pass the string we intended; only the
#    real binary can prove the string means "never ask for permission". Skipped when
#    pool or the gateway isn't available (CI, zero-spend boxes).
unset POOL_BIN POOLSIDE_YOLO_GATEWAY_URL
REAL_POOL="${HOME}/.local/bin/pool"
if [ -x "$REAL_POOL" ] && curl -fsS -m 4 http://127.0.0.1:4010/health/liveliness >/dev/null 2>&1; then
  LIVE="$("$WRAPPER" --doctor --json 2>/dev/null)"
  echo "$LIVE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['mode']=='always-allow', 'mode is %r' % d['mode']
assert d['modeValid'] is True, 'pool does not advertise %r; it advertises %r' % (d['mode'], d['availableModes'])
assert 'always-allow' in d['availableModes']
assert d['modelServed'] is True, 'gateway does not serve %r' % d['defaultModel']
" && ok "LIVE: pool advertises mode always-allow + gateway serves model" \
    || no "LIVE: mode/model validity ($LIVE)"
else
  echo "  [SKIP] live mode probe (no real pool binary or gateway at :4010)"
fi

echo "poolside-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
