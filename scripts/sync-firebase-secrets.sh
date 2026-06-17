#!/usr/bin/env bash
# Set Firebase App Distribution secrets for Hermes Mobile only.
set -euo pipefail

TARGET_REPO="${TARGET_REPO:-IgorGanapolsky/mac-yolo-safeguards}"
HERMES_FIREBASE_APP_ID="1:587028054730:android:00258f23e47d56f6772a33"

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
  cat >&2 <<'EOF'
Missing Firebase service account JSON.

Generate a key on Firebase Console → openclaw-console-mobile-8d53d → Service accounts, then:

  FIREBASE_SERVICE_ACCOUNT_JSON_PATH=~/path/to/openclaw-firebase-sa.json \
    ./scripts/sync-firebase-secrets.sh
EOF
  exit 1
fi

CLIENT_EMAIL="$(printf '%s' "$SA_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("client_email",""))')"
PROJECT_ID="$(printf '%s' "$SA_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("project_id",""))')"

if [[ "$PROJECT_ID" != "openclaw-console-mobile-8d53d" ]]; then
  echo "WARN: expected project_id openclaw-console-mobile-8d53d, got $PROJECT_ID" >&2
fi

printf '%s' "$SA_JSON" | gh secret set FIREBASE_SERVICE_ACCOUNT_JSON --repo "$TARGET_REPO"
gh secret set FIREBASE_ANDROID_APP_ID --body "$HERMES_FIREBASE_APP_ID" --repo "$TARGET_REPO"
echo "Set FIREBASE_SERVICE_ACCOUNT_JSON ($CLIENT_EMAIL) and FIREBASE_ANDROID_APP_ID=$HERMES_FIREBASE_APP_ID"
