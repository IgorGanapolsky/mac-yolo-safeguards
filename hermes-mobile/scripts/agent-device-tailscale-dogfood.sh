#!/usr/bin/env bash
# agent-device-tailscale-dogfood.sh — Prove Hermes Mobile Tailscale connect on a real phone.
#
# Uses Callstack agent-device (https://github.com/callstack/agent-device) as the
# agent hands/eyes loop: open app → snapshot refs → select Mac → evidence.
#
# Usage:
#   bash scripts/agent-device-tailscale-dogfood.sh
#   bash scripts/agent-device-tailscale-dogfood.sh --device "SM S931U1"
#   HERMES_AGENT_DEVICE_NAME="SM S931U1" bash scripts/agent-device-tailscale-dogfood.sh
#
# Note: --device is agent-device display name from `agent-device devices --platform android`,
# NOT the adb serial (R3CY90QPM7E).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$HERMES_DIR"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="${ANDROID_HOME}/platform-tools:${HOME}/.npm-global/bin:/opt/homebrew/bin:${PATH}"

PKG="${HERMES_ANDROID_PACKAGE:-com.iganapolsky.hermesmobile}"
APP_NAME="${HERMES_AGENT_DEVICE_APP:-Hermesmobile}"
DEVICE_NAME="${HERMES_AGENT_DEVICE_NAME:-}"
PROOF_DIR="${HERMES_AGENT_DEVICE_PROOF_DIR:-docs/proofs/agent-device-tailscale-$(date -u +%Y%m%dT%H%M%SZ)}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE_NAME="$2"; shift 2 ;;
    --app) APP_NAME="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! command -v agent-device >/dev/null 2>&1; then
  echo "agent-device required: npm i -g agent-device@latest (or use hermes-mobile node_modules/.bin)" >&2
  if [[ -x "$HERMES_DIR/node_modules/.bin/agent-device" ]]; then
    export PATH="$HERMES_DIR/node_modules/.bin:$PATH"
  else
    exit 1
  fi
fi

mkdir -p "$PROOF_DIR"
echo "Proof dir: $PROOF_DIR"

if [[ -z "$DEVICE_NAME" ]]; then
  # Prefer a physical (booted=true, not emulator) line from agent-device devices
  DEVICE_NAME="$(
    agent-device devices --platform android 2>/dev/null \
      | awk '/android device target=mobile/ && /booted=true/ {
          sub(/ \(android device.*/, "");
          print;
          exit
        }'
  )"
fi
if [[ -z "$DEVICE_NAME" ]]; then
  echo "No physical Android device in agent-device inventory. Run: agent-device devices --platform android" >&2
  exit 1
fi
echo "Device: $DEVICE_NAME"

agent-device doctor --platform android 2>&1 | tee "$PROOF_DIR/doctor.log" | tail -15

echo "=== open $APP_NAME ==="
agent-device open "$APP_NAME" --platform android --device "$DEVICE_NAME" --relaunch 2>&1 \
  | tee "$PROOF_DIR/open.log"
agent-device appstate 2>&1 | tee "$PROOF_DIR/appstate.txt"
agent-device snapshot -i 2>&1 | tee "$PROOF_DIR/snapshot-open.txt"
agent-device screenshot "$PROOF_DIR/screen-open.png" 2>&1 | tee "$PROOF_DIR/shot-open.log"

# Open computer picker by accessibility label (stable vs ref churn)
echo "=== open computer picker ==="
if agent-device press 'label="Choose your computer"' --settle 2>&1 | tee "$PROOF_DIR/press-picker.log"; then
  :
elif agent-device press 'label=Choose your computer' --settle 2>&1 | tee -a "$PROOF_DIR/press-picker.log"; then
  :
else
  echo "Could not open computer picker by label; see snapshot-open.txt" >&2
fi
agent-device snapshot -i 2>&1 | tee "$PROOF_DIR/snapshot-picker.txt"
agent-device screenshot "$PROOF_DIR/screen-picker.png" 2>&1 | tee "$PROOF_DIR/shot-picker.log"

# Prefer Mac mini Tailscale when present
echo "=== select Mac mini if listed ==="
if agent-device press 'label~="Igors-Mac-mini"' --settle 2>&1 | tee "$PROOF_DIR/press-mini.log"; then
  :
elif agent-device press 'label~="Mac-mini"' --settle 2>&1 | tee -a "$PROOF_DIR/press-mini.log"; then
  :
else
  echo "Mac mini row not found — leave picker for manual select" | tee -a "$PROOF_DIR/press-mini.log"
fi
agent-device snapshot -i 2>&1 | tee "$PROOF_DIR/snapshot-after-select.txt"
agent-device screenshot "$PROOF_DIR/screen-after-select.png" 2>&1 | tee "$PROOF_DIR/shot-after.log"

# Network ground truth (serial from adb for curl only)
SERIAL="$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
if [[ -n "$SERIAL" ]]; then
  {
    echo "serial=$SERIAL"
    adb -s "$SERIAL" shell "curl -sS -m 4 -w '\nHTTP:%{http_code}\n' http://100.94.135.78:8642/health" || true
    adb -s "$SERIAL" shell "curl -sS -m 4 -w '\nHTTP:%{http_code}\n' http://100.87.85.85:8642/health" || true
  } | tee "$PROOF_DIR/phone-health-probes.txt"
fi

agent-device close 2>&1 | tee "$PROOF_DIR/close.log" || true

# Verdict
{
  echo "# agent-device Tailscale dogfood"
  echo
  echo "- device: \`$DEVICE_NAME\`"
  echo "- app: \`$PKG\` / \`$APP_NAME\`"
  echo "- at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- tool: [agent-device](https://github.com/callstack/agent-device)"
  echo
  if rg -q 'Connected' "$PROOF_DIR/snapshot-after-select.txt" 2>/dev/null \
    || rg -q 'Connected' "$PROOF_DIR/snapshot-open.txt" 2>/dev/null; then
    echo "**UI:** Connected string present in snapshot."
  else
    echo "**UI:** Connected not seen — inspect screenshots."
  fi
  if rg -q 'HTTP:200' "$PROOF_DIR/phone-health-probes.txt" 2>/dev/null; then
    echo "**Network:** phone → Tailscale Hermes /health returned HTTP 200."
  else
    echo "**Network:** no phone health 200 (adb/curl missing or path down)."
  fi
} | tee "$PROOF_DIR/RESULT.md"

echo "Done: $PROOF_DIR/RESULT.md"
cat "$PROOF_DIR/RESULT.md"
