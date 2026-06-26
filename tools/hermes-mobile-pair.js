#!/usr/bin/env node
'use strict';

/**
 * Zero-friction Hermes Mobile pairing from Mac:
 * - LAN HTTP server on :8765 (phone camera scans http://LAN:8765/pair)
 * - hermes://setup deep link + optional adb intent
 *
 * Usage: node tools/hermes-mobile-pair.js [--no-adb] [--no-serve] [--open]
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync, spawn } = require('child_process');

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

function readEnvKey(filePath, names) {
  if (!fs.existsSync(filePath)) return '';
  const text = fs.readFileSync(filePath, 'utf8');
  for (const name of names) {
    const match = text.match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function fetchHealth() {
  const result = spawnSync('curl', ['-sf', 'http://127.0.0.1:8642/health'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status !== 0) {
    throw new Error('Gateway not reachable at http://127.0.0.1:8642/health — start Hermes gateway first.');
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Invalid health JSON from gateway');
  }
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

function buildDeepLink(gatewayUrl, apiKey, hostname, relayCode, tailnetProbeHosts) {
  const params = new URLSearchParams();
  params.set('url', gatewayUrl);
  if (apiKey) params.set('key', apiKey);
  const displayName = (hostname || '').replace(/\.local$/i, '').trim();
  if (displayName) params.set('name', displayName);
  if (relayCode) params.set('relay', relayCode.trim().toUpperCase());
  for (const host of tailnetProbeHosts || []) {
    const trimmed = String(host).trim();
    if (trimmed) params.append('tailnet', trimmed);
  }
  return `hermes://setup?${params.toString()}`;
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
    return discoveries
      .map((item) => item.host || item.gatewayUrl?.replace(/^https?:\/\//i, '').split(':')[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

function adbDevice() {
  const result = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const lines = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((row) => row.trim())
    .filter((row) => row.endsWith('device'));
  const physical = lines.find((row) => !row.startsWith('emulator-'));
  if (physical) {
    return physical.split(/\s+/)[0];
  }
  return lines[0] ? lines[0].split(/\s+/)[0] : null;
}

function setupAdbReverse(serial) {
  const result = spawnSync('adb', ['-s', serial, 'reverse', 'tcp:8642', 'tcp:8642'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return result.status === 0;
}

function openDeepLinkOnDevice(serial, link) {
  const args = serial
    ? ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', link]
    : ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', link];
  const result = spawnSync('adb', args, {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function writePairAssets({ gatewayUrl, lanIp, deepLink, pageUrl, hostname, relayCode, tailnetProbeHosts }) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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

function runServerOnly() {
  const health = fetchHealth();
  const lanIp = resolveLanIp(health);
  if (portInUse(PAIR_PORT)) {
    process.exit(0);
  }
  startPairServer(lanIp);
}

function createPairServer(lanIp) {
  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] ?? '/';
    if (url === '/pair.json') {
      const json = fs.readFileSync(path.join(OUT_DIR, 'pair.json'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(json);
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
  const health = fetchHealth();
  const lanIp = resolveLanIp(health);
  const apiKey = readEnvKey(HERMES_ENV, [
    'API_SERVER_KEY',
    'HERMES_API_SERVER_KEY',
    'API_KEY',
  ]);
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
  if (usbPairing) {
    const reversed8642 = setupAdbReverse(serial);
    const reversed8765 =
      spawnSync('adb', ['-s', serial, 'reverse', 'tcp:8765', 'tcp:8765'], {
        encoding: 'utf8',
        timeout: 10_000,
      }).status === 0;
    console.log(
      reversed8642
        ? `  adb reverse: tcp:8642 → Mac (${serial})`
        : `  adb reverse: tcp:8642 failed on ${serial}`,
    );
    if (reversed8765) {
      console.log(`  adb reverse: tcp:8765 → Mac (${serial})`);
    }
  }

  const tailnetProbeHosts = discoverTailnetProbeHosts();
  if (tailnetProbeHosts.length > 0) {
    console.log('  Tailnet Hermes hosts:', tailnetProbeHosts.join(', '));
  }

  const gatewayUrl = usbPairing ? 'http://127.0.0.1:8642' : `http://${lanIp}:8642`;
  const deepLink = buildDeepLink(gatewayUrl, apiKey, hostname, relayCode, tailnetProbeHosts);
  const pageUrl = `http://${lanIp}:${PAIR_PORT}/pair`;
  const { htmlPath } = writePairAssets({
    gatewayUrl,
    lanIp,
    deepLink,
    pageUrl,
    hostname,
    relayCode,
    tailnetProbeHosts,
  });

  console.log('Hermes Mobile pairing');
  console.log('  Gateway:', gatewayUrl);
  console.log('  Pair page:', pageUrl);
  console.log('  Local file:', htmlPath);
  console.log(
    '  Deep link:',
    deepLink.replace(apiKey, apiKey ? `${apiKey.slice(0, 12)}…` : ''),
  );

  printTerminalQr(pageUrl);

  if (!args.has('--no-serve')) {
    ensurePairServerDaemon(lanIp);
  }

  if (serial && !args.has('--no-adb')) {
    const ok = openDeepLinkOnDevice(serial, deepLink);
    console.log(ok ? `  adb: opened on ${serial}` : '  adb: intent failed — scan QR on pair page');
    try {
      openDeepLinkOnDevice(serial, 'hermes://dev/leash-unlock');
      console.log('  adb: developer Leash unlock intent sent');
    } catch {
      // App may still be cold-starting after install.
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
