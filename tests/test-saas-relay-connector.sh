#!/usr/bin/env bash
# Proves the SaaS core end-to-end on ONE machine, no Tailscale, no inbound ports:
#   pair -> connector dials out -> browser fetches sessions THROUGH the relay ->
#   connector offline -> relay fails over to a VPS instance.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RELAY="$HERE/../saas/relay.js"; CONN="$HERE/../saas/connector.js"
ROOT="$(mktemp -d)"; pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }
pids=()
cleanup(){ for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; rm -rf "$ROOT"; }
trap cleanup EXIT

# fixture HOME with one real-looking session
FH="$ROOT/home"; PROJ="$FH/.claude/projects/-Users-x-demo"; mkdir -p "$PROJ"
SID="aaaa1111-bbbb-2222-cccc-333344445555"
cat > "$PROJ/$SID.jsonl" <<J
{"type":"ai-title","title":"My paid customer session"}
{"type":"user","cwd":"/Users/x/demo","gitBranch":"main","message":{"role":"user","content":"build me a feature"}}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"on it"}]}}
J

node --check "$RELAY" && node --check "$CONN" && ok "relay + connector syntax" || no "syntax"

# a stub "VPS Hermes" that answers /api/sessions (stands in for the fallback instance)
cat > "$ROOT/vps.js" <<'V'
const http=require('http');http.createServer((q,s)=>{if(q.url.startsWith('/api/sessions')){s.writeHead(200,{'Content-Type':'application/json'});s.end(JSON.stringify({sessions:[{id:"vps-1",title:"served by VPS fallback",project:"vps",msgCount:1}]}));}else{s.writeHead(200);s.end('{}');}}).listen(9098,'127.0.0.1');
V
node "$ROOT/vps.js" & pids+=($!)

# start the relay with the VPS fallback wired
RELAY_PORT=9099 RELAY_HOST=127.0.0.1 RELAY_VPS_FALLBACK_URL="http://127.0.0.1:9098" node "$RELAY" >"$ROOT/relay.log" 2>&1 & pids+=($!)
for i in $(seq 1 20); do curl -s -o /dev/null "http://127.0.0.1:9099/health" && break; sleep 0.2; done

# 1: website (post-SSO) mints a pairing code for an account
code="$(curl -s -X POST http://127.0.0.1:9099/v1/pair/new -d '{"accountId":"acct_paying_customer"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["pairingCode"])')"
[ -n "$code" ] && ok "website mints pairing code ($code)" || no "pairing code"

# 2: connector on the user's Mac redeems the code (dials out; no inbound ports)
RELAY_URL="http://127.0.0.1:9099" HOME="$FH" CONNECTOR_STATE="$ROOT/conn.json" node "$CONN" pair "$code" >/dev/null 2>&1
tok="$(python3 -c 'import json;print(json.load(open("'"$ROOT"'/conn.json"))["token"])' 2>/dev/null || true)"
[ -n "$tok" ] && ok "connector paired, token stored" || no "connector pair"

# 3: start the connector daemon (long-poll dial-out)
RELAY_URL="http://127.0.0.1:9099" HOME="$FH" CONNECTOR_STATE="$ROOT/conn.json" node "$CONN" run >"$ROOT/conn.log" 2>&1 & CPID=$!; pids+=($CPID)
sleep 2

# 4: BROWSER fetches the user's sessions THROUGH the relay — no Tailscale, no inbound port
sess="$(curl -s "http://127.0.0.1:9099/v1/sessions?token=$tok")"
{ echo "$sess" | grep -q '"source":"connector"' && echo "$sess" | grep -q 'My paid customer session'; } \
  && ok "browser reads LOCAL sessions via relay (no Tailscale)" || no "browser->relay->connector ($sess)"

# 5: status shows the machine online
curl -s "http://127.0.0.1:9099/v1/status?token=$tok" | grep -q '"online":true' && ok "status: connector online" || no "status online"

# 6: FAILOVER — kill the connector (user's Mac offline) -> relay serves from the VPS
kill "$CPID" 2>/dev/null; sleep 1
RELAY_NOW_MS=$(( $(date +%s000) + 60000 )) # advance clock past offline window for a deterministic check
off="$(RELAY_CONNECTOR_OFFLINE_MS=1 curl -s "http://127.0.0.1:9099/v1/sessions?token=$tok")"
# connector is dead; after OFFLINE_MS (default 15s) relay uses VPS. Force by waiting.
sleep 15
off2="$(curl -s "http://127.0.0.1:9099/v1/sessions?token=$tok")"
{ echo "$off2" | grep -q '"source":"vps-fallback"' && echo "$off2" | grep -q 'served by VPS fallback'; } \
  && ok "offline -> relay fails over to VPS instance" || no "VPS failover ($off2)"

echo "saas relay+connector: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
