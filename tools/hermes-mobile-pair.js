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
 *   [--mini-tailscale --force-mini-usb-primary --no-serve] still applies the mini deep link
 *     over adb (session-start phone-install path) without binding a LAN pair server.
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
  classifyMiniApiKeyResolution,
  setupUsbAdbReverses,
  assertUsbAdbReverses,
  ANDROID_PACKAGE_NAME,
  waitForForegroundAck,
  createPairingCodeStore,
  putPairingCode,
  takePairingCode,
  pruneExpiredPairingCodes,
  pairingCodeRemainingMs,
  PAIRING_CODE_DISPLAY_TTL_MS,
  PAIRING_CODE_REFRESH_MS,
  writePairJsonAtomic,
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
const PAIR_SEED_PATH = path.join(OUT_DIR, 'pair-seed.json');

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

function savePairSeed(seed) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(PAIR_SEED_PATH, `${JSON.stringify(seed, null, 2)}\n`, { mode: 0o600 });
}

function loadPairSeed() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PAIR_SEED_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Mint a single-use pairing code. Defaults to DISPLAY TTL (20m) so a QR left on the
 * pair page does not go dead at 120s. Returns { code, expiresAt, ttlMs }.
 */
function mintPairingCode(payload, options = {}) {
  const map = loadPairCodesFile();
  const now = Date.now();
  for (const [code, entry] of Object.entries(map)) {
    if (!entry || now > entry.expiresAt) delete map[code];
  }
  const store = new Map(Object.entries(map));
  const ttlMs = options.ttlMs ?? PAIRING_CODE_DISPLAY_TTL_MS;
  const code = putPairingCode(store, payload, { ttlMs, now: () => now });
  const entry = store.get(code);
  savePairCodesFile(Object.fromEntries(store));
  return {
    code,
    expiresAt: entry.expiresAt,
    ttlMs,
    remainingMs: pairingCodeRemainingMs(entry, now),
  };
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

/**
 * Fresh installs block setup ack behind the Android notification runtime dialog.
 * Tap "Don't allow" so Linking/getInitialURL can finish applying hermes://setup.
 */
function dismissAndroidRuntimePermissionDialogs(serial) {
  const adbBase = serial ? ['-s', serial] : [];
  spawnSync('adb', [...adbBase, 'shell', 'uiautomator', 'dump', '/sdcard/hermes-pair-ui.xml'], {
    encoding: 'utf8',
    timeout: 8_000,
  });
  const dump = spawnSync('adb', [...adbBase, 'shell', 'cat', '/sdcard/hermes-pair-ui.xml'], {
    encoding: 'utf8',
    timeout: 8_000,
  });
  const xml = dump.stdout || '';
  const re =
    /text="((?:Don.?t allow|Don't allow|Deny))"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/gi;
  let match;
  let tapped = false;
  while ((match = re.exec(xml))) {
    const x1 = Number(match[2]);
    const y1 = Number(match[3]);
    const x2 = Number(match[4]);
    const y2 = Number(match[5]);
    if (![x1, y1, x2, y2].every((n) => Number.isFinite(n))) continue;
    const x = Math.floor((x1 + x2) / 2);
    const y = Math.floor((y1 + y2) / 2);
    spawnSync('adb', [...adbBase, 'shell', 'input', 'tap', String(x), String(y)], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    tapped = true;
    break;
  }
  return tapped;
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRemainingLabel(remainingMs) {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

/**
 * Build the live pair HTML. Never bake a stale single-use code into a long-lived static
 * file for HTTP `/pair` — callers mint immediately before render.
 */
function buildLivePairHtml({
  gatewayUrl,
  deepLink,
  pageUrl,
  hostname,
  imgTag,
  expiresAt,
  remainingMs,
  refreshMs = PAIRING_CODE_REFRESH_MS,
}) {
  const displayName = (hostname || '').replace(/\.local$/i, '') || 'Mac';
  const usbPrimary = isLoopbackGatewayUrl(gatewayUrl);
  const pairingInstructions = usbPrimary
    ? 'On cellular: install Tailscale on this phone and your computer, then scan this QR (it opens over Tailscale). USB cable pairing auto-opens Hermes without a scan. Stock Camera cannot open hermes:// links by itself.'
    : 'Scan this QR with your phone camera on the same Wi‑Fi or with Tailscale on. On cellular without Tailscale, the QR cannot reach your computer — that is expected.';
  const gatewayLabel = usbPrimary ? 'USB gateway (cable only)' : 'Your computer';
  const safeDeepLink = String(deepLink || '').replace(/'/g, "\\'");
  const remainingLabel = formatRemainingLabel(remainingMs);
  const refreshSec = Math.max(5, Math.round(refreshMs / 1000));
  const livePageHint = pageUrl
    ? `<p>Prefer this live link (not a saved <code>file://</code> page): <code>${escapeHtml(pageUrl)}</code></p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="Cache-Control" content="no-store"/>
<title>Hermes Mobile — Pair</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0b0f19; color:#e5e7eb; text-align:center; padding:24px; }
  img { max-width:280px; margin:16px auto; border-radius:12px; background:#fff; padding:12px; display:block; }
  a.btn { display:inline-block; margin-top:16px; padding:14px 22px; background:#6366f1; color:#fff;
    text-decoration:none; border-radius:12px; font-weight:700; }
  p { max-width:420px; margin:12px auto; line-height:1.5; color:#9ca3af; }
  code { color:#22d3ee; font-size:11px; word-break:break-all; }
  #ttl { color:#fbbf24; font-weight:600; }
  #status { color:#a5b4fc; min-height:1.2em; }
  .hint { display:inline-block; margin-top:10px; padding:4px 10px; border:1px solid #374151; border-radius:999px; font-size:12px; color:#a5b4fc; }
  [data-view] { display:none; }
</style></head>
<body>
  <h1>Hermes Mobile</h1>
  <h2 style="color:#a5b4fc;font-size:15px;margin:0 0 8px">${escapeHtml(displayName)}</h2>

  <div data-view="mac">
    <span class="hint">Viewing on this Mac</span>
    <p>Show this QR to your <strong>phone</strong> (Camera or Hermes scan). Do not rely on a saved <code>file://</code> snapshot — use the live Tailscale/Wi‑Fi pair link. USB cable: Hermes opens automatically (no scan).</p>
    ${imgTag || ''}
    ${livePageHint}
    <p id="ttl-mac">Code expires in <span id="ttl-value-mac">${escapeHtml(remainingLabel)}</span></p>
    <p>${escapeHtml(gatewayLabel)}: <code>${escapeHtml(gatewayUrl)}</code></p>
  </div>

  <div data-view="phone">
    <span class="hint">Viewing on your phone</span>
    <p>${escapeHtml(pairingInstructions)}</p>
    <p id="ttl">Code expires in <span id="ttl-value">${escapeHtml(remainingLabel)}</span></p>
    <p id="status"></p>
    <p>${escapeHtml(gatewayLabel)}: <code>${escapeHtml(gatewayUrl)}</code></p>
    <a class="btn" id="open-btn" href="${escapeHtml(deepLink)}">Open in Hermes Mobile</a>
    <p>No typing — Hermes Mobile links automatically.</p>
  </div>

  <script>
    (function () {
      // Same generated page renders on the Mac (file:// --open, or this Mac's own
      // browser hitting :8765/pair) and on the phone (QR scan) — only the phone can
      // act on hermes://, so pick which half to show instead of a dead Open button.
      var isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent);
      var view = document.querySelector('[data-view="' + (isPhone ? 'phone' : 'mac') + '"]');
      if (view) view.style.display = 'block';

      var expiresAt = ${Number(expiresAt) || 0};
      var refreshMs = ${Number(refreshMs) || 60000};
      var deepLink = '${safeDeepLink}';
      var pageUrl = ${JSON.stringify(pageUrl || '')};
      var statusEl = document.getElementById('status');
      var ttlEl = document.getElementById(isPhone ? 'ttl-value' : 'ttl-value-mac');
      var openBtn = document.getElementById('open-btn');
      function formatRemaining(ms) {
        var totalSec = Math.max(0, Math.ceil(ms / 1000));
        var mins = Math.floor(totalSec / 60);
        var secs = totalSec % 60;
        if (mins <= 0) return secs + 's';
        return mins + 'm ' + String(secs).padStart(2, '0') + 's';
      }
      function tick() {
        var remaining = Math.max(0, expiresAt - Date.now());
        if (ttlEl) ttlEl.textContent = formatRemaining(remaining);
        if (remaining <= 0) {
          if (statusEl) statusEl.textContent = 'Code expired — refreshing…';
          window.location.reload();
          return;
        }
        if (remaining <= refreshMs) {
          if (statusEl) statusEl.textContent = 'Refreshing pairing code…';
          window.location.reload();
        }
      }
      setInterval(tick, 1000);
      setTimeout(function () {
        if (statusEl) statusEl.textContent = 'Refreshing pairing code…';
        window.location.reload();
      }, refreshMs);
      // Auto-open once per browser tab session so 60s remints do not spam hermes://.
      // Phone only — hermes:// has no handler on the Mac, so opening it there is a no-op.
      if (isPhone) {
        try {
          if (deepLink && !sessionStorage.getItem('hermesPairAutoOpened')) {
            sessionStorage.setItem('hermesPairAutoOpened', '1');
            setTimeout(function () { window.location.href = deepLink; }, 600);
          }
        } catch (e) {
          if (deepLink) setTimeout(function () { window.location.href = deepLink; }, 600);
        }
      }
      if (openBtn && deepLink) openBtn.href = deepLink;
      if (pageUrl) { /* keep pageUrl for live reload identity */ }
    })();
  </script>
</body></html>`;
}

function resolveCameraPageUrl(lanIp) {
  const tailnetIp = localTailscaleIpv4();
  if (tailnetIp) return `http://${tailnetIp}:${PAIR_PORT}/pair`;
  return `http://${lanIp}:${PAIR_PORT}/pair`;
}

/**
 * Phone-reachable pair-exchange base for Camera / HTTP / Tailscale QR paths.
 * Prefer Tailscale MagicDNS IP over LAN — cellular phones cannot redeem against
 * 10.x/192.168.x even when the QR page itself was opened via Tailscale.
 * Never use 127.0.0.1 here (that only works for adb reverse deep links).
 */
function resolvePhoneReachablePairServerUrl(lanIp) {
  const tailnetIp = localTailscaleIpv4();
  if (tailnetIp) return `http://${tailnetIp}:${PAIR_PORT}`;
  const lan = String(lanIp || '').trim();
  if (lan && lan !== '127.0.0.1' && lan !== 'localhost') {
    return `http://${lan}:${PAIR_PORT}`;
  }
  return `http://127.0.0.1:${PAIR_PORT}`;
}

/** Prefer Tailscale/LAN for HTTP remints; keep loopback only when seed has no better host. */
function resolveLiveMintPairServerUrl(seed) {
  const lanIp = seed?.localIp || detectLocalLanIp() || '127.0.0.1';
  const phoneReachable = resolvePhoneReachablePairServerUrl(lanIp);
  const fromSeed = String(seed?.pairServer || '').replace(/\/$/, '');
  if (!fromSeed) return phoneReachable;
  // Stale seed often stores LAN while Camera QR already uses Tailscale — upgrade.
  if (phoneReachable.includes('100.') && !fromSeed.includes('100.')) {
    return phoneReachable;
  }
  // Never redeem Camera/HTTP codes against loopback unless that is truly all we have.
  if (fromSeed.includes('127.0.0.1') && !phoneReachable.includes('127.0.0.1')) {
    return phoneReachable;
  }
  return fromSeed;
}

function writePairQrPng(qrPayload) {
  const qrPath = path.join(OUT_DIR, 'pair-qr.png');
  const qr = spawnSync('npx', ['--yes', 'qrcode', '-o', qrPath, qrPayload], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (qr.status !== 0 || !fs.existsSync(qrPath)) {
    return { qrPath, imgTag: '' };
  }
  // Data URL so file:// (Mac --open) never depends on Chrome loading a sibling PNG.
  const b64 = fs.readFileSync(qrPath).toString('base64');
  return {
    qrPath,
    imgTag: `<img src="data:image/png;base64,${b64}" alt="Pair QR code" width="280" height="280"/>`,
  };
}

/**
 * Persist non-secret-path seed + QR that points at the HTTP pair page (never a stale
 * hermes:// code). Live `/pair` remints from pair-seed.json on every GET.
 */
function writePairAssets({
  gatewayUrl,
  lanIp,
  deepLink,
  pageUrl,
  hostname,
  relayCode,
  tailnetProbeHosts,
  pairSeed,
  expiresAt,
  remainingMs,
}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  syncVaultProjectsCatalog();
  const displayName = (hostname || '').replace(/\.local$/i, '') || 'Mac';
  // Always encode the HTTP pair page for Camera. Stock Android Camera ignores hermes://
  // and a baked deep-link code dies after TTL while the QR still looks valid.
  const cameraPageUrl = resolveCameraPageUrl(lanIp);
  const qrPayload = cameraPageUrl;
  const { imgTag } = writePairQrPng(qrPayload);

  if (pairSeed) {
    const phonePairServer = resolvePhoneReachablePairServerUrl(lanIp);
    savePairSeed({
      ...pairSeed,
      // HTTP remints / Camera deep links must redeem against a phone-reachable host.
      // Keep any explicit Tailscale pairServer; upgrade LAN/loopback seeds to Tailscale.
      pairServer: resolveLiveMintPairServerUrl({
        ...pairSeed,
        localIp: lanIp,
        pairServer: pairSeed.pairServer || phonePairServer,
      }),
      pageUrl: cameraPageUrl,
      updatedAt: new Date().toISOString(),
    });
  }

  const pairJson = {
    gatewayUrl,
    // deepLink may be a just-minted adb link; HTTP /pair remints and must not reuse this.
    deepLink: deepLink || '',
    qrUrl: qrPayload,
    hostname: displayName,
    localIp: lanIp,
    codeExpiresAt: expiresAt || null,
    ...(relayCode ? { relayCode: relayCode.trim().toUpperCase() } : {}),
    ...(Array.isArray(tailnetProbeHosts) && tailnetProbeHosts.length > 0
      ? { tailnetProbeHosts }
      : {}),
  };
  // Single-writer lock — concurrent agents must not poison primary Mac in pair.json.
  writePairJsonAtomic(path.join(OUT_DIR, 'pair.json'), pairJson);

  const htmlPath = path.join(OUT_DIR, 'index.html');
  const html = buildLivePairHtml({
    gatewayUrl,
    deepLink: deepLink || cameraPageUrl,
    pageUrl: pageUrl || cameraPageUrl,
    hostname: displayName,
    imgTag,
    expiresAt: expiresAt || Date.now() + PAIRING_CODE_DISPLAY_TTL_MS,
    remainingMs: remainingMs ?? PAIRING_CODE_DISPLAY_TTL_MS,
    refreshMs: PAIRING_CODE_REFRESH_MS,
  });
  fs.writeFileSync(htmlPath, html);
  return { htmlPath, pairJson, cameraPageUrl };
}

/**
 * Mint a fresh secretless pair session from the on-disk seed.
 * @param {{ light?: boolean }} [options] light=true skips QR/HTML disk work so /pair.json
 * stays under the phone's ~1.5s pair-server probe timeout on cellular Tailscale.
 */
function mintLivePairSession(options = {}) {
  const light = options.light === true;
  const seed = loadPairSeed();
  if (!seed || !seed.gatewayUrl || !seed.apiKey) {
    return { ok: false, reason: 'no_seed' };
  }
  // Camera/HTTP path: always mint against Tailscale/LAN — never stale LAN while QR is Tailscale.
  const pairServer = resolveLiveMintPairServerUrl(seed);
  const minted = mintPairingCode(
    {
      gatewayUrl: seed.gatewayUrl,
      apiKey: seed.apiKey,
      macName: seed.macName || seed.hostname || 'Mac',
      relayCode: seed.relayCode || '',
      tailnetProbeHosts: seed.tailnetProbeHosts || [],
      extraComputers: seed.extraComputers || [],
      thumbgateApiKey: seed.thumbgateApiKey || '',
    },
    { ttlMs: PAIRING_CODE_DISPLAY_TTL_MS },
  );
  const deepLink = buildSecretlessDeepLink(minted.code, pairServer, seed.macName || seed.hostname);
  const lanIp = seed.localIp || detectLocalLanIp() || '127.0.0.1';
  const cameraPageUrl = seed.pageUrl || resolveCameraPageUrl(lanIp);
  const displayName = (seed.macName || seed.hostname || 'Mac').replace(/\.local$/i, '');
  // P0 2026-07-24: always rewrite pair.json with this mint so Connect/Find computers
  // redeem against a code still present in the in-memory exchange store.
  const pairJson = {
    gatewayUrl: seed.gatewayUrl,
    deepLink,
    qrUrl: cameraPageUrl,
    hostname: displayName,
    localIp: lanIp,
    codeExpiresAt: minted.expiresAt,
    ...(seed.relayCode ? { relayCode: String(seed.relayCode).trim().toUpperCase() } : {}),
    ...(Array.isArray(seed.tailnetProbeHosts) && seed.tailnetProbeHosts.length > 0
      ? { tailnetProbeHosts: seed.tailnetProbeHosts }
      : {}),
  };
  try {
    writePairJsonAtomic(path.join(OUT_DIR, 'pair.json'), pairJson);
  } catch {
    // Non-fatal: in-memory exchange still works for this process.
  }

  let html;
  if (!light) {
    const { imgTag } = writePairQrPng(cameraPageUrl);
    html = buildLivePairHtml({
      gatewayUrl: seed.gatewayUrl,
      deepLink,
      pageUrl: cameraPageUrl,
      hostname: displayName,
      imgTag,
      expiresAt: minted.expiresAt,
      remainingMs: minted.remainingMs,
      refreshMs: PAIRING_CODE_REFRESH_MS,
    });
    // Keep on-disk index.html aligned with the live mint for --open / file viewers.
    fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
  }

  return {
    ok: true,
    deepLink,
    code: minted.code,
    expiresAt: minted.expiresAt,
    remainingMs: minted.remainingMs,
    refreshMs: PAIRING_CODE_REFRESH_MS,
    ttlMs: minted.ttlMs,
    pageUrl: cameraPageUrl,
    gatewayUrl: seed.gatewayUrl,
    hostname: displayName,
    html,
    pairJson,
  };
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
 *
 * P0 2026-07-21: --server-only used to always prefer Tailscale and clobber a just-written
 * USB loopback primary (runPairMain → writePairAssets → ensurePairServerDaemon → here).
 * When adb reverse :8642 is up and loopback auth verifies, keep USB as the pair-page primary.
 */
function refreshPairAssetsFromLocalGateway() {
  const health = fetchHealth();
  const lanIp = resolveLanIp(health);
  const hostname = (health.hostname || os.hostname() || 'Mac').replace(/\.local$/i, '');
  const tailnetIp = localTailscaleIpv4();
  let gatewayUrl = tailnetIp ? `http://${tailnetIp}:8642` : `http://${lanIp}:8642`;
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
  const cameraPageUrl = resolveCameraPageUrl(lanIp);
  const phonePairServer = resolvePhoneReachablePairServerUrl(lanIp);
  const pairPath = path.join(OUT_DIR, 'pair.json');
  let previous = null;
  if (fs.existsSync(pairPath)) {
    try {
      previous = JSON.parse(fs.readFileSync(pairPath, 'utf8'));
    } catch {
      previous = null;
    }
  }
  const serial = adbDevice();
  const usbReverseLive =
    Boolean(serial) &&
    !String(serial).startsWith('emulator-') &&
    !assertUsbAdbReverses(serial).missing.includes(8642);
  const loopback = 'http://127.0.0.1:8642';
  if (usbReverseLive && verifyGatewayAuthSync(loopback, apiKey).ok) {
    gatewayUrl = loopback;
    console.log('  pair.json refresh: keeping USB loopback primary (adb reverse + auth verified)');
  } else if (previous && isLoopbackGatewayUrl(previous.gatewayUrl) && !usbReverseLive) {
    // Cable gone — fall through to Tailscale/LAN rewrite below.
    console.log('  pair.json refresh: prior USB primary, no live reverse — promoting network gateway');
  }
  // Preserve fleet extras (e.g. Mac mini) across --server-only refresh so HTTP remints
  // still seed Find computers after a cellular/Tailscale redeem.
  let priorExtras = [];
  try {
    const priorSeed = loadPairSeed();
    if (Array.isArray(priorSeed?.extraComputers)) {
      priorExtras = priorSeed.extraComputers;
    }
  } catch {
    priorExtras = [];
  }
  // pairServer MUST be phone-reachable (Tailscale preferred) — Camera QR is not USB.
  // P0 2026-07-22: --server-only used to write a legacy key= deepLink into pair.json.
  // The Tailscale health watchdog validates /pair.json for pairCode; legacy links made
  // every launchd tick exit 1 even when the pair HTTP page reminted secretless codes.
  // Keep HTTP /pair live remints, but also persist a secretless pairCode in pair.json.
  const pairSeed = {
    gatewayUrl,
    apiKey,
    macName: hostname,
    hostname,
    relayCode,
    tailnetProbeHosts,
    extraComputers: priorExtras,
    thumbgateApiKey,
    localIp: lanIp,
    pairServer: phonePairServer,
    pageUrl: cameraPageUrl,
  };
  const minted = mintPairingCode(pairSeed, { ttlMs: PAIRING_CODE_DISPLAY_TTL_MS });
  const deepLink = buildSecretlessDeepLink(minted.code, phonePairServer, hostname);
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
    pageUrl: cameraPageUrl,
    hostname,
    relayCode,
    tailnetProbeHosts,
    pairSeed,
    expiresAt: minted.expiresAt,
    remainingMs: minted.remainingMs,
  });
  console.log(
    `  pair.json: ${hostname} → ${gatewayUrl} (localIp ${lanIp}; pairServer ${phonePairServer}; pairCode)`,
  );
  return { health, lanIp, hostname, gatewayUrl, pageUrl: cameraPageUrl };
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

function readRequestBody(req, limitBytes = 64_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createPairServer(lanIp) {
  const vaultProjectsPath = path.join(OUT_DIR, 'vault-projects.json');
  const sessionHandoffPath = path.join(OUT_DIR, 'session-handoff.json');
  const {
    writeSessionHandoff,
    readSessionHandoffJson,
  } = require('./hermes-mobile-session-handoff.js');
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';
    const method = (req.method || 'GET').toUpperCase();
    if (url === '/pair.json') {
      // Light remint — phone Connect uses this under a ~1.5s client timeout; skip QR/HTML.
      const live = mintLivePairSession({ light: true });
      if (live.ok && live.pairJson) {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        });
        res.end(`${JSON.stringify(live.pairJson)}\n`);
        return;
      }
      // Fallback: static file (legacy seed missing) so callers still get gatewayUrl/hostname.
      try {
        const json = fs.readFileSync(path.join(OUT_DIR, 'pair.json'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(json);
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: live.reason || 'unavailable' }));
      }
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
    if (url === '/session-handoff.json' && method === 'GET') {
      const handoff = readSessionHandoffJson({ pairJsonPath: sessionHandoffPath });
      if (!handoff) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no_handoff' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(`${JSON.stringify(handoff)}\n`);
      return;
    }
    if (url === '/session-handoff' && method === 'POST') {
      void readRequestBody(req)
        .then((body) => {
          let parsed;
          try {
            parsed = JSON.parse(body || '{}');
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_json' }));
            return;
          }
          try {
            const result = writeSessionHandoff(parsed);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, vaultRelativePath: result.handoff.vaultRelativePath }));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message || 'write_failed' }));
          }
        })
        .catch((error) => {
          const status = error.message === 'body_too_large' ? 413 : 400;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'bad_request' }));
        });
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
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
      return;
    }
    if (url === '/pair-live.json') {
      const live = mintLivePairSession();
      if (!live.ok) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ error: live.reason || 'unavailable' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({
          deepLink: live.deepLink,
          expiresAt: live.expiresAt,
          remainingMs: live.remainingMs,
          refreshMs: live.refreshMs,
          ttlMs: live.ttlMs,
          pageUrl: live.pageUrl,
          gatewayUrl: live.gatewayUrl,
          hostname: live.hostname,
        }),
      );
      return;
    }
    if (url === '/pair' || url === '/') {
      const live = mintLivePairSession();
      if (live.ok) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(live.html);
        return;
      }
      // Fallback: static HTML (legacy / seed missing) — never pretend a dead code is live.
      const htmlPath = path.join(OUT_DIR, 'index.html');
      if (!fs.existsSync(htmlPath)) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Pair seed missing — run node tools/hermes-mobile-pair.js');
        return;
      }
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
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
  // Prefer the target Mac's /health local_ip when pairing mini/Tailscale so pair.json
  // cannot advertise this laptop's LAN IP under Igors-Mac-mini (Find-computers merge poison).
  const hostClassEarly = classifyGatewayHost(gatewayUrl);
  const lanIp =
    hostClassEarly === 'mini' || args.has('--mini-tailscale')
      ? resolveLanIp(health) || detectLocalLanIp()
      : detectLocalLanIp() || resolveLanIp(health);
  const allowLocalKeyFallback = args.has('--allow-local-key-fallback');
  const skipAuthProbe = args.has('--skip-auth-probe');
  const apiKeyBefore = readLocalApiKey();
  let apiKey;
  const hostClass = hostClassEarly;
  // P0 2026-07-16: never treat miniSSH_key === laptop_key as failure (cleared embed → Wrong key).
  if (hostClass === 'mini') {
    const miniResolved = classifyMiniApiKeyResolution(apiKeyBefore, { allowLocalKeyFallback });
    apiKey = miniResolved.apiKey;
    if (miniResolved.source === 'ssh' && miniResolved.syncedWithLocal) {
      console.log('  API key: loaded from Mac mini via SSH (matches laptop — fleet keys synced)');
    } else if (miniResolved.source === 'ssh') {
      console.log('  API key: loaded from target Mac (~/.hermes/.env via SSH)');
    } else if (miniResolved.source === 'local_fallback') {
      console.warn('  API key: Mac mini SSH lookup failed — using local key (--allow-local-key-fallback)');
    } else {
      console.warn(
        '  API key: Mac mini SSH lookup failed — will NOT embed laptop key for mini (avoids Wrong key)',
      );
    }
  } else {
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
  let reversed8765 = false;
  if (usbPairing) {
    setupUsbAdbReverses(serial);
    const reverseCheck = assertUsbAdbReverses(serial);
    reversed8642 = !reverseCheck.missing.includes(8642);
    reversed8765 = !reverseCheck.missing.includes(8765);
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
  const pageUrl = resolveCameraPageUrl(lanIp);
  const phonePairServer = resolvePhoneReachablePairServerUrl(lanIp);
  // Secretless pairing (T-330 priority 3): only when a pair server will actually run to
  // serve the exchange. `--no-serve` unattended/session-start flows keep the legacy
  // embedded-key link unchanged (no server exists there to exchange a code against).
  // Split audiences:
  // - adb `am start` deep link: loopback when USB reverse :8765 is up (works on 5G via adb)
  // - Camera / HTTP /pair remints: Tailscale (or LAN) so cellular+VPN can redeem without USB
  const adbPairExchangeBase =
    usbPairing && reversed8765
      ? `http://127.0.0.1:${PAIR_PORT}`
      : phonePairServer;
  if (adbPairExchangeBase.includes('127.0.0.1')) {
    console.log('  Pair exchange (adb): http://127.0.0.1:8765 (USB reverse)');
  }
  console.log(`  Pair exchange (Camera/HTTP): ${phonePairServer}`);
  const secretlessPairing = !args.has('--no-serve') && !args.has('--legacy-key-link');
  // Seed stores phone-reachable pairServer so live /pair remints work off-USB.
  const pairSeed = {
    gatewayUrl,
    apiKey,
    macName: hostname,
    hostname,
    relayCode,
    tailnetProbeHosts,
    extraComputers,
    thumbgateApiKey,
    localIp: lanIp,
    pairServer: phonePairServer,
    pageUrl,
  };
  let minted = null;
  const deepLink = secretlessPairing
    ? (() => {
        minted = mintPairingCode(pairSeed, { ttlMs: PAIRING_CODE_DISPLAY_TTL_MS });
        // adb open uses loopback when reverse is live; HTTP page remints use phonePairServer.
        return buildSecretlessDeepLink(minted.code, adbPairExchangeBase, hostname);
      })()
    : buildDeepLink(gatewayUrl, apiKey, hostname, relayCode, tailnetProbeHosts, extraComputers, thumbgateApiKey);
  // P0 2026-07-20: `--no-serve --mini-tailscale` used to always skip adb/pair.json, even with
  // `--force-mini-usb-primary`. Session-start phone-install then left the phone on a stale
  // Wrong-key / unreachable mini Tailscale profile while infra was healthy.
  const forceMiniUsbPrimary = args.has('--force-mini-usb-primary');
  const skipPairAssetWrite =
    usbHijackGuardTripped ||
    (args.has('--no-serve') && args.has('--mini-tailscale') && !forceMiniUsbPrimary);
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
      pairSeed,
      expiresAt: minted?.expiresAt,
      remainingMs: minted?.remainingMs,
    }));
  }

  console.log('Hermes Mobile pairing');
  console.log('  Gateway:', gatewayUrl);
  console.log('  Pair page:', pageUrl);
  if (minted) {
    console.log(
      `  Pair code: fresh mint, expires in ${formatRemainingLabel(minted.remainingMs)} ` +
        `(display TTL ${Math.round(minted.ttlMs / 1000)}s; page remints every ${Math.round(PAIRING_CODE_REFRESH_MS / 1000)}s)`,
    );
  }
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
      if (forceMiniUsbPrimary && args.has('--no-serve') && args.has('--mini-tailscale')) {
        console.log(
          '  adb: applying mini Tailscale primary (--force-mini-usb-primary with --no-serve)',
        );
      }
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
        // Fresh Play install: notification permission sheet eats the setup ack window.
        if (dismissAndroidRuntimePermissionDialogs(serial)) {
          console.log('  adb: dismissed runtime permission dialog (notif) so setup can finish');
        }
        const ackWaitMs = Number(process.env.HERMES_PAIR_ACK_WAIT_MS || 8000);
        const ack = waitForForegroundAck(serial, ANDROID_PACKAGE_NAME, { timeoutMs: ackWaitMs });
        if (!ack.ok && dismissAndroidRuntimePermissionDialogs(serial)) {
          console.log('  adb: dismissed runtime permission dialog after ack timeout');
        }
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
    // Prefer live HTTP (Tailscale/LAN) over file:// — Camera QR and remints are HTTP-only.
    const openTarget = pageUrl || htmlPath;
    spawnSync('open', [openTarget], { stdio: 'inherit' });
    console.log(`  Opened: ${openTarget}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`[hermes-mobile-pair] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
