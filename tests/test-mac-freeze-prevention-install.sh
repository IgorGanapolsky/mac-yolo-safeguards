#!/usr/bin/env bash
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
INSTALLER="$REPO/scripts/install-mac-freeze-prevention.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/freeze-install-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM
pass=0; fail=0
ok() { printf '  [PASS] %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  [FAIL] %s\n' "$1"; fail=$((fail + 1)); }

echo '=== mac freeze prevention installer tests ==='
if bash -n "$INSTALLER"; then ok "installer syntax is valid"; else bad "installer syntax is invalid"; fi

HOME="$TMP/home" MAC_FREEZE_INSTALL_SKIP_LAUNCHCTL=1 bash "$INSTALLER" > "$TMP/install.out"
HOME="$TMP/home" MAC_FREEZE_INSTALL_SKIP_LAUNCHCTL=1 bash "$INSTALLER" >> "$TMP/install.out"

for file in \
  "$TMP/home/.local/bin/sim-runaway-guard.sh" \
  "$TMP/home/.local/bin/memory-pressure-guardian.sh" \
  "$TMP/home/.hermes/hermes-gateway-watchdog.sh"; do
  if [ -f "$file" ] && [ -x "$file" ] && [ ! -L "$file" ]; then
    ok "regular executable installed at stable path: ${file#"$TMP/home/"}"
  else
    bad "missing, non-executable, or symlinked install: $file"
  fi
done

PLISTS="$TMP/home/Library/LaunchAgents"
if ! grep -E '/private/tmp|actions-runner/_work|--dry-run' "$PLISTS"/com.igor.*.plist >/dev/null; then
  ok "installed plists contain no runner/temp paths and no dry-run flag"
else
  bad "installed plists contain an unstable path or dry-run flag"
fi
if grep -A1 '<key>HERMES_PIN_MODEL</key>' "$PLISTS/com.igor.hermes-gateway-watchdog.plist" | grep -q '<string>0</string>' \
  && grep -A1 '<key>HERMES_WARMUP_COUNT</key>' "$PLISTS/com.igor.hermes-gateway-watchdog.plist" | grep -q '<string>0</string>'; then
  ok "gateway pin and warmup are disabled in the installed service"
else
  bad "installed gateway service can still force model residency"
fi
if grep -q "$TMP/home/.local/bin/memory-pressure-guardian.sh" "$PLISTS/com.igor.memory-pressure-guardian.plist"; then
  ok "memory guardian plist resolves to its durable installed copy"
else
  bad "memory guardian plist does not use the durable copy"
fi
if cmp -s "$REPO/scripts/memory-pressure-guardian.sh" "$TMP/home/.local/bin/memory-pressure-guardian.sh" \
  && cmp -s "$REPO/scripts/hermes-gateway-watchdog.sh" "$TMP/home/.hermes/hermes-gateway-watchdog.sh"; then
  ok "repeat installation is idempotent and byte-identical"
else
  bad "installed scripts differ from verified sources"
fi

echo
echo "=== $pass passed, $fail failed ==="
[ "$fail" -eq 0 ]
