#!/usr/bin/env bash
# content-engine-preflight.sh
#
# Run this FIRST in every ThumbGate content-engine run, before drafting anything.
#
# Why this exists (incident 2026-08-11): a scheduled AM run fired inside a remote
# Linux container instead of on the Mac. The engine skill assumes a signed-in
# Chrome via claude-in-chrome; none of that existed. The agent discovered this
# one channel at a time, mid-run, and shipped 1 of 9 channels while reporting
# "Blocked" eight times. The failure was not the missing browser -- it was that
# the run started at all without knowing what it could reach.
#
# This script answers ONE question before any content is written:
#   which channels can this run actually publish to, right now, from this host?
#
# Exit codes:
#   0  = at least one channel reachable; publish set printed to stdout
#   10 = ZERO channels reachable -> the run must abort, not degrade into drafts
#
# It never types a password, never opens checkout, never spends money.

set -uo pipefail

REACHABLE=()
UNREACHABLE=()

note() { printf '  %s\n' "$1" >&2; }

printf '\n=== ThumbGate content-engine preflight ===\n' >&2

# ---------------------------------------------------------------------------
# 1. Where are we? Mac-with-browser path, or headless-cloud path?
# ---------------------------------------------------------------------------
HOST_KIND="unknown"
if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "$HOME/Library/Application Support/Google/Chrome" ]]; then
  HOST_KIND="mac-with-chrome"
else
  HOST_KIND="headless-cloud"
fi
note "host: $HOST_KIND ($(uname -s))"

# ---------------------------------------------------------------------------
# 2. Is there a browser carrying REAL logged-in sessions?
#
#    A browser binary is NOT a capability. A browser binary with no cookie jar
#    lands on a login wall, and typing credentials is a hard ban. So the test is
#    for authenticated state, not for an executable.
# ---------------------------------------------------------------------------
BROWSER_AUTH="no"
if [[ "$HOST_KIND" == "mac-with-chrome" ]]; then
  for p in "$HOME/Library/Application Support/Google/Chrome/Default/Cookies" \
           "$HOME/Library/Application Support/BrowserOS/Default/Cookies" \
           "$HOME/Library/Application Support/Comet/Default/Cookies"; do
    if [[ -s "$p" ]]; then BROWSER_AUTH="yes"; note "browser auth state found: $p"; break; fi
  done
fi
[[ "$BROWSER_AUTH" == "no" ]] && note "no logged-in browser profile on this host"

# Channels that ONLY work via a signed-in browser session.
BROWSER_ONLY=(X Medium dev.to Skool Threads Bluesky)
if [[ "$BROWSER_AUTH" == "yes" ]]; then
  REACHABLE+=("${BROWSER_ONLY[@]}")
else
  for c in "${BROWSER_ONLY[@]}"; do
    UNREACHABLE+=("$c:no-logged-in-browser-on-this-host")
  done
fi

# ---------------------------------------------------------------------------
# 3. API-path channels (work headlessly IF a connection exists).
#
#    Buffer is the only social publisher reachable without a browser. Its
#    connected channels are the real capability list -- an enabled app with
#    ZERO connected accounts is not a channel, it is a login wall with extra
#    steps. The agent must inspect Buffer channels via the Zapier MCP and pass
#    them in as BUFFER_CHANNELS (comma-separated) before trusting this section.
# ---------------------------------------------------------------------------
if [[ -n "${BUFFER_CHANNELS:-}" ]]; then
  IFS=',' read -ra BC <<< "$BUFFER_CHANNELS"
  for c in "${BC[@]}"; do REACHABLE+=("$(echo "$c" | xargs)"); done
  note "buffer channels supplied: $BUFFER_CHANNELS"
else
  UNREACHABLE+=("Buffer:BUFFER_CHANNELS-not-supplied-inspect-zapier-first")
  note "BUFFER_CHANNELS not set -- inspect Zapier/Buffer channels and re-run with it"
fi

# ---------------------------------------------------------------------------
# 4. Standing bans. Never reachable, by operator rule, regardless of host.
# ---------------------------------------------------------------------------
for c in Hashnode:frozen-permanent-ban Reddit:no-promo-posting HackerNews:frozen-until-cleared; do
  UNREACHABLE+=("$c")
done

# ---------------------------------------------------------------------------
# 5. Verdict
# ---------------------------------------------------------------------------
printf '\n--- REACHABLE (%d) ---\n' "${#REACHABLE[@]}" >&2
for c in "${REACHABLE[@]}"; do printf '  + %s\n' "$c" >&2; done
printf -- '--- UNREACHABLE (%d) ---\n' "${#UNREACHABLE[@]}" >&2
for c in "${UNREACHABLE[@]}"; do printf '  - %s\n' "$c" >&2; done

if [[ ${#REACHABLE[@]} -eq 0 ]]; then
  printf '\nPREFLIGHT FAIL: zero reachable channels. Do NOT draft content.\n' >&2
  printf 'Report the capability gap to the operator instead of producing drafts.\n' >&2
  exit 10
fi

printf '\nPREFLIGHT OK: publish set = %s\n\n' "${REACHABLE[*]}" >&2
printf '%s\n' "${REACHABLE[*]}"
exit 0
