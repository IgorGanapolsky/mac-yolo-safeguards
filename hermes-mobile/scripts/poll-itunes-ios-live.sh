#!/usr/bin/env bash
# Poll public App Store index for Hermes Mobile iOS (no ASC credentials).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ID="${HERMES_IOS_BUNDLE_ID:-com.iganapolsky.hermesmobile}"
ASC_APP_ID="${HERMES_IOS_ASC_APP_ID:-6786778037}"
NTFY_TOPIC="${HERMES_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
LATEST_JSON="${ROOT}/docs/proofs/ios-itunes-lookup-latest.json"
STATE_JSON="${ROOT}/docs/proofs/ios-itunes-lookup-state.json"
DAY="$(date -u +%Y%m%d)"
ARCHIVE_DIR="${ROOT}/docs/proofs/ios-live-${DAY}"

mkdir -p "${ARCHIVE_DIR}" "${ROOT}/docs/proofs"

bundle_json="$(curl -sS "https://itunes.apple.com/lookup?bundleId=${BUNDLE_ID}")"
id_json="$(curl -sS "https://itunes.apple.com/lookup?id=${ASC_APP_ID}&country=us")"

python3 - "${STAMP}" "${LATEST_JSON}" "${STATE_JSON}" "${ARCHIVE_DIR}" "${bundle_json}" "${id_json}" << 'PY'
import json, os, sys, urllib.request

stamp, latest_path, state_path, archive_dir, bundle_raw, id_raw = sys.argv[1:7]
bundle_json = json.loads(bundle_raw)
id_json = json.loads(id_raw)
count_bundle = int(bundle_json.get("resultCount") or 0)
count_id = int(id_json.get("resultCount") or 0)
live_count = max(count_bundle, count_id)

proof = {
    "polledAt": stamp,
    "bundleId": "com.iganapolsky.hermesmobile",
    "ascAppId": "6786778037",
    "lookups": {"byBundleId": bundle_json, "byAscAppId": id_json},
    "resultCount": {"byBundleId": count_bundle, "byAscAppId": count_id},
}
with open(latest_path, "w") as f:
    json.dump(proof, f, indent=2)
    f.write("\n")

archive_name = f"itunes-lookup-{stamp.replace(':', '').replace('-', '')}.json"
with open(os.path.join(archive_dir, archive_name), "w") as f:
    json.dump(proof, f, indent=2)
    f.write("\n")

prev = 0
if os.path.exists(state_path):
    try:
        with open(state_path) as f:
            prev = int(json.load(f).get("resultCount") or 0)
    except (json.JSONDecodeError, TypeError, ValueError):
        prev = 0

state = {"lastPolledAt": stamp, "resultCount": live_count, "notifiedLiveAt": None}
if os.path.exists(state_path):
    try:
        with open(state_path) as f:
            old = json.load(f)
        if isinstance(old.get("notifiedLiveAt"), str):
            state["notifiedLiveAt"] = old["notifiedLiveAt"]
    except (json.JSONDecodeError, TypeError):
        pass

track_url = ""
if live_count >= 1:
    for payload in (bundle_json, id_json):
        results = payload.get("results") or []
        if results:
            track_url = results[0].get("trackViewUrl") or ""
            if track_url:
                break
    summary = {
        "polledAt": stamp,
        "resultCount": live_count,
        "trackViewUrl": track_url,
        "bundleId": (bundle_json.get("results") or [{}])[0].get("bundleId") if count_bundle else None,
        "version": (bundle_json.get("results") or [{}])[0].get("version") if count_bundle else None,
    }
    with open(os.path.join(archive_dir, "latest-live.json"), "w") as f:
        json.dump(summary, f, indent=2)
        f.write("\n")

with open(state_path, "w") as f:
    json.dump(state, f, indent=2)
    f.write("\n")

print(f"resultCount={live_count} (bundle={count_bundle}, id={count_id})")

if prev < 1 and live_count >= 1 and not state.get("notifiedLiveAt"):
    topic = os.environ.get("HERMES_NTFY_TOPIC", "yolo-guard-fdh8ktuw1vtxb5sb")
    body = f"Hermes Mobile iOS is LIVE on App Store. resultCount={live_count}"
    if track_url:
        body += f" {track_url}"
    req = urllib.request.Request(
        f"https://ntfy.sh/{topic}",
        data=body.encode(),
        headers={"Title": "Hermes Mobile iOS live", "Priority": "high"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
        state["notifiedLiveAt"] = stamp
        with open(state_path, "w") as f:
            json.dump(state, f, indent=2)
            f.write("\n")
        print("ntfy=sent")
    except Exception as exc:
        print(f"ntfy=failed:{exc}", file=sys.stderr)
PY
