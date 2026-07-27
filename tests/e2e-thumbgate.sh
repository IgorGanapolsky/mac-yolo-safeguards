#!/usr/bin/env bash
# End-to-end proof for the live thumbgate.app SaaS. Tests every layer against
# PRODUCTION. Exit 0 only if ALL pass. Run: bash tests/e2e-thumbgate.sh
set -uo pipefail
APP="https://thumbgate.app"
ALT="https://app.thumbgate.app"
WORKERS="https://hermes-control-plane.iganapolsky.workers.dev"
RUNNER="https://igor-hermes-cloud-runner.fly.dev/health"
pass=0; fail=0
ok(){ echo "  ✅ $1"; pass=$((pass+1)); }
no(){ echo "  ❌ $1"; fail=$((fail+1)); }
codeof(){ curl -s -m 15 -A "Mozilla/5.0" -o /dev/null -w '%{http_code}' "$1"; }

echo "── 1. Site reachable on the real domain (valid SSL) ──"
c=$(curl -s -m 15 -o /dev/null -w '%{http_code}:%{ssl_verify_result}' "$APP")
[ "${c%%:*}" = 200 ] && [ "${c##*:}" = 0 ] && ok "thumbgate.app 200 + valid SSL" || no "thumbgate.app ($c)"
[ "$(codeof "$ALT")" = 200 ] && ok "app.thumbgate.app 200" || no "app.thumbgate.app"
[ "$(codeof "$WORKERS")" = 200 ] && ok "workers.dev origin 200" || no "workers.dev"

echo "── 2. Sign-in (WorkOS Google/Apple) ──"
loc=$(curl -sI -m 15 "$APP/api/auth/login" | grep -i '^location:' | tr -d '\r')
{ echo "$loc" | grep -q 'workos.com' && echo "$loc" | grep -q 'client_01KY0305'; } \
  && ok "sign-in 302 -> WorkOS with correct client_id" || no "sign-in redirect ($loc)"

# Callback-allowlist gate: a 302->WorkOS is NOT proof sign-in works. If the callback
# URI isn't in the WorkOS Redirect URIs allowlist, WorkOS bounces the user to
# /redirect-uri-invalid and login is DEAD — yet the check above still passes. So we
# follow the WHOLE redirect chain and require it to land on the hosted sign-in page,
# NOT the invalid-redirect error. This is the gap that let a real break ship 9/9 green.
for base in "$APP" "$ALT"; do
  final=$(curl -sL -m 20 -A "Mozilla/5.0" -o /dev/null -w '%{url_effective}' "$base/api/auth/login")
  if echo "$final" | grep -q 'redirect-uri-invalid'; then
    no "$base callback REJECTED by WorkOS (not allowlisted): $final"
  elif echo "$final" | grep -Eq 'authkit\.app|workos\.com/(sso|user_management)'; then
    ok "$base callback allowlisted -> reaches AuthKit sign-in page"
  else
    no "$base sign-in chain ended unexpectedly: $final"
  fi
done

echo "── 3. API auth + validation gates ──"
[ "$(codeof "$APP/api/me")" = 401 ] && ok "/api/me 401 (auth required)" || no "/api/me"
[ "$(curl -s -m 12 -o /dev/null -w '%{http_code}' -X POST "$APP/api/pairing/start")" = 400 ] \
  && ok "/api/pairing/start 400 (input validated)" || no "/api/pairing/start"

echo "── 4. Failover runner healthy + connected ──"
rb=$(curl -s -m 15 "$RUNNER")
echo "$rb" | grep -q '"degraded":false' && ok "runner healthy (degraded=false)" || no "runner ($rb)"

echo "── 5. Billing: key valid + price purchasable ──"
SK="$(security find-generic-password -a hermes-fleet -s STRIPE_SECRET_KEY -w 2>/dev/null)"
PID="$(security find-generic-password -a hermes-fleet -s STRIPE_PRICE_ID -w 2>/dev/null)"
[ "$(curl -s -m 12 -H "Authorization: Bearer $SK" -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/balance)" = 200 ] \
  && ok "Stripe key valid" || no "Stripe key"
cs=$(curl -s -m 15 https://api.stripe.com/v1/checkout/sessions -H "Authorization: Bearer $SK" \
  -d mode=subscription -d "line_items[0][price]=$PID" -d "line_items[0][quantity]=1" \
  -d "success_url=$APP/dashboard" -d "cancel_url=$APP/" | python3 -c "import json,sys;print(json.load(sys.stdin).get('url','ERR'))")
case "$cs" in https://checkout.stripe.com/*) ok "subscription checkout session creates (live URL)";; *) no "checkout ($cs)";; esac

echo ""
echo "═══ E2E: $pass passed, $fail failed ═══"
[ "$fail" -eq 0 ]
