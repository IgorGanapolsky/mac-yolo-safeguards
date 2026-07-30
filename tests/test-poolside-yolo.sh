#!/usr/bin/env bash
# Tests for poolside-yolo: doctor shape, zero-spend gate, model default, binary
# resolution, gateway routing env vars, login passthrough.
# Hermetic — stubs the pool binary and gateway; no network, no real pool.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$HERE/../poolside-yolo"
ROOT="$(mktemp -d)"

# Interactive invocations register the ACP image guard in poolside's settings.yaml.
# Point that at a throwaway file: a test suite must never rewrite the developer's real
# ~/.config/poolside/settings.yaml, and if it did it would record whatever transient
# path this checkout happens to live at (a worktree that later gets pruned), leaving
# `pool` pointing at a command that no longer exists.
export POOLSIDE_SETTINGS="$ROOT/settings.yaml"
# Keep the guard's reachability probe off the network in a hermetic suite.
export POOLSIDE_IMAGE_GUARD_URL="http://127.0.0.1:1/v1"
# Lane selection consults pool's OWN log directory to detect a blown daily quota, so
# point that at an empty throwaway dir. Without this the suite reads the developer's
# real ~/Library/Application Support/poolside/logs and every lane assertion becomes
# timing-dependent — passing only while the last real 429 is older than the cooldown
# window. Measured while writing this: 36/36 with aged-out logs, 32/4 with a quota
# error inside the window. Same hazard, and same fix, as POOLSIDE_SETTINGS above.
export POOLSIDE_YOLO_LOGDIR="$ROOT/pool-logs"
mkdir -p "$POOLSIDE_YOLO_LOGDIR"
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

# Stub gateway via Node (always present in CI after setup-node; more reliable than
# python HTTPServer on GitHub-hosted macOS where bind+heredoc races showed port=none).
PORT_FILE="$ROOT/gw-port"
node - "$PORT_FILE" <<'JS' &
const http = require('http');
const fs = require('fs');
const portFile = process.argv[2];
const server = http.createServer((req, res) => {
  const url = req.url || '';
  if (url.endsWith('/health/liveliness')) {
    res.writeHead(200); res.end('"alive"');
    return;
  }
  if (url.endsWith('/models') || url.endsWith('/v1/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'glm-coding' }, { id: 'qwen3.5:9b-hermes-64k' }] }));
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  fs.writeFileSync(portFile, String(port));
});
JS
GW_PID=$!
trap 'rm -rf "$ROOT"; kill $GW_PID 2>/dev/null' EXIT
PORT=""
ready=0
for _ in $(seq 1 50); do
  if [ -f "$PORT_FILE" ]; then
    PORT="$(cat "$PORT_FILE" 2>/dev/null || true)"
    if [ -n "$PORT" ] && curl -fsS -m 1 "http://127.0.0.1:${PORT}/health/liveliness" >/dev/null 2>&1; then
      ready=1
      break
    fi
  fi
  sleep 0.2
done
if [ "$ready" -ne 1 ] || [ -z "$PORT" ]; then
  echo "test-poolside-yolo: stub gateway failed to start (port=${PORT:-none} pid=$GW_PID)" >&2
  kill $GW_PID 2>/dev/null || true
  exit 2
fi

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

# 6b-i. Interactive sessions go through the ACP image guard. Without it, a pasted
#       screenshot returns "400 ... does not support multimodal" AND poisons the
#       session history, so every later turn — text-only included — fails too.
rm -f "$ARGS_OUT"
"$WRAPPER" >/dev/null 2>&1 || true
grep -qx "HermesImageGuard" "$ARGS_OUT" 2>/dev/null && grep -qx -- "-s" "$ARGS_OUT" \
  && ok "interactive run is routed through the ACP image guard" \
  || no "interactive run not guarded ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6b-ii. Opt-out must actually opt out.
rm -f "$ARGS_OUT"
POOLSIDE_YOLO_IMAGE_GUARD=off "$WRAPPER" >/dev/null 2>&1 || true
# Require proof that pool ACTUALLY RAN. "no HermesImageGuard in the args" is also true
# when the wrapper died before spawning anything — which is exactly what happened on
# bash 3.2, where an empty "${GUARD_ARGS[@]}" is an unbound variable under `set -u`.
if [ ! -s "$ARGS_OUT" ]; then
  no "POOLSIDE_YOLO_IMAGE_GUARD=off never spawned pool (vacuous pass guarded)"
elif grep -qx "HermesImageGuard" "$ARGS_OUT"; then
  no "POOLSIDE_YOLO_IMAGE_GUARD=off still injected the guard"
else
  ok "POOLSIDE_YOLO_IMAGE_GUARD=off runs unguarded (and pool still ran)"
fi

# 6b-iii. An explicit -s is the caller's choice; never override it.
rm -f "$ARGS_OUT"
"$WRAPPER" -s Poolside >/dev/null 2>&1 || true
[ "$(grep -c -- "-s" "$ARGS_OUT" 2>/dev/null || echo 0)" -eq 1 ] && grep -qx "Poolside" "$ARGS_OUT" \
  && ok "explicit -s wins over the image guard (no double agent-server)" \
  || no "explicit -s was overridden ($(tr '\n' ' ' < "$ARGS_OUT" 2>/dev/null))"

# 6b-iv. `pool exec` has no --agent-server flag, and nothing can paste an image into
#        it, so the guard must NOT leak onto that path — passing -s there would make
#        every one-shot run fail on an unknown flag.
rm -f "$ARGS_OUT"
"$WRAPPER" exec -p hello >/dev/null 2>&1 || true
if [ ! -s "$ARGS_OUT" ]; then
  no "exec path never spawned pool (vacuous pass guarded)"
elif grep -qx -- "-s" "$ARGS_OUT"; then
  no "guard leaked onto the exec path (pool exec rejects -s)"
else
  ok "exec path stays unguarded (pool exec has no -s flag)"
fi

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

# 10a-quota. Poolside's free tier has a DAILY cap. When it blows, the credential is
#     still valid, so native_authed() keeps saying yes and `auto` kept feeding a lane
#     that could not answer a single prompt — every turn 429ing while --doctor reported
#     ok:true. That is what "poolside-yolo is completely broken" looked like.
#     pool logs the rejection itself, so the demotion is a local file read.
QLOGS="$ROOT/quota-logs"; mkdir -p "$QLOGS"
printf 'level=ERROR msg="OpenAI API error" error_body="{\\"error\\":\\"usage limit exceeded\\"}"\n' \
  > "$QLOGS/pool-quota.log"
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LOGDIR="$QLOGS" "$WRAPPER" "hi" >/dev/null 2>&1 || true
{ grep -q "BASE=http" "$ENV_OUT" 2>/dev/null && grep -q "MODEL=glm-coding" "$ENV_OUT" 2>/dev/null; } \
  && ok "auto + creds + blown daily quota -> demotes to gateway" \
  || no "auto + creds + blown quota should demote ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10a-quota-negative. The discriminator: a 429 that is NOT Poolside's daily cap must
#     NOT demote. The gateway's own chain 429s constantly (OpenRouter free tiers, z.ai
#     code 1310); rerouting TO the gateway because the GATEWAY is rate-limited would be
#     strictly worse than doing nothing. Match the specific body, never a bare "429".
printf 'level=ERROR msg="OpenAI API error" error_body="{\\"error\\":\\"429 rate limited\\"}"\n' \
  > "$QLOGS/pool-quota.log"
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LOGDIR="$QLOGS" "$WRAPPER" "hi" >/dev/null 2>&1 || true
{ grep -qx "BASE=" "$ENV_OUT" && grep -qx "MODEL=" "$ENV_OUT"; } \
  && ok "unrelated 429 in the log does NOT demote off native" \
  || no "unrelated 429 wrongly demoted ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10a-quota-stale. Self-healing: the cooldown is an mtime window, so once the daily cap
#     resets and pool stops logging, native is preferred again with no state to clear.
printf 'level=ERROR msg="OpenAI API error" error_body="{\\"error\\":\\"usage limit exceeded\\"}"\n' \
  > "$QLOGS/pool-quota.log"
touch -t 202001010000 "$QLOGS/pool-quota.log"
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LOGDIR="$QLOGS" "$WRAPPER" "hi" >/dev/null 2>&1 || true
{ grep -qx "BASE=" "$ENV_OUT" && grep -qx "MODEL=" "$ENV_OUT"; } \
  && ok "quota error older than the cooldown -> native again" \
  || no "stale quota error still demoting ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

# 10a-quota-explicit. An EXPLICIT lane=native is never rerouted. Naming a lane and
#     silently getting a different one is the silent degradation this wrapper removes.
printf 'level=ERROR msg="OpenAI API error" error_body="{\\"error\\":\\"usage limit exceeded\\"}"\n' \
  > "$QLOGS/pool-quota.log"
rm -f "$ENV_OUT"
POOLSIDE_YOLO_CREDENTIALS="$CREDS" POOLSIDE_YOLO_LOGDIR="$QLOGS" POOLSIDE_YOLO_LANE=native \
  "$WRAPPER" "hi" >/dev/null 2>&1 || true
{ grep -qx "BASE=" "$ENV_OUT" && grep -qx "MODEL=" "$ENV_OUT"; } \
  && ok "explicit lane=native is not rerouted by quota" \
  || no "explicit lane=native was rerouted ($(tr '\n' ' ' < "$ENV_OUT" 2>/dev/null))"

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
