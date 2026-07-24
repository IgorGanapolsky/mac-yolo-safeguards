#!/usr/bin/env bash
# Thin wrapper: refuse local/CI OTA when mobile-ota.yml spend budget is exhausted.
# See tools/ota-publish-budget.js and hermes-mobile/docs/OTA_UPDATES.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHANNEL="${1:-${OTA_BUDGET_CHANNEL:-}}"

ARGS=(node "$ROOT/tools/ota-publish-budget.js")
if [[ -n "$CHANNEL" ]]; then
  ARGS+=(--channel "$CHANNEL")
fi

exec "${ARGS[@]}"
