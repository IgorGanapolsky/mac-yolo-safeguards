#!/usr/bin/env node
'use strict';

/**
 * Zero-friction Hermes Mobile pairing from Mac:
 * - LAN HTTP server on :8765 (phone camera scans http://LAN:8765/pair)
 * - hermes://setup deep link + optional adb intent
 *
 * Usage: node tools/hermes-mobile-pair.js [--no-adb] [--no-serve] [--open]
 *   [--mini-tailscale] fetches the mini's key/health for programmatic use; if a phone is
 *     verifiably USB-cabled to THIS Mac when that flag is used, pair.json/adb push are
 *     skipped so the live USB session is never hijacked (override: --force-mini-usb-primary).
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const {
  readEnvKey,
  readLocalApiKey,
  resolveApiKeyForGatewayUrl,
  resolvePairingBindings,
  selectPhysicalAdbSerial,
  verifyGatewayAuthSync,
  redactDeepLinkSecrets,
  buildVerifiedExtraComputer,
  isLoopbackGatewayUrl,
  classifyGatewayHost,
  setupUsbAdbReverses,
  assertUsbAdbReverses,
  ANDROID_PACKAGE_NAME,
  waitForForegroundAck,
  createPairingCodeStore,
  putPairingCode,
  takePairingCode,
  pruneExpiredPairingCodes,
} = require('./hermes-mobile-pair-lib.js');
const { pipelineBusyReason } = require('./agent-phone-pipeline-lock.js');
const { withPhoneLease } = require('./agent-phone-lease.js');
const { localTailscaleIpv4 } = require('./hermes-discover-tailscale-macs.js');

const REPO = path.resolve(__dirname, '..');
const HERMES_ENV = path.join(os.homedir(), '.hermes', '.env');
const RELAY_WORKER_ENV = path.join(os.homedir(), '.hermes', 'relay-worker.env');
const PAIR_PORT = 8765;
const OUT_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'mac-yolo-safeguards',
  'hermes-mobile-pair',
);

function readThumbgateApiKey() {
  const fromEnv = process.env.THUMBGATE_API_KEY?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const licensePath = path.join(os.homedir(), '.thumbgate', 'license.json');
  if (!fs.existsSync(licensePath)) {
    return '';
  }
  try {
    const license = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    return typeof license.key === 'string' ? license.key.trim() : '';
  } catch {
    return '';
  }
}

function fetchHealthAt(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/$/, '');
  const healthUrl = `${trimmed}/health`;
  const result = spawnSync('curl', ['-sf', healthUrl], {
    encoding: 'utf8',
    timeout: 8000,
  });
  if (result.status !== 0) {
    throw new Error(`Gateway not reachable at ${healthUrl}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Invalid health JSON from gateway');
  }
}

function fetchHealth() {
  return fetchHealthAt('http://127.0.0.1:8642');
}

function isPrivateIpv4(address) {
  if (!address || address.includes(':')) return false;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function detectLocalLanIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    if (/^(lo|utun|bridge|awdl|llw)/i.test(name)) continue;
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal && isPrivateIpv4(info.address)) {
        return info.address;
      }
    }
  }
  return null;
}

function resolveLanIp(health) {
  const fromHealth = health?.localIp || health?.local_ip;
  if (typeof fromHealth === 'string' && fromHealth.trim() && fromHealth.trim() !== 'unknown') {
    return fromHealth.trim();
  }
  const detected = detectLocalLanIp();
  if (detected) {
    console.log(
      `  LAN IP: ${detected} (from network interfaces — gateway /health no longer returns localIp)`,
    );
    return detected;
  }
  throw new Error('Gateway health missing localIp — cannot build LAN URL for phone.');
}

const PAIR_CODES_PATH = path.join(OUT_DIR, 'pair-codes.json');

/**
 * Secretless one-time pairing code (T-330 priority 3): file-backed so the short-lived
 * main process (which mints the code) and the long-running pair-server daemon (which
 * serves the exchange) can share single-use state without an IPC channel. Mode 0600 —
 * same convention as other local receipt files in this repo.
 */
function loadPairCodesFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PAIR_CODES_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePairCodesFile(map) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PAIR_CODES_PATH, JSON.stringify(map), { mode: 0o600 });
}

function mintPairingCode(payload) {
  const map = loadPairCodesFile();
  const now = Date.now();
  for (const [code, entry] of Object.entries(map)) {
    if (!entry || now > entry.expiresAt) delete map[code];
  }
  const store = new Map(Object.entries(map));
  const code = putPairingCode(store, payload);
  savePairCodesFile(Object.fromEntries(store));
  return code;
}

/** Single-use, TTL-bound exchange — never returns the same code twice. */
function exchangePairingCode(code) {
  const map = loadPairCodesFile();
  const store = new Map(Object.entries(map));
  const result = takePairingCode(store, code);
  savePairCodesFile(Object.fromEntries(store));
  return result;
}

function buildSecretlessDeepLink(code, pairServerUrl, hostname) {
  const params = new URLSearchParams();
  // Mobile parser expects `pairCode` (not relay `code`) — see setupDeepLink.ts T-330.
  params.set('pairCode', code);
  params.set('pairServer', pairServerUrl);
  const displayName = (hostname || '').replace(/\.local$/i, '').trim();
  if (displayName) params.set('name', displayName);
  return `hermes://setup?${params.toString()}`;
}

function buildDeepLink(
  gatewayUrl,
  apiKey,
  hostname,
  relayCode,
  tailnetProbeHosts,
  extraComputers,
  thumbgateApiKey,
) {
  const params = new URLSearchParams();
  params.set('url', gatewayUrl);
  if (apiKey) params.set('key', apiKey);
  if (thumbgateApiKey) params.set('thumbgate', thumbgateApiKey);
  const displayName = (hostname || '').replace(/\.local$/i, '').trim();
  if (displayName) params.set('name', displayName);
  if (relayCode) params.set('relay', relayCode.trim().toUpperCase());
  for (const host of tailnetProbeHosts || []) {
    const trimmed = String(host).trim();
    if (trimmed) params.append('tailnet', trimmed);
  }
  for (const extra of extraComputers || []) {
    const url = extra?.gatewayUrl?.trim();
    if (url) params.append('extraUrl', url);
    const name = extra?.name?.trim();
    if (name) params.append('extraName', name);
    const extraKey = extra?.apiKey?.trim();
    if (extraKey) params.append('extraKey', extraKey);
  }
  return `hermes://setup?${params.toString()}`;
}


function resolveMiniTailscaleDiscovery() {
  const script = path.join(__dirname, 'hermes-discover-tailscale-macs.js');
  const result = spawnSync(process.execPath, [script, '--json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
    return null;
  }
  try {
    const payload = JSON.parse(result.stdout);
    const discoveries = Array.isArray(payload.discoveries) ? payload.discoveries : [];
    const isPhoneDiscovery = (item) =>
      /s25|iphone|ipad|android/i.test(
        `${item.hostname || ''} ${item.label || ''} ${item.host || ''}`,
      );
    const mini =
      discoveries.find(
        (item) => !isPhoneDiscovery(item) && /mac-mini/i.test(item.hostname || item.label || ''),
      ) ||
      discoveries.find((item) => !isPhoneDiscovery(item) && item.host === '100.94.135.78') ||
      discoveries.find((item) => !isPhoneDiscovery(item));
    return mini || null;
  } catch {
    return null;
  }
}

function parseGatewayUrlArg(args) {
  const argv = process.argv.slice(2);
  const flagIdx = argv.indexOf('--gateway-url');
  if (flagIdx >= 0 && argv[flagIdx + 1]) {
    return argv[flagIdx + 1].trim();
  }
  for (const entry of argv) {
    if (entry.startsWith('--gateway-url=')) {
      return entry.slice('--gateway-url='.length).trim();
    }
  }
  return null;
}

function discoverTailnetProbeHosts() {
  const script = path.join(__dirname, 'hermes-discover-tailscale-macs.js');
  const result = spawnSync(process.execPath, [script, '--json'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (result.status !== 0 || !result.stdout?.trim()) {
    return [];
  }
  try {
    const payload = JSON.parse(result.stdout);
    const discoveries = Array.isArray(payload.discoveries) ? payload.discoveries : [];
    const probedHosts = Array.isArray(payload.probedHosts) ? payload.probedHosts : [];
    const fromDiscoveries = discoveries
      .map((item) => item.host || item.gatewayUrl?.replace(/^https?:\/\//i, '').split(':')[0])
      .filter(Boolean);
    // Only online tailnet peers (discover script skips Online===false) plus live Hermes hosts.
    return [...new Set([...probedHosts, ...fromDiscoveries])];
  } catch {
    return [];
  }
}

function adbDevice() {
  const result = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return selectPhysicalAdbSerial(result.stdout);
}

function openDeepLinkOnDevice(serial, link) {
  // Android device shell splits on '&' unless the URI is single-quoted (breaks &name=… params).
  const quoted = `'${String(link).replace(/'/g, `'\\''`)}'`;
  const shellCmd = `am start -a android.intent.action.VIEW -d ${quoted}`;
  const args = serial ? ['-s', serial, 'shell', shellCmd] : ['shell', shellCmd];
  const result = spawnSync('adb', args, {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function syncVaultProjectsCatalog() {
  try {
    const { collectCatalog, DEFAULT_OUT } = require('./hermes-vault-projects-sync.js');
    const catalog = collectCatalog(
      fs.existsSync(path.join(os.homedir(), 'Documents', 'AI-Agent-Sync'))
        ? path.join(os.homedir(), 'Documents', 'AI-Agent-Sync')
        : require('./hermes-vault-projects-sync.js').DEFAULT_VAULT,
    );
    fs.mkdirSync(path.dirname(DEFAULT_OUT), { recursive: true });
    fs.writeFileSync(DEFAULT_OUT, `${JSON.stringify(catalog, null, 2)}\n`);
  } catch (error) {
    console.warn(`  vault-projects sync skipped: ${error.message || error}`);
  }
}

function writePairAssets({ gatewayUrl, lanIp, deepLink, pageUrl, hostname, relayCode, tailnetProbeHosts }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  syncVaultProjectsCatalog();
  const displayName = (hostname || '').replace(/\.local$/i, '') || 'Mac';
  const qrPath = path.join(OUT_DIR, 'pair-qr.png');
  let imgTag = '';
  const qr = spawnSync('npx', ['--yes', 'qrcode', '-o', qrPath, pageUrl], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (qr.status === 0 && fs.existsSync(qrPath)) {
    imgTag = `<img src="/pair-qr.png" alt="Pair QR code" width="280" height="280"/>`;
  }

  const pairJson = {
    gatewayUrl,
    deepLink,
    qrUrl: pageUrl,
    hostname: displayName,
    localIp: lanIp,
    ...(relayCode ? { relayCode: relayCode.trim().toUpperCase() } : {}),
    ...(Array.isArray(tailnetProbeHosts) && tailnetProbeHosts.length > 0
      ? { tailnetProbeHosts }
      : {}),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'pair.json'), JSON.stringify(pairJson, null, 2));

  const htmlPath = path.join(OUT_DIR, 'index.html');
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Hermes Mobile — Pair</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0b0f19; color:#e5e7eb; text-align:center; padding:24px; }
  img { max-width:280px; margin:16px auto; border-radius:12px; background:#fff; padding:12px; }
  a.btn { display:inline-block; margin-top:16px; padding:14px 22px; background:#6366f1; color:#fff;
    text-decoration:none; border-radius:12px; font-weight:700; }
  p { max-width:420px; margin:12px auto; line-height:1.5; color:#9ca3af; }
  code { color:#22d3ee; font-size:11px; word-break:break-all; }
</style></head>
<body>
  <h1>Hermes Mobile</h1>
  <h2 style="color:#a5b4fc;font-size:15px;margin:0 0 8px">${displayName}</h2>
  <p>Scan the QR with your phone camera (same Wi‑Fi) or tap Open below.</p>
  ${imgTag}
  <p>Gateway: <code>${gatewayUrl}</code></p>
  <a class="btn" href="${deepLink}">Open in Hermes Mobile</a>
  <p>No typing — Hermes Mobile links automatically.</p>
  <script>
    setTimeout(function () {
      window.location.href = '${deepLink.replace(/'/g, "\\'")}';
    }, 600);
  </script>
</body></html>`;
  fs.writeFileSync(htmlPath, html);
  return { htmlPath, pairJson };
}

function printTerminalQr(pageUrl) {
  const r = spawnSync('npx', ['--yes', 'qrcode-terminal', pageUrl], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 20_000,
    stdio: 'pipe',
  });
  if (r.status === 0 && r.stdout) {
    process.stdout.write(r.stdout);
    return;
  }
  console.log('  (terminal QR skipped — open pair page in browser)');
}

function portInUse(port) {
  const result = spawnSync('lsof', ['-i', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
}

function ensurePairServerDaemon(lanIp) {
  if (portInUse(PAIR_PORT)) {
    console.log(`  Pair server: already listening on :${PAIR_PORT}`);
    return;
  }
  const child = spawn(process.execPath, [path.join(__dirname, 'hermes-mobile-pair.js'), '--server-only'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  console.log(`  Pair server: started daemon on http://${lanIp}:${PAIR_PORT}/pair`);
}

/**
 * Rewrite pair.json from THIS Mac's /health so a stale --mini-tailscale artifact
 * cannot keep advertising Mac mini hostname + Pro localIp (Find computers found-2/show-1).
 * Crisis 2026-07-15 P0.
 */
function refreshPairAssetsFromLocalGateway() {
  const health = fetchHealth();
  const lanIp = resolveLanIp(health);
  const hostname = (health.hostname || os.hostname() || 'Mac').replace(/\.local$/i, '');
  const tailnetIp = localTailscaleIpv4();
  const gatewayUrl = tailnetIp ? `http://${tailnetIp}:8642` : `http://${lanIp}:8642`;
  const apiKey = readLocalApiKey();
  const thumbgateApiKey = readThumbgateApiKey();
  const relayCode =
    readEnvKey(HERMES_ENV, [
      'HERMES_MOBILE_RELAY_CODE',
      'HERMES_RELAY_PAIR_CODE',
      'MOBILE_RELAY_PAIR_CODE',
    ]) ||
    readEnvKey(RELAY_WORKER_ENV, [
      'HERMES_MOBILE_RELAY_CODE',
      'HERMES_RELAY_PAIR_CODE',
      'MOBILE_RELAY_PAIR_CODE',
    ]);
  const tailnetProbeHosts = discoverTailnetProbeHosts();
  const pageUrl = `http://${lanIp}:${PAIR_PORT}/pair`;
  const deepLink = buildDeepLink(
    gatewayUrl,
    apiKey,
    hostname,
    relayCode,
    tailnetProbeHosts,
    [],
    thumbgateApiKey,
  );
  const pairPath = path.join(OUT_DIR, 'pair.json');
  let previous = null;
  if (fs.existsSync(pairPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(pairPath, 'utf8'));
    } catch {
      previous = null;
    }
  }
  const prevHost = String(previous?.hostname || '')
    .replace(/\.local$/i, '')
    .trim()
    .toLowerCase();
  const nextHost = hostname.replace(/\.local$/i, '').trim().toLowerCase();
  const prevUrl = String(previous?.gatewayUrl || '').trim();
  if (previous && prevHost && nextHost && prevHost !== nextHost) {
    console.warn(
      `  pair.json refresh: hostname mismatch was "${previous.hostname}" (gateway ${prevUrl}); ` +
        `rewriting to "${hostname}" (${gatewayUrl}) from local /health`,
    );
  }
  writePairAssets({
    gatewayUrl,
    lanIp,
    deepLink,
    pageUrl,
    hostname,
    relayCode,
    tailnetProbeHosts,
  });
  console.log(`  pair.json: ${hostname} → ${gatewayUrl} (localIp ${lanIp})`);
  return { health, lanIp, hostname, gatewayUrl };
}

function runServerOnly() {
  syncVaultProjectsCatalog();
  const { lanIp } = refreshPairAssetsFromLocalGateway();
  if (portInUse(PAIR_PORT)) {
    console.log(`  Pair server: already listening on :${PAIR_PORT} (pair.json refreshed on disk)`);
    process.exit(0);
  }
  startPairServer(lanIp);
}

function createPairServer(lanIp) {
  const vaultProjectsPath = path.join(OUT_DIR, 'vault-projects.json');
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';
    if (url === '/pair.json') {
      const json = fs.readFileSync(path.join(OUT_DIR, 'pair.json'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(json);
      return;
    }
    if (url === '/vault-projects.json') {
      if (!fs.existsSync(vaultProjectsPath)) {
        res.writeHead(404);
        res.end('vault catalog missing — run node tools/hermes-vault-projects-sync.js');
        return;
      }
      const json = fs.readFileSync(vaultProjectsPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(json);
      return;
    }
    if (url === '/pair-exchange') {
      const codeMatch = req.url.match(/[?&]code=([^&]+)/);
      const code = codeMatch ? decodeURIComponent(codeMatch[1]) : '';
      const result = exchangePairingCode(code);
      if (!result.ok) {
        res.writeHead(result.reason === 'not_found' ? 404 : 410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.reason }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.payload));
      return;
    }
    if (url === '/pair-qr.png') {
      const png = fs.readFileSync(path.join(OUT_DIR, 'pair-qr.png'));
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(png);
      return;
    }
    if (url === '/pair' || url === '/') {
      const html = fs.readFileSync(path.join(OUT_DIR, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });

  return server;
}

function startPairServer(lanIp) {
  const server = createPairServer(lanIp);
  server.listen(PAIR_PORT, '0.0.0.0', () => {
    console.log(`  Pair server: http://${lanIp}:${PAIR_PORT}/pair`);
  });
  return server;
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--server-only')) {
    runServerOnly();
    return;
  }

  const lockResult = withPhoneLease(
    'pairing',
    `hermes-mobile-pair:${[...args].join(',') || 'default'}`,
    () => runPairMain(args),
    { waitMs: Number(process.env.HERMES_PAIR_LOCK_WAIT_MS || 180_000), skipIfBusy: false },
  );
  if (!lockResult.ran) {
    console.error(
      `[hermes-mobile-pair] skipped — ${lockResult.reason || pipelineBusyReason() || 'pipeline busy'}`,
    );
    process.exit(75);
  }
}

function runPairMain(args) {
  const explicitGatewayUrl = parseGatewayUrlArg(args);
  let gatewayUrl;
  let health;
  if (args.has('--mini-tailscale')) {
    const mini = resolveMiniTailscaleDiscovery();
    if (!mini?.gatewayUrl) {
      throw new Error('No Hermes Mac mini found on Tailscale (run tools/hermes-discover-tailscale-macs.js).');
    }
    gatewayUrl = mini.gatewayUrl.trim();
    health = fetchHealthAt(gatewayUrl);
  } else if (explicitGatewayUrl) {
    gatewayUrl = explicitGatewayUrl.replace(/\/$/, '');
    health = fetchHealthAt(gatewayUrl);
  } else {
    health = fetchHealth();
    const tailnetIp = localTailscaleIpv4();
    if (tailnetIp) {
      gatewayUrl = `http://${tailnetIp}:8642`;
      console.log('  Gateway: tailnet (5G/cellular-safe)', gatewayUrl);
    } else {
      const lanIpFromHealth = resolveLanIp(health);
      gatewayUrl = `http://${lanIpFromHealth}:8642`;
    }
  }
  const lanIp = detectLocalLanIp() || resolveLanIp(health);
  const allowLocalKeyFallback = args.has('--allow-local-key-fallback');
  const skipAuthProbe = args.has('--skip-auth-probe');
  const apiKeyBefore = readLocalApiKey();
  let apiKey;
  try {
    apiKey = resolveApiKeyForGatewayUrl(gatewayUrl, { allowLocalKeyFallback });
  } catch (err) {
    if (err && err.code === 'MINI_KEY_UNAVAILABLE') {
      console.warn(`  API key: ${err.message}`);
      apiKey = '';
    } else {
      throw err;
    }
  }
  const hostClass = classifyGatewayHost(gatewayUrl);
  if (apiKey && apiKey !== apiKeyBefore && hostClass === 'mini') {
    console.log('  API key: loaded from target Mac (~/.hermes/.env via SSH)');
  } else if ((!apiKey || apiKey === apiKeyBefore) && hostClass === 'mini' && !allowLocalKeyFallback) {
    console.warn(
      '  API key: Mac mini SSH lookup failed — will NOT embed laptop key for mini (avoids Wrong key)',
    );
    apiKey = resolveApiKeyForGatewayUrl(gatewayUrl, { fallbackLocal: false, strictMini: false }) || '';
  } else if (apiKey === apiKeyBefore && hostClass === 'mini' && allowLocalKeyFallback) {
    console.warn('  API key: Mac mini SSH lookup failed — using local key (--allow-local-key-fallback)');
  }
  const thumbgateApiKey = readThumbgateApiKey();
  const hostname = health.hostname || os.hostname();
  const relayCode =
    readEnvKey(HERMES_ENV, [
      'HERMES_MOBILE_RELAY_CODE',
      'HERMES_RELAY_PAIR_CODE',
      'MOBILE_RELAY_PAIR_CODE',
    ]) ||
    readEnvKey(RELAY_WORKER_ENV, [
      'HERMES_MOBILE_RELAY_CODE',
      'HERMES_RELAY_PAIR_CODE',
      'MOBILE_RELAY_PAIR_CODE',
    ]);

  const serial = adbDevice();
  const usbPairing = serial && !serial.startsWith('emulator-') && !args.has('--no-adb');
  let reversed8642 = false;
  if (usbPairing) {
    setupUsbAdbReverses(serial);
    const reverseCheck = assertUsbAdbReverses(serial);
    reversed8642 = !reverseCheck.missing.includes(8642);
    const reversed8765 = !reverseCheck.missing.includes(8765);
    console.log(
      reversed8642
        ? `  adb reverse: tcp:8642 → Mac (${serial})`
        : `  adb reverse: tcp:8642 failed on ${serial}`,
    );
    if (reversed8765) {
      console.log(`  adb reverse: tcp:8765 → Mac (${serial}) (pair.json sweep)`);
    } else {
      throw new Error(
        `adb reverse tcp:8765 missing on ${serial} — phone cannot sweep pair.json for Mac mini discovery. ` +
          `Replug USB or run: adb -s ${serial} reverse tcp:8765 tcp:8765`,
      );
    }
  }

  // USB cable: prefer loopback so the phone never depends on Tailscale for desk pairing.
  // Real-user 5G path still gets tailnetProbeHosts + optional verified mini extra.
  if (
    usbPairing &&
    reversed8642 &&
    !explicitGatewayUrl &&
    !args.has('--mini-tailscale') &&
    !isLoopbackGatewayUrl(gatewayUrl)
  ) {
    const localKey = readLocalApiKey();
    const loopback = 'http://127.0.0.1:8642';
    const loopAuth = verifyGatewayAuthSync(loopback, localKey);
    if (loopAuth.ok) {
      console.log('  USB pairing: primary URL → http://127.0.0.1:8642 (adb reverse; key verified)');
      gatewayUrl = loopback;
      apiKey = localKey;
    } else {
      console.warn(
        `  USB reverse auth failed (${loopAuth.reason}) — keeping ${gatewayUrl}; may show Wrong key`,
      );
    }
  }

  if (!skipAuthProbe) {
    const primaryAuth = verifyGatewayAuthSync(gatewayUrl, apiKey);
    if (!primaryAuth.ok) {
      throw new Error(
        `Refusing to pair: gateway auth failed for ${gatewayUrl} (${primaryAuth.reason}, http ${primaryAuth.status}). ` +
          `Fix API_SERVER_KEY on the target Mac or re-run after hermes gateway is up. Never push a wrong key to the phone.`,
      );
    }
    console.log('  Auth: verified /api/sessions 200 with embedded key');
  } else {
    console.warn('  Auth: skipped (--skip-auth-probe)');
  }

  const tailnetProbeHosts = discoverTailnetProbeHosts();
  if (tailnetProbeHosts.length > 0) {
    console.log('  Tailnet Hermes hosts:', tailnetProbeHosts.join(', '));
  }

  const extraComputers = [];
  if (!args.has('--mini-tailscale')) {
    const mini = resolveMiniTailscaleDiscovery();
    const miniUrl = mini?.gatewayUrl?.trim().replace(/\/$/, '');
    const primaryUrl = gatewayUrl.trim().replace(/\/$/, '');
    if (miniUrl && miniUrl !== primaryUrl && !isLoopbackGatewayUrl(miniUrl)) {
      const verified = buildVerifiedExtraComputer({
        gatewayUrl: miniUrl,
        name: (mini.hostname || mini.label || 'Igors-Mac-mini').replace(/\.local$/i, '').trim(),
      });
      if (verified && !verified.skipped) {
        extraComputers.push(verified);
        console.log(
          '  Extra saved computer (verified auth):',
          verified.name,
          verified.gatewayUrl,
        );
      } else {
        console.warn(
          `  Extra Mac mini skipped (${verified?.reason || 'unverified'}) — phone will not get a Wrong-key ghost profile`,
        );
      }
    }
  }

  resolvePairingBindings(gatewayUrl, {
    allowLocalKeyFallback,
    probe: false,
    probeExtras: false,
    extraGatewayUrls: extraComputers.map((c) => c.gatewayUrl),
  });

  if (usbPairing && !explicitGatewayUrl && !args.has('--mini-tailscale')) {
    console.log(
      isLoopbackGatewayUrl(gatewayUrl)
        ? '  USB pairing: loopback primary + reverse (5G: add Tailscale computer later or re-pair --mini-tailscale)'
        : '  USB pairing: adb reverse active',
    );
    if (classifyGatewayHost(gatewayUrl) === 'mini') {
      throw new Error(
        'USB pair on this Mac cannot target Mac mini as primary — refuse to write mini URL with USB reverse.',
      );
    }
  }
  if (args.has('--mini-tailscale') || explicitGatewayUrl) {
    console.log('  Pairing target gateway (explicit):', gatewayUrl);
  }

  // P0 2026-07-14: `--mini-tailscale` is documented (AGENTS.md "Multi-Mac API keys") as the
  // way to SSH-fetch the mini's key/health for programmatic use — it is NOT a request to
  // repoint a phone that is physically cabled to THIS Mac right now. Without this guard the
  // flag unconditionally set gatewayUrl to the mini (line ~505) and, unless the caller
  // remembered `--no-serve`, overwrote pair.json's primary + pushed an adb deep link at the
  // mini — while /health over the live loopback reverse tunnel still correctly answered as
  // THIS Mac. Detect the live cable fact (not just trust the flag) and force a read-only
  // key-fetch mode whenever that happens.
  const usbHijackGuardTripped =
    args.has('--mini-tailscale') &&
    !explicitGatewayUrl &&
    !args.has('--force-mini-usb-primary') &&
    usbPairing &&
    reversed8642 &&
    verifyGatewayAuthSync('http://127.0.0.1:8642', readLocalApiKey()).ok;
  if (usbHijackGuardTripped) {
    console.warn(
      '  USB guard: phone is USB-cabled to THIS Mac (loopback 127.0.0.1:8642 verified) — ' +
        'refusing to make mini the USB primary. Only fetching mini key/health; ' +
        'pair.json and the phone stay on this Mac. Pass --force-mini-usb-primary to override.',
    );
  }
  const pageUrl = `http://${lanIp}:${PAIR_PORT}/pair`;
  // Secretless pairing (T-330 priority 3): only when a pair server will actually run to
  // serve the exchange. `--no-serve` unattended/session-start flows keep the legacy
  // embedded-key link unchanged (no server exists there to exchange a code against).
  const secretlessPairing = !args.has('--no-serve') && !args.has('--legacy-key-link');
  const deepLink = secretlessPairing
    ? buildSecretlessDeepLink(
        mintPairingCode({
          gatewayUrl,
          apiKey,
          macName: hostname,
          relayCode,
          tailnetProbeHosts,
          extraComputers,
          thumbgateApiKey,
        }),
        pageUrl.replace(/\/pair$/, ''),
        hostname,
      )
    : buildDeepLink(gatewayUrl, apiKey, hostname, relayCode, tailnetProbeHosts, extraComputers, thumbgateApiKey);
  const skipPairAssetWrite =
    usbHijackGuardTripped || (args.has('--no-serve') && args.has('--mini-tailscale'));
  let htmlPath = path.join(OUT_DIR, 'index.html');
  if (skipPairAssetWrite) {
    console.log(
      usbHijackGuardTripped
        ? '  pair.json: preserved (USB guard — mini-tailscale key fetch while cabled to this Mac)'
        : '  pair.json: preserved (--no-serve + --mini-tailscale; will not overwrite USB/MBP pair page primary)',
    );
  } else {
    ({ htmlPath } = writePairAssets({
      gatewayUrl,
      lanIp,
      deepLink,
      pageUrl,
      hostname,
      relayCode,
      tailnetProbeHosts,
    }));
  }

  console.log('Hermes Mobile pairing');
  console.log('  Gateway:', gatewayUrl);
  console.log('  Pair page:', pageUrl);
  console.log('  Local file:', htmlPath);
  const secrets = [apiKey, thumbgateApiKey, ...extraComputers.map((c) => c.apiKey)].filter(Boolean);
  const redactedLink = redactDeepLinkSecrets(deepLink, secrets);
  if (thumbgateApiKey) {
    console.log('  ThumbGate key: embedded in deep link');
  }
  console.log('  Deep link:', redactedLink);

  printTerminalQr(pageUrl);

  if (!args.has('--no-serve')) {
    ensurePairServerDaemon(lanIp);
  }

  if (serial && !args.has('--no-adb')) {
    if (skipPairAssetWrite) {
      console.log(
        usbHijackGuardTripped
          ? '  adb: skipped (USB guard — phone keeps its verified USB primary, not mini)'
          : '  adb: skipped (--mini-tailscale --no-serve; phone keeps primary from full USB/MBP pair)',
      );
    } else {
      // Serialized handshake (T-330 priority 1): one setup intent, wait for an auth ack
      // (Hermes app confirmed foreground), THEN send the optional secondary developer-unlock
      // intent. Previously these fired consecutively with zero delay, which could race a
      // cold-starting app and drop it back to the launcher or apply the unlock before the
      // setup profile existed.
      const ok = openDeepLinkOnDevice(serial, deepLink);
      console.log(ok ? `  adb: opened on ${serial}` : '  adb: intent failed — scan QR on pair page');
      if (!ok) {
        console.log('  adb: secondary intent skipped — primary setup intent failed');
      } else if (args.has('--no-dev-unlock')) {
        console.log('  adb: secondary intent skipped (--no-dev-unlock)');
      } else {
        const ackWaitMs = Number(process.env.HERMES_PAIR_ACK_WAIT_MS || 8000);
        const ack = waitForForegroundAck(serial, ANDROID_PACKAGE_NAME, { timeoutMs: ackWaitMs });
        console.log(
          ack.ok
            ? `  adb: setup ack confirmed after ${ack.waitedMs}ms (app foreground) — sending secondary intent`
            : `  adb: setup ack timed out after ${ack.waitedMs}ms — sending secondary intent anyway (best-effort)`,
        );
        try {
          openDeepLinkOnDevice(serial, 'hermes://dev/leash-unlock');
          console.log('  adb: developer Leash unlock intent sent (does not change tab)');
        } catch {
          // App may still be cold-starting after install.
        }
      }
    }
  } else if (!serial) {
    console.log('  adb: no device — scan QR on pair page');
  }

  if (args.has('--open')) {
    spawnSync('open', [htmlPath], { stdio: 'inherit' });
  }
}

try {
  main();
} catch (err) {
  console.error(`[hermes-mobile-pair] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
