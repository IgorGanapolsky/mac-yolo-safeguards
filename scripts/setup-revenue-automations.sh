#!/usr/bin/env bash
# Idempotent install: revenue loop + smart-ops (+ market signals) LaunchAgents.
# Points agents at main-runtime worktree (or this repo) and shared business_os/revenue.
set -euo pipefail

HOME_DIR="${HOME}"
MAIN="${REVENUE_MAIN_REPO:-$HOME_DIR/workspace/git/igor/mac-yolo-safeguards}"
RUNTIME="${REVENUE_RUNTIME:-$MAIN/.worktrees/main-runtime}"
NODE="$(command -v node)"
UID_N="$(id -u)"
LAUNCH="$HOME_DIR/Library/LaunchAgents"
LOGS="$HOME_DIR/Library/Logs/mac-yolo"

if [[ -z "$NODE" ]]; then
  echo "node not found" >&2
  exit 1
fi

mkdir -p "$LAUNCH" "$LOGS" "$MAIN/business_os/revenue"

# Ensure main-runtime exists and tracks origin/main
if [[ ! -d "$RUNTIME/.git" ]] && [[ ! -f "$RUNTIME/.git" ]]; then
  git -C "$MAIN" fetch origin main -q
  git -C "$MAIN" worktree add -B main-runtime "$RUNTIME" origin/main 2>/dev/null \
    || git -C "$MAIN" worktree add -f -B main-runtime "$RUNTIME" origin/main
fi
git -C "$RUNTIME" fetch origin main -q
git -C "$RUNTIME" reset --hard origin/main -q
ln -sfn "$MAIN/business_os" "$RUNTIME/business_os"

if [[ ! -f "$RUNTIME/tools/smart-ops-controller.js" ]]; then
  echo "smart-ops-controller.js missing at $RUNTIME" >&2
  exit 1
fi
if [[ ! -f "$RUNTIME/tools/hermes-hosting-market-signal.js" ]]; then
  echo "hermes-hosting-market-signal.js missing at $RUNTIME" >&2
  exit 1
fi

install_plist() {
  local name="$1"
  local template="$RUNTIME/$name"
  local dest="$LAUNCH/$name"
  if [[ ! -f "$template" ]]; then
    echo "SKIP missing template $template" >&2
    return 0
  fi
  sed "s#{{REPO}}#${RUNTIME}#g; s#{{HOME}}#${HOME_DIR}#g; s#{{NODE}}#${NODE}#g" \
    "$template" >"$dest"
  local label="${name%.plist}"
  launchctl bootout "gui/${UID_N}/${label}" 2>/dev/null || true
  launchctl bootstrap "gui/${UID_N}" "$dest"
  launchctl enable "gui/${UID_N}/${label}" 2>/dev/null || true
  echo "OK $label -> $RUNTIME"
}

install_plist com.igor.smart-ops.plist
install_plist com.igor.revenue-autonomous-loop.plist
install_plist com.igor.ralph-gsd-loop.plist

# Partner pilot nudge → revenue/smart-ops (zero manual)
cat >"$HOME_DIR/.local/bin/partner-pilot-followup-nudge.sh" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export REVENUE_AUTO_SEND=1 REVENUE_AUTO_GH=1 REVENUE_NTFY_QUIET_NOOP=1
export SMART_OPS_MARKET_SIGNAL=1
export REVENUE_DIR="${REVENUE_DIR:-$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue}"
for REPO in \
  "$HOME/workspace/git/igor/mac-yolo-safeguards/.worktrees/main-runtime" \
  "$HOME/workspace/git/igor/mac-yolo-safeguards"
do
  if [[ -f "$REPO/tools/smart-ops-controller.js" ]]; then
    cd "$REPO" && exec node tools/smart-ops-controller.js --json --force
  fi
done
exit 1
EOF
chmod +x "$HOME_DIR/.local/bin/partner-pilot-followup-nudge.sh"

# Outreach daily → smart-ops (not Instagram homework)
cat >"$HOME_DIR/.local/bin/outreach-send-nudge.sh" <<'EOF'
#!/usr/bin/env bash
set -uo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export REVENUE_AUTO_SEND=1 REVENUE_AUTO_GH=1 REVENUE_NTFY_QUIET_NOOP=1 SMART_OPS_MARKET_SIGNAL=1
export REVENUE_DIR="${REVENUE_DIR:-$HOME/workspace/git/igor/mac-yolo-safeguards/business_os/revenue}"
for REPO in \
  "$HOME/workspace/git/igor/mac-yolo-safeguards/.worktrees/main-runtime" \
  "$HOME/workspace/git/igor/mac-yolo-safeguards"
do
  if [[ -f "$REPO/tools/smart-ops-controller.js" ]]; then
    cd "$REPO" && exec node tools/smart-ops-controller.js --json
  fi
done
exit 1
EOF
chmod +x "$HOME_DIR/.local/bin/outreach-send-nudge.sh"

# One-shot verify: run smart-ops with market signals
export PATH="$HOME_DIR/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export REVENUE_DIR="$MAIN/business_os/revenue"
export SMART_OPS_MARKET_SIGNAL=1
export REVENUE_AUTO_SEND=1
export REVENUE_AUTO_GH=1
export REVENUE_NTFY_QUIET_NOOP=1
cd "$RUNTIME"
echo "=== smart-ops --force (setup proof) ==="
node tools/smart-ops-controller.js --json --force | tee "$LOGS/setup-revenue-automations-proof.json" | head -c 2500
echo ""
echo "=== launchctl ==="
for label in com.igor.smart-ops com.igor.revenue-autonomous-loop com.igor.ralph-gsd-loop; do
  if launchctl print "gui/${UID_N}/${label}" >/dev/null 2>&1; then
    echo -n "$label: "
    launchctl print "gui/${UID_N}/${label}" 2>/dev/null | rg 'state =|run interval|last exit|working directory' | tr '\n' ' '
    echo
  else
    echo "$label: NOT LOADED"
  fi
done
echo "SETUP_OK runtime=$RUNTIME head=$(git -C "$RUNTIME" rev-parse --short HEAD)"
