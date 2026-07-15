#!/usr/bin/env bash
# agent-device-connection-proof.sh — Prove Hermes Mobile Chat transport + Tailscale
# via Callstack agent-device on a connected Android phone (default: first adb device).
#
# Prefer this for connection-crisis / Tailscale / fresh-user UI inspection.
# Prefer Maestro (`npm run e2e:*`) for deterministic CI flows.
# Prefer raw adb for pair/install/reverse only.
#
# Usage:
#   bash hermes-mobile/scripts/agent-device-connection-proof.sh
#   ANDROID_SERIAL=R3CY90QPM7E bash hermes-mobile/scripts/agent-device-connection-proof.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
PROOF_DIR="${AGENT_DEVICE_PROOF_DIR:-$ROOT/docs/proofs/agent-device/connection-latest}"
APP_ID="${HERMES_ANDROID_PACKAGE:-com.iganapolsky.hermesmobile}"
TS_ID="${TAILSCALE_ANDROID_PACKAGE:-com.tailscale.ipn}"
SESSION="${AGENT_DEVICE_SESSION:-hermes-conn-proof}"
TS_SESSION="${AGENT_DEVICE_TS_SESSION:-ts-proof}"

resolve_agent_device() {
  if command -v agent-device >/dev/null 2>&1; then
    command -v agent-device
    return
  fi
  for candidate in \
    "$HOME/.npm-global/bin/agent-device" \
    "$ROOT/node_modules/.bin/agent-device" \
    "$REPO/hermes-mobile/node_modules/.bin/agent-device"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done
  echo "ERROR: agent-device not found. Run: bash scripts/install-agent-device.sh" >&2
  exit 1
}

AD="$(resolve_agent_device)"
export PATH="$(dirname "$AD"):${PATH:-}"

SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$SERIAL" ]]; then
  SERIAL="$(adb devices | awk '/\tdevice$/{print $1; exit}')"
fi
if [[ -z "$SERIAL" ]]; then
  echo "ERROR: no Android device in adb. Connect phone USB or set ANDROID_SERIAL." >&2
  exit 1
fi

mkdir -p "$PROOF_DIR"
STAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SUMMARY="$PROOF_DIR/summary.json"

echo "=== agent-device connection proof ==="
echo "binary=$AD"
echo "serial=$SERIAL"
echo "proofDir=$PROOF_DIR"

"$AD" close --session "$SESSION" >/dev/null 2>&1 || true
"$AD" close --session "$TS_SESSION" >/dev/null 2>&1 || true

# Tailscale app (VPN / account surface)
"$AD" open "$TS_ID" --platform android --serial "$SERIAL" --session "$TS_SESSION" --relaunch
"$AD" snapshot --session "$TS_SESSION" >"$PROOF_DIR/snapshot-tailscale.txt"
"$AD" screenshot "$PROOF_DIR/tailscale.png" --session "$TS_SESSION" >/dev/null
"$AD" close --session "$TS_SESSION" >/dev/null 2>&1 || true

# Hermes Chat tab
"$AD" open "$APP_ID" --platform android --serial "$SERIAL" --session "$SESSION" --relaunch
"$AD" press 'label="Hermes"' --session "$SESSION" --settle >"$PROOF_DIR/press-hermes.txt" || true
"$AD" snapshot --session "$SESSION" >"$PROOF_DIR/snapshot-chat.txt"
"$AD" screenshot "$PROOF_DIR/hermes-chat.png" --session "$SESSION" >/dev/null
"$AD" close --session "$SESSION" >/dev/null 2>&1 || true

# Derive coarse signals from snapshots (honest; no greenwashing).
CHAT="$(cat "$PROOF_DIR/snapshot-chat.txt")"
TS_SNAP="$(cat "$PROOF_DIR/snapshot-tailscale.txt")"

has_tailscale_label=false
has_connected=false
has_reconnecting=false
has_vpn_on=false
has_connect_gate=false

echo "$CHAT" | rg -qi 'Tailscale' && has_tailscale_label=true || true
echo "$CHAT" | rg -qi '\bConnected\b' && has_connected=true || true
echo "$CHAT" | rg -qi 'Reconnecting' && has_reconnecting=true || true
echo "$CHAT" | rg -qi 'VPN on' && has_vpn_on=true || true
echo "$CHAT" | rg -qi 'Find computers|Connect your Mac|Looking for your Mac' && has_connect_gate=true || true

export STAMP SERIAL APP_ID AD SUMMARY
export HAS_TS="$has_tailscale_label"
export HAS_CONNECTED="$has_connected"
export HAS_RECONNECTING="$has_reconnecting"
export HAS_VPN="$has_vpn_on"
export HAS_GATE="$has_connect_gate"

node <<'NODE'
const fs = require("fs");
const out = {
  updatedAt: process.env.STAMP,
  tool: "agent-device",
  serial: process.env.SERIAL,
  appId: process.env.APP_ID,
  binary: process.env.AD,
  signals: {
    chatShowsTailscaleLabel: process.env.HAS_TS === "true",
    chatShowsConnected: process.env.HAS_CONNECTED === "true",
    chatShowsReconnecting: process.env.HAS_RECONNECTING === "true",
    statusBarVpnOn: process.env.HAS_VPN === "true",
    chatShowsFreshConnectCopy: process.env.HAS_GATE === "true",
  },
  artifacts: {
    snapshotChat: "snapshot-chat.txt",
    snapshotTailscale: "snapshot-tailscale.txt",
    screenshotChat: "hermes-chat.png",
    screenshotTailscale: "tailscale.png",
  },
  note: "e2e pass still requires Maestro continuous latest.json; this proof is exploratory UI evidence only.",
};
fs.writeFileSync(process.env.SUMMARY, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
NODE

echo "Wrote $SUMMARY"
echo "Done. Read snapshot-chat.txt before claiming Connected."
