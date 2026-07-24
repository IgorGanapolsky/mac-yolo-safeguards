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
# Match host from URL (100.94.135.78) or legacy hermes-mini alias
if [[ "$*" == *hermes-mini* || "$*" == *100.94.135.78* || "$*" == *mac-mini* ]]; then
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

# Strict mini: SSH failure must NOT fall back to laptop key (fresh-install Wrong key class)
cat > "$BIN/ssh-fail" <<'MOCK'
#!/usr/bin/env bash
exit 1
MOCK
chmod +x "$BIN/ssh-fail"
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  try {
    lib.resolveApiKeyForGatewayUrl('http://100.94.135.78:8642', {
      hermesEnvPath: '$TMP/home/.hermes/.env',
      sshCommand: '$BIN/ssh-fail',
    });
    process.exit(1);
  } catch (err) {
    if (err.code !== 'MINI_KEY_UNAVAILABLE') process.exit(2);
  }
"; then
  ok "mini SSH failure refuses laptop key fallback (strict)"
else
  bad "mini SSH failure refuses laptop key fallback (strict)"
fi

# Explicit dogfood override still allows local fallback
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const key = lib.resolveApiKeyForGatewayUrl('http://100.94.135.78:8642', {
    hermesEnvPath: '$TMP/home/.hermes/.env',
    sshCommand: '$BIN/ssh-fail',
    allowLocalKeyFallback: true,
  });
  if (key !== 'laptop-key-from-env') process.exit(1);
"; then
  ok "allowLocalKeyFallback still works for intentional dogfood"
else
  bad "allowLocalKeyFallback still works for intentional dogfood"
fi

# P0 2026-07-16: identical fleet keys (mini SSH === laptop .env) must stay embeddable
if run_node "
  const fs = require('fs');
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  fs.writeFileSync('$TMP/home/.hermes/.env', 'API_SERVER_KEY=mini-key-from-ssh\\n');
  const local = lib.readLocalApiKey('$TMP/home/.hermes/.env');
  const classified = lib.classifyMiniApiKeyResolution(local, { sshCommand: '$BIN/ssh' });
  if (!classified.ok || classified.source !== 'ssh' || !classified.syncedWithLocal) process.exit(1);
  if (classified.apiKey !== 'mini-key-from-ssh') process.exit(2);
  // Restore distinct laptop key for later tests
  fs.writeFileSync('$TMP/home/.hermes/.env', 'API_SERVER_KEY=laptop-key-from-env\\n');
"; then
  ok "identical mini/laptop keys classify as SSH success (not cleared)"
else
  bad "identical mini/laptop keys classify as SSH success (not cleared)"
fi

# USB reverse adb deep-link pairServer prefers loopback; Camera/HTTP uses Tailscale.
if grep -q "127.0.0.1:\${PAIR_PORT}" "$REPO/tools/hermes-mobile-pair.js" \
  && grep -q 'adbPairExchangeBase' "$REPO/tools/hermes-mobile-pair.js" \
  && grep -q 'resolvePhoneReachablePairServerUrl' "$REPO/tools/hermes-mobile-pair.js"; then
  ok "pair script splits adb loopback vs Camera/HTTP Tailscale pairServer"
else
  bad "pair script splits adb loopback vs Camera/HTTP Tailscale pairServer"
fi

# Camera/HTTP remints must not redeem against LAN when Tailscale IP exists.
if grep -q 'resolveLiveMintPairServerUrl' "$REPO/tools/hermes-mobile-pair.js" \
  && grep -q 'Stale seed often stores LAN while Camera QR already uses Tailscale' "$REPO/tools/hermes-mobile-pair.js" \
  && grep -q 'Pair exchange (Camera/HTTP)' "$REPO/tools/hermes-mobile-pair.js"; then
  ok "live mint upgrades LAN pairServer to Tailscale for Camera QR redeem"
else
  bad "live mint upgrades LAN pairServer to Tailscale for Camera QR redeem"
fi

# --open must prefer live HTTP over file://
if grep -q 'Prefer live HTTP (Tailscale/LAN) over file://' "$REPO/tools/hermes-mobile-pair.js" \
  && grep -q 'const openTarget = pageUrl || htmlPath' "$REPO/tools/hermes-mobile-pair.js"; then
  ok "pair --open launches live HTTP pair page not file://"
else
  bad "pair --open launches live HTTP pair page not file://"
fi

# Host/key consistency: never bind mini key to USB/local URL
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const result = lib.assertHostKeyConsistency(
    [
      { gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'mini-key-from-ssh' },
      { gatewayUrl: 'http://100.94.135.78:8642', apiKey: 'mini-key-from-ssh' },
    ],
    { localKey: 'laptop-key-from-env', miniKey: 'mini-key-from-ssh' },
  );
  if (result.ok) process.exit(1);
  if (!result.errors.includes('local_or_usb_url_bound_to_mini_key')) process.exit(2);
"; then
  ok "consistency rejects USB/local URL bound to mini key"
else
  bad "consistency rejects USB/local URL bound to mini key"
fi

# Host/key consistency: never bind laptop key to mini when fleet keys differ
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const result = lib.assertHostKeyConsistency(
    [
      { gatewayUrl: 'http://100.87.85.85:8642', apiKey: 'laptop-key-from-env' },
      { gatewayUrl: 'http://100.94.135.78:8642', apiKey: 'laptop-key-from-env' },
    ],
    { localKey: 'laptop-key-from-env', miniKey: 'mini-key-from-ssh' },
  );
  if (result.ok) process.exit(1);
  if (!result.errors.includes('mini_url_bound_to_laptop_key')) process.exit(2);
"; then
  ok "consistency rejects mini URL bound to laptop key"
else
  bad "consistency rejects mini URL bound to laptop key"
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

# Loopback/USB classifies as loopback and uses local key
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  if (lib.classifyGatewayHost('http://127.0.0.1:8642') !== 'loopback') process.exit(1);
  const key = lib.resolveApiKeyForGatewayUrl('http://127.0.0.1:8642', {
    hermesEnvPath: '$TMP/home/.hermes/.env',
  });
  if (key !== 'laptop-key-from-env') process.exit(2);
"; then
  ok "USB loopback binds local Mac key (not mini)"
else
  bad "USB loopback binds local Mac key (not mini)"
fi

if run_node "
  const { selectPhysicalAdbSerial } = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const output = 'List of devices attached\\nemulator-5554\\tdevice product:sdk_gphone\\n';
  if (selectPhysicalAdbSerial(output) !== null) process.exit(1);
"; then
  ok "emulator-only ADB is never selected for private pairing"
else
  bad "emulator-only ADB is never selected for private pairing"
fi

if run_node "
  const { selectPhysicalAdbSerial } = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const output = 'List of devices attached\\nemulator-5554\\tdevice\\nphysical-1234\\tdevice usb:1\\n';
  if (selectPhysicalAdbSerial(output) !== 'physical-1234') process.exit(1);
"; then
  ok "physical phone wins when an emulator is also attached"
else
  bad "physical phone wins when an emulator is also attached"
fi

# Pair script wires --mini-tailscale and extraKey (regression guard)
PAIR_JS="$(cat "$REPO/tools/hermes-mobile-pair.js")"
LIB_JS="$(cat "$REPO/tools/hermes-mobile-pair-lib.js")"
if [[ "$PAIR_JS" == *"--mini-tailscale"* ]] && [[ "$PAIR_JS" == *"extraKey"* ]] && [[ "$PAIR_JS" == *"hermes-mobile-pair-lib.js"* ]]; then
  ok "pair script exports mini-tailscale + extraKey contract"
else
  bad "pair script exports mini-tailscale + extraKey contract"
fi

# Never push an unverified / foreign key onto the phone (2026-07-14 Wrong key after fresh install)
if [[ "$PAIR_JS" == *"verifyGatewayAuthSync"* ]] && [[ "$PAIR_JS" == *"buildVerifiedExtraComputer"* ]] && [[ "$PAIR_JS" == *"Refusing to pair"* ]]; then
  ok "pair refuses deep link without verified /api/sessions 200"
else
  bad "pair refuses deep link without verified /api/sessions 200"
fi

if [[ "$PAIR_JS" == *"127.0.0.1:8642"* ]] && [[ "$PAIR_JS" == *"USB pairing: primary URL"* || "$PAIR_JS" == *"loopback primary"* ]]; then
  ok "USB pair prefers adb-reverse loopback when auth verifies"
else
  bad "USB pair prefers adb-reverse loopback when auth verifies"
fi

PAIR_LIB="$(cat "$REPO/tools/hermes-mobile-pair-lib.js")"
if [[ "$PAIR_LIB" == *"USB_ADB_REVERSE_PORTS"* ]] \
  && [[ "$PAIR_LIB" == *"setupUsbAdbReverses"* ]] \
  && [[ "$PAIR_LIB" == *"assertUsbAdbReverses"* ]]; then
  ok "pair-lib exports USB adb reverse helpers (8642 + 8765)"
else
  bad "pair-lib exports USB adb reverse helpers (8642 + 8765)"
fi

if [[ "$PAIR_JS" == *"setupUsbAdbReverses(serial, { ports: usbReversePorts })"* ]] \
  && [[ "$PAIR_JS" == *"assertUsbAdbReverses(serial, { requiredPorts: usbReversePorts })"* ]] \
  && [[ "$PAIR_JS" == *"tcp:8765 missing"* ]] \
  && [[ "$PAIR_JS" == *"pair.json sweep"* ]]; then
  ok "USB pair always reverses tcp:8765 (--no-serve still needs pair.json tunnel)"
else
  bad "USB pair always reverses tcp:8765 (--no-serve still needs pair.json tunnel)"
fi

# --- 2026-07-24: install-phone-release.sh auto-pair must not clobber a mini-primary/
#     explicit-gateway session by blindly re-adding tcp:8642 to THIS Mac's loopback ------

if [[ "$PAIR_LIB" == *"function resolveUsbReversePorts"* ]] \
  && [[ "$PAIR_LIB" == *"function removeUsbAdbReverse"* ]]; then
  ok "pair-lib exports resolveUsbReversePorts + removeUsbAdbReverse (8642 hijack guard)"
else
  bad "pair-lib exports resolveUsbReversePorts + removeUsbAdbReverse (8642 hijack guard)"
fi

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const defaultPorts = lib.resolveUsbReversePorts({});
  if (JSON.stringify(defaultPorts) !== JSON.stringify([8642, 8765])) process.exit(1);
  const forced = lib.resolveUsbReversePorts({ forceMiniUsbPrimary: true });
  if (forced.includes(8642) || !forced.includes(8765)) process.exit(2);
  const tunneled = lib.resolveUsbReversePorts({ explicitGatewayUrl: 'http://127.0.0.1:18642' });
  if (tunneled.includes(8642) || !tunneled.includes(8765)) process.exit(3);
  const explicitDefault = lib.resolveUsbReversePorts({ explicitGatewayUrl: 'http://127.0.0.1:8642' });
  if (!explicitDefault.includes(8642)) process.exit(4);
  const remote = lib.resolveUsbReversePorts({ explicitGatewayUrl: 'http://100.94.135.78:8642' });
  if (!remote.includes(8642)) process.exit(5);
"; then
  ok "resolveUsbReversePorts drops tcp:8642 only for mini-primary/non-default loopback gateways"
else
  bad "resolveUsbReversePorts drops tcp:8642 only for mini-primary/non-default loopback gateways"
fi

if [[ "$PAIR_JS" == *"usbReverseSkipped8642"* ]] \
  && [[ "$PAIR_JS" == *"removeUsbAdbReverse(serial, 8642)"* ]] \
  && [[ "$PAIR_JS" == *"not clobbering with laptop loopback"* ]]; then
  ok "pair script removes a stale tcp:8642 reverse when skipping it for mini-primary"
else
  bad "pair script removes a stale tcp:8642 reverse when skipping it for mini-primary"
fi

INSTALL_SH="$(cat "$REPO/hermes-mobile/scripts/install-phone-release.sh")"
if [[ "$INSTALL_SH" == *"HERMES_PAIR_GATEWAY_URL"* ]] \
  && [[ "$INSTALL_SH" == *"HERMES_FORCE_MINI_USB_PRIMARY"* ]] \
  && [[ "$INSTALL_SH" == *'PAIR_ARGS+=(--gateway-url="${HERMES_PAIR_GATEWAY_URL}")'* ]] \
  && [[ "$INSTALL_SH" == *'PAIR_ARGS+=(--force-mini-usb-primary)'* ]]; then
  ok "install-phone-release.sh auto-pair propagates mini-primary/explicit gateway intent"
else
  bad "install-phone-release.sh auto-pair propagates mini-primary/explicit gateway intent"
fi

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  if (!Array.isArray(lib.USB_ADB_REVERSE_PORTS)) process.exit(1);
  if (!lib.USB_ADB_REVERSE_PORTS.includes(8642)) process.exit(2);
  if (!lib.USB_ADB_REVERSE_PORTS.includes(8765)) process.exit(3);
"; then
  ok "USB adb reverse port list includes 8642 and 8765"
else
  bad "USB adb reverse port list includes 8642 and 8765"
fi

cat > "$BIN/ssh-fail" <<'MOCK'
#!/usr/bin/env bash
exit 1
MOCK
chmod +x "$BIN/ssh-fail"
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const empty = lib.resolveApiKeyForGatewayUrl('http://100.94.135.78:8642', {
    hermesEnvPath: '$TMP/home/.hermes/.env',
    sshCommand: '$BIN/ssh-fail',
    fallbackLocal: false,
  });
  if (empty !== '') process.exit(1);
"; then
  ok "mini URL with fallbackLocal:false never returns laptop key"
else
  bad "mini URL with fallbackLocal:false never returns laptop key"
fi

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const auth = lib.verifyGatewayAuthSync('http://example.invalid:8642', 'k', {
    fetchImpl: () => ({ ok: false, status: 401, reason: 'wrong_key' }),
  });
  if (auth.ok || auth.reason !== 'wrong_key') process.exit(1);
  const good = lib.verifyGatewayAuthSync('http://example.invalid:8642', 'k', {
    fetchImpl: () => ({ ok: true, status: 200, reason: 'ok' }),
  });
  if (!good.ok) process.exit(1);
  const red = lib.redactDeepLinkSecrets(
    'hermes://setup?key=super-secret-key-value&extraKey=other-secret-key-xx',
    ['super-secret-key-value', 'other-secret-key-xx'],
  );
  if (red.includes('super-secret-key-value') || red.includes('other-secret-key-xx')) process.exit(1);
"; then
  ok "auth verify + deep-link secret redaction helpers"
else
  bad "auth verify + deep-link secret redaction helpers"
fi

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const skipped = lib.buildVerifiedExtraComputer(
    { gatewayUrl: 'http://100.94.135.78:8642', name: 'mini' },
    {
      hermesEnvPath: '$TMP/home/.hermes/.env',
      sshCommand: '$BIN/ssh-fail',
      fetchImpl: () => ({ ok: false, status: 401, reason: 'wrong_key' }),
    },
  );
  if (!skipped || !skipped.skipped) process.exit(1);
  const okExtra = lib.buildVerifiedExtraComputer(
    { gatewayUrl: 'http://100.94.135.78:8642', name: 'mini', apiKey: 'mini-key' },
    { fetchImpl: () => ({ ok: true, status: 200, reason: 'ok' }) },
  );
  if (!okExtra || okExtra.skipped || okExtra.apiKey !== 'mini-key') process.exit(1);
"; then
  ok "extras only when auth verifies; skip foreign keys"
else
  bad "extras only when auth verifies; skip foreign keys"
fi
# Deep link adb intent must single-quote URI so device shell does not split on &name=
if [[ "$PAIR_JS" == *"device shell splits"* ]] && [[ "$PAIR_JS" == *"single-quoted"* ]] && [[ "$PAIR_JS" == *"am start -a android.intent.action.VIEW -d"* ]]; then
  ok "pair adb deep link quotes URI for &name= params"
else
  bad "pair adb deep link quotes URI for &name= params"
fi

# Unattended session-start pairing must never expose the credential-bearing LAN server,
# but phone-install MUST still adb-apply mini Tailscale (--force-mini-usb-primary).
SESSION_START="$REPO/tools/agent-session-start.js"
if grep -Fq '`node "${pairScript}" --mini-tailscale --force-mini-usb-primary --no-serve`' "$SESSION_START"; then
  ok "queued phone install pairs mini Tailscale without serving on LAN"
else
  bad "queued phone install pairs mini Tailscale without serving on LAN"
fi

if grep -Fq "!forceMiniUsbPrimary" "$REPO/tools/hermes-mobile-pair.js" \
  && grep -Fq "forceMiniUsbPrimary" "$REPO/tools/hermes-mobile-pair.js"; then
  ok "force-mini-usb-primary still applies adb under --mini-tailscale --no-serve"
else
  bad "force-mini-usb-primary still applies adb under --mini-tailscale --no-serve"
fi

if grep -Fq "pair = runNode('tools/hermes-mobile-pair.js', ['--no-serve'], 90_000);" "$SESSION_START" \
  || grep -Fq "pair = runNode('tools/hermes-mobile-pair.js', ['--no-serve'], 60_000);" "$SESSION_START"; then
  ok "ordinary session-start auto-pair does not serve on LAN"
else
  bad "ordinary session-start auto-pair does not serve on LAN"
fi

if grep -Fq "auto-pair: FAILED" "$SESSION_START" \
  && grep -Fq "Refuse ready claim" "$SESSION_START"; then
  ok "session-start fails closed when pair exits non-zero with phone present"
else
  bad "session-start fails closed when pair exits non-zero with phone present"
fi

if grep -Fq "phoneInstall.reason === 'no-device'" "$SESSION_START" \
  && grep -Fq "emulator-only ADB is never paired" "$SESSION_START"; then
  ok "session-start does not inject owner pairing into an emulator-only ADB environment"
else
  bad "session-start does not inject owner pairing into an emulator-only ADB environment"
fi

enable_line="$(grep -nF "['enable', domain]" "$SESSION_START" | head -1 | cut -d: -f1 || true)"
submit_line="$(grep -nF 'const submit = spawnSync(' "$SESSION_START" | head -1 | cut -d: -f1 || true)"
if grep -Fq 'const domain = `gui/${uid}/${label}`;' "$SESSION_START" \
  && grep -Fq '`launchctl remove "${label}"`' "$SESSION_START" \
  && [[ "$enable_line" =~ ^[0-9]+$ ]] \
  && [[ "$submit_line" =~ ^[0-9]+$ ]] \
  && (( enable_line < submit_line )); then
  ok "session-start re-enables and self-removes its true one-shot phone job"
else
  bad "session-start re-enables and self-removes its true one-shot phone job"
fi

cat > "$BIN/launchctl" <<'MOCK'
#!/usr/bin/env bash
if [[ "$1" == "print" && "$2" == gui/*/com.igor.hermes-phone-install-once.* ]]; then
  printf 'state = spawn scheduled\n'
  exit 0
fi
exit 1
MOCK
chmod +x "$BIN/launchctl"
if run_node "
  const { phoneInstallLaunchJobRunning } = require('$REPO/tools/agent-phone-pipeline-lock.js');
  if (!phoneInstallLaunchJobRunning()) process.exit(1);
"; then
  ok "scheduled phone job blocks a duplicate submit before running"
else
  bad "scheduled phone job blocks a duplicate submit before running"
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

# --- T-330 prevent-recurrence: serialized pairing handshake ------------------------------

# Foreground-ack parser and waiter must be pure/testable (no live adb needed).
if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  if (!lib.isAppForegroundOutput('mCurrentFocus=Window{x com.iganapolsky.hermesmobile/.MainActivity}')) process.exit(1);
  if (lib.isAppForegroundOutput('mCurrentFocus=Window{x com.android.launcher3/.Launcher}')) process.exit(2);
  const okAck = lib.waitForForegroundAck('s1', lib.ANDROID_PACKAGE_NAME, {
    timeoutMs: 1000, pollIntervalMs: 50,
    execImpl: () => 'mCurrentFocus=Window{x com.iganapolsky.hermesmobile/.MainActivity}',
    sleepImpl: () => {},
  });
  if (!okAck.ok) process.exit(3);
  const timedOut = lib.waitForForegroundAck('s1', lib.ANDROID_PACKAGE_NAME, {
    timeoutMs: 150, pollIntervalMs: 50,
    execImpl: () => 'mCurrentFocus=Window{x com.android.launcher3/.Launcher}',
    sleepImpl: () => {},
  });
  if (timedOut.ok) process.exit(4);
"; then
  ok "foreground-ack waiter confirms app resumed and bounds the timeout"
else
  bad "foreground-ack waiter confirms app resumed and bounds the timeout"
fi

# Pair script must NOT fire the setup + dev-unlock intents back-to-back with no ack wait.
if [[ "$PAIR_JS" == *"waitForForegroundAck"* ]] \
  && [[ "$PAIR_JS" == *"Serialized handshake"* ]] \
  && [[ "$PAIR_JS" == *"--no-dev-unlock"* ]]; then
  ok "pair script serializes setup ack before the optional secondary intent"
else
  bad "pair script serializes setup ack before the optional secondary intent"
fi

# --- T-330 prevent-recurrence: secretless one-time pairing code --------------------------

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const store = lib.createPairingCodeStore();
  const code = lib.putPairingCode(store, { gatewayUrl: 'http://127.0.0.1:8642', apiKey: 'super-secret' });
  if (typeof code !== 'string' || code.length < 6) process.exit(1);
  const first = lib.takePairingCode(store, code);
  if (!first.ok || first.payload.apiKey !== 'super-secret') process.exit(2);
  const second = lib.takePairingCode(store, code);
  if (second.ok) process.exit(3); // single-use: must fail on replay
  const missing = lib.takePairingCode(store, 'NOPE0000');
  if (missing.ok) process.exit(4);
"; then
  ok "pairing code is single-use and rejects replay/unknown codes"
else
  bad "pairing code is single-use and rejects replay/unknown codes"
fi

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const store = lib.createPairingCodeStore();
  const code = lib.putPairingCode(store, { apiKey: 'x' }, { ttlMs: 1 });
  const later = Date.now() + 50;
  while (Date.now() < later) { /* burn past ttl */ }
  const result = lib.takePairingCode(store, code);
  if (result.ok || result.reason !== 'expired') process.exit(1);
"; then
  ok "pairing code expires after its TTL"
else
  bad "pairing code expires after its TTL"
fi

# Deep link must never embed the raw key when a pair server will actually run.
if [[ "$PAIR_JS" == *"secretlessPairing"* ]] \
  && [[ "$PAIR_JS" == *"buildSecretlessDeepLink"* ]] \
  && [[ "$PAIR_JS" == *"/pair-exchange"* ]] \
  && [[ "$PAIR_JS" == *"mintPairingCode"* ]]; then
  ok "pair script mints a secretless code+pairServer deep link when serving"
else
  bad "pair script mints a secretless code+pairServer deep link when serving"
fi

if [[ "$LIB_JS" == *"never as a query-string argument"* ]] || [[ "$LIB_JS" == *"land in adb logs"* ]]; then
  ok "secretless pairing code documents why raw keys are never in deep-link args"
else
  bad "secretless pairing code documents why raw keys are never in deep-link args"
fi

# --- P0 2026-07-14: --mini-tailscale must never hijack a phone USB-cabled to THIS Mac ----

if [[ "$PAIR_JS" == *"usbHijackGuardTripped"* ]] \
  && [[ "$PAIR_JS" == *"--force-mini-usb-primary"* ]] \
  && [[ "$PAIR_JS" == *"refusing to make mini the USB primary"* ]]; then
  ok "pair script guards --mini-tailscale against live USB-cabled Mac hijack"
else
  bad "pair script guards --mini-tailscale against live USB-cabled Mac hijack"
fi

if grep -Fq "usbHijackGuardTripped ||" "$REPO/tools/hermes-mobile-pair.js" \
  && grep -Fq "args.has('--no-serve') && args.has('--mini-tailscale') && !forceMiniUsbPrimary" "$REPO/tools/hermes-mobile-pair.js"; then
  ok "pair.json write + adb push gated on USB hijack guard; force-mini overrides no-serve skip"
else
  bad "pair.json write + adb push gated on USB hijack guard; force-mini overrides no-serve skip"
fi

# P0 2026-07-21: file:// pair page must embed QR (Chrome often fails sibling PNG loads),
# and loopback/USB must not claim "same Wi‑Fi" as the primary instruction.
if [[ "$PAIR_JS" == *'data:image/png;base64,'* ]] \
  && [[ "$PAIR_JS" == *'USB cable pairing auto-opens Hermes'* || "$PAIR_JS" == *'USB cable: Hermes opens automatically'* ]] \
  && [[ "$PAIR_JS" == *'USB gateway'* ]] \
  && [[ "$PAIR_JS" == *'isLoopbackGatewayUrl(gatewayUrl)'* ]] \
  && [[ "$PAIR_JS" == *'file://'* ]]; then
  ok "pair page embeds QR data URL + USB-first copy for loopback gateways"
else
  bad "pair page embeds QR data URL + USB-first copy for loopback gateways"
fi

# Camera QR must encode the HTTP pair page (never a stale hermes:// pairCode).
if [[ "$PAIR_JS" == *"resolveCameraPageUrl"* ]] \
  && [[ "$PAIR_JS" == *"const qrPayload = cameraPageUrl"* ]] \
  && [[ "$PAIR_JS" == *"mintLivePairSession"* ]] \
  && [[ "$PAIR_JS" == *"/pair-live.json"* ]]; then
  ok "Camera QR points at HTTP /pair; live mint regenerates codes"
else
  bad "Camera QR points at HTTP /pair; live mint regenerates codes"
fi


if [[ "$PAIR_JS" == *'Stock Camera cannot open hermes://'* || "$PAIR_JS" == *'Stock Android Camera cannot open hermes://'* ]] \
  && [[ "$PAIR_JS" == *'Tailscale'* ]] \
  && [[ "$PAIR_JS" == *'USB cable'* ]]; then
  ok "USB copy explains Tailscale Camera path + USB cable primary"
else
  bad "USB copy explains Tailscale Camera path + USB cable primary"
fi

# --server-only refresh must not clobber a live USB loopback primary with Tailscale.
if [[ "$PAIR_JS" == *"keeping USB loopback primary"* ]] \
  && [[ "$PAIR_JS" == *"usbReverseLive"* ]]; then
  ok "server-only refresh preserves USB loopback when adb reverse is live"
else
  bad "server-only refresh preserves USB loopback when adb reverse is live"
fi

# --server-only must persist secretless pairCode in pair.json (watchdog /pair.json contract).
if [[ "$PAIR_JS" == *"buildSecretlessDeepLink(minted.code, phonePairServer"* ]] \
  && [[ "$PAIR_JS" == *"pairCode)"* ]] \
  && [[ "$PAIR_JS" == *"function refreshPairAssetsFromLocalGateway"* ]]; then
  ok "server-only refresh writes secretless pairCode into pair.json"
else
  bad "server-only refresh writes secretless pairCode into pair.json"
fi

# --- T-PAIR-CODE-TTL: display TTL + refresh so QR never shows a dead single-use code ----

if [[ "$LIB_JS" == *"PAIRING_CODE_DISPLAY_TTL_MS"* ]] \
  && [[ "$LIB_JS" == *"PAIRING_CODE_REFRESH_MS"* ]] \
  && [[ "$LIB_JS" == *"pairingCodeRemainingMs"* ]]; then
  ok "pair-lib exports display TTL + refresh constants"
else
  bad "pair-lib exports display TTL + refresh constants"
fi

if run_node "
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  if (lib.PAIRING_CODE_TTL_MS !== 120_000) process.exit(1);
  if (lib.PAIRING_CODE_DISPLAY_TTL_MS < 15 * 60_000) process.exit(2);
  if (lib.PAIRING_CODE_REFRESH_MS !== 60_000) process.exit(3);
  const store = lib.createPairingCodeStore();
  const frozen = Date.now();
  const code = lib.putPairingCode(store, { apiKey: 'x' }, {
    ttlMs: lib.PAIRING_CODE_DISPLAY_TTL_MS,
    now: () => frozen,
  });
  const entry = store.get(code);
  const remaining = lib.pairingCodeRemainingMs(entry, frozen + 30_000);
  if (remaining !== lib.PAIRING_CODE_DISPLAY_TTL_MS - 30_000) process.exit(4);
  // Still single-use after long display TTL.
  const first = lib.takePairingCode(store, code);
  if (!first.ok) process.exit(5);
  const second = lib.takePairingCode(store, code);
  if (second.ok) process.exit(6);
"; then
  ok "display TTL is ≥15m, refresh is 60s, and codes stay single-use"
else
  bad "display TTL is ≥15m, refresh is 60s, and codes stay single-use"
fi

if [[ "$PAIR_JS" == *"PAIRING_CODE_DISPLAY_TTL_MS"* ]] \
  && [[ "$PAIR_JS" == *"Code expires in"* ]] \
  && [[ "$PAIR_JS" == *"Refreshing pairing code"* ]] \
  && [[ "$PAIR_JS" == *"savePairSeed"* ]] \
  && [[ "$PAIR_JS" == *"fresh mint"* ]]; then
  ok "pair page labels remaining TTL and remints from pair-seed"
else
  bad "pair page labels remaining TTL and remints from pair-seed"
fi

if run_node "
  const fs = require('fs');
  const src = fs.readFileSync('$REPO/tools/hermes-mobile-pair.js', 'utf8');
  // Contract: mintPairingCode returns { code, expiresAt } and adb path uses .code
  if (!src.includes('minted.code')) process.exit(1);
  if (!src.includes('ttlMs: PAIRING_CODE_DISPLAY_TTL_MS')) process.exit(2);
  if (!src.includes('Never bake a stale single-use code')) process.exit(3);
  // Two consecutive logical mints must produce different codes (fresh each open).
  const lib = require('$REPO/tools/hermes-mobile-pair-lib.js');
  const store = lib.createPairingCodeStore();
  const a = lib.putPairingCode(store, { apiKey: 'a' }, { ttlMs: lib.PAIRING_CODE_DISPLAY_TTL_MS });
  const b = lib.putPairingCode(store, { apiKey: 'b' }, { ttlMs: lib.PAIRING_CODE_DISPLAY_TTL_MS });
  if (a === b) process.exit(4);
"; then
  ok "adb/open path mints a fresh display-TTL code each time"
else
  bad "adb/open path mints a fresh display-TTL code each time"
fi

printf "\nResults: %s passed, %s failed\n" "$pass" "$fail"
[[ "$fail" -eq 0 ]]
