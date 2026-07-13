#!/usr/bin/env bash
# Hermes Mobile 24/7 unpaid marketing cadence.
# Morning: ntfy "post Show HN / Reddit draft today"
# Evening: check Play install bucket (public page + optional Play API) and log proof JSON.
# Never auto-publishes. Never spends paid UA. Never invents install counts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROOF_DIR="${REPO_ROOT}/hermes-mobile/docs/proofs/marketing"
CAMPAIGN_DIR="${REPO_ROOT}/hermes-mobile/docs/social/campaign-2026-07-13"
READY_DIR="${REPO_ROOT}/hermes-mobile/docs/social/ready-to-post"
NTFY_TOPIC="${HERMES_PROMO_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
NTFY_URL="${HERMES_NTFY_URL:-https://ntfy.sh/${NTFY_TOPIC}}"
PLAY_STORE_URL="https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en_US&gl=US"
PACKAGE="com.iganapolsky.hermesmobile"
SA_JSON="${GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:-${HOME}/.gcloud-keys/hermes-mobile-publisher.json}"
MODE="${1:-auto}"
HOUR="$(date +%H)"
NOW_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="$(date +%Y-%m-%d)"

mkdir -p "${PROOF_DIR}"

resolve_mode() {
  if [[ "${MODE}" == "morning" || "${MODE}" == "evening" ]]; then
    echo "${MODE}"
    return
  fi
  # Default: before 14:00 local = morning post nudge; else evening install check.
  if (( 10#${HOUR} < 14 )); then
    echo "morning"
  else
    echo "evening"
  fi
}

morning_nudge() {
  local channel file
  local dow
  dow="$(date +%u)" # 1=Mon .. 7=Sun
  case "${dow}" in
    1) channel="Stage Show HN (post Tue–Thu ~9am PT)"; file="${CAMPAIGN_DIR}/01-show-hn.md" ;;
    2|3|4) channel="Post Show HN OR Reddit (one channel)"; file="${CAMPAIGN_DIR}/01-show-hn.md" ;;
    5) channel="r/selfhosted OR r/SideProject"; file="${CAMPAIGN_DIR}/03-reddit-selfhosted.md" ;;
    6) channel="X 5-tweet thread"; file="${CAMPAIGN_DIR}/05-x-thread.md" ;;
    7) channel="Agency B2B + Discord helpful reply"; file="${CAMPAIGN_DIR}/07-agency-followup-bluefully.md" ;;
  esac

  local body
  body="$(cat <<EOF
Hermes Mobile: post Show HN / Reddit draft today

Today: ${channel}
Draft: ${file}
Also: ${READY_DIR}/
Play (do not invent installs): ${PLAY_STORE_URL}
Paid UA: DO NOT spend until PostHog production app_open + payments fixed.
EOF
)"

  curl -fsS -H "Title: Hermes Mobile: post Show HN / Reddit draft today" \
    -H "Priority: high" \
    -H "Tags: megaphone,android" \
    -d "${body}" \
    "${NTFY_URL}" >/dev/null || true

  printf '%s\n' "{\"updatedAt\":\"${NOW_UTC}\",\"mode\":\"morning\",\"channel\":\"${channel}\",\"draft\":\"${file}\",\"ntfy\":\"sent\"}" \
    > "${PROOF_DIR}/morning-${TODAY}.json"
  echo "morning nudge ok channel=${channel}"
}

scrape_public_bucket() {
  local html tmp
  tmp="$(mktemp)"
  if ! curl -fsSL --max-time 30 "${PLAY_STORE_URL}" -o "${tmp}"; then
    rm -f "${tmp}"
    echo "unknown"
    return
  fi
  # Prefer explicit 0+ / N+ token near downloads.
  local bucket
  bucket="$(python3 - "${tmp}" <<'PY'
import re, sys
html = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
# Common Play patterns: "0+", "10+", "100+", etc.
m = re.search(r'"(\d[\d,]*)\+"', html)
if m:
    print(m.group(1).replace(",", "") + "+")
    raise SystemExit
m = re.search(r'(\d[\d,]*)\+\s*downloads', html, re.I)
if m:
    print(m.group(1).replace(",", "") + "+")
    raise SystemExit
if "0+" in html:
    print("0+")
else:
    print("unknown")
PY
)"
  rm -f "${tmp}"
  echo "${bucket}"
}

play_api_installs() {
  # Best-effort; never print the service-account JSON.
  if [[ ! -f "${SA_JSON}" ]]; then
    echo ""
    return
  fi
  python3 - "${SA_JSON}" "${PACKAGE}" <<'PY' 2>/dev/null || true
import json, sys, urllib.request
from pathlib import Path

sa_path, package = sys.argv[1], sys.argv[2]
try:
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
except Exception:
    raise SystemExit(0)

scopes = ["https://www.googleapis.com/auth/androidpublisher"]
creds = service_account.Credentials.from_service_account_file(sa_path, scopes=scopes)
creds.refresh(Request())
# Installs statistics endpoint (may 403 depending on API grant) — fail soft.
url = (
    "https://androidpublisher.googleapis.com/androidpublisher/v3/"
    f"applications/{package}/statistics"
)
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {creds.token}"})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8", "ignore"))
    print(json.dumps({"ok": True, "keys": list(data.keys())[:12]}))
except Exception as exc:
    print(json.dumps({"ok": False, "error": type(exc).__name__}))
PY
}

evening_install_check() {
  local public_bucket api_json
  public_bucket="$(scrape_public_bucket)"
  api_json="$(play_api_installs)"
  [[ -z "${api_json}" ]] && api_json='{"ok":false,"error":"no_service_account_or_client"}'

  local latest="${PROOF_DIR}/latest.json"
  local dated="${PROOF_DIR}/installs-${TODAY}.json"
  python3 - "${latest}" "${dated}" "${NOW_UTC}" "${public_bucket}" "${api_json}" "${PACKAGE}" <<'PY'
import json, sys
latest, dated, now, bucket, api_raw, package = sys.argv[1:7]
try:
    api = json.loads(api_raw)
except Exception:
    api = {"ok": False, "error": "parse"}
payload = {
    "updatedAt": now,
    "mode": "evening",
    "package": package,
    "publicDownloadBucket": bucket,
    "playApi": api,
    "note": "Installed audience from Console may differ; public bucket is the only always-available signal. Do not invent installs.",
    "paidUa": "gated_until_posthog_production_app_open",
}
text = json.dumps(payload, indent=2) + "\n"
open(latest, "w", encoding="utf-8").write(text)
open(dated, "w", encoding="utf-8").write(text)
print(text)
PY

  # Optional private ops mirror (gitignored business_os) — never fail the job.
  local bos="${REPO_ROOT}/business_os/revenue"
  if [[ -d "${bos}" ]]; then
    mkdir -p "${bos}/marketing-proofs" 2>/dev/null || true
    cp -f "${latest}" "${bos}/marketing-proofs/hermes-mobile-installs-latest.json" 2>/dev/null || true
  fi

  local body
  body="$(cat <<EOF
Hermes Mobile evening install check

Public Play download bucket: ${public_bucket}
Proof: ${latest}
Paid UA still gated. Post one unpaid draft if morning nudge was skipped.
EOF
)"
  curl -fsS -H "Title: Hermes Mobile evening install check" \
    -H "Priority: default" \
    -H "Tags: chart_with_upwards_trend,android" \
    -d "${body}" \
    "${NTFY_URL}" >/dev/null || true

  echo "evening check ok bucket=${public_bucket}"
}

main() {
  local resolved
  resolved="$(resolve_mode)"
  case "${resolved}" in
    morning) morning_nudge ;;
    evening) evening_install_check ;;
    *) echo "unknown mode: ${resolved}" >&2; exit 2 ;;
  esac
}

main
