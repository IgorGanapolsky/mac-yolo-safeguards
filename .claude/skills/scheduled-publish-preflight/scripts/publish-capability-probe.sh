#!/usr/bin/env bash
# publish-capability-probe.sh — answer "can this session actually publish?" with evidence.
#
# Exists because four consecutive scheduled runs recorded blockers they never tested
# ("no dev.to API key configured" was written three times without anyone looking for one).
# Prints names and presence only — never a secret value.
#
# Usage: bash .claude/skills/scheduled-publish-preflight/scripts/publish-capability-probe.sh
# Exit:  0 always (this is a report, not a gate)

set -uo pipefail

hr() { printf '%s\n' "------------------------------------------------------------"; }
yes_no() { if [ "$1" = "yes" ]; then printf 'YES'; else printf 'no'; fi; }

echo "publish-capability-probe  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
hr

# ---------- 1. where are we ----------
echo "[1] EXECUTION ENVIRONMENT"
echo "    uname            : $(uname -s -m)"
echo "    hostname         : $(hostname 2>/dev/null || echo unknown)"
echo "    CLAUDE_CODE_REMOTE=${CLAUDE_CODE_REMOTE:-<unset>}  type=${CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE:-<unset>}"

ENV_KIND="unknown"
if [ "$(uname -s)" = "Darwin" ] && [ -z "${CLAUDE_CODE_REMOTE:-}" ]; then
  ENV_KIND="mac"
elif [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  ENV_KIND="cloud"
fi
echo "    => environment   : $ENV_KIND"
case "$ENV_KIND" in
  mac)   echo "       Browser MCP / BrowserOS and macOS Keychain may be usable." ;;
  cloud) echo "       Ephemeral container: NO logged-in browser, NO Keychain." ;
         echo "       Only env-var tokens and already-authorized MCP servers can publish." ;;
  *)     echo "       Could not classify — do not assume a browser exists." ;;
esac
hr

# ---------- 2. secret store ----------
echo "[2] SECRET STORE (names only, never values)"
if [ -f tools/secret-store.js ]; then
  OUT="$(node tools/secret-store.js list 2>&1 | head -20)"
  echo "$OUT" | sed 's/^/    /'
  case "$OUT" in
    *"requires macOS Keychain"*)
      echo "    => UNUSABLE here. Any credential stored in the Keychain is unreachable;"
      echo "       it must be supplied as an environment variable instead." ;;
  esac
else
  echo "    tools/secret-store.js not present"
fi
hr

# ---------- 3. tokens in env ----------
echo "[3] SOCIAL / PUBLISH TOKENS IN ENV (names only)"
# Anchored, token-ish names only. A loose grep here is actively harmful: an unanchored
# BUFFER matches PYTHONUNBUFFERED and would tell the next run a Buffer credential exists.
FOUND="$(env | cut -d= -f1 \
  | grep -Ei '^(DEVTO|DEV_TO|MEDIUM|BLUESKY|BSKY|ATPROTO|LINKEDIN|THREADS|SKOOL|TWITTER|X|BUFFER|ZAPIER|HASHNODE)_' \
  | sort || true)"
if [ -n "$FOUND" ]; then
  echo "$FOUND" | sed 's/^/    /'
else
  echo "    (none)"
  echo "    => No token-based publishing route. dev.to needs only an API key and"
  echo "       Bluesky only an app password — both are single-secret, no OAuth, and"
  echo "       are the cheapest routes to make unattended runs actually publish."
fi
echo "    GH_TOKEN present : $( [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ] && echo yes || echo no )"
hr

# ---------- 4. other credential locations ----------
echo "[4] OTHER CREDENTIAL LOCATIONS"
echo "    ~/.hermes        : $( [ -d "$HOME/.hermes" ] && echo present || echo absent )"
DOTENV="$(find . -maxdepth 3 -name '.env' -not -path '*/node_modules/*' 2>/dev/null | head -5)"
echo "    .env (real)      : ${DOTENV:-none (only .env.example files)}"
hr

# ---------- 5. browser reality ----------
echo "[5] BROWSER"
PROFILE="no"
[ -d "$HOME/.config/google-chrome" ] && PROFILE="yes"
[ -d "$HOME/.config/chromium" ] && PROFILE="yes"
[ -d "$HOME/Library/Application Support/Google/Chrome" ] && PROFILE="yes"
echo "    logged-in profile: $(yes_no "$PROFILE")"
echo "    playwright path  : ${PLAYWRIGHT_BROWSERS_PATH:-<unset>}"
if [ -n "${PLAYWRIGHT_BROWSERS_PATH:-}" ] && [ -d "${PLAYWRIGHT_BROWSERS_PATH}" ]; then
  echo "    binaries         : $(ls "$PLAYWRIGHT_BROWSERS_PATH" 2>/dev/null | tr '\n' ' ')"
fi
if [ "$PROFILE" = "no" ]; then
  echo "    => A browser binary without a profile CANNOT publish: every target is behind"
  echo "       SSO, and a fresh container hits a sign-in wall on an unrecognized device."
  echo "       Never type a password to get past it."
fi
hr

# ---------- 6. what to check by MCP (not scriptable) ----------
echo "[6] STILL TO CHECK VIA MCP TOOLS (this script cannot see them)"
cat <<'EOF'
    Zapier  : list_zapier_connections({selected_api}) per app.
              Use CONNECTIONS, not inspect_zapier_actions — an app can be
              "enabled" with zero authorized accounts, which looks available
              and is not. An empty array [] is the real answer.
              Widest-blast-radius unblock: Buffer (covers LinkedIn/X/Bluesky/Threads).
    Browser : ToolSearch for a browser/computer MCP. Absent in cloud containers.
    Registry: SearchMcpRegistry before declaring any connector unavailable.
EOF
hr
echo "VERDICT: record each channel's blocker WITH the evidence above and the remedy"
echo "(auth URL or missing env var name). An untested blocker is a guess, and the next"
echo "run will inherit it."
