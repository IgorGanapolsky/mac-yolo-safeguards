#!/usr/bin/env bash
# Expo billing freeze (2026-07-23): Visa 2394 failed $78 subscription charge.
# Refuse eas update / OTA publish until billing is recovered AND an explicit thaw.
#
# Thaw (after Igor recovers Expo billing): export HERMES_OTA_BILLING_THAW=1
# GitHub Actions: set repo variable HERMES_OTA_BILLING_THAW=1, then re-enable
# workflow "Hermes Mobile OTA" (currently disabled_manually).
set -euo pipefail

if [[ "${HERMES_OTA_BILLING_THAW:-}" == "1" ]]; then
  echo "Expo billing thaw acknowledged (HERMES_OTA_BILLING_THAW=1)."
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
  'batch ONE coherent tip-of-day OTA — never one OTA per small PR.' \
  >&2
exit 1
