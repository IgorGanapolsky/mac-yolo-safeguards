#!/usr/bin/env bash
# Tests for hermes-context: incremental indexing, multi-repo search, doctor.
# Hermetic — stubs Ollama's embedding API with a tiny deterministic HTTP server
# (no real model, no network).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$HERE/../hermes-context"
ROOT="$(mktemp -d)"
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }

PORT=4996
python3 - "$PORT" <<'PY' &
import hashlib, http.server, json, sys

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith('/api/tags'):
            body = json.dumps({"models": [{"name": "nomic-embed-text:latest"}]}).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        payload = json.loads(self.rfile.read(length) or b'{}')
        prompt = payload.get('prompt', '')
        # Simulate the real nomic-embed-text 500 for an over-long prompt, so the
        # split-and-retry path (embed_with_split) is actually exercised, not just
        # the happy path.
        if len(prompt) > 300:
            body = json.dumps({"error": "the input length exceeds the context length"}).encode()
            self.send_response(500); self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body))); self.end_headers()
            self.wfile.write(body)
            return
        # Deterministic fake embedding: seed a small vector from a hash of the text so
        # near-duplicate/related text produces a similar-ish vector (good enough for
        # exercising cosine ranking without a real model).
        h = hashlib.sha256(prompt.encode()).digest()
        vec = [b / 255.0 for b in h[:16]]
        body = json.dumps({"embedding": vec}).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body))); self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

http.server.HTTPServer(('127.0.0.1', int(sys.argv[1])), H).serve_forever()
PY
GW_PID=$!
trap 'rm -rf "$ROOT"; kill $GW_PID 2>/dev/null' EXIT
sleep 1
OLLAMA_URL="http://127.0.0.1:$PORT"

# Build a tiny fixture git repo to index.
REPO="$ROOT/fixture-repo"
mkdir -p "$REPO"
git -C "$REPO" init -q
git -C "$REPO" config user.email test@example.com
git -C "$REPO" config user.name test
printf 'def hello():\n    return "hi"\n' > "$REPO/a.py"
printf 'binary junk\x00\x01' > "$REPO/logo.png"
head -c 400000 /dev/zero | tr '\0' 'x' > "$REPO/huge.txt"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m init

INDEX_DIR="$ROOT/index"

# 1. doctor reports ollama up + model available before anything is indexed
DJSON="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" doctor --json)"
echo "$DJSON" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['schema']=='hermes-context/doctor-v1'; assert d['ok'] is True; assert d['ollamaUp'] is True; assert d['modelAvailable'] is True; assert d['indexedRepos']==[]" \
  && ok "doctor --json shape (pre-index)" || no "doctor --json shape (pre-index)"

# 2. index the fixture repo; binary + oversized files are skipped
OUT="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" index "$REPO" --name fixture)"
echo "$OUT" | grep -q "files=1 " && echo "$OUT" | grep -q "skipped_files=2" \
  && ok "index skips binary + oversized files, keeps 1 text file" || no "index file counts ($OUT)"
[ -f "$INDEX_DIR/fixture.jsonl" ] && [ -f "$INDEX_DIR/fixture.meta.json" ] \
  && ok "index writes jsonl + meta" || no "index writes jsonl + meta"

# 3. re-index with no changes reuses all chunks, embeds nothing new
OUT2="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" index "$REPO" --name fixture)"
echo "$OUT2" | grep -q "newly_embedded=0" && ok "unchanged re-index embeds nothing (incremental)" || no "unchanged re-index ($OUT2)"

# 4. changing the file causes re-embedding of just that file
printf 'def hello():\n    return "changed"\n' > "$REPO/a.py"
git -C "$REPO" add -A && git -C "$REPO" commit -q -m change
OUT3="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" index "$REPO" --name fixture)"
echo "$OUT3" | grep -qv "newly_embedded=0" && ok "changed file gets re-embedded" || no "changed file re-embed ($OUT3)"

# 5. search returns results and respects --repo filter across multiple indexed repos
REPO2="$ROOT/fixture-repo-2"
mkdir -p "$REPO2"; git -C "$REPO2" init -q
git -C "$REPO2" config user.email test@example.com; git -C "$REPO2" config user.name test
printf 'class Widget:\n    pass\n' > "$REPO2/b.py"
git -C "$REPO2" add -A && git -C "$REPO2" commit -q -m init
"$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" index "$REPO2" --name fixture2 >/dev/null

RESULTS="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" search "changed" --json)"
echo "$RESULTS" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
assert isinstance(rows, list) and len(rows) >= 1
assert {r['repo'] for r in rows} <= {'fixture', 'fixture2'}
" && ok "search across multiple repos returns valid JSON" || no "search JSON shape"

FILTERED="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" search "changed" --repo fixture2 --json)"
echo "$FILTERED" | python3 -c "
import json, sys
rows = json.load(sys.stdin)
assert all(r['repo'] == 'fixture2' for r in rows), rows
" && ok "search --repo filter is honored" || no "search --repo filter"

# 6. list shows both indexed repos
LISTED="$("$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" list)"
echo "$LISTED" | grep -q "^fixture:" && echo "$LISTED" | grep -q "^fixture2:" \
  && ok "list shows all indexed repos" || no "list output ($LISTED)"

# 7. gateway down => doctor reports not-ok, exit 1
set +e; "$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "http://127.0.0.1:4995" doctor --json >/dev/null 2>&1; code=$?; set -e
[ "$code" -eq 1 ] && ok "doctor exit 1 when Ollama down" || no "doctor exit code when down (got $code)"

# 8. an over-long chunk that trips the stub's "exceeds context length" 500 is
#    bisected and retried rather than dropped (embed_with_split)
REPO3="$ROOT/fixture-repo-3"
mkdir -p "$REPO3"; git -C "$REPO3" init -q
git -C "$REPO3" config user.email test@example.com; git -C "$REPO3" config user.name test
python3 -c "print('x' * 900)" > "$REPO3/dense.css"
git -C "$REPO3" add -A && git -C "$REPO3" commit -q -m init

ERR_OUT="$ROOT/index3-stderr"
"$WRAPPER" --index-dir "$INDEX_DIR" --ollama-url "$OLLAMA_URL" index "$REPO3" --name fixture3 2>"$ERR_OUT" >/dev/null
grep -q "embed failed" "$ERR_OUT" && no "over-long chunk dropped instead of split ($(cat "$ERR_OUT"))" \
  || ok "over-long chunk triggers no embed-failed drops"

CHUNKS3="$(python3 -c "
import json
n = sum(1 for _ in open('$INDEX_DIR/fixture3.jsonl'))
print(n)
")"
[ "$CHUNKS3" -ge 2 ] && ok "over-long chunk was bisected into multiple embedded pieces (got $CHUNKS3)" \
  || no "expected >=2 pieces from the split, got $CHUNKS3"

echo "hermes-context tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
