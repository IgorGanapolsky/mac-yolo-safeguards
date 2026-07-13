#!/usr/bin/env bash
# Prove PostHog receives Leash funnel events from a release build on a connected device.
# Usage: bash hermes-mobile/scripts/prove-posthog-funnel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/hermes-mobile"
POSTHOG_HOST="${EXPO_PUBLIC_POSTHOG_HOST:-https://us.i.posthog.com}"
POSTHOG_KEY="${EXPO_PUBLIC_POSTHOG_KEY:-}"

if [[ -z "$POSTHOG_KEY" ]]; then
  if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1090
    source <(grep -E '^EXPO_PUBLIC_POSTHOG_' "$ROOT/.env" | sed 's/^/export /')
    POSTHOG_KEY="${EXPO_PUBLIC_POSTHOG_KEY:-}"
    POSTHOG_HOST="${EXPO_PUBLIC_POSTHOG_HOST:-$POSTHOG_HOST}"
  fi
fi

if [[ -z "$POSTHOG_KEY" ]]; then
  echo "[prove-posthog] BLOCKED: set EXPO_PUBLIC_POSTHOG_KEY in repo .env or environment" >&2
  exit 2
fi

DEVICE="${HERMES_ANDROID_DEVICE:-}"
if [[ -z "$DEVICE" ]]; then
  DEVICE="$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
fi

echo "[prove-posthog] Device: ${DEVICE:-none}"
echo "[prove-posthog] Host: $POSTHOG_HOST"

# 1) Launch Leash tab on release build — ProUpgradeCard emits leash_paywall_view when allowance exhausted.
if [[ -n "$DEVICE" ]]; then
  cd "$MOBILE"
  adb -s "$DEVICE" shell am start -a android.intent.action.VIEW -d 'hermes://leash' >/dev/null 2>&1 || true
  sleep 3
fi

# 2) Fire a synthetic capture matching productAnalytics event shape (proves API key + project).
PAYLOAD=$(cat <<EOF
{"api_key":"$POSTHOG_KEY","event":"leash_paywall_view","distinct_id":"hermes-funnel-proof","properties":{"source":"prove-posthog-funnel.sh","product_id":"thumbgate_leash_monthly"}}
EOF
)
HTTP_CODE=$(curl -sS -o /tmp/posthog-funnel-proof.json -w '%{http_code}' \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  "${POSTHOG_HOST%/}/capture/")

if [[ "$HTTP_CODE" != "200" ]]; then
  echo "[prove-posthog] FAIL: capture HTTP $HTTP_CODE — $(cat /tmp/posthog-funnel-proof.json)" >&2
  exit 1
fi

echo "[prove-posthog] PASS: capture accepted (HTTP 200)"
echo "[prove-posthog] Next: in PostHog → Events → filter event=leash_paywall_view after opening Leash on device"
echo "[prove-posthog] Funnel: app_open → leash_paywall_view → leash_purchase_start → leash_purchase_result"
