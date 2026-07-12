#!/usr/bin/env bash
# Unit tests for tools/hermes-mobile-pair-lib.js — per-machine API key resolution.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/hermes-pair-test.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT INT TERM

pass=0; fail=0
G="\033[32m"; R="\033[31m"; Z="\033[0m"
ok()  { printf "  ${G}[PASS]${Z} %s\n" "$1"; pass=$((pass + 1)); }
bad() { printf "  ${R}[FAIL]${Z} %s\n" "$1"; fail=$((fail + 1)); }

BIN="$TMP/bin"
mkdir -p "$BIN" "$TMP/home/.hermes"

cat > "$BIN/ssh" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *hermes-mini* ]]; then
  echo "mini-key-from-ssh"
  exit 0
fi
exit 1
MOCK
chmod +x "$BIN/ssh"

echo 'API_SERVER_KEY=laptop-key-from-env' > "$TMP/home/.hermes/.env"

run_node() {
  HOME="$TMP/home" PATH="$BIN:$PATH" node -e "$1"
}

# Mac mini Tailscale URL must use SSH key, not laptop .env key
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const miniKey = lib.resolveApiKeyForGatewayUrl('http://100.94.135.78:8642', {
    hermesEnvPath: '$TMP/home/.hermes/.env',
    sshCommand: '$BIN/ssh',
  });
  if (miniKey !== 'mini-key-from-ssh') process.exit(1);
"; then
  ok "mini Tailscale URL resolves SSH key (not laptop .env)"
else
  bad "mini Tailscale URL resolves SSH key (not laptop .env)"
fi

# MacBook / non-mini URL keeps local .env key
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const laptopKey = lib.resolveApiKeyForGatewayUrl('http://100.87.85.85:8642', {
    hermesEnvPath: '$TMP/home/.hermes/.env',
    sshCommand: '$BIN/ssh',
  });
  if (laptopKey !== 'laptop-key-from-env') process.exit(1);
"; then
  ok "MacBook URL keeps local .env key"
else
  bad "MacBook URL keeps local .env key"
fi

# Pair script wires --mini-tailscale and extraKey (regression guard)
PAIR_JS="$(cat "$REPO/tools/hermes-mobile-pair.js")"
if [[ "$PAIR_JS" == *"--mini-tailscale"* ]] && [[ "$PAIR_JS" == *"extraKey"* ]] && [[ "$PAIR_JS" == *"hermes-mobile-pair-lib.js"* ]]; then
  ok "pair script exports mini-tailscale + extraKey contract"
else
  bad "pair script exports mini-tailscale + extraKey contract"
fi

# Deep link adb intent must single-quote URI so device shell does not split on &name=
if [[ "$PAIR_JS" == *"device shell splits"* ]] && [[ "$PAIR_JS" == *"single-quoted"* ]] && [[ "$PAIR_JS" == *"am start -a android.intent.action.VIEW -d"* ]]; then
  ok "pair adb deep link quotes URI for &name= params"
else
  bad "pair adb deep link quotes URI for &name= params"
fi

# Unattended session-start pairing must never expose the credential-bearing LAN server.
SESSION_START="$REPO/tools/agent-session-start.js"
if grep -Fq '`node "${pairScript}" --mini-tailscale --no-serve`' "$SESSION_START"; then
  ok "queued phone install pairs without serving on LAN"
else
  bad "queued phone install pairs without serving on LAN"
fi

if grep -Fq "pair = runNode('tools/hermes-mobile-pair.js', ['--no-serve'], 60_000);" "$SESSION_START"; then
  ok "ordinary session-start auto-pair does not serve on LAN"
else
  bad "ordinary session-start auto-pair does not serve on LAN"
fi

if grep -Fq "phoneInstall.reason === 'no-device'" "$SESSION_START" \
  && grep -Fq "emulator-only ADB is never paired" "$SESSION_START"; then
  ok "session-start does not inject owner pairing into an emulator-only ADB environment"
else
  bad "session-start does not inject owner pairing into an emulator-only ADB environment"
fi

# Default pairing must prefer tailnet IP (5G-safe), not LAN, when --gateway-url is omitted.
if [[ "$PAIR_JS" == *"localTailscaleIpv4"* ]] && [[ "$PAIR_JS" == *"5G/cellular-safe"* ]]; then
  ok "pair script prefers tailnet gateway URL for cellular"
else
  bad "pair script prefers tailnet gateway URL for cellular"
fi

DISCOVER_JS="$(cat "$REPO/tools/hermes-discover-tailscale-macs.js")"
if [[ "$DISCOVER_JS" == *"isPeerOnline"* ]] && [[ "$DISCOVER_JS" == *"Online !== false"* ]]; then
  ok "discover script skips offline tailnet peers"
else
  bad "discover script skips offline tailnet peers"
fi

printf "\nResults: %s passed, %s failed\n" "$pass" "$fail"
[[ "$fail" -eq 0 ]]
