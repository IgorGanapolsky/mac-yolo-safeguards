#!/usr/bin/env bash
# Contract: continuous E2E must boot a Maestro AVD when the USB phone is awake
# and no emulator is online — otherwise latest.json stays e2e=skipped forever.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/hermes-mobile/scripts/run-continuous-e2e.sh"
pass=0
fail=0
ok() { echo "  [PASS] $1"; pass=$((pass + 1)); }
bad() { echo "  [FAIL] $1"; fail=$((fail + 1)); }

[[ -f "$SCRIPT" ]] || {
  echo "missing $SCRIPT" >&2
  exit 1
}

# Pure string/contract checks (do not boot an emulator in CI unit path).
grep -q 'boot_continuous_e2e_avd' "$SCRIPT" \
  && ok "defines boot_continuous_e2e_avd" \
  || bad "missing boot_continuous_e2e_avd"

grep -q 'enable_emulator_fallback' "$SCRIPT" \
  && ok "defines enable_emulator_fallback" \
  || bad "missing enable_emulator_fallback"

# Fallback must attempt boot when no emulator id is online.
if grep -A30 '^enable_emulator_fallback()' "$SCRIPT" | grep -q 'boot_continuous_e2e_avd'; then
  ok "enable_emulator_fallback calls boot_continuous_e2e_avd"
else
  bad "enable_emulator_fallback does not call boot_continuous_e2e_avd"
fi

grep -q 'MAESTRO_AVD_NAME' "$SCRIPT" \
  && ok "pins MAESTRO_AVD_NAME / HERMES_E2E_AVD_NAME" \
  || bad "missing MAESTRO_AVD_NAME"

# run-e2e must honor HERMES_E2E_ANDROID_UDID over USB phone in the selection chain.
RUN_E2E="$ROOT/hermes-mobile/scripts/run-e2e.sh"
# Selection starts at ANDROID_ID="" assignment used for device pick (not helper defs).
sel_start="$(grep -n '^ANDROID_ID=""$' "$RUN_E2E" | head -1 | cut -d: -f1)"
if [[ -z "$sel_start" ]]; then
  bad "run-e2e missing ANDROID_ID selection block"
else
  udid_line="$(awk -v s="$sel_start" 'NR>=s && /HERMES_E2E_ANDROID_UDID/ {print NR; exit}' "$RUN_E2E")"
  usb_line="$(awk -v s="$sel_start" 'NR>=s && /first_usb_android_id/ {print NR; exit}' "$RUN_E2E")"
  if [[ -n "$udid_line" && -n "$usb_line" && "$udid_line" -lt "$usb_line" ]]; then
    ok "run-e2e prefers HERMES_E2E_ANDROID_UDID before USB phone"
  else
    bad "run-e2e still picks USB before HERMES_E2E_ANDROID_UDID (udid=$udid_line usb=$usb_line start=$sel_start)"
  fi
fi

# Progress noise must not pollute command substitution of boot_continuous_e2e_avd.
if grep -A20 '^boot_continuous_e2e_avd()' "$SCRIPT" | grep -E 'echo "Booting' | grep -q '>&2'; then
  ok "boot progress goes to stderr (safe for emu_id=\$(boot...))"
else
  # Also accept if there is no Booting echo at all, or all echo in function use >&2
  if ! grep -A20 '^boot_continuous_e2e_avd()' "$SCRIPT" | grep -q 'echo "Booting'; then
    ok "boot progress goes to stderr (safe for emu_id=\$(boot...))"
  else
    bad "boot_continuous_e2e_avd still prints progress on stdout"
  fi
fi

# wait_for_android_device accepts explicit UDID as \$2
if grep -A15 '^wait_for_android_device()' "$RUN_E2E" | grep -q 'want_id'; then
  ok "wait_for_android_device can pin an explicit UDID"
else
  bad "wait_for_android_device missing explicit UDID support"
fi

echo "continuous-e2e-emulator-fallback: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]