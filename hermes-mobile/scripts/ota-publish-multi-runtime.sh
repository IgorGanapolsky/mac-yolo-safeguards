#!/usr/bin/env bash
# Publish the same JS OTA for every runtime that still has production clients.
# runtimeVersion policy is appVersion — a 1.5 binary never sees a 1.4 update.
#
# Usage:
#   bash scripts/ota-publish-multi-runtime.sh production "message here"
#   RUNTIMES="1.5 1.4 1.3 1.2" CHANNEL=production-android-paid bash scripts/ota-publish-multi-runtime.sh
set -euo pipefail

CHANNEL="${1:-production}"
MSG="${2:-${OTA_MESSAGE:-multi-runtime OTA $(date -u +%Y-%m-%d)}}"
# Default: active production runtimes observed on EAS production branch (2026-08).
RUNTIMES="${RUNTIMES:-1.5 1.4 1.3 1.2}"
ENVIRONMENT="${OTA_ENVIRONMENT:-$CHANNEL}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/.." && pwd)"
cd "$ROOT"

bash ./scripts/require-expo-billing-thaw.sh
if [[ "$CHANNEL" == "production" || "$CHANNEL" == "production-android-paid" ]]; then
  bash ./scripts/require-fresh-user-ota-gate.sh
fi

APP_JSON="$ROOT/app.json"
if [[ ! -f "$APP_JSON" ]]; then
  echo "FATAL: missing $APP_JSON" >&2
  exit 1
fi

BACKUP="$(mktemp)"
cp "$APP_JSON" "$BACKUP"
cleanup() {
  cp "$BACKUP" "$APP_JSON"
  rm -f "$BACKUP"
}
trap cleanup EXIT

set_version() {
  local ver="$1"
  python3 - "$APP_JSON" "$ver" <<'PY'
import json, sys
path, ver = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
data["expo"]["version"] = ver
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
print(f"expo.version -> {ver}")
PY
}

echo "Multi-runtime OTA channel=$CHANNEL runtimes=[$RUNTIMES]"
for ver in $RUNTIMES; do
  echo "——— runtime $ver ———"
  set_version "$ver"
  eas update \
    --channel "$CHANNEL" \
    --environment "$ENVIRONMENT" \
    --non-interactive \
    --message "$MSG (runtime $ver)"
done

echo "Multi-runtime OTA complete for channel=$CHANNEL"
