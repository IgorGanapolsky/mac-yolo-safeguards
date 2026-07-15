#!/usr/bin/env bash
# Disable Chrome's background-app mode without touching live windows, helpers,
# profiles, extensions, or the Hermes CDP browsers.
set -euo pipefail

mode="status"
json=0
remote_host=""

usage() {
  cat <<'EOF'
Usage: scripts/configure-browser-efficiency.sh [--status|--apply] [--host SSH_HOST] [--json]

  --status       Report the current Chrome background-mode setting (default)
  --apply        Set BackgroundModeEnabled=false, then report the result
  --host HOST    Run on an explicit SSH host such as hermes-mini
  --json         Emit one secret-safe JSON object

This command never terminates browser processes and never reads browser
profiles, extensions, cookies, or session data.
EOF
}

while (($#)); do
  case "$1" in
    --status) mode="status" ;;
    --apply) mode="apply" ;;
    --host)
      shift
      [[ $# -gt 0 ]] || { echo "--host requires a value" >&2; exit 64; }
      remote_host="$1"
      ;;
    --json) json=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 64 ;;
  esac
  shift
done

if [[ -n "$remote_host" && ! "$remote_host" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Unsafe SSH host: $remote_host" >&2
  exit 64
fi

collect_script='set -euo pipefail
mode="$1"
defaults_bin="${BROWSER_EFFICIENCY_DEFAULTS_BIN:-defaults}"
pgrep_bin="${BROWSER_EFFICIENCY_PGREP_BIN:-pgrep}"
curl_bin="${BROWSER_EFFICIENCY_CURL_BIN:-curl}"
chrome_app="${BROWSER_EFFICIENCY_CHROME_APP:-/Applications/Google Chrome.app}"
domain="com.google.Chrome"

installed=false
[[ -d "$chrome_app" ]] && installed=true

before="$($defaults_bin read "$domain" BackgroundModeEnabled 2>/dev/null || echo unset)"
if [[ "$mode" == "apply" && "$installed" == "true" ]]; then
  "$defaults_bin" write "$domain" BackgroundModeEnabled -bool false
fi
after="$($defaults_bin read "$domain" BackgroundModeEnabled 2>/dev/null || echo unset)"

roots="$($pgrep_bin -f "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome($| )" 2>/dev/null | wc -l | tr -d " ")"
for port in 9222 9223; do
  state=down
  "$curl_bin" -fsS --max-time 2 "http://127.0.0.1:${port}/json/version" >/dev/null 2>&1 && state=ok
  printf "cdp%s=%s\n" "$port" "$state"
done
printf "installed=%s\n" "$installed"
printf "before=%s\n" "$before"
printf "after=%s\n" "$after"
printf "roots=%s\n" "${roots:-0}"
printf "hostname=%s\n" "$(hostname -s | tr -cd "A-Za-z0-9._-")"
'

if [[ -n "$remote_host" ]]; then
  ssh_bin="${BROWSER_EFFICIENCY_SSH_BIN:-ssh}"
  report="$($ssh_bin -o BatchMode=yes -o ConnectTimeout=8 "$remote_host" /bin/bash -s -- "$mode" <<<"$collect_script")"
  target="$remote_host"
else
  report="$(/bin/bash -s -- "$mode" <<<"$collect_script")"
  target="local"
fi

value() {
  local key="$1"
  printf '%s\n' "$report" | awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); print; exit }'
}

installed="$(value installed)"
before="$(value before)"
after="$(value after)"
roots="$(value roots)"
hostname_value="$(value hostname)"
cdp9222="$(value cdp9222)"
cdp9223="$(value cdp9223)"

if [[ "$mode" == "apply" && "$installed" == "true" && "$after" != "0" ]]; then
  echo "Failed to disable Chrome background mode on $target (after=$after)" >&2
  exit 1
fi

if ((json)); then
  printf '{"schema":"browser-efficiency/v1","action":"%s","target":"%s","hostname":"%s","chromeInstalled":%s,"backgroundModeBefore":"%s","backgroundModeAfter":"%s","chromeRootProcesses":%s,"cdp":{"9222":"%s","9223":"%s"},"processesTerminated":0,"profilesInspected":0}\n' \
    "$mode" "$target" "$hostname_value" "$installed" "$before" "$after" "${roots:-0}" "$cdp9222" "$cdp9223"
else
  printf 'Browser efficiency (%s) host=%s installed=%s background=%s->%s chrome_roots=%s cdp9222=%s cdp9223=%s processes_terminated=0 profiles_inspected=0\n' \
    "$mode" "$hostname_value" "$installed" "$before" "$after" "${roots:-0}" "$cdp9222" "$cdp9223"
fi

