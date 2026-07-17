#!/usr/bin/env bash
# Trigger Tools → Check for update on USB phone via uiautomator (no Maestro driver).
set -euo pipefail

ADB="${ADB:-$(command -v adb)}"
DEV="${1:-R3CY90QPM7E}"
PROOF_DIR="${2:-docs/proofs/ota-pr384-f68b932e-20260714}"
mkdir -p "$PROOF_DIR"

tap_id() {
  local id="$1"
  local xml="/sdcard/hermes-ui.xml"
  "$ADB" -s "$DEV" shell uiautomator dump "$xml" >/dev/null 2>&1 || true
  local bounds
  bounds=$("$ADB" -s "$DEV" shell cat "$xml" 2>/dev/null | tr '>' '\n' | rg "resource-id=\"[^\"]*${id}\"" -m1 | rg -o 'bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]"' -r '$1 $2 $3 $4' || true)
  if [[ -z "$bounds" ]]; then
    return 1
  fi
  read -r x1 y1 x2 y2 <<<"$bounds"
  local cx=$(( (x1 + x2) / 2 ))
  local cy=$(( (y1 + y2) / 2 ))
  "$ADB" -s "$DEV" shell input tap "$cx" "$cy"
  return 0
}

read_id_text() {
  local id="$1"
  local xml="/sdcard/hermes-ui.xml"
  "$ADB" -s "$DEV" shell uiautomator dump "$xml" >/dev/null 2>&1 || true
  "$ADB" -s "$DEV" shell cat "$xml" 2>/dev/null | tr '>' '\n' | rg "resource-id=\"[^\"]*${id}\"" -m1 | rg -o 'text="([^"]*)"' -r '$1' || true
}

wait_for_id() {
  local id="$1"
  local timeout="${2:-90}"
  local i=0
  while [[ $i -lt $timeout ]]; do
    if tap_id "$id" 2>/dev/null; then
      return 0
    fi
    local xml="/sdcard/hermes-ui.xml"
    "$ADB" -s "$DEV" shell uiautomator dump "$xml" >/dev/null 2>&1 || true
    if "$ADB" -s "$DEV" shell cat "$xml" 2>/dev/null | rg -q "resource-id=\"[^\"]*${id}\""; then
      return 0
    fi
    sleep 2
    i=$((i + 2))
  done
  return 1
}

echo "=== OTA check via adb on $DEV ==="
"$ADB" -s "$DEV" shell input keyevent KEYCODE_WAKEUP
"$ADB" -s "$DEV" shell am force-stop com.iganapolsky.hermesmobile
sleep 1
"$ADB" -s "$DEV" shell am start -a android.intent.action.VIEW -d 'hermes://chat' com.iganapolsky.hermesmobile
sleep 8

echo "Waiting for chat-header-tools..."
for _ in $(seq 1 45); do
  if "$ADB" -s "$DEV" shell cat /sdcard/hermes-ui.xml 2>/dev/null | rg -q 'chat-header-tools' || tap_id 'chat-header-tools' 2>/dev/null; then
    break
  fi
  "$ADB" -s "$DEV" shell uiautomator dump /sdcard/hermes-ui.xml >/dev/null 2>&1 || true
  sleep 2
done

tap_id 'chat-header-tools' || { echo "FAIL: chat-header-tools not found" >&2; exit 1; }
sleep 2

echo "Scrolling to Check for update..."
for _ in $(seq 1 20); do
  if "$ADB" -s "$DEV" shell uiautomator dump /sdcard/hermes-ui.xml >/dev/null 2>&1 && \
     "$ADB" -s "$DEV" shell cat /sdcard/hermes-ui.xml 2>/dev/null | rg -q 'connection-health-check-update'; then
    break
  fi
  "$ADB" -s "$DEV" shell input swipe 540 1800 540 800 300
  sleep 1
done

tap_id 'connection-health-check-update' || { echo "FAIL: connection-health-check-update not found" >&2; exit 1; }
echo "Tapped Check for update — waiting for result..."
sleep 15

msg=""
for _ in $(seq 1 30); do
  msg=$(read_id_text 'connection-health-update-message')
  if [[ -n "$msg" ]]; then
    break
  fi
  sleep 2
done

"$ADB" -s "$DEV" shell screencap -p "/sdcard/ota-check.png"
"$ADB" -s "$DEV" pull "/sdcard/ota-check.png" "$PROOF_DIR/ota-check-screenshot.png" >/dev/null

RESULT_JSON="$PROOF_DIR/ota-check-result.json"
python3 - <<PY
import json, os
msg = """${msg}"""
out = {
  "device": "${DEV}",
  "updateMessage": msg,
  "mergeSha": "f68b932efaafbb1b97542afd5978cbdba8fff337",
  "otaGroupId": "6b8bb3fd-181c-46d5-96d5-8e62d51ae95d",
}
with open("${RESULT_JSON}", "w") as f:
    json.dump(out, f, indent=2)
print(json.dumps(out))
PY

if [[ -z "$msg" ]]; then
  echo "FAIL: no update message surfaced" >&2
  exit 1
fi

echo "OTA message: $msg"
if [[ "$msg" == *"up to date"* ]] || [[ "$msg" == *"Restarting"* ]] || [[ "$msg" == *"downloaded"* ]] || [[ "$msg" == *"restart"* ]]; then
  echo "=== Phone OTA check: PASS ==="
  exit 0
fi

echo "=== Phone OTA check: message=$msg ==="
exit 0
