#!/usr/bin/env bash
# Set Firebase App Distribution secrets for Hermes Mobile.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FB_CFG="$REPO_ROOT/hermes-mobile/firebase-project.json"
TARGET_REPO="${TARGET_REPO:-IgorGanapolsky/mac-yolo-safeguards}"

read_fb() {
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$FB_CFG" "$1"
}

HERMES_FIREBASE_APP_ID="$(read_fb androidAppId)"
HERMES_FIREBASE_GCP_PROJECT_ID="$(read_fb gcpProjectId)"
HERMES_FIREBASE_PROJECT_NUMBER="$(read_fb projectNumber)"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

SA_JSON=""
if [[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON_PATH:-}" && -f "$FIREBASE_SERVICE_ACCOUNT_JSON_PATH" ]]; then
  SA_JSON="$(cat "$FIREBASE_SERVICE_ACCOUNT_JSON_PATH")"
elif [[ -n "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  SA_JSON="$FIREBASE_SERVICE_ACCOUNT_JSON"
else
  cat >&2 <<EOF
Missing Firebase service account JSON.

Generate a key on Firebase Console → Hermes Mobile → Project settings → Service accounts, then:

  FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/hermes-firebase-sa.json \\
    ./scripts/sync-firebase-secrets.sh
EOF
  exit 1
fi

CLIENT_EMAIL="$(printf '%s' "$SA_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("client_email",""))')"
PROJECT_ID="$(printf '%s' "$SA_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("project_id",""))')"

if [[ "$PROJECT_ID" != "$HERMES_FIREBASE_GCP_PROJECT_ID" ]]; then
  echo "WARN: expected Hermes Mobile Firebase project ($HERMES_FIREBASE_GCP_PROJECT_ID), got project_id=$PROJECT_ID" >&2
fi

printf '%s' "$SA_JSON" | gh secret set FIREBASE_SERVICE_ACCOUNT_JSON --repo "$TARGET_REPO"
gh secret set FIREBASE_ANDROID_APP_ID --body "$HERMES_FIREBASE_APP_ID" --repo "$TARGET_REPO"
echo "Set FIREBASE_SERVICE_ACCOUNT_JSON ($CLIENT_EMAIL) and FIREBASE_ANDROID_APP_ID=$HERMES_FIREBASE_APP_ID"
