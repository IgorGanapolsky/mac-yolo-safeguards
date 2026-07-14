#!/usr/bin/env bash
# Poll public App Store index for Hermes Mobile iOS (no ASC credentials).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ID="${HERMES_IOS_BUNDLE_ID:-com.iganapolsky.hermesmobile}"
URL="https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}"
DAY="$(date -u +%Y%m%d)"
OUT_DIR="${ROOT}/docs/proofs/ios-live-${DAY}"
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"

mkdir -p "${OUT_DIR}"
JSON="$(curl -sS "${URL}")"
OUT_JSON="${OUT_DIR}/itunes-lookup-${STAMP}.json"
echo "${JSON}" > "${OUT_JSON}"

python3 - "${OUT_JSON}" << 'PY'
import json, sys
path = sys.argv[1]
with open(path) as f:
    data = json.load(f)
count = int(data.get("resultCount") or 0)
print(f"resultCount={count}")
if count == 1:
    r = (data.get("results") or [{}])[0]
    url = r.get("trackViewUrl") or ""
    track_id = r.get("trackId")
    print(f"trackViewUrl={url}")
    if url:
        with open(path.replace("itunes-lookup-", "trackViewUrl-").replace(".json", ".txt"), "w") as out:
            out.write(url + "\n")
    summary = {
        "polledAt": path.split("itunes-lookup-")[-1].replace(".json", ""),
        "resultCount": count,
        "trackViewUrl": url,
        "trackId": track_id,
        "bundleId": r.get("bundleId"),
        "version": r.get("version"),
    }
    with open(path.rsplit("/", 1)[0] + "/latest-live.json", "w") as out:
        json.dump(summary, out, indent=2)
        out.write("\n")
PY

