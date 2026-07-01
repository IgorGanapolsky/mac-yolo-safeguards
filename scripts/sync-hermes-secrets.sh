#!/usr/bin/env bash
# Mirror Hermes Mobile EAS / Apple signing secrets to GitHub.
# Firebase: use scripts/sync-firebase-secrets.sh (separate Hermes project).
#
# Play submit: EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH must point at a Hermes Mobile
# Play Console API key (convention: hermes-mobile-publisher@<gcp-project>.iam.gserviceaccount.com,
# local file ~/.gcloud-keys/hermes-mobile-publisher.json). Do NOT reuse Play keys from other apps —
# see hermes-mobile/docs/PLAY_RELEASE.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_REPO="${TARGET_REPO:-IgorGanapolsky/mac-yolo-safeguards}"
ENV_FILE="${HERMES_ENV_FILE:-$REPO_ROOT/hermes-mobile/.env}"
HERMES_ENV_OUT="${REPO_ROOT}/hermes-mobile/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Copy hermes-mobile/.env.example to hermes-mobile/.env and fill EXPO_TOKEN + key paths." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

env_value() {
  local key="$1"
  local line value
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -1 || true)"
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

EXPO_TOKEN="$(env_value EXPO_TOKEN || true)"
ANDROID_KEY_PATH="$(env_value EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH || true)"
ASC_KEY_PATH="$(env_value EXPO_ASC_API_KEY_PATH || true)"

set_secret EXPO_TOKEN "$EXPO_TOKEN"

if [[ -n "$ANDROID_KEY_PATH" && -f "$ANDROID_KEY_PATH" ]]; then
  FIREBASE_PROJECT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("gcpProjectId",""))' "$REPO_ROOT/hermes-mobile/firebase-project.json" 2>/dev/null || true)"
  PLAY_PROJECT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("project_id",""))' "$ANDROID_KEY_PATH" 2>/dev/null || true)"
  if [[ -n "$FIREBASE_PROJECT_ID" && "$PLAY_PROJECT_ID" == "$FIREBASE_PROJECT_ID" ]]; then
    echo "ERROR: EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH points at Firebase project $FIREBASE_PROJECT_ID." >&2
    echo "Play submit needs a Play Console API key (LLC org). See hermes-mobile/docs/PLAY_RELEASE.md" >&2
    exit 1
  fi
  set_secret GOOGLE_SERVICE_ACCOUNT_JSON "$(cat "$ANDROID_KEY_PATH")"
fi

if [[ -n "$ASC_KEY_PATH" && -f "$ASC_KEY_PATH" ]]; then
  set_secret EXPO_ASC_API_KEY_BASE64 "$(base64 < "$ASC_KEY_PATH" | tr -d '\n')"
fi

set_secret EXPO_ASC_APP_ID "$(env_value EXPO_ASC_APP_ID || true)"
set_secret EXPO_ASC_API_KEY_ID "$(env_value EXPO_ASC_API_KEY_ID || true)"
set_secret EXPO_ASC_API_KEY_ISSUER_ID "$(env_value EXPO_ASC_API_KEY_ISSUER_ID || true)"
set_secret EXPO_APPLE_TEAM_ID "$(env_value EXPO_APPLE_TEAM_ID || true)"
set_secret EXPO_APPLE_ID "$(env_value EXPO_APPLE_ID || echo "${EXPO_APPLE_ID:-igor.ganapolsky@icloud.com}")"
set_secret EXPO_APPLE_APP_SPECIFIC_PASSWORD "$(env_value EXPO_APPLE_APP_SPECIFIC_PASSWORD || echo "${EXPO_APPLE_APP_SPECIFIC_PASSWORD:-}")"

set_secret FIREBASE_REQUIRED_TESTER_EMAIL "$(env_value FIREBASE_REQUIRED_TESTER_EMAIL || echo "${FIREBASE_REQUIRED_TESTER_EMAIL:-iganapolsky@gmail.com}")"

echo "Firebase secrets: run ./scripts/sync-firebase-secrets.sh"

{
  echo "# Hermes Mobile EAS env (do not commit)"
  echo "EXPO_TOKEN=${EXPO_TOKEN}"
  echo "EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH=${ANDROID_KEY_PATH}"
  echo "EXPO_ASC_APP_ID=$(env_value EXPO_ASC_APP_ID || true)"
  echo "EXPO_ASC_API_KEY_ID=$(env_value EXPO_ASC_API_KEY_ID || true)"
  echo "EXPO_ASC_API_KEY_ISSUER_ID=$(env_value EXPO_ASC_API_KEY_ISSUER_ID || true)"
  echo "EXPO_ASC_API_KEY_PATH=${ASC_KEY_PATH}"
  echo "EXPO_APPLE_TEAM_ID=$(env_value EXPO_APPLE_TEAM_ID || true)"
  echo "EXPO_APPLE_ID=$(env_value EXPO_APPLE_ID || echo igor.ganapolsky@icloud.com)"
} > "$HERMES_ENV_OUT"
chmod 600 "$HERMES_ENV_OUT"
echo "wrote $HERMES_ENV_OUT"
echo "Done. Verify: gh secret list --repo ${TARGET_REPO}"
