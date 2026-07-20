#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/thumbgate-watchdog-test.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT

FAKE_CURL="$TMP/fake-curl"
cat >"$FAKE_CURL" <<'FAKE'
#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >>"${FAKE_CURL_LOG:?}"

mode="${FAKE_CURL_MODE:-healthy}"
format=""
dump_headers=0
follow=0
method=GET
args=("$@")
url="${args[${#args[@]}-1]}"
for ((index=0; index<${#args[@]}; index+=1)); do
  case "${args[$index]}" in
    -w) format="${args[$((index+1))]}" ;;
    -D) dump_headers=1 ;;
    -L) follow=1 ;;
    -X) method="${args[$((index+1))]}" ;;
  esac
done

if [[ "$url" == https://ntfy.sh/* ]]; then
  exit 0
fi

if [[ "$mode" == degraded ]]; then
  case "$format" in
    '%{http_code}|%{redirect_url}') printf '200|' ;;
    '%{http_code}|%{url_effective}') printf '404|https://api.workos.com/redirect-uri-invalid' ;;
    '%{http_code}')
      case "$url" in
        https://thumbgate.app|https://thumbgate.app/) printf '200' ;;
        https://igor-hermes-cloud-runner.fly.dev/health) printf '200' ;;
        *) printf '404' ;;
      esac
      ;;
    *)
      case "$url" in
        https://igor-hermes-cloud-runner.fly.dev/health) printf '{"degraded":true}' ;;
        *) printf '{"ok":false}' ;;
      esac
      ;;
  esac
  exit 0
fi

if (( dump_headers == 1 )); then
  printf 'HTTP/2 200\r\nStrict-Transport-Security: max-age=63072000; includeSubDomains; preload\r\n\r\n'
  exit 0
fi

case "$format" in
  '%{http_code}|%{redirect_url}')
    printf '308|https://thumbgate.app/'
    ;;
  '%{http_code}|%{url_effective}')
    if (( follow == 1 )); then
      printf '200|https://example.authkit.app/sign-in'
    fi
    ;;
  '%{http_code}')
    case "$url" in
      https://thumbgate.app|https://thumbgate.app/|https://app.thumbgate.app|https://app.thumbgate.app/) printf '200' ;;
      https://thumbgate.app/api/health|https://hermes-control-plane.iganapolsky.workers.dev/api/health) printf '200' ;;
      https://thumbgate.app/api/me) printf '401' ;;
      https://thumbgate.app/api/analytics/event)
        [[ "$method" == POST ]] && printf '204' || printf '405'
        ;;
      https://thumbgate.app/api/billing/webhook) printf '401' ;;
      https://igor-hermes-cloud-runner.fly.dev/health) printf '200' ;;
      *) printf '000' ;;
    esac
    ;;
  *)
    case "$url" in
      https://thumbgate.app/api/health)
        printf '{"ok":true,"database":"available","schema":"current","telemetry":{"analyticsLatestAt":1784584500000,"auditLatestAt":1784584400000,"deviceHeartbeatLatestAt":null,"billingEventLatestAt":1784584300000,"realBillingEventLatestAt":null}}'
        ;;
      https://igor-hermes-cloud-runner.fly.dev/health) printf '{"ok":true,"degraded":false}' ;;
      *) printf '{}';;
    esac
    ;;
esac
FAKE
chmod 700 "$FAKE_CURL"

run_watchdog() {
  FAKE_CURL_MODE="$1" \
  FAKE_CURL_LOG="$TMP/curl.log" \
  CURL_BIN="$FAKE_CURL" \
  SAAS_WATCHDOG_STATE="$TMP/state" \
  SAAS_WATCHDOG_LOG="$TMP/status.jsonl" \
  bash "$ROOT/saas/saas-watchdog.sh"
}

if run_watchdog degraded >/dev/null 2>&1; then
  echo "FAIL: degraded production surface returned success"
  exit 1
fi
grep -q '^degraded$' "$TMP/state"
grep -q '"status":"degraded"' "$TMP/status.jsonl"
grep -q 'Title: ThumbGate degraded' "$TMP/curl.log"

run_watchdog healthy
grep -q '^ok$' "$TMP/state"
grep -q '"status":"ok"' "$TMP/status.jsonl"
grep -q '"analyticsIngest":"204"' "$TMP/status.jsonl"
grep -q '"analyticsLatestAt":"1784584500000"' "$TMP/status.jsonl"
grep -q 'Title: ThumbGate recovered' "$TMP/curl.log"

echo "saas watchdog tests: degraded alert + healthy recovery + analytics readback PASS"
