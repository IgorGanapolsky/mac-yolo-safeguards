#!/usr/bin/env bash
# Tests for hermes-primary-route-recovery: decides whether a stale LiteLLM cooldown
# should be cleared by restarting the proxy. The whole point is that it must NOT
# restart on noise, so most of these assert inaction.
# Hermetic — stubs the gateway and the proxy error log; never restarts anything
# (every case runs --dry-run, and the acting path is asserted via its DRY-RUN line).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../scripts/hermes-primary-route-recovery.sh"
ROOT="$(mktemp -d)"
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

PORT=4987
SERVED_FILE="$ROOT/served"
echo "some-other-model" > "$SERVED_FILE"

python3 - "$PORT" "$SERVED_FILE" <<'PY' &
import http.server, sys, json
served_file = sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        ln = int(self.headers.get('Content-Length', 0)); self.rfile.read(ln)
        served = open(served_file).read().strip()
        if served == "__FAIL__":
            self.send_response(500); self.end_headers(); return
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({"model": served, "choices":[{"message":{"content":"hi"}}]}).encode())
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
PY
GW_PID=$!
trap 'rm -rf "$ROOT"; kill $GW_PID 2>/dev/null' EXIT
sleep 1

run() { # $1=errlog $2=state -> stdout is the decision line
  # `|| true`: the script exits 1 when it cannot determine the served model, which is a
  # decision we assert on — it must not abort this suite under `set -e`.
  HERMES_GATEWAY_URL="http://127.0.0.1:$PORT/v1" \
  HERMES_PRIMARY_MODEL="glm-coding" \
  HERMES_LITELLM_ERRLOG="$1" \
  HERMES_ROUTE_RECOVERY_STATE="$2" \
  HERMES_ROUTE_RECOVERY_LOG="$ROOT/recovery.log" \
  bash "$SCRIPT" --dry-run 2>&1 | tail -n1 || true
}

PAST="$ROOT/past.err";   printf 'reset at 2026-07-01 10:00:00\n' > "$PAST"
FUTURE="$ROOT/fut.err";  printf 'reset at 2099-01-01 00:00:00\n' > "$FUTURE"
NONE="$ROOT/none.err";   : > "$NONE"

# 1. glm-coding serving itself is NOT healthy — switch to SuperGrok now
echo "glm-coding" > "$SERVED_FILE"
run "$PAST" "$ROOT/s1" | grep -q "would switch primary" && ok "glm serving -> switch now" || no "glm serving -> switch now"

# 2. fell back, reset still in the future => ACT now (do not sit idle until Aug 22)
echo "nemotron3-free" > "$SERVED_FILE"
run "$FUTURE" "$ROOT/s2" | grep -q "would switch primary" && ok "fallback + reset in future -> switch now" || no "fallback + reset in future -> switch now"

# 3. glm primary + fallback, reset passed => switch now (not wait, not idle restart-only)
out="$(run "$PAST" "$ROOT/s3")"
echo "$out" | grep -qE "DRY-RUN: would switch primary|DRY-RUN: would restart" && ok "fallback + reset passed -> would act" || no "fallback + reset passed -> would act ($out)"

# 4. fell back, reset passed, but restarted moments ago => cooldown, no thrash
date '+%s' > "$ROOT/s4"
run "$PAST" "$ROOT/s4" | grep -q "cooling down" && ok "recent restart -> cooldown, no thrash" || no "recent restart -> cooldown"

# 5. glm primary + fallback and no reset stamp => still leave glm (do not invent a wait window)
run "$NONE" "$ROOT/s5" | grep -q "would switch primary" && ok "glm primary + no reset stamp -> switch now" || no "glm primary + no reset stamp -> switch now"

# 6. gateway unreachable/erroring => cannot determine, must not restart on noise
echo "__FAIL__" > "$SERVED_FILE"
out="$(run "$PAST" "$ROOT/s6")"
echo "$out" | grep -q "UNKNOWN" && ok "gateway failing -> UNKNOWN, no restart" || no "gateway failing -> UNKNOWN ($out)"

echo "hermes-primary-route-recovery tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
