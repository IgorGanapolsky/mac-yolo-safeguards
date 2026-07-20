#!/usr/bin/env bash
# Live smoke test for the deployed Hermes Control Plane at thumbgate.app.
# Asserts the public surface a brand-new visitor hits: apex, www redirect,
# WorkOS login redirect, and unauthenticated checkout rejection.
# Exits non-zero on the first failed assertion so CI/launchd can alert.
set -u

HOST="thumbgate.app"
RESOLVER="1.1.1.1"
FAILS=0

resolve_ip() {
  dig +short "$1" A @"$RESOLVER" | head -1
}

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == $expected ]]; then
    echo "PASS  $label ($actual)"
  else
    echo "FAIL  $label — expected '$expected', got '$actual'"
    FAILS=$((FAILS + 1))
  fi
}

APEX_IP="$(resolve_ip "$HOST")"
WWW_IP="$(resolve_ip "www.$HOST")"

check "apex DNS resolves" "[0-9]*.*" "${APEX_IP:-}"
check "www DNS resolves" "[0-9]*.*" "${WWW_IP:-}"

if [[ -n "$APEX_IP" ]]; then
  code=$(curl -sS -o /dev/null -m 20 -w "%{http_code}" --resolve "$HOST:443:$APEX_IP" "https://$HOST/")
  check "apex landing page 200" "200" "$code"

  redirect=$(curl -sS -o /dev/null -m 20 -w "%{redirect_url}" --resolve "$HOST:443:$APEX_IP" "https://$HOST/api/auth/login")
  check "login redirects to WorkOS" "https://api.workos.com/*" "$redirect"

  code=$(curl -sS -o /dev/null -m 20 -w "%{http_code}" -X POST --resolve "$HOST:443:$APEX_IP" "https://$HOST/api/billing/checkout")
  check "unauthenticated checkout rejected" "401" "$code"
fi

if [[ -n "$WWW_IP" ]]; then
  code=$(curl -sS -o /dev/null -m 20 -w "%{http_code}" --resolve "www.$HOST:443:$WWW_IP" "https://www.$HOST/")
  redirect=$(curl -sS -o /dev/null -m 20 -w "%{redirect_url}" --resolve "www.$HOST:443:$WWW_IP" "https://www.$HOST/")
  check "www redirects to apex" "https://$HOST/*" "$redirect"
  check "www redirect is 301" "301" "$code"
fi

if [[ $FAILS -gt 0 ]]; then
  echo "SMOKE FAILED: $FAILS assertion(s)"
  exit 1
fi
echo "SMOKE OK: all assertions passed"
