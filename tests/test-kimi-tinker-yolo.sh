#!/usr/bin/env bash
# Hermetic tests for kimi-yolo + tinker-yolo: gate behavior, dispatch, delegation.
# No network, no real Kimi/Tinker — stubs the harness and gateway.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KIMI="$HERE/../kimi-yolo"; TINKER="$HERE/../tinker-yolo"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"; [ -n "${GW_PID:-}" ] && kill "$GW_PID" 2>/dev/null || true' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

# Stub gateway answering /health/liveliness AND a kimi-code completion of KIMI-YOLO-OK.
PORT=4997
python3 - "$PORT" <<'PY' &
import http.server,sys,json
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('/health/liveliness'):
            self.send_response(200); self.end_headers(); self.wfile.write(b'"alive"')
        else: self.send_response(404); self.end_headers()
    def do_POST(self):
        self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers()
        self.wfile.write(json.dumps({"choices":[{"message":{"content":"KIMI-YOLO-OK"}}]}).encode())
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',int(sys.argv[1])),H).serve_forever()
PY
GW_PID=$!; sleep 1

# Stub opencode-yolo harness that records argv.
OCY="$ROOT/opencode-yolo"; ARGS="$ROOT/ocy-args"
printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s"\necho HARNESS-RAN\n' "$ARGS" > "$OCY"; chmod +x "$OCY"

kenv(){ export KIMI_YOLO_GATEWAY_URL="http://127.0.0.1:$PORT/v1"; export OPENCODE_YOLO_BIN="$OCY"; export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"; }
kenv

# kimi-yolo 1: doctor --json valid + probeReply
"$KIMI" --doctor --json | python3 -c "import json,sys;d=json.load(sys.stdin);assert d['schema']=='kimi-yolo/doctor-v1';assert d['ok'];assert d['model']=='kimi-code';assert d['probeReply']=='KIMI-YOLO-OK';assert d['autonomous']" \
  && ok "kimi-yolo doctor json" || no "kimi-yolo doctor json"

# kimi-yolo 2: zero-spend -> 73, harness never runs
: > "$ROOT/NO_PAID_SPEND"; rm -f "$ARGS"
set +e; "$KIMI" run hi >/dev/null 2>&1; c=$?; set -e
{ [ "$c" = 73 ] && [ ! -f "$ARGS" ]; } && ok "kimi-yolo zero-spend 73" || no "kimi-yolo zero-spend (got $c)"
rm -f "$ROOT/NO_PAID_SPEND"

# kimi-yolo 3: delegates with -m hermes/kimi-code
rm -f "$ARGS"; "$KIMI" run hi >/dev/null 2>&1 || true
grep -q -- "--model\|-m" "$ARGS" 2>/dev/null; grep -q "hermes/kimi-code" "$ARGS" && ok "kimi-yolo pins kimi model" || no "kimi-yolo pins kimi model ($(tr '\n' ' ' <"$ARGS"))"

# kimi-yolo 4: explicit -m respected (delegates verbatim, no injected kimi model)
rm -f "$ARGS"; "$KIMI" run -m hermes/glm-coding hi >/dev/null 2>&1 || true
grep -q "glm-coding" "$ARGS" && ! grep -q "kimi-code" "$ARGS" && ok "kimi-yolo respects explicit -m" || no "kimi-yolo explicit -m ($(tr '\n' ' ' <"$ARGS"))"

# kimi-yolo 5: missing harness -> 127
export OPENCODE_YOLO_BIN="$ROOT/nope"
set +e; "$KIMI" run hi >/dev/null 2>&1; c=$?; set -e
[ "$c" = 127 ] && ok "kimi-yolo missing-harness 127" || no "kimi-yolo missing-harness (got $c)"
kenv

# --- tinker-yolo (gate + dispatch; real training is proven live, not here) ---
export HERMES_ZERO_SPEND_MARKER="$ROOT/NO_PAID_SPEND"; export TINKER_VENV="$ROOT/venv"
# 6: missing venv -> 127 (no marker)
set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 127 ] && ok "tinker-yolo missing-venv 127" || no "tinker-yolo missing-venv (got $c)"
# 7: zero-spend -> 73 (even with a fake venv present)
mkdir -p "$ROOT/venv/bin"; printf '#!/bin/sh\nexit 0\n' > "$ROOT/venv/bin/python"; chmod +x "$ROOT/venv/bin/python"
: > "$ROOT/NO_PAID_SPEND"
set +e; "$TINKER" proof >/dev/null 2>&1; c=$?; set -e
[ "$c" = 73 ] && ok "tinker-yolo zero-spend 73" || no "tinker-yolo zero-spend (got $c)"
rm -f "$ROOT/NO_PAID_SPEND"
# 8: bad subcommand -> 2
set +e; "$TINKER" bogus >/dev/null 2>&1; c=$?; set -e
[ "$c" = 2 ] && ok "tinker-yolo usage error 2" || no "tinker-yolo usage error (got $c)"

echo "kimi/tinker-yolo tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
