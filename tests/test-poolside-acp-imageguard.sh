#!/usr/bin/env bash
# Tests for poolside-acp-imageguard — the ACP proxy that stops a pasted screenshot
# from permanently bricking a pool session.
#
# The bug being defended against (verified live 2026-07-30, pool 1.0.14):
#   `pool acp` advertises promptCapabilities.image=true while serving only
#   poolside/laguna-s-2.1 and poolside/laguna-xs-2.1, which are text-only. An image
#   therefore reaches inference and returns
#     400 Bad Request: This model does not support multimodal (image/video/audio) inputs
#   and because pool replays the whole conversation each turn, that image poisons the
#   session FOREVER — text-only prompts fail too. Measured against the real server:
#   prompt #1 (with image) 400s, and prompt #2 (pure text) 400s as well.
#
# Hermetic: stubs the ACP server and the vision gateway. No network, no real pool.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
GUARD="$HERE/../poolside-acp-imageguard"
ROOT="$(mktemp -d)"
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }
trap 'rm -rf "$ROOT"' EXIT

# 1x1 PNG, the smallest thing that is unambiguously an image block.
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

# --- stub ACP server -------------------------------------------------------------
# Echoes back what it RECEIVED so the test can assert on the post-transform stream,
# and answers initialize with the real (lying) capability payload.
STUB="$ROOT/pool"
RECV="$ROOT/received.jsonl"
cat >"$STUB" <<EOF
#!/usr/bin/env node
const readline = require('readline');
const fs = require('fs');
if (process.argv[2] !== 'acp') { console.error('stub expects acp'); process.exit(9); }
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  fs.appendFileSync('$RECV', line + '\n');
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === 'initialize') {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: {
      agentCapabilities: { loadSession: true, promptCapabilities: { image: true } },
      agentInfo: { name: 'stub' }, protocolVersion: 1 } }) + '\n');
  } else if (m.id !== undefined) {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { ok: true } }) + '\n');
  }
});
EOF
chmod +x "$STUB"

# --- stub vision gateway ----------------------------------------------------------
PORT_FILE="$ROOT/gw-port"
node - "$PORT_FILE" <<'JS' &
const http = require('http');
const fs = require('fs');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    if ((req.url || '').endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'glm-vision' }] }));
      return;
    }
    if ((req.url || '').includes('/chat/completions')) {
      // Assert the guard sends a real data: URL, not a bare base64 blob.
      const sawDataUrl = /data:image\/png;base64,iVBOR/.test(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: {
        content: sawDataUrl ? 'STUB-DESCRIPTION: a single red pixel' : 'MISSING-DATA-URL' } }] }));
      return;
    }
    res.writeHead(404); res.end();
  });
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(process.argv[2], String(server.address().port)));
JS
GW_PID=$!
# Drop it from the job table so bash does not print a "Terminated: 15 <entire
# heredoc>" notice on cleanup, which would bury the assertion lines in CI output.
disown "$GW_PID" 2>/dev/null || true
trap 'kill "$GW_PID" 2>/dev/null; rm -rf "$ROOT"' EXIT
for _ in $(seq 1 50); do [ -s "$PORT_FILE" ] && break; sleep 0.1; done
PORT="$(cat "$PORT_FILE" 2>/dev/null || echo)"
[ -n "$PORT" ] || { echo "  [FAIL] stub gateway never bound"; exit 1; }
GW="http://127.0.0.1:$PORT/v1"

# Drive the guard with a scripted client; print the agent->client stream.
drive() {
  local mode="$1"; shift
  printf '%s\n' "$@" | env \
    POOLSIDE_ACP_COMMAND="$STUB" \
    POOLSIDE_IMAGE_GUARD="$mode" \
    POOLSIDE_IMAGE_GUARD_URL="$GW" \
    POOLSIDE_IMAGE_GUARD_TIMEOUT=5000 \
    PATH="$ROOT:$PATH" \
    node "$GUARD" 2>/dev/null
}

INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}'
IMG_PROMPT="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"session/prompt\",\"params\":{\"sessionId\":\"s1\",\"prompt\":[{\"type\":\"text\",\"text\":\"why broken?\"},{\"type\":\"image\",\"mimeType\":\"image/png\",\"data\":\"$PNG\"}]}}"

# --- 1. the capability lie is corrected when we CANNOT transcribe ------------------
OUT="$(drive strip "$INIT")"
echo "$OUT" | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
  const m = JSON.parse(s.trim().split("\n")[0]);
  const c = m.result.agentCapabilities.promptCapabilities;
  if (c.image !== false) { console.error("image still "+c.image); process.exit(1); }
  if (m.result.agentCapabilities.loadSession !== true) { console.error("sibling field clobbered"); process.exit(1); }
});' && ok "strip: promptCapabilities.image true -> false (sibling fields intact)" \
   || no "initialize: capability not corrected"

# --- 1b. ...but ONLY when we cannot transcribe -------------------------------------
# The two layers pull opposite ways. Advertising image:false makes a well-behaved
# client refuse the paste — good when we have nothing better, a REGRESSION when we can
# transcribe, because it would block a screenshot the user is entitled to send. In
# describe/auto the advertisement must be left alone; layer 2 still guarantees no image
# reaches the model.
OUT="$(drive describe "$INIT")"
echo "$OUT" | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
  const c = JSON.parse(s.trim().split("\n")[0]).result.agentCapabilities.promptCapabilities;
  if (c.image !== true) { console.error("image was downgraded to "+c.image+" despite being able to transcribe"); process.exit(1); }
});' && ok "describe: image capability left TRUE so pastes are accepted and transcribed" \
   || no "describe: capability downgraded, which would block a transcribable screenshot"

# --- 2. strip mode: no image block survives ---------------------------------------
: >"$RECV"
drive strip "$INIT" "$IMG_PROMPT" >/dev/null
node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);
const p=lines.find(m=>m.method==="session/prompt");
if(!p){console.error("no prompt reached the server");process.exit(1)}
if(p.params.prompt.some(b=>b.type==="image")){console.error("IMAGE REACHED THE MODEL");process.exit(1)}
if(p.params.prompt[0].text!=="why broken?"){console.error("text block mutated");process.exit(1)}
if(!/no vision support/.test(p.params.prompt[1].text)){console.error("no explanation in note");process.exit(1)}
' "$RECV" && ok "strip: image block replaced with an explanatory note, text untouched" \
           || no "strip: image survived or text mutated"

# --- 3. describe mode: the image becomes its transcription -------------------------
: >"$RECV"
drive describe "$INIT" "$IMG_PROMPT" >/dev/null
node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);
const p=lines.find(m=>m.method==="session/prompt");
if(p.params.prompt.some(b=>b.type==="image")){console.error("IMAGE REACHED THE MODEL");process.exit(1)}
const t=p.params.prompt[1].text;
if(!/STUB-DESCRIPTION: a single red pixel/.test(t)){console.error("transcription missing: "+t.slice(0,120));process.exit(1)}
if(/MISSING-DATA-URL/.test(t)){console.error("guard sent raw base64, not a data: URL");process.exit(1)}
' "$RECV" && ok "describe: image transcribed via the vision route and injected as text" \
           || no "describe: transcription missing or malformed request"

# --- 4. describe falls back to a note when no vision route answers -----------------
: >"$RECV"
printf '%s\n' "$INIT" "$IMG_PROMPT" | env \
  POOLSIDE_ACP_COMMAND="$STUB" POOLSIDE_IMAGE_GUARD=describe \
  POOLSIDE_IMAGE_GUARD_URL="http://127.0.0.1:1/v1" POOLSIDE_IMAGE_GUARD_TIMEOUT=2000 \
  node "$GUARD" >/dev/null 2>&1
node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);
const p=lines.find(m=>m.method==="session/prompt");
if(p.params.prompt.some(b=>b.type==="image")){console.error("IMAGE REACHED THE MODEL on the failure path");process.exit(1)}
if(!/Transcription unavailable/.test(p.params.prompt[1].text)){console.error("no failure note");process.exit(1)}
' "$RECV" && ok "describe: dead vision route degrades to a note, still no image sent" \
           || no "describe: failure path let an image through"

# --- 5. non-prompt traffic is byte-identical ---------------------------------------
: >"$RECV"
OTHER='{"jsonrpc":"2.0","id":3,"method":"session/set_mode","params":{"sessionId":"s1","modeId":"always-allow"}}'
drive strip "$INIT" "$OTHER" >/dev/null
node -e '
const fs=require("fs");
const want=process.argv[2];
const got=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").find(l=>l.includes("set_mode"));
if(got!==want){console.error("mutated:\n"+got+"\n"+want);process.exit(1)}
' "$RECV" "$OTHER" && ok "pass-through: unrelated methods forwarded byte-for-byte" \
                   || no "pass-through: unrelated method was rewritten"

# --- 6. malformed lines are forwarded, not dropped ----------------------------------
: >"$RECV"
drive strip "$INIT" 'this is not json' >/dev/null
grep -qx 'this is not json' "$RECV" \
  && ok "pass-through: non-JSON line forwarded verbatim (never silently dropped)" \
  || no "pass-through: non-JSON line was dropped"

# --- 7. ordering is preserved across an awaited transcription -----------------------
# The transform awaits a network call; a naive implementation would let the later
# text prompt overtake the image prompt and reach the server out of order.
: >"$RECV"
P3='{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"s1","prompt":[{"type":"text","text":"SECOND"}]}}'
drive describe "$INIT" "$IMG_PROMPT" "$P3" >/dev/null
node -e '
const fs=require("fs");
const ids=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse)
  .filter(m=>m.method==="session/prompt").map(m=>m.id);
if(JSON.stringify(ids)!==JSON.stringify([2,3])){console.error("order was "+JSON.stringify(ids));process.exit(1)}
' "$RECV" && ok "ordering: transcription does not let a later prompt overtake an earlier one" \
           || no "ordering: prompts reached the server out of order"

# --- 8. off mode is a true passthrough ----------------------------------------------
: >"$RECV"
printf '%s\n' "$INIT" "$IMG_PROMPT" | env \
  POOLSIDE_ACP_COMMAND="$STUB" POOLSIDE_IMAGE_GUARD=off node "$GUARD" >/dev/null 2>&1
node -e '
const fs=require("fs");
const lines=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);
const p=lines.find(m=>m.method==="session/prompt");
if(!p.params.prompt.some(b=>b.type==="image")){console.error("off mode still stripped");process.exit(1)}
' "$RECV" && ok "off: explicit passthrough leaves the stream untouched (opt-out works)" \
           || no "off: passthrough still modified the stream"

# --- 9. an unknown mode fails loudly rather than silently disabling the guard --------
set +e
printf '%s\n' "$INIT" | env POOLSIDE_ACP_COMMAND="$STUB" POOLSIDE_IMAGE_GUARD=bogus \
  node "$GUARD" >/dev/null 2>"$ROOT/err"; rc=$?
set -e
[ "$rc" -eq 2 ] && grep -q "is not a mode" "$ROOT/err" \
  && ok "unknown POOLSIDE_IMAGE_GUARD mode exits 2 instead of failing open" \
  || no "unknown mode did not fail loudly (rc=$rc)"

# --- 10. settings install/uninstall is idempotent and surgical -----------------------
SET="$ROOT/settings.yaml"
cat >"$SET" <<'YAML'
pool:
    api_url: https://inference.poolside.ai
agent_servers:
    Poolside:
        type: custom
        command: pool
        args:
            - acp
default_config_options:
    mode: always-allow
YAML
BEFORE="$(cat "$SET")"
POOLSIDE_SETTINGS="$SET" node "$GUARD" --install >/dev/null
POOLSIDE_SETTINGS="$SET" node "$GUARD" --install >/dev/null   # twice: must not duplicate
COUNT="$(grep -c 'HermesImageGuard:' "$SET" || true)"
POOLSIDE_SETTINGS="$SET" node "$GUARD" --doctor --json | grep -q '"installed":true' && INST=1 || INST=0
POOLSIDE_SETTINGS="$SET" node "$GUARD" --uninstall >/dev/null
AFTER="$(cat "$SET")"
[ "$COUNT" = "1" ] && [ "$INST" = "1" ] && [ "$BEFORE" = "$AFTER" ] \
  && ok "install is idempotent and uninstall restores settings.yaml byte-for-byte" \
  || no "install/uninstall not clean (count=$COUNT installed=$INST restored=$([ "$BEFORE" = "$AFTER" ] && echo yes || echo no))"

# --- 11. selftest is wired and green -------------------------------------------------
node "$GUARD" --selftest >/dev/null 2>&1 \
  && ok "--selftest passes (offline invariant: no image block can reach the model)" \
  || no "--selftest failed"

# --- 12. LIVE: the real pool ACP server still lies about image support ---------------
# This is the canary. If Poolside ever ships the fix, this flips and the guard can be
# retired — we want to find that out from a test, not from folklore.
#
# `pool acp` answers on a long-lived stdio channel: it does NOT respond to a
# `printf | pool acp` pipeline, because that closes stdin before the handshake
# completes. The probe therefore has to hold the pipe open and wait.
REAL_POOL="${HOME}/.local/bin/pool"
if [ -x "$REAL_POOL" ]; then
  set +e
  LIVE_RC=$(node -e '
const {spawn} = require("child_process");
const p = spawn(process.argv[1], ["acp"], {stdio:["pipe","pipe","ignore"]});
let buf = "", done = false;
const finish = (code, msg) => { if (done) return; done = true; if (msg) console.error(msg); try { p.kill(); } catch {} process.exit(code); };
p.on("error", () => finish(3, "pool acp did not start"));
p.stdout.on("data", d => {
  buf += d;
  const line = buf.split("\n")[0];
  if (!buf.includes("\n")) return;
  let m; try { m = JSON.parse(line); } catch { return finish(3, "unparseable handshake"); }
  const c = m && m.result && m.result.agentCapabilities && m.result.agentCapabilities.promptCapabilities;
  if (!c) return finish(3, "no promptCapabilities in handshake");
  if (c.image === true) return finish(0);   // bug still present -> guard still required
  finish(1, "pool now reports image=" + c.image + " — upstream may be fixed; re-evaluate the guard");
});
p.stdin.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false}}}}) + "\n");
setTimeout(() => finish(3, "timed out waiting for the pool acp handshake"), 20000);
' "$REAL_POOL" >/dev/null 2>"$ROOT/live-err"; echo $?)
  set -e
  case "$LIVE_RC" in
    0) ok "LIVE: pool still advertises image support it cannot honour (guard still required)" ;;
    1) no "LIVE: pool capability changed — re-evaluate whether the guard is still needed ($(cat "$ROOT/live-err"))" ;;
    *) echo "  [SKIP] live capability probe ($(cat "$ROOT/live-err" 2>/dev/null))" ;;
  esac
else
  echo "  [SKIP] live capability probe (no real pool binary)"
fi

echo "poolside-acp-imageguard tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
