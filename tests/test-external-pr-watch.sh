#!/usr/bin/env bash
# Hermetic tests for external-pr-watch.sh — gh and curl are stubbed; no network.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../scripts/external-pr-watch.sh"
ROOT="$(mktemp -d)"; trap 'rm -rf "$ROOT"' EXIT
pass=0; fail=0
ok(){ echo "  [PASS] $1"; pass=$((pass+1)); }
no(){ echo "  [FAIL] $1"; fail=$((fail+1)); }

export EXTERNAL_PR_WATCHLIST="$ROOT/watchlist.txt"
export EXTERNAL_PR_WATCH_STATE="$ROOT/state"
export EXTERNAL_PR_NTFY_TOPIC="test-topic"
export GH_BIN="$ROOT/gh" CURL_BIN="$ROOT/curl"

# curl stub records notifications; gh stub serves canned JSON from $ROOT/gh-out
cat > "$ROOT/curl" <<EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$ROOT/notifications"
EOF
cat > "$ROOT/gh" <<EOF
#!/bin/sh
cat "$ROOT/gh-out"
EOF
chmod +x "$ROOT/curl" "$ROOT/gh"

# 1: no watchlist -> clean exit, nothing happens
bash "$SCRIPT" && ok "no watchlist clean exit" || no "no watchlist clean exit"

# 2: first observation -> baseline saved, NO notification
printf 'acme/widgets#42\n' > "$ROOT/watchlist.txt"
printf '{"state":"OPEN","comments":0,"reviews":0}' > "$ROOT/gh-out"
bash "$SCRIPT"
{ [ -n "$(ls "$ROOT/state" 2>/dev/null)" ] && [ ! -f "$ROOT/notifications" ]; } \
  && ok "baseline saved, no ping" || no "baseline saved, no ping"

# 3: unchanged snapshot -> still no notification
bash "$SCRIPT"
[ ! -f "$ROOT/notifications" ] && ok "no ping on no change" || no "no ping on no change"

# 4: comment added -> notification fires, PR stays watched
printf '{"state":"OPEN","comments":1,"reviews":0}' > "$ROOT/gh-out"
bash "$SCRIPT"
{ grep -q "acme/widgets#42 changed" "$ROOT/notifications" && grep -q 'acme/widgets#42' "$ROOT/watchlist.txt"; } \
  && ok "ping on change, still watched" || no "ping on change"

# 5: merged -> final ping and pruned from watchlist
printf '{"state":"MERGED","comments":1,"reviews":1}' > "$ROOT/gh-out"
bash "$SCRIPT"
{ grep -q "MERGED" "$ROOT/notifications" && ! grep -q 'acme/widgets#42' "$ROOT/watchlist.txt"; } \
  && ok "merged -> ping + pruned" || no "merged -> ping + pruned"

# 6: gh failure -> kept in watchlist, no ping
printf 'acme/widgets#43\n' > "$ROOT/watchlist.txt"
printf '#!/bin/sh\nexit 1\n' > "$ROOT/gh"; chmod +x "$ROOT/gh"
rm -f "$ROOT/notifications"
bash "$SCRIPT"
{ grep -q 'acme/widgets#43' "$ROOT/watchlist.txt" && [ ! -f "$ROOT/notifications" ]; } \
  && ok "transient gh failure keeps watching silently" || no "transient gh failure handling"

echo "external-pr-watch tests: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
