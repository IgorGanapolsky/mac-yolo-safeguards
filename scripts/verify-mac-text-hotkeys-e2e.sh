#!/bin/sh
# Restart and verify guarded cmd+# text hotkeys on the local Mac and Mac mini.
set -eu

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${MAC_TEXT_HOTKEYS_INIT:-$HOME/Documents/mac-text-hotkeys/init.lua}"
REMOTE_HOST="${MAC_TEXT_HOTKEYS_REMOTE_HOST:-macmini}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_DIR="${MAC_TEXT_HOTKEYS_ARTIFACT_DIR:-$REPO/artifacts/mac-text-hotkeys/$STAMP}"
HS="${HS_BIN:-/opt/homebrew/bin/hs}"

mkdir -p "$ARTIFACT_DIR"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

run_capture() {
  label="$1"
  shift
  {
    echo "$ $*"
    "$@"
  } >"$ARTIFACT_DIR/$label.txt" 2>&1
}

assert_file_contains() {
  file="$1"
  pattern="$2"
  description="$3"
  if grep -Ev '^\$ ' "$file" | grep -Eq "$pattern"; then
    printf "  [OK] %s\n" "$description"
  else
    printf "  [FAIL] %s\n" "$description"
    sed 's/^/    /' "$file" | tail -80
    exit 1
  fi
}

assert_file_not_contains() {
  file="$1"
  pattern="$2"
  description="$3"
  if grep -Ev '^\$ ' "$file" | grep -Eq "$pattern"; then
    printf "  [FAIL] %s\n" "$description"
    grep -Ev '^\$ ' "$file" | grep -En "$pattern" | sed 's/^/    /'
    exit 1
  else
    printf "  [OK] %s\n" "$description"
  fi
}

[ -f "$SOURCE" ] || fail "missing source config: $SOURCE"
[ -x "$HS" ] || fail "missing local hs CLI: $HS"

echo "=== mac-text-hotkeys e2e orchestration ==="
echo "Artifacts: $ARTIFACT_DIR"
cp "$SOURCE" "$ARTIFACT_DIR/source-init.lua"

echo ""
echo "=== Static invariants ==="
node "$REPO/tests/test-mac-text-hotkeys-config.js" | tee "$ARTIFACT_DIR/unit-test.txt"
assert_file_not_contains "$SOURCE" 'hs\.eventtap\.new|AXSelectedText|global-cooldown|source=eventtap' "dangerous eventtap/AX/global-cooldown paths absent"

echo ""
echo "=== Local Hammerspoon restart ==="
mkdir -p "$HOME/.hammerspoon"
cp "$SOURCE" "$HOME/.hammerspoon/init.lua"
osascript -e 'tell application "Hammerspoon" to quit' >/dev/null 2>&1 || true
sleep 1
open -a Hammerspoon
sleep 3
run_capture local-status "$HS" -c 'return hs.inspect(_G.igorTextHotkeys.status())'
run_capture local-hotkeys "$HS" -c 'return hs.inspect(hs.fnutils.map(hs.hotkey.getHotkeys(), function(h) return h.idx end))'
tail -80 "$HOME/Documents/mac-text-hotkeys/hotkey-events.log" >"$ARTIFACT_DIR/local-log-tail.txt" 2>&1 || true
assert_file_contains "$ARTIFACT_DIR/local-status.txt" 'accessibility = true' "local accessibility enabled"
assert_file_contains "$ARTIFACT_DIR/local-status.txt" 'enabled = true' "local hotkey config enabled"
assert_file_contains "$ARTIFACT_DIR/local-status.txt" 'hotkeys = 6' "local registered six hotkeys"
assert_file_contains "$ARTIFACT_DIR/local-hotkeys.txt" '⌘0' "local cmd+0 registered"
assert_file_contains "$ARTIFACT_DIR/local-hotkeys.txt" '⌘1' "local cmd+1 registered"
assert_file_contains "$ARTIFACT_DIR/local-hotkeys.txt" '⌘2' "local cmd+2 registered"
assert_file_contains "$ARTIFACT_DIR/local-hotkeys.txt" '⌘3' "local cmd+3 registered"
assert_file_contains "$ARTIFACT_DIR/local-hotkeys.txt" '⌘4' "local cmd+4 registered"
assert_file_contains "$ARTIFACT_DIR/local-hotkeys.txt" '⌘5' "local cmd+5 registered"

echo ""
echo "=== Remote Mac mini Hammerspoon restart ==="
ssh "$REMOTE_HOST" 'mkdir -p "$HOME/Documents/mac-text-hotkeys" "$HOME/.hammerspoon"'
scp "$SOURCE" "$REMOTE_HOST:~/Documents/mac-text-hotkeys/init.lua" >"$ARTIFACT_DIR/remote-scp.txt" 2>&1
ssh "$REMOTE_HOST" 'cp "$HOME/Documents/mac-text-hotkeys/init.lua" "$HOME/.hammerspoon/init.lua"; osascript -e '\''tell application "Hammerspoon" to quit'\'' >/dev/null 2>&1 || true; sleep 1; open -a Hammerspoon; sleep 3'
run_capture remote-status ssh "$REMOTE_HOST" "$HS -c 'return hs.inspect(_G.igorTextHotkeys.status())'"
run_capture remote-hotkeys ssh "$REMOTE_HOST" "$HS -c 'return hs.inspect(hs.fnutils.map(hs.hotkey.getHotkeys(), function(h) return h.idx end))'"
run_capture remote-file ssh "$REMOTE_HOST" "rg -n 'eventtap.new|AXSelectedText|deniedBundleIDs|no-focused-role-fallback|key-cooldown|global-cooldown|hs.hotkey.bind' ~/Documents/mac-text-hotkeys/init.lua || true"
run_capture remote-log-tail ssh "$REMOTE_HOST" "tail -80 ~/Documents/mac-text-hotkeys/hotkey-events.log || true"
assert_file_contains "$ARTIFACT_DIR/remote-status.txt" 'accessibility = true' "remote accessibility enabled"
assert_file_contains "$ARTIFACT_DIR/remote-status.txt" 'enabled = true' "remote hotkey config enabled"
assert_file_contains "$ARTIFACT_DIR/remote-status.txt" 'hotkeys = 6' "remote registered six hotkeys"
assert_file_contains "$ARTIFACT_DIR/remote-hotkeys.txt" '⌘0' "remote cmd+0 registered"
assert_file_contains "$ARTIFACT_DIR/remote-hotkeys.txt" '⌘1' "remote cmd+1 registered"
assert_file_contains "$ARTIFACT_DIR/remote-hotkeys.txt" '⌘2' "remote cmd+2 registered"
assert_file_contains "$ARTIFACT_DIR/remote-hotkeys.txt" '⌘3' "remote cmd+3 registered"
assert_file_contains "$ARTIFACT_DIR/remote-hotkeys.txt" '⌘4' "remote cmd+4 registered"
assert_file_contains "$ARTIFACT_DIR/remote-hotkeys.txt" '⌘5' "remote cmd+5 registered"
assert_file_not_contains "$ARTIFACT_DIR/remote-file.txt" 'eventtap\.new|AXSelectedText|global-cooldown' "remote dangerous paths absent"
assert_file_contains "$ARTIFACT_DIR/remote-file.txt" 'deniedBundleIDs' "remote denylist present"
assert_file_contains "$ARTIFACT_DIR/remote-file.txt" 'no-focused-role-fallback' "remote no-role fallback present"
assert_file_contains "$ARTIFACT_DIR/remote-file.txt" 'key-cooldown' "remote per-key cooldown present"

echo ""
echo "=== Remote Mac mini paste behavior ==="
ssh "$REMOTE_HOST" 'bash -s' >"$ARTIFACT_DIR/remote-api-paste.txt" 2>&1 <<'REMOTE_PASTE'
set -eu
close_textedit_docs() {
  osascript <<'OSA' >/dev/null 2>&1 || true
tell application "TextEdit"
  if it is running then
    repeat while (count of documents) > 0
      close front document saving no
    end repeat
  end if
end tell
OSA
}
check_key() {
  key="$1"
  expected="$2"
  close_textedit_docs
  osascript <<'OSA'
tell application "TextEdit"
  activate
  make new document
  set text of front document to ""
end tell
OSA
  sleep 1
  /opt/homebrew/bin/hs -c "hs.application.launchOrFocus(\"TextEdit\"); _G.igorTextHotkeys.paste(\"$key\"); return hs.inspect(_G.igorTextHotkeys.status())" </dev/null
  sleep 4
  text=$(osascript <<'OSA'
tell application "TextEdit"
  set txt to text of front document
  close front document saving no
  return txt
end tell
OSA
)
  printf 'key=%s text=%s\n' "$key" "$text"
  case "$text" in
    *"$expected"*) printf 'key=%s PASS\n' "$key" ;;
    *) printf 'key=%s FAIL expected=%s\n' "$key" "$expected"; exit 1 ;;
  esac
}
check_key 1 'are you sure?'
check_key 2 'continue'
check_key 3 'I rely on you as my autonomous CEO/CTO. I always expect you to investigate, do Deep Research and take action'
check_key 4 'always use Data Science, ML, and Agentic RAG to drive your decisions'
check_key 5 'What action must you take next to make money today?'
close_textedit_docs
REMOTE_PASTE
assert_file_contains "$ARTIFACT_DIR/remote-api-paste.txt" 'key=1 PASS' "remote cmd+1 snippet inserts"
assert_file_contains "$ARTIFACT_DIR/remote-api-paste.txt" 'key=2 PASS' "remote cmd+2 snippet inserts"
assert_file_contains "$ARTIFACT_DIR/remote-api-paste.txt" 'key=3 PASS' "remote cmd+3 snippet inserts"
assert_file_contains "$ARTIFACT_DIR/remote-api-paste.txt" 'key=4 PASS' "remote cmd+4 snippet inserts"
assert_file_contains "$ARTIFACT_DIR/remote-api-paste.txt" 'key=5 PASS' "remote cmd+5 snippet inserts"

echo ""
echo "=== PASS: mac-text-hotkeys e2e orchestration ==="
echo "Artifacts: $ARTIFACT_DIR"
