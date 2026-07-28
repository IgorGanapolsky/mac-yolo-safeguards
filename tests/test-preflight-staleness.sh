#!/usr/bin/env bash
# Tests for preflight-staleness.
#
# This tool exists to stop me acting on a stale view of a target, so the tests are
# mostly negative controls: deliberately create the stale condition and assert it is
# DETECTED. A staleness checker that always says FRESH is worse than none -- it
# launders a wrong assumption into a verified-looking one. (Its first version did
# exactly the opposite: a parser bug made every healthy launchd job report STALE.)
#
# Uses a throwaway launchd label so no real service is touched.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOL="$HERE/../tools/preflight-staleness.sh"
LABEL="com.igor.preflight-selftest"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(mktemp -d)"
pass=0; fail=0
ok() { echo "  [PASS] $1"; pass=$((pass+1)); }
no() { echo "  [FAIL] $1"; fail=$((fail+1)); }
# Must end in `true`: launchctl bootout returns 3 when the job is already gone, and that
# status leaked out as the SCRIPT's exit code -- 15/15 assertions passing while the suite
# reported failure. run-suite correctly refused to call that a pass.
cleanup() { launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null; rm -f "$PLIST"; rm -rf "$ROOT"; true; }
trap cleanup EXIT

write_plist() { # $1 = final argument
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/bin/echo</string><string>$1</string>
  </array>
  <key>RunAtLoad</key><false/>
</dict></plist>
EOF
}

rc_of() { set +e; "$TOOL" "$@" >/dev/null 2>&1; local r=$?; set -e; printf '%s' "$r"; }

# missing plist entirely -> UNKNOWN(2), never FRESH
rm -f "$PLIST"
[ "$(rc_of launchd "$LABEL")" = "2" ] && ok "missing plist -> 2 (unknown), never 0" || no "missing plist -> 2"

# plist on disk but job not loaded -> STALE(1): editing it changes nothing
write_plist original
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
[ "$(rc_of launchd "$LABEL")" = "1" ] && ok "plist exists but job NOT loaded -> 1 (stale)" || no "unloaded job -> 1"

# loaded and matching -> FRESH(0)
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; sleep 1
[ "$(rc_of launchd "$LABEL")" = "0" ] && ok "loaded and matching -> 0 (fresh)" || no "loaded+matching -> 0"

# MUTATION: edit the plist WITHOUT reloading -> launchd still holds the old definition.
# This is the exact 2026-07-28 failure (MAX_QUEUE kept reverting to 4).
write_plist mutated
[ "$(rc_of launchd "$LABEL")" = "1" ] && ok "MUTATION edited-but-not-reloaded -> 1 (stale)" || no "edited-but-not-reloaded not detected"

# reloading resolves it
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; sleep 1
[ "$(rc_of launchd "$LABEL")" = "0" ] && ok "after reload -> 0 (fresh)" || no "after reload -> 0"

# MUTATION (reviewer-found): an ENV-only plist edit must be detected. Comparing only
# ProgramArguments missed exactly the OLLAMA_MAX_QUEUE case that motivated this tool.
write_plist_env() { # $1 = env value
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/echo</string><string>same</string></array>
  <key>EnvironmentVariables</key><dict><key>PREFLIGHT_TEST_VAR</key><string>$1</string></dict>
  <key>RunAtLoad</key><false/>
</dict></plist>
EOF
}
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
write_plist_env original
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null; sleep 1
[ "$(rc_of launchd "$LABEL")" = "0" ] && ok "env matching -> 0 (fresh)" || no "env matching -> 0"
write_plist_env mutated   # env changed, ARGS identical, no reload
[ "$(rc_of launchd "$LABEL")" = "1" ] && ok "MUTATION env-only plist edit -> 1 (stale)" || no "env-only edit not detected"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null

# ---- git checks, in a throwaway repo so nothing real is touched
GR="$ROOT/repo"; mkdir -p "$GR"
( cd "$GR" && git init -q && git config user.email t@t && git config user.name t \
  && echo a > f && git add f && git commit -qm base \
  && git checkout -qb feature && git checkout -q master 2>/dev/null || git checkout -q main 2>/dev/null
  echo b > f && git commit -qam ahead ) >/dev/null 2>&1
BASE="$(cd "$GR" && git rev-parse --abbrev-ref HEAD)"
( cd "$GR" && git checkout -q feature ) >/dev/null 2>&1
(cd "$GR" && "$TOOL" git "$BASE" >/dev/null 2>&1); grc=$?   # no set -e toggle: this suite runs without -e
[ "$grc" = "1" ] && ok "branch behind base -> 1 (stale)" || no "branch behind base -> 1 (got $grc)"
( cd "$GR" && git merge -q "$BASE" ) >/dev/null 2>&1
(cd "$GR" && "$TOOL" git "$BASE" >/dev/null 2>&1); grc2=$?
[ "$grc2" = "0" ] && ok "branch up to date -> 0 (fresh)" || no "up-to-date branch -> 0 (got $grc2)"

# ---- node checks
ND="$ROOT/node"; mkdir -p "$ND/node_modules/dep"
echo '{"name":"x","version":"1.0.0"}' > "$ND/package.json"
cat > "$ND/package-lock.json" <<'EOF'
{"name":"x","lockfileVersion":3,"packages":{"node_modules/dep":{"version":"2.0.0"}}}
EOF
echo '{"name":"dep","version":"2.0.0"}' > "$ND/node_modules/dep/package.json"
[ "$(rc_of node "$ND")" = "0" ] && ok "node_modules matches lockfile -> 0" || no "matching node_modules -> 0"

# MUTATION: installed version drifts from the lockfile -> local runs stop reproducing CI
echo '{"name":"dep","version":"1.9.9"}' > "$ND/node_modules/dep/package.json"
[ "$(rc_of node "$ND")" = "1" ] && ok "MUTATION node_modules drifted from lockfile -> 1 (stale)" || no "drifted node_modules not detected"

# MUTATION (reviewer-found): a lockfile package ABSENT from node_modules is a partial
# install and must be STALE, not silently skipped while another package matches.
PD="$ROOT/partial"; mkdir -p "$PD/node_modules/present"
echo '{"name":"z","version":"1.0.0"}' > "$PD/package.json"
cat > "$PD/package-lock.json" <<'EOF'
{"name":"z","lockfileVersion":3,"packages":{"node_modules/present":{"version":"1.0.0"},"node_modules/absent":{"version":"3.0.0"}}}
EOF
echo '{"name":"present","version":"1.0.0"}' > "$PD/node_modules/present/package.json"
[ "$(rc_of node "$PD")" = "1" ] && ok "MUTATION locked package absent from node_modules -> 1 (stale)" || no "partial install not detected"

# reviewer-found: a RELATIVE dir must resolve the lockfile correctly, not return UNKNOWN
RELRC=$( cd "$ROOT" && set +e; "$TOOL" node "partial" >/dev/null 2>&1; echo $?; set -e )
[ "$RELRC" = "1" ] && ok "relative --dir resolves lockfile (1, not vacuous 2)" || no "relative dir -> got $RELRC"

# reviewer-found: an unreachable remote must be UNKNOWN, never FRESH off a cached ref
BR="$ROOT/badremote"; mkdir -p "$BR"
( cd "$BR" && git init -q && git config user.email t@t && git config user.name t \
  && echo a > f && git add f && git commit -qm base \
  && git remote add origin "$ROOT/does-not-exist.git" \
  && git update-ref refs/remotes/origin/main HEAD ) >/dev/null 2>&1
BRC=$( cd "$BR" && set +e; "$TOOL" git origin/main >/dev/null 2>&1; echo $?; set -e )
[ "$BRC" = "2" ] && ok "unreachable remote -> 2 (unknown), never 0" || no "unreachable remote -> got $BRC"

# vacuity: nothing comparable must be UNKNOWN, never FRESH
VD="$ROOT/vac"; mkdir -p "$VD/node_modules"
echo '{"name":"y","version":"1.0.0"}' > "$VD/package.json"
echo '{"name":"y","lockfileVersion":3,"packages":{}}' > "$VD/package-lock.json"
[ "$(rc_of node "$VD")" = "2" ] && ok "0 packages comparable -> 2 (unknown), never 0" || no "vacuous node check -> 2"

echo "preflight-staleness tests: $pass passed, $fail failed"
[ "$pass" -ge 15 ] || { echo "VACUOUS: expected >=15 assertions, ran $pass" >&2; exit 2; }

# Clean up EXPLICITLY and disarm the trap before exiting. Relying on the EXIT trap let
# `launchctl bootout`'s status (3, "no such process", because the job was already gone)
# become the SUITE's exit code -- 15/15 assertions passing while CI saw a failure.
cleanup
trap - EXIT
if [ "$fail" -eq 0 ]; then exit 0; else exit 1; fi
