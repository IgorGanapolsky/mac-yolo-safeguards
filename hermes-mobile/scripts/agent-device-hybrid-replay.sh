#!/usr/bin/env bash
# agent-device-hybrid-replay.sh — Callstack agent-device 0.20 hybrid workflow
# (Callstack July 2026 newsletter: replay known journeys in seconds, agent only
# when the flow needs intelligence).
#
# Modes:
#   proof   (default) — live connect/chat UI inspection with --settle (token-cheap)
#   record  — open app with --save-script, capture a short chat-tab journey, publish .ad
#   replay  — re-run a saved .ad script without another model call
#
# Usage:
#   bash hermes-mobile/scripts/agent-device-hybrid-replay.sh
#   bash hermes-mobile/scripts/agent-device-hybrid-replay.sh proof
#   bash hermes-mobile/scripts/agent-device-hybrid-replay.sh record
#   bash hermes-mobile/scripts/agent-device-hybrid-replay.sh replay [path.ad]
#   ANDROID_SERIAL=R3CY90QPM7E HERMES_ANDROID_PACKAGE=com.iganapolsky.hermesmobile.paid \
#     bash hermes-mobile/scripts/agent-device-hybrid-replay.sh proof
#
# Evidence under docs/proofs/agent-device/hybrid-latest/ (gitignored proofs tree).
# Maestro continuous latest.json remains the only e2e=pass ship gate.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
MODE="${1:-proof}"
PROOF_DIR="${AGENT_DEVICE_PROOF_DIR:-$ROOT/docs/proofs/agent-device/hybrid-latest}"
SCRIPT_DIR="${AGENT_DEVICE_SCRIPT_DIR:-$ROOT/.agent-device/replays}"
DEFAULT_SCRIPT="$SCRIPT_DIR/hermes-chat-tab.ad"
APP_ID="${HERMES_ANDROID_PACKAGE:-com.iganapolsky.hermesmobile.paid}"
SESSION="${AGENT_DEVICE_SESSION:-hermes-hybrid}"

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
  echo "ERROR: agent-device not found. Prefer hermes-mobile pin (^0.20.5) or: npm i -g agent-device@0.20.5" >&2
  exit 1
}

AD="$(resolve_agent_device)"
export PATH="$(dirname "$AD"):${PATH:-}"
VER="$("$AD" --version 2>/dev/null || echo unknown)"
echo "agent-device=$AD version=$VER"

SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$SERIAL" ]]; then
  SERIAL="$(adb devices 2>/dev/null | awk '/\tdevice$/{print $1; exit}')"
fi
if [[ -z "$SERIAL" ]]; then
  echo "ERROR: no Android device. Connect USB or set ANDROID_SERIAL." >&2
  exit 1
fi

mkdir -p "$PROOF_DIR" "$SCRIPT_DIR"
STAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
SUMMARY="$PROOF_DIR/summary.json"

"$AD" close --session "$SESSION" >/dev/null 2>&1 || true

run_proof() {
  echo "=== hybrid proof (settle-first, no model) ==="
  # Prefer paid package when installed (Igor dogfood).
  if adb -s "$SERIAL" shell pm path "$APP_ID" >/dev/null 2>&1; then
    :
  elif adb -s "$SERIAL" shell pm path com.iganapolsky.hermesmobile >/dev/null 2>&1; then
    APP_ID=com.iganapolsky.hermesmobile
  fi
  echo "app=$APP_ID serial=$SERIAL"

  "$AD" open "$APP_ID" --platform android --serial "$SERIAL" --session "$SESSION" --relaunch
  # --settle returns the next snapshot diff (Callstack 0.20 default loop).
  "$AD" press 'label="Hermes"' --session "$SESSION" --settle >"$PROOF_DIR/press-hermes-settle.txt" 2>&1 || true
  "$AD" snapshot --session "$SESSION" >"$PROOF_DIR/snapshot-chat.txt" 2>&1 || true
  "$AD" screenshot "$PROOF_DIR/hermes-chat.png" --session "$SESSION" >/dev/null 2>&1 || true
  "$AD" close --session "$SESSION" >/dev/null 2>&1 || true

  CHAT="$(cat "$PROOF_DIR/snapshot-chat.txt" 2>/dev/null || true)"
  has_connected=false
  has_reconnecting=false
  has_tools_banner=false
  has_mini=false
  has_pro=false
  echo "$CHAT" | rg -qi '\bConnected\b' && has_connected=true || true
  echo "$CHAT" | rg -qi 'Reconnecting' && has_reconnecting=true || true
  echo "$CHAT" | rg -qi 'Using on your computer' && has_tools_banner=true || true
  echo "$CHAT" | rg -qi 'Mac-mini|Mac mini' && has_mini=true || true
  echo "$CHAT" | rg -qi 'MacBook-Pro|MacBook Pro' && has_pro=true || true

  node <<NODE
const fs = require('fs');
const summary = {
  at: process.env.STAMP || '$STAMP',
  mode: 'proof',
  agentDevice: process.env.AD || '$AD',
  version: process.env.VER || '$VER',
  serial: process.env.SERIAL || '$SERIAL',
  appId: process.env.APP_ID || '$APP_ID',
  signals: {
    connected: $has_connected,
    reconnecting: $has_reconnecting,
    toolsBanner: $has_tools_banner,
    macMini: $has_mini,
    macBookPro: $has_pro,
  },
  artifacts: {
    snapshot: 'snapshot-chat.txt',
    settle: 'press-hermes-settle.txt',
    screenshot: 'hermes-chat.png',
  },
  note: 'Exploratory UI proof only — not e2e=pass. Maestro continuous remains the ship gate.',
};
fs.writeFileSync('$SUMMARY', JSON.stringify(summary, null, 2) + '\\n');
console.log(JSON.stringify(summary, null, 2));
NODE
}

run_record() {
  local out="${2:-$DEFAULT_SCRIPT}"
  echo "=== hybrid record → $out ==="
  mkdir -p "$(dirname "$out")"
  "$AD" open "$APP_ID" --platform android --serial "$SERIAL" --session "$SESSION" --relaunch --save-script "$out" --force
  "$AD" press 'label="Hermes"' --session "$SESSION" --settle >"$PROOF_DIR/record-press-hermes.txt" 2>&1 || true
  "$AD" snapshot --session "$SESSION" >"$PROOF_DIR/record-snapshot.txt" 2>&1 || true
  # Publish armed recording (0.20: session save-script or close with armed open).
  "$AD" session save-script "$out" --force 2>&1 | tee "$PROOF_DIR/record-save-script.txt" || true
  "$AD" close --session "$SESSION" >/dev/null 2>&1 || true
  if [[ -f "$out" ]]; then
    echo "saved_script=$out"
    cp -f "$out" "$PROOF_DIR/$(basename "$out")" 2>/dev/null || true
  else
    echo "WARN: script not written at $out (agent-device may need interactive steps)" >&2
  fi
  node -e "const fs=require('fs');fs.writeFileSync('$SUMMARY',JSON.stringify({at:'$STAMP',mode:'record',script:'$out',exists:fs.existsSync('$out')},null,2)+'\\n');"
}

run_replay() {
  local script="${2:-$DEFAULT_SCRIPT}"
  if [[ ! -f "$script" ]]; then
    echo "ERROR: no replay script at $script — run: $0 record first" >&2
    exit 1
  fi
  echo "=== hybrid replay $script (no model) ==="
  "$AD" replay "$script" --platform android --serial "$SERIAL" 2>&1 | tee "$PROOF_DIR/replay-log.txt"
  node -e "const fs=require('fs');fs.writeFileSync('$SUMMARY',JSON.stringify({at:'$STAMP',mode:'replay',script:'$script',ok:true},null,2)+'\\n');"
  echo "replay_log=$PROOF_DIR/replay-log.txt"
}

case "$MODE" in
  proof) run_proof ;;
  record) run_record "$@" ;;
  replay) run_replay "$@" ;;
  *)
    echo "Usage: $0 [proof|record|replay] [script.ad]" >&2
    exit 2
    ;;
esac

echo "summary=$SUMMARY"
