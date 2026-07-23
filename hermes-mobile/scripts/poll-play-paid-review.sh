#!/usr/bin/env bash
# Durable single-tick poll for Play paid download listing.
# Live truth = public store HTTP 200 (not Console "completed").
# Optional Chrome scrape (PLAY_PAID_POLL_CONSOLE=1) with hard timeout for reject signals.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="${PLAY_PAID_PACKAGE:-com.iganapolsky.hermesmobile.paid}"
PUBLIC="https://play.google.com/store/apps/details?id=${PKG}&hl=en_US&gl=US"
DEV="${PLAY_PAID_DEV_ID:-5120393192891708058}"
APP="${PLAY_PAID_APP_ID:-4972002147362988720}"
PUBLISHING="https://play.google.com/console/u/0/developers/${DEV}/app/${APP}/publishing"
NTFY_TOPIC="${HERMES_NTFY_TOPIC:-yolo-guard-fdh8ktuw1vtxb5sb}"
# Default off for LaunchAgent: public URL alone is the LIVE gate. Session watchers can set =1.
POLL_CONSOLE="${PLAY_PAID_POLL_CONSOLE:-0}"
CONSOLE_TIMEOUT="${PLAY_PAID_CONSOLE_TIMEOUT:-25}"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
PROOF_DIR="${ROOT}/docs/proofs"
LATEST_JSON="${PROOF_DIR}/play-paid-review-latest.json"
STATE_JSON="${PROOF_DIR}/play-paid-review-state.json"
LOG="${PROOF_DIR}/play-paid-review-poll.log"
DAY="$(date -u +%Y%m%d)"
ARCHIVE_DIR="${PROOF_DIR}/play-paid-review-${DAY}"

mkdir -p "${ARCHIVE_DIR}" "${PROOF_DIR}"

public_http="000"
: > /tmp/play-paid-public-http.code
if curl -sS -L --max-time 30 \
    -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' \
    -o /tmp/play-paid-public-tick.html \
    -w '%{http_code}' \
    "$PUBLIC" > /tmp/play-paid-public-http.code 2>/tmp/play-paid-public-curl.err; then
  public_http="$(tr -d '[:space:]' </tmp/play-paid-public-http.code)"
else
  code="$(tr -d '[:space:]' </tmp/play-paid-public-http.code 2>/dev/null || true)"
  public_http="${code:-000}"
fi

og_title=""
price_signal=""
developer_id=""
if [[ "$public_http" == "200" ]]; then
  eval "$(
    python3 - <<'PY'
import re
from pathlib import Path
h = Path("/tmp/play-paid-public-tick.html").read_text(errors="replace")
title = re.search(r'property="og:title" content="([^"]+)"', h) or re.search(
    r'content="([^"]+)" property="og:title"', h
)
price = "4.99" if re.search(r"\$4\.99|USD 4\.99|\"4\.99\"", h) else "price_not_found"
dev = re.search(r"developer\?id=([^\"&]+)", h)
def esc(s):
    return (s or "").replace("'", "'\"'\"'")
print(f"og_title='{esc(title.group(1) if title else '')}'")
print(f"price_signal='{esc(price)}'")
print(f"developer_id='{esc(dev.group(1) if dev else '')}'")
PY
  )"
fi

console_status="skipped"
console_signals=""
if [[ "$POLL_CONSOLE" == "1" ]] && pgrep -x "Google Chrome" >/dev/null 2>&1; then
  # Only reload an existing publishing tab (no new tabs). Hard-timeout via perl alarm.
  console_json="$(
    perl -e 'alarm shift; exec @ARGV' "$CONSOLE_TIMEOUT" osascript -e "
tell application \"Google Chrome\"
  if (count of windows) is 0 then return \"{\\\"error\\\":\\\"no_windows\\\"}\"
  set targetURL to \"${PUBLISHING}\"
  set found to false
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      if URL of t starts with targetURL then
        set active tab index of w to i
        set found to true
        exit repeat
      end if
    end repeat
    if found then exit repeat
  end repeat
  if not found then return \"{\\\"error\\\":\\\"no_publishing_tab\\\"}\"
  tell active tab of front window to reload
  delay 4
  set result to execute active tab of front window javascript \"(function(){const b=document.body?document.body.innerText:''; const keys=['Changes in review','Your changes are now in review','Rejected','Updates rejected','Issues found','Update required','Needs attention','Ready to publish','Published','Remove changes','Send for review','paid-15','United States']; const signals=keys.filter(k=>b.includes(k)); return JSON.stringify({signals, snippet:b.replace(/\\\\s+/g,' ').slice(0,500)});})();\"
  return result
end tell
" 2>/dev/null || true
  )"
  if [[ -n "${console_json:-}" ]]; then
    if printf '%s' "$console_json" | grep -q 'no_publishing_tab\|no_windows'; then
      console_status="no_tab"
    else
      console_status="ok"
      console_signals="$(
        python3 -c 'import json,sys; d=json.loads(sys.argv[1]); print(",".join(d.get("signals") or []))' \
          "$console_json" 2>/dev/null || echo parse_error
      )"
    fi
  else
    console_status="timeout_or_fail"
  fi
fi

status="in_review"
if [[ "$public_http" == "200" ]]; then
  status="live"
elif [[ "$console_signals" == *"Rejected"* ]] || [[ "$console_signals" == *"Updates rejected"* ]] || [[ "$console_signals" == *"Issues found"* ]]; then
  status="needs_action"
elif [[ "$console_signals" == *"Your changes are now in review"* ]] || [[ "$console_signals" == *"Changes in review"* ]]; then
  status="in_review"
elif [[ "$console_status" == "skipped" || "$console_status" == "no_tab" || "$console_status" == "timeout_or_fail" ]]; then
  status="in_review_public_only"
fi

python3 - "$STAMP" "$LATEST_JSON" "$STATE_JSON" "$ARCHIVE_DIR" "$LOG" \
  "$PKG" "$PUBLIC" "$public_http" "$status" "$og_title" "$price_signal" \
  "$developer_id" "$console_status" "$console_signals" "$NTFY_TOPIC" <<'PY'
import json, os, sys, urllib.request

(
    stamp, latest_path, state_path, archive_dir, log_path,
    pkg, public, public_http, status, og_title, price_signal,
    developer_id, console_status, console_signals, topic,
) = sys.argv[1:16]

proof = {
    "polledAt": stamp,
    "package": pkg,
    "publicUrl": public,
    "publicHttp": int(public_http) if str(public_http).isdigit() else public_http,
    "status": status,
    "ogTitle": og_title or None,
    "priceSignal": price_signal or None,
    "developerId": developer_id or None,
    "console": {"status": console_status, "signals": [s for s in console_signals.split(",") if s]},
    "releaseHint": {"name": "paid-15", "countries": ["US"], "listPriceUsd": "4.99"},
}
with open(latest_path, "w") as f:
    json.dump(proof, f, indent=2)
    f.write("\n")

arch = os.path.join(archive_dir, f"tick-{stamp.replace(':', '').replace('-', '')}.json")
with open(arch, "w") as f:
    json.dump(proof, f, indent=2)
    f.write("\n")

notified_live = None
notified_action = None
if os.path.exists(state_path):
    try:
        with open(state_path) as f:
            old = json.load(f)
        notified_live = old.get("notifiedLiveAt")
        notified_action = old.get("notifiedNeedsActionAt")
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

state = {
    "lastPolledAt": stamp,
    "status": status,
    "publicHttp": proof["publicHttp"],
    "notifiedLiveAt": notified_live,
    "notifiedNeedsActionAt": notified_action,
}

def ntfy(title, body, priority="default"):
    req = urllib.request.Request(
        f"https://ntfy.sh/{topic}",
        data=body.encode(),
        headers={"Title": title, "Priority": priority},
        method="POST",
    )
    urllib.request.urlopen(req, timeout=10)

line = (
    f"[{stamp}] tick public_http={public_http} status={status} "
    f"console={console_status}:{console_signals or '-'} "
    f"title={og_title or '-'} price={price_signal or '-'}"
)
with open(log_path, "a") as f:
    f.write(line + "\n")
print(line)

if status == "live" and not notified_live:
    body = f"Play paid LIVE {pkg} HTTP 200 price={price_signal or '?'} {public}"
    try:
        ntfy("Hermes Play paid LIVE", body, "high")
        state["notifiedLiveAt"] = stamp
        print("ntfy=live_sent")
    except Exception as exc:
        print(f"ntfy=live_failed:{exc}", file=sys.stderr)

if status == "needs_action" and not notified_action:
    body = f"Play paid NEEDS ACTION {pkg} signals={console_signals} {public}"
    try:
        ntfy("Hermes Play paid needs action", body, "high")
        state["notifiedNeedsActionAt"] = stamp
        print("ntfy=needs_action_sent")
    except Exception as exc:
        print(f"ntfy=needs_action_failed:{exc}", file=sys.stderr)

with open(state_path, "w") as f:
    json.dump(state, f, indent=2)
    f.write("\n")
PY
