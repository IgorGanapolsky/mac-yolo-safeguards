#!/usr/bin/env bash
# Tests for ollama-embed-pin: plist validity, quiet-failure contract against a
# dead endpoint, and the keep_alive=-1 pin request. Hermetic — the success path
# stubs curl via PATH; the failure path uses a real connection refusal.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../scripts/ollama-embed-pin.sh"
PLIST="$HERE/../com.igor.ollama-embed-pin.plist"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

# 1. plist lints after {{HOME}} substitution (what install.sh produces)
sed "s|{{HOME}}|$HOME|g" "$PLIST" > "$ROOT/rendered.plist"
plutil -lint "$ROOT/rendered.plist" >/dev/null && ok "rendered plist lints" || no "rendered plist lints"

# 2. plist wiring: 5-minute interval + RunAtLoad
grep -A1 StartInterval "$PLIST" | grep -q ">300<" && ok "StartInterval 300" || no "StartInterval 300"
grep -A1 RunAtLoad "$PLIST" | grep -q "<true/>" && ok "RunAtLoad true" || no "RunAtLoad true"

# 3. dead endpoint -> exit 0, no output (quiet; launchd retries next interval)
if out="$(EMBED_PIN_OLLAMA_URL="http://127.0.0.1:1" sh "$SCRIPT" 2>&1)"; then
  [ -z "$out" ] && ok "dead endpoint: exit 0, silent" || no "dead endpoint: expected silence, got: $out"
else
  no "dead endpoint: expected exit 0"
fi

# 4. success path via curl stub: request pins keep_alive=-1 with a 15s cap
mkdir -p "$ROOT/bin"
cat > "$ROOT/bin/curl" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$ROOT/curl_args"
exit 0
EOF
chmod +x "$ROOT/bin/curl"
out="$(PATH="$ROOT/bin:$PATH" sh "$SCRIPT")"
grep -q '"keep_alive":-1' "$ROOT/curl_args" && ok 'request carries "keep_alive":-1' || no 'request carries "keep_alive":-1'
grep -q '"model":"nomic-embed-text"' "$ROOT/curl_args" && ok "request targets nomic-embed-text" || no "request targets nomic-embed-text"
grep -q -- "--max-time 15" "$ROOT/curl_args" && ok "15s curl cap" || no "15s curl cap"
grep -q "/api/embed" "$ROOT/curl_args" && ok "hits /api/embed" || no "hits /api/embed"
[ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 1 ] && echo "$out" | grep -q "pinned nomic-embed-text" \
  && ok "success logs exactly one line" || no "success logs exactly one line (got: $out)"

echo "ollama-embed-pin tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
