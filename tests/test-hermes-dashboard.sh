#!/usr/bin/env bash
# Smoke test for hermes-dashboard.js — starts the server against a fixture
# ~/.claude/projects tree, asserts the APIs return real parsed data, then stops it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SERVER="$HERE/../tools/hermes-dashboard.js"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"; [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null || true' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

# fixture: a fake HOME with one project + one session .jsonl
FAKE_HOME="$ROOT/home"
PROJ="$FAKE_HOME/.claude/projects/-Users-x-demo"
mkdir -p "$PROJ"
SID="11111111-2222-3333-4444-555555555555"
cat > "$PROJ/$SID.jsonl" <<JSONL
{"type":"ai-title","title":"Demo session title"}
{"type":"user","timestamp":"2026-07-19T10:00:00Z","cwd":"/Users/x/demo","gitBranch":"main","message":{"role":"user","content":"hello agent"}}
{"type":"assistant","timestamp":"2026-07-19T10:00:01Z","message":{"role":"assistant","content":[{"type":"text","text":"hi there"},{"type":"tool_use","name":"Bash","input":{"command":"ls"}}]}}
{"type":"pr-link","url":"https://github.com/x/y/pull/1"}
JSONL

node --check "$SERVER" && ok "server syntax OK" || no "server syntax"

PORT=8791
HOME="$FAKE_HOME" HERMES_DASH_PORT="$PORT" HERMES_DASH_HOST=127.0.0.1 \
  FLEET_GATEWAY_URL="http://127.0.0.1:1/nope" node "$SERVER" > "$ROOT/log" 2>&1 &
PID=$!
# wait for listen
for i in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:$PORT/api/fleet" && break; sleep 0.3; done

# 1: fleet endpoint reports session count from the fixture
fleet="$(curl -s "http://127.0.0.1:$PORT/api/fleet")"
echo "$fleet" | grep -q '"sessionCount":1' && ok "fleet: counts fixture session" || no "fleet sessionCount ($fleet)"
echo "$fleet" | grep -q '"up":false' && ok "fleet: gateway down detected (no false-up)" || no "fleet gateway status"

# 2: sessions endpoint parses title/project/branch/count
sess="$(curl -s "http://127.0.0.1:$PORT/api/sessions")"
echo "$sess" | grep -q 'Demo session title' && ok "sessions: ai-title parsed" || no "sessions title"
echo "$sess" | grep -q '"project":"demo"' && ok "sessions: project from cwd" || no "sessions project"
echo "$sess" | grep -q '"branch":"main"' && ok "sessions: git branch" || no "sessions branch"

# 3: search filter works
echo "$(curl -s "http://127.0.0.1:$PORT/api/sessions?q=nomatch")" | grep -q '"shown":0' \
  && ok "sessions: search filters out non-matches" || no "sessions search"

# 4: thread endpoint returns messages incl tool_use flattening + resume command
thr="$(curl -s "http://127.0.0.1:$PORT/api/thread?id=$SID")"
echo "$thr" | grep -q 'hello agent' && ok "thread: user message" || no "thread user msg"
echo "$thr" | grep -q 'claude --resume '"$SID" && ok "thread: real resume command" || no "thread resume cmd"
echo "$thr" | grep -q 'Bash' && ok "thread: tool_use flattened" || no "thread tool_use"

# 5: unknown thread id -> 404
code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/thread?id=nope")"
[ "$code" = 404 ] && ok "thread: 404 on unknown id" || no "thread 404 (got $code)"

# 6: live agents endpoint returns an array
echo "$(curl -s "http://127.0.0.1:$PORT/api/live")" | grep -q '"agents":\[' \
  && ok "live: returns agents array" || no "live agents endpoint"

# 7: kill SAFETY — refuses invalid pid (<=1) and a non-agent pid, never signals blindly
k1="$(curl -s -X POST "http://127.0.0.1:$PORT/api/kill?pid=1")"
echo "$k1" | grep -q '"ok":false' && ok "kill: refuses pid<=1" || no "kill pid1 ($k1)"
k2="$(curl -s -X POST "http://127.0.0.1:$PORT/api/kill?pid=99999998")"
echo "$k2" | grep -qi 'not a currently-running agent' && ok "kill: refuses non-agent pid" || no "kill non-agent ($k2)"
# 8: kill only responds to POST (GET is not the kill path)
gcode="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/kill?pid=1")"
[ "$gcode" = 404 ] && ok "kill: GET is not the kill path" || no "kill GET guard (got $gcode)"

echo "hermes-dashboard tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
