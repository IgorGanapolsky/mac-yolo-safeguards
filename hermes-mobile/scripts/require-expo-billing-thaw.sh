#!/usr/bin/env bash
# OTA publish eligibility — LIVE checks only.
#
# History (2026-07-23): agents spam-burned EAS Update and a Visa charge failed once.
# That incident must NEVER become a permanent "you didn't pay Expo" agent story.
#
# Rules:
#   1. Prefer live `eas whoami` — if Expo answers, do not invent a freeze.
#   2. Explicit HERMES_OTA_BILLING_THAW=1 always allows (CI repo var after recovery).
#   3. HERMES_OTA_FORCE_BLOCK=1 is the only hard emergency stop.
#   4. Spam control is separate: batch tip-of-day OTAs; never one update per PR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${HERMES_OTA_FORCE_BLOCK:-}" == "1" ]]; then
  echo "FATAL: HERMES_OTA_FORCE_BLOCK=1 — OTA deliberately blocked." >&2
  exit 1
fi

if [[ "${HERMES_OTA_BILLING_THAW:-}" == "1" || "${EXPO_PUBLIC_OTA_BILLING_THAW:-}" == "1" ]]; then
  echo "Expo OTA allowed (HERMES_OTA_BILLING_THAW / EXPO_PUBLIC_OTA_BILLING_THAW=1)."
  echo "Reminder: batch one coherent tip-of-day production OTA — do not spam eas update per PR."
  exit 0
fi

# Live account probe — paid subscription is verified by successful auth to Expo, not by
# replaying a July 2026 failed-payment email.
EAS_BIN=(npx --yes eas-cli)
if ! command -v npx >/dev/null 2>&1; then
  echo "FATAL: npx missing; cannot verify Expo login for OTA." >&2
  exit 1
fi

set +e
WHO_OUT="$("${EAS_BIN[@]}" whoami --non-interactive 2>&1)"
WHO_RC=$?
set -e

if [[ $WHO_RC -eq 0 && -n "${WHO_OUT//[[:space:]]/}" ]]; then
  # Reject obvious not-logged-in messages if whoami ever returns 0 with a warning.
  if echo "$WHO_OUT" | grep -Eiq 'not logged in|log in|login required|unauthorized|401'; then
    echo "FATAL: Expo CLI is not authenticated for OTA publish." >&2
    echo "$WHO_OUT" >&2
    echo "Fix: eas login (or EXPO_TOKEN), then retry. Do NOT invent 'billing freeze'." >&2
    exit 1
  fi
  # Drop eas-cli upgrade noise; prefer the last non-empty username-ish line.
  WHO_LINE="$(
    echo "$WHO_OUT" | tr -d '\r' | grep -Ev '^\s*$|eas-cli@|To upgrade|Proceeding with|★' | tail -1
  )"
  echo "Expo account live: ${WHO_LINE:-authenticated}"
  echo "OTA allowed — subscription/account answers Expo API (no stale Visa freeze)."
  echo "Reminder: one batched production OTA per tip-of-day; multi-runtime if stores differ."
  exit 0
fi

echo "FATAL: cannot verify Expo account (eas whoami failed)." >&2
echo "$WHO_OUT" >&2
echo "" >&2
echo "This is a login/network failure — not automatic proof of unpaid billing." >&2
echo "After Expo works: set HERMES_OTA_BILLING_THAW=1 for CI, or re-auth locally." >&2
exit 1
