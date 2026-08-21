#!/usr/bin/env bash
# install-harness.sh - one-command bootstrap of the DEFAULT Hermes agent harness
# for thumbgate.app: ALL canonical skills, ALL tools, the ThumbGate connector
# (computer-use relay), and headless browser-use - enabled by default.
#
#   curl -fsSL https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-harness.sh | bash
#   (thumbgate.app/install-harness.sh is the branded alias; the raw GitHub URL is the
#   bootstrap source, mirroring how the control plane fetches install-connector.sh in
#   DashboardClient.tsx. Override: HERMES_HARNESS_REPO=<repo> HERMES_CONTROL_PLANE_URL=<url> bash install-harness.sh)
#
# Safety rules (see docs/AGENTS.md "No desktop hijack"):
#   * Interactive browser (real Chrome on your daily profile / osascript /
#     com.hermes.chrome-cdp auto-install / headed Playwright) is HARD-banned
#     unless HERMES_ALLOW_INTERACTIVE_CHROME=1 is set on THIS invocation.
#     Default = headless Playwright only.
#   * The protected LaunchAgents com.igor.shutdown-simulators and
#     com.igor.hermes-mobile-continuous-e2e are NEVER managed here - they must
#     keep running. Only the connector service (com.hermes.connector) is owned
#     (installed by the reused install-connector.sh).
#   * No secrets are written. Only a ~/.hermes/.env skeleton is created; you fill keys.
set -euo pipefail

CONTROL_PLANE="${HERMES_CONTROL_PLANE_URL:-https://thumbgate.app}"
REPO="${HERMES_HARNESS_REPO:-https://github.com/IgorGanapolsky/mac-yolo-safeguards.git}"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
SKILLS_DIR="${HERMES_SKILLS_DIR:-$HOME/.claude/skills}"
TOOLS_DIR="${HERMES_TOOLS_DIR:-$HERMES_HOME/tools}"
CACHE="$HERMES_HOME/.harness-source"
DRY_RUN="${HERMES_HARNESS_DRY_RUN:-0}"
INTERACTIVE="${HERMES_ALLOW_INTERACTIVE_CHROME:-0}"
NODE="$(command -v node)"

say(){ printf '\033[1;35m* %s\033[0m\n' "$1"; }
maybe(){
  if [ "$DRY_RUN" = "1" ]; then
    printf '  [dry-run] %s\n' "$*"
  else
    "$@"
  fi
}

say "ThumbGate.app Hermes harness bootstrap"
say "control plane: $CONTROL_PLANE | dry-run: $DRY_RUN | interactive chrome: $INTERACTIVE"
if [ "$INTERACTIVE" = "1" ]; then
  say "Interactive Chrome opt-in detected - review docs/NO-DESKTOP-HIJACK.md first."
  say "(Headless browser-use remains the base; interactive is wired to a dedicated non-daily profile.)"
else
  say "Headless browser-use only (No-desktop-hijack). Set HERMES_ALLOW_INTERACTIVE_CHROME=1 to opt into interactive browser."
fi

command -v git >/dev/null 2>&1 || { echo "::error::git is required." >&2; exit 1; }
[ -n "$NODE" ] || { echo "::error::Node.js is required (https://nodejs.org)." >&2; exit 1; }

# 1. Layout + default config (no secrets - skeleton only)
say "Installing default harness layout + ~/.hermes config skeleton"
mkdir -p "$HERMES_HOME" "$SKILLS_DIR" "$TOOLS_DIR"
if [ ! -f "$HERMES_HOME/.env" ]; then
  printf '%s\n' \
    "# Hermes harness config - fill your own keys. Never committed." \
    "HERMES_CONTROL_PLANE_URL=$CONTROL_PLANE" \
    "LOG_LEVEL=info" \
    "# HERMES_ALLOW_INTERACTIVE_CHROME=1  # opt-in only (see docs/NO-DESKTOP-HIJACK.md)" \
    > "$HERMES_HOME/.env"
fi

# 2. Default skill catalog - all canonical skills auto-load by default
say "Syncing ALL canonical skills -> $SKILLS_DIR"
if [ "$DRY_RUN" = "1" ]; then
  printf '  [dry-run] git clone --depth 1 --filter=blob:none --no-checkout %s %s\n' "$REPO" "$CACHE"
  printf '  [dry-run] rsync -a %s/.agents/skills/ %s/ (preserves existing user skills; non-destructive)\n' "$CACHE" "$SKILLS_DIR"
else
  rm -rf "$CACHE"
  git clone --quiet --depth 1 --filter=blob:none --no-checkout "$REPO" "$CACHE"
  git -C "$CACHE" sparse-checkout set -q .agents/skills tools
  git -C "$CACHE" checkout -q
  [ -d "$CACHE/tools" ] || { echo "::error::sparse-checkout did not include tools/" >&2; exit 1; }
  rsync -a "$CACHE/.agents/skills/" "$SKILLS_DIR/"
fi

# 3. Tools - link the harness toolset (all tools enabled by default)
say "Linking ALL harness tools -> $TOOLS_DIR"
if [ "$DRY_RUN" = "1" ]; then
  printf '  [dry-run] rsync -a --delete %s/tools/ %s/\n' "$CACHE" "$TOOLS_DIR"
elif [ -d "$CACHE/tools" ]; then
  rsync -a --delete "$CACHE/tools/" "$TOOLS_DIR/"
fi

# 4. Connector (computer-use / remote Mac relay) - fetched from the raw repo
#    (the same source the control plane uses in DashboardClient.tsx), since the
#    control plane serves the dashboard, not saas/*.sh.
say "Installing ThumbGate connector (computer-use relay)"
CONNECTOR_INSTALLER="https://raw.githubusercontent.com/IgorGanapolsky/mac-yolo-safeguards/main/saas/install-connector.sh"
if [ "$DRY_RUN" = "1" ]; then
  printf '  [dry-run] curl -fsSL %s | HERMES_CONTROL_PLANE_URL=%s bash\n' "$CONNECTOR_INSTALLER" "$CONTROL_PLANE"
else
  curl -fsSL "$CONNECTOR_INSTALLER" | HERMES_CONTROL_PLANE_URL="$CONTROL_PLANE" bash
fi

# 5. Browser-use - HEADLESS only by default (No desktop hijack)
say "Installing headless browser-use (Playwright chromium, non-interactive)"
if [ "$INTERACTIVE" = "1" ]; then
  say "Interactive opt-in: headless chromium is the base; wire a dedicated non-daily profile for live browser (docs/NO-DESKTOP-HIJACK.md)."
fi
if [ "$DRY_RUN" = "1" ]; then
  printf '  [dry-run] npx --yes playwright install chromium\n'
else
  ( cd "$HERMES_HOME" && npx --yes playwright install chromium ) >/tmp/hermes-browser.log 2>&1 \
    || { echo "::error::Playwright browser install failed (see /tmp/hermes-browser.log)" >&2; exit 1; }
fi

# 6. Cleanup the transient clone
if [ "$DRY_RUN" != "1" ] && [ -d "$CACHE" ]; then
  rm -rf "$CACHE"
fi

say "OK: default Hermes harness installed - all skills + all tools + connector (computer-use) + headless browser-use."
say "Manage at $CONTROL_PLANE/dashboard | skills loaded from $SKILLS_DIR"
say "Interactive Chrome stays gated (HERMES_ALLOW_INTERACTIVE_CHROME=1 + docs/NO-DESKTOP-HIJACK.md)."
