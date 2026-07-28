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
  # Pin credential discovery at a path that does NOT exist, so the default lane
  # resolves to `gateway` and the gateway-routing cases below stay meaningful. Without
  # this the suite would read the developer's REAL ~/.config/poolside/credentials.json
  # and silently test the native lane instead. Native-lane cases opt in explicitly.
  export POOLSIDE_YOLO_CREDENTIALS="$ROOT/absent-credentials.json"
  unset POOLSIDE_API_KEY POOLSIDE_STANDALONE_BASE_URL POOLSIDE_STANDALONE_MODEL \
        POOLSIDE_YOLO_LOCAL_MODEL POOLSIDE_YOLO_ZERO_SPEND_STRICT POOLSIDE_YOLO_LANE 2>/dev/null || true
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

# 7. gateway down => exit 69
export POOLSIDE_YOLO_GATEWAY_URL="http://127.0.0.1:4997/v1"  # nothing listening
set +e; "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 69 ] && ok "gateway-down guard (69)" || no "gateway-down guard (got $code)"
base_env

# ---- LANES (2026-07-28) ----------------------------------------------------------
# The wrapper used to force every run through the gateway, which shares one failure
# domain with the whole fleet: when z.ai's weekly cap and OpenRouter's daily free cap
# blew on the same day, every route in the chain was dead and pool either sat for ~40s
# before answering as local qwen3:8b or died on "No deployments available". Poolside's
# own inference has an INDEPENDENT quota, so `auto` must prefer it when logged in.

# 10. auto + credentials present => native lane, and the standalone overrides are
#     WITHHELD so pool uses its own stored auth rather than our gateway shim.
CREDS="$ROOT/creds.json"
printf '[{"stub":"token"}]\n' > "$CREDS"
rm -f "$ARGS_OUT" "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" "$WRAPPER" "hi" >/dev/null 2>&1 || true
{ grep -qx "BASE=" "$ENV_OUT" && grep -qx "MODEL=" "$ENV_OUT"; } \
  && ok "auto + creds -> native lane (no gateway override)" \
  || no "auto + creds -> native lane ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10b. an exported gateway override in the caller's shell must NOT drag a native run
#      back onto the gateway — the wrapper unsets, it does not merely skip setting.
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_STANDALONE_BASE_URL="http://leaked.invalid/v1" \
  "$WRAPPER" "hi" >/dev/null 2>&1 || true
grep -q "leaked.invalid" "$ENV_OUT" 2>/dev/null \
  && no "native lane leaked an inherited POOLSIDE_STANDALONE_BASE_URL" \
  || ok "native lane clears an inherited gateway override"

# 10c. auto WITHOUT credentials keeps the old behaviour (gateway), so nobody who never
#      ran `pool login` loses their working setup.
rm -f "$ENV_OUT"
"$WRAPPER" "hi" >/dev/null 2>&1 || true
grep -q "MODEL=glm-coding" "$ENV_OUT" \
  && ok "auto without creds -> gateway lane (unchanged)" || no "auto without creds -> gateway ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10d. an explicit lane=gateway still reaches the fleet chain even when native is
#      available — the chain remains one env var away.
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LANE=gateway "$WRAPPER" "hi" >/dev/null 2>&1 || true
grep -q "MODEL=glm-coding" "$ENV_OUT" \
  && ok "explicit lane=gateway overrides native" || no "explicit lane=gateway ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10e. lane=native without credentials must fail LOUDLY (69, no spawn) rather than
#      quietly degrading to some other lane.
rm -f "$ARGS_OUT"
set +e; POOLSIDE_YOLO_LANE=native "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 69 ] && [ ! -f "$ARGS_OUT" ]; } \
  && ok "lane=native without creds blocks (69, no spawn)" || no "lane=native without creds blocks (got $code)"

# 10f. an unknown lane fails loudly instead of being treated as valid
rm -f "$ARGS_OUT"
set +e; POOLSIDE_YOLO_LANE=not-a-lane "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 2 ] && [ ! -f "$ARGS_OUT" ]; } \
  && ok "unknown lane fails loudly (2, no spawn)" || no "unknown lane fails loudly (got $code)"

# 10g. zero-spend OUTRANKS an explicit paid lane. The marker is policy, not a default.
: > "$ROOT/NO_PAID_SPEND"
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LANE=native "$WRAPPER" "hi" >/dev/null 2>&1 || true
grep -q "MODEL=qwen3.5:9b-hermes-64k" "$ENV_OUT" 2>/dev/null \
  && ok "zero-spend overrides explicit lane=native" || no "zero-spend overrides lane=native ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"
rm -f "$ROOT/NO_PAID_SPEND"

# 10i. POOLSIDE_API_KEY is native auth. docs.poolside.ai: "For automation environments,
#      set POOLSIDE_API_KEY instead of using stored credentials. pool checks it before
#      reading from configuration files." Ignoring it sent `auto` to the gateway AND
#      re-used the caller's real Poolside key as the gateway bearer token.
rm -f "$ENV_OUT"
POOLSIDE_API_KEY="real-poolside-key" "$WRAPPER" "hi" >/dev/null 2>&1 || true
{ grep -qx "BASE=" "$ENV_OUT" && grep -qx "KEY=real-poolside-key" "$ENV_OUT"; } \
  && ok "env-only POOLSIDE_API_KEY selects native AND survives" \
  || no "env-only POOLSIDE_API_KEY ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10j. ...and an explicitly requested native lane must not exit 69 when the only
#      credential is the environment variable.
rm -f "$ARGS_OUT"
set +e; POOLSIDE_API_KEY="real-poolside-key" POOLSIDE_YOLO_LANE=native "$WRAPPER" "hi" >/dev/null 2>&1; code=$?; set -e
{ [ "$code" -eq 0 ] && [ -f "$ARGS_OUT" ]; } \
  && ok "lane=native accepts env-only credentials" || no "lane=native accepts env-only creds (got $code)"

# 10k. the gateway lane must NOT forward a Poolside platform credential as its bearer
rm -f "$ENV_OUT"
POOLSIDE_API_KEY="real-poolside-key" POOLSIDE_YOLO_LANE=gateway "$WRAPPER" "hi" >/dev/null 2>&1 || true
grep -q "KEY=real-poolside-key" "$ENV_OUT" 2>/dev/null \
  && no "gateway lane leaked the Poolside platform key as its bearer" \
  || ok "gateway lane never forwards POOLSIDE_API_KEY"

# 10l. doctor must resolve the lane the SAME way execution does. Under zero-spend an
#      explicit paid lane is demoted to local at run time, so doctor reporting (and
#      probing) `native` was misleading exactly when policy was being enforced.
: > "$ROOT/NO_PAID_SPEND"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LANE=native "$WRAPPER" --doctor --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['zeroSpendActive'] is True
assert d['lane']=='local', 'doctor says %r but runtime forces local' % d['lane']
assert d['laneRequested']=='native'
" && ok "doctor agrees with runtime under zero-spend" || no "doctor agrees with runtime under zero-spend"
rm -f "$ROOT/NO_PAID_SPEND"

# 10h. doctor reports the lane it would actually take (this is the field that would
#      have made the 2026-07-28 outage obvious instead of a 40s mystery).
POOLSIDE_YOLO_CREDENTIALS="$CREDS" "$WRAPPER" --doctor --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['lane']=='native', 'lane is %r' % d['lane']
assert d['laneRequested']=='auto'
assert d['nativeAuthed'] is True
" && ok "doctor reports native lane" || no "doctor reports native lane"

"$WRAPPER" --doctor --json | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['lane']=='gateway', 'lane is %r' % d['lane']
assert d['nativeAuthed'] is False
" && ok "doctor reports gateway lane without creds" || no "doctor reports gateway lane without creds"
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
#    POOLSIDE_YOLO_CREDENTIALS is unset here on purpose: this case is about the REAL
#    machine, so it must resolve the real credentials path and report the real lane.
#    DOCTOR_NO_PROBE keeps it fast — the live model probe can legitimately take ~55s
#    while walking a dead fallback chain, and this case is about mode validity.
unset POOL_BIN POOLSIDE_YOLO_GATEWAY_URL POOLSIDE_YOLO_CREDENTIALS
REAL_POOL="${HOME}/.local/bin/pool"
if [ -x "$REAL_POOL" ] && curl -fsS -m 4 http://127.0.0.1:4010/health/liveliness >/dev/null 2>&1; then
  LIVE="$(POOLSIDE_YOLO_DOCTOR_NO_PROBE=1 "$WRAPPER" --doctor --json 2>/dev/null)"
  echo "$LIVE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['mode']=='always-allow', 'mode is %r' % d['mode']
assert d['modeValid'] is True, 'pool does not advertise %r; it advertises %r' % (d['mode'], d['availableModes'])
assert 'always-allow' in d['availableModes']
assert d['modelServed'] is True, 'gateway does not serve %r' % d['defaultModel']
assert d['lane'] in ('native','gateway','local'), 'lane is %r' % d['lane']
assert d['nativeAuthed'] is (d['lane'] == 'native') or d['laneRequested'] != 'auto', \
    'auto resolved to %r while nativeAuthed=%r' % (d['lane'], d['nativeAuthed'])
" && ok "LIVE: pool advertises mode always-allow + gateway serves model" \
    || no "LIVE: mode/model validity ($LIVE)"
else
  echo "  [SKIP] live mode probe (no real pool binary or gateway at :4010)"
fi

echo "poolside-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
