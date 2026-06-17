#!/usr/bin/env bash
# Mirror EAS / release secrets from ../LipoShield/.env (+ local key files) onto
# IgorGanapolsky/mac-yolo-safeguards GitHub Actions secrets.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_REPO="${TARGET_REPO:-IgorGanapolsky/mac-yolo-safeguards}"
LIPO_ENV="${LIPO_ENV:-$REPO_ROOT/../LipoShield/.env}"
HERMES_ENV="${REPO_ROOT}/hermes-mobile/.env"

if [[ ! -f "$LIPO_ENV" ]]; then
  echo "Missing LipoShield env file: $LIPO_ENV" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

env_value() {
  local key="$1"
  local line value
  line="$(grep -E "^${key}=" "$LIPO_ENV" | tail -1 || true)"
  if [[ -z "$line" ]]; then
    return 1
  fi
  value="${line#*=}"
  if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

set_secret() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "skip $name (empty)"
    return 0
  fi
  printf '%s' "$value" | gh secret set "$name" --repo "$TARGET_REPO"
  echo "set $name"
}

set_var() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "skip var $name (empty)"
    return 0
  fi
  gh variable set "$name" --body "$value" --repo "$TARGET_REPO"
  echo "set var $name"
}

EXPO_TOKEN="$(env_value EXPO_TOKEN || true)"
ANDROID_KEY_PATH="$(env_value EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH || true)"
ASC_KEY_PATH="$(env_value EXPO_ASC_API_KEY_PATH || true)"

set_secret EXPO_TOKEN "$EXPO_TOKEN"

if [[ -n "$ANDROID_KEY_PATH" && -f "$ANDROID_KEY_PATH" ]]; then
  set_secret GOOGLE_SERVICE_ACCOUNT_JSON "$(cat "$ANDROID_KEY_PATH")"
fi

if [[ -n "$ASC_KEY_PATH" && -f "$ASC_KEY_PATH" ]]; then
  set_secret EXPO_ASC_API_KEY_BASE64 "$(base64 < "$ASC_KEY_PATH" | tr -d '\n')"
fi

set_secret EXPO_ASC_APP_ID "$(env_value EXPO_ASC_APP_ID || true)"
set_secret EXPO_ASC_API_KEY_ID "$(env_value EXPO_ASC_API_KEY_ID || true)"
set_secret EXPO_ASC_API_KEY_ISSUER_ID "$(env_value EXPO_ASC_API_KEY_ISSUER_ID || true)"
set_secret EXPO_APPLE_TEAM_ID "$(env_value EXPO_APPLE_TEAM_ID || true)"
set_secret EXPO_APPLE_ID "$(env_value EXPO_APPLE_ID || echo "${EXPO_APPLE_ID:-}")"
set_secret EXPO_APPLE_APP_SPECIFIC_PASSWORD "$(env_value EXPO_APPLE_APP_SPECIFIC_PASSWORD || echo "${EXPO_APPLE_APP_SPECIFIC_PASSWORD:-}")"

if [[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON_PATH:-}" && -f "$FIREBASE_SERVICE_ACCOUNT_JSON_PATH" ]]; then
  set_secret FIREBASE_SERVICE_ACCOUNT_JSON "$(cat "$FIREBASE_SERVICE_ACCOUNT_JSON_PATH")"
elif [[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  set_secret FIREBASE_SERVICE_ACCOUNT_JSON "${FIREBASE_SERVICE_ACCOUNT_JSON}"
elif [[ -n "${GOOGLE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  set_secret FIREBASE_SERVICE_ACCOUNT_JSON "${GOOGLE_SERVICE_ACCOUNT_JSON}"
fi

set_secret FIREBASE_ANDROID_APP_ID "$(env_value FIREBASE_ANDROID_APP_ID || echo "${FIREBASE_ANDROID_APP_ID:-}")"
# Must be Firebase App ID for com.iganapolsky.hermesmobile — NOT com.iganapolsky.agentleash
echo "NOTE: FIREBASE_ANDROID_APP_ID must register package com.iganapolsky.hermesmobile (see hermes-mobile/docs/FIREBASE_CI.md)"
set_secret FIREBASE_REQUIRED_TESTER_EMAIL "$(env_value FIREBASE_REQUIRED_TESTER_EMAIL || echo "${FIREBASE_REQUIRED_TESTER_EMAIL:-iganapolsky@gmail.com}")"

set_var FIREBASE_INTERNAL_GROUPS "$(env_value FIREBASE_INTERNAL_GROUPS || echo "${FIREBASE_INTERNAL_GROUPS:-internal-testers}")"
set_var FIREBASE_INTERNAL_TESTERS "$(env_value FIREBASE_INTERNAL_TESTERS || echo "${FIREBASE_INTERNAL_TESTERS:-}")"

{
  echo "# Mirrored from ../LipoShield/.env for Hermes Mobile EAS (do not commit)"
  echo "EXPO_TOKEN=${EXPO_TOKEN}"
  echo "EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=${ANDROID_KEY_PATH}"
  echo "EXPO_ASC_APP_ID=$(env_value EXPO_ASC_APP_ID || true)"
  echo "EXPO_ASC_API_KEY_ID=$(env_value EXPO_ASC_API_KEY_ID || true)"
  echo "EXPO_ASC_API_KEY_ISSUER_ID=$(env_value EXPO_ASC_API_KEY_ISSUER_ID || true)"
  echo "EXPO_ASC_API_KEY_PATH=${ASC_KEY_PATH}"
  echo "EXPO_APPLE_TEAM_ID=$(env_value EXPO_APPLE_TEAM_ID || true)"
} > "$HERMES_ENV"
chmod 600 "$HERMES_ENV"
echo "wrote $HERMES_ENV"

echo "Done. Verify: gh secret list --repo ${TARGET_REPO}"
