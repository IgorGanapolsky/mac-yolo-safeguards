#!/usr/bin/env bash
# Expo billing freeze (2026-07-23): Visa 2394 failed $78 subscription charge.
# Refuse eas update / OTA publish until billing is recovered AND an explicit thaw.
#
# Thaw (after Igor recovers Expo billing): export HERMES_OTA_BILLING_THAW=1
# GitHub Actions: set repo variable HERMES_OTA_BILLING_THAW=1.
# HARD: spend budget (tools/ota-publish-budget.js / ota-spend-guard.sh) remains
# mandatory after thaw — never burn Expo overages again (≤3 runs/48h, ≤1 prod/day).
set -euo pipefail

if [[ "${HERMES_OTA_BILLING_THAW:-}" == "1" ]]; then
  echo "Expo billing thaw acknowledged (HERMES_OTA_BILLING_THAW=1)."
  echo "Reminder: OTA spend budget still applies (ota-spend-guard.sh) — never burn Expo overages."
  exit 0
fi

printf '%s\n' \
  'FATAL: Expo billing freeze active (2026-07-23).' \
  '' \
  'Evidence: failed-payments@expo.dev — $78.00 Visa 2394 unsuccessful.' \
  'Agents burned EAS Update via mobile-ota.yml spam (preview-on-every-main-push' \
  '+ many workflow_dispatch production publishes). Merge PRs OK; OTA deferred.' \
  '' \
  'Do NOT publish production/preview OTA until Expo billing works again.' \
  'Then set HERMES_OTA_BILLING_THAW=1 (local) / repo Actions variable (CI),' \
  'with tools/ota-publish-budget.js wired — batch ONE tip-of-day OTA,' \
  'never one OTA per small PR, never burn Expo overages again.' \
  >&2
exit 1
