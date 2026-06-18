#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
platform="${1:-android}"
require_android_submit_creds="${REQUIRE_ANDROID_SUBMIT_CREDS:-0}"
require_ios_submit_creds="${REQUIRE_IOS_SUBMIT_CREDS:-0}"
failures=()

record_failure() {
  failures+=("$1")
}

require_non_placeholder_var() {
  local name="$1"
  local value="${!name:-}"

  if [[ -z "$value" ]]; then
    record_failure "Missing required env: $name"
    return 0
  fi

  if [[ "$value" == *"your_"* || "$value" == *"placeholder"* || "$value" == *"REPLACE_WITH"* ]]; then
    record_failure "Invalid $name: placeholder value detected"
    return 0
  fi
}

require_android_submit_credential() {
  local credential_path="${EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH:-}"
  local credential_json="${GOOGLE_SERVICE_ACCOUNT_JSON:-}"
  local firebase_project_id
  firebase_project_id="$(node -e "console.log(require('./firebase-project.json').gcpProjectId)" 2>/dev/null || true)"

  if [[ -n "$credential_path" ]]; then
    if [[ ! -f "$credential_path" ]]; then
      record_failure "Invalid EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH: file not found at $credential_path"
    elif [[ -n "$firebase_project_id" ]]; then
      local play_project_id
      play_project_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("project_id",""))' "$credential_path" 2>/dev/null || true)"
      if [[ "$play_project_id" == "$firebase_project_id" ]]; then
        record_failure "Play submit credential uses Firebase project_id ($firebase_project_id). Use a Play Console API service account from your LLC org account (see docs/PLAY_RELEASE.md)."
      fi
    fi
    return 0
  fi

  if [[ -n "$credential_json" ]]; then
    if [[ "$credential_json" != *'"type":"service_account"'* && "$credential_json" != *'"type": "service_account"'* ]]; then
      record_failure 'Invalid GOOGLE_SERVICE_ACCOUNT_JSON: expected a Google service-account JSON payload'
    elif [[ -n "$firebase_project_id" && "$credential_json" == *"\"project_id\": \"$firebase_project_id\""* ]]; then
      record_failure "GOOGLE_SERVICE_ACCOUNT_JSON is a Firebase key ($firebase_project_id). Play submit needs a Play Console API service account (see docs/PLAY_RELEASE.md)."
    fi
    return 0
  fi

  record_failure 'Missing Android submit credential: set EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_JSON (Play Console API key, not Firebase)'
}

require_ios_submit_credential() {
  local apple_id="${EXPO_APPLE_ID:-}"
  local app_specific_password="${EXPO_APPLE_APP_SPECIFIC_PASSWORD:-}"
  local apple_team_id="${EXPO_APPLE_TEAM_ID:-}"
  local api_key_path="${EXPO_ASC_API_KEY_PATH:-}"
  local api_key_id="${EXPO_ASC_API_KEY_ID:-}"
  local api_key_issuer_id="${EXPO_ASC_API_KEY_ISSUER_ID:-}"

  require_non_placeholder_var "EXPO_ASC_APP_ID"

  if [[ -n "$api_key_path" || -n "$api_key_id" || -n "$api_key_issuer_id" ]]; then
    require_non_placeholder_var "EXPO_ASC_API_KEY_PATH"
    require_non_placeholder_var "EXPO_ASC_API_KEY_ID"
    require_non_placeholder_var "EXPO_ASC_API_KEY_ISSUER_ID"

    if [[ -n "$api_key_path" && ! -f "$api_key_path" ]]; then
      record_failure "Invalid EXPO_ASC_API_KEY_PATH: file not found at $api_key_path"
    fi

    return 0
  fi

  require_non_placeholder_var "EXPO_APPLE_ID"
  require_non_placeholder_var "EXPO_APPLE_APP_SPECIFIC_PASSWORD"
  require_non_placeholder_var "EXPO_APPLE_TEAM_ID"

  if [[ -n "$app_specific_password" && "$app_specific_password" != *-* ]]; then
    record_failure 'Invalid EXPO_APPLE_APP_SPECIFIC_PASSWORD: expected an app-specific password value'
  fi

  if [[ -n "$apple_id" && "$apple_id" != *"@"* ]]; then
    record_failure 'Invalid EXPO_APPLE_ID: expected an Apple ID email address'
  fi

  if [[ -n "$apple_team_id" && ! "$apple_team_id" =~ ^[A-Z0-9]{10}$ ]]; then
    record_failure 'Invalid EXPO_APPLE_TEAM_ID: expected a 10-character Apple team identifier'
  fi
}

echo "Running Hermes Mobile release preflight for platform: $platform"

export REQUIRE_EAS_PROJECT=1
if ! node "$repo_root/scripts/verify-release-readiness.cjs"; then
  exit 1
fi

case "$platform" in
  android)
    if [[ "$require_android_submit_creds" == "1" ]]; then
      require_android_submit_credential
    fi
    ;;
  ios)
    if [[ "$require_ios_submit_creds" == "1" ]]; then
      require_ios_submit_credential
    fi
    ;;
  all)
    if [[ "$require_android_submit_creds" == "1" ]]; then
      require_android_submit_credential
    fi
    if [[ "$require_ios_submit_creds" == "1" ]]; then
      require_ios_submit_credential
    fi
    ;;
  *)
    echo "Unknown platform '$platform'. Use: android | ios | all" >&2
    exit 1
    ;;
esac

if (( ${#failures[@]} > 0 )); then
  printf '%s\n' "${failures[@]}" >&2
  exit 1
fi

echo "Hermes Mobile release preflight passed."
