'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_HERMES_ENV = path.join(os.homedir(), '.hermes', '.env');

function readEnvKey(filePath, names) {
  if (!fs.existsSync(filePath)) return '';
  const text = fs.readFileSync(filePath, 'utf8');
  for (const name of names) {
    const match = text.match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function readLocalApiKey(hermesEnvPath = DEFAULT_HERMES_ENV) {
  return readEnvKey(hermesEnvPath, ['API_SERVER_KEY', 'HERMES_API_SERVER_KEY', 'API_KEY']);
}

function gatewayUrlHost(gatewayUrl) {
  try {
    return new URL(gatewayUrl.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isMacMiniGatewayUrl(gatewayUrl) {
  const host = gatewayUrlHost(gatewayUrl);
  return host === '100.94.135.78' || /mac-mini|igors-mac-mini/.test(host);
}

/** Loopback / adb-reverse URLs only make sense on a USB-paired phone. */
function isLoopbackGatewayUrl(gatewayUrl) {
  const host = gatewayUrlHost(gatewayUrl);
  return host === '127.0.0.1' || host === 'localhost' || host === '10.0.2.2';
}

function selectPhysicalAdbSerial(adbDevicesOutput) {
  const devices = String(adbDevicesOutput || '')
    .split(/\r?\n/)
    .map((row) => row.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device');
  return devices.find(([serial]) => !serial.startsWith('emulator-'))?.[0] || null;
}

/**
 * Auth probe: /health is unauthenticated (always 200 when up). Chat needs a key.
 * GET /api/sessions?limit=1 with Bearer must be 200 — never pair a key that 401s.
 */
function verifyGatewayAuth(gatewayUrl, apiKey, options = {}) {
  const base = String(gatewayUrl || '')
    .trim()
    .replace(/\/$/, '');
  const key = String(apiKey || '').trim();
  if (!base || !key) {
    return { ok: false, status: 0, reason: 'missing_url_or_key' };
  }
  if (typeof options.fetchImpl === 'function') {
    try {
      const result = options.fetchImpl(base, key);
      if (result && typeof result === 'object') {
        return result;
      }
      return { ok: Boolean(result), status: result ? 200 : 0, reason: result ? 'ok' : 'fetch_failed' };
    } catch (err) {
      return { ok: false, status: 0, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  let parsed;
  try {
    parsed = new URL(`${base}/api/sessions?limit=1`);
  } catch {
    return { ok: false, status: 0, reason: 'invalid_url' };
  }
  const lib = parsed.protocol === 'https:' ? https : http;
  const timeoutMs = options.timeoutMs ?? 5_000;

  return new Promise((resolve) => {
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        const status = res.statusCode || 0;
        resolve({
          ok: status === 200,
          status,
          reason: status === 200 ? 'ok' : status === 401 || status === 403 ? 'wrong_key' : `http_${status}`,
        });
      },
    );
    req.on('error', (err) => resolve({ ok: false, status: 0, reason: err.message || 'network_error' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, reason: 'timeout' });
    });
    req.end();
  });
}

/** Sync wrapper for pair CLI (spawn curl — available on Macs). */
function verifyGatewayAuthSync(gatewayUrl, apiKey, options = {}) {
  const base = String(gatewayUrl || '')
    .trim()
    .replace(/\/$/, '');
  const key = String(apiKey || '').trim();
  if (!base || !key) {
    return { ok: false, status: 0, reason: 'missing_url_or_key' };
  }
  if (typeof options.fetchImpl === 'function') {
    try {
      const result = options.fetchImpl(base, key);
      if (result && typeof result === 'object' && 'ok' in result) {
        return result;
      }
      return { ok: Boolean(result), status: result ? 200 : 0, reason: result ? 'ok' : 'fetch_failed' };
    } catch (err) {
      return { ok: false, status: 0, reason: err instanceof Error ? err.message : String(err) };
    }
  }
  const url = `${base}/api/sessions?limit=1`;
  const curl = spawnSync(
    options.curlCommand ?? 'curl',
    ['-sS', '-m', String(options.timeoutSec ?? 5), '-o', '/dev/null', '-w', '%{http_code}', '-H', `Authorization: Bearer ${key}`, url],
    { encoding: 'utf8', timeout: (options.timeoutSec ?? 5) * 1000 + 2000 },
  );
  const status = Number.parseInt(String(curl.stdout || '').trim(), 10) || 0;
  if (curl.error) {
    return { ok: false, status: 0, reason: curl.error.message || 'curl_error' };
  }
  return {
    ok: status === 200,
    status,
    reason: status === 200 ? 'ok' : status === 401 || status === 403 ? 'wrong_key' : `http_${status}`,
  };
}

/**
 * Fleet Macs can have different API_SERVER_KEY values — fetch the target machine's key over SSH.
 * @param {object} options
 * @param {boolean} [options.fallbackLocal=true] When false, remote/SSH failure returns '' (never a foreign key).
 */
function resolveApiKeyForGatewayUrl(gatewayUrl, options = {}) {
  const hermesEnvPath = options.hermesEnvPath ?? DEFAULT_HERMES_ENV;
  const localKey = readLocalApiKey(hermesEnvPath);
  const fallbackLocal = options.fallbackLocal !== false;
  if (!gatewayUrl?.trim()) {
    return localKey;
  }
  // Loopback is always this Mac's key.
  if (isLoopbackGatewayUrl(gatewayUrl)) {
    return localKey;
  }
  if (!isMacMiniGatewayUrl(gatewayUrl) && !options.forceRemote) {
    return localKey;
  }
  const host = String(options.sshHost || gatewayUrlHost(gatewayUrl) || 'hermes-mini').trim();
  const remote = spawnSync(
    options.sshCommand ?? 'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=8',
      host,
      "grep -E '^API_SERVER_KEY=' ~/.hermes/.env | head -1 | cut -d= -f2- | tr -d '\"' | tr -d \"'\"",
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
  const remoteKey = remote.stdout?.trim().replace(/^["']|["']$/g, '');
  if (remote.status === 0 && remoteKey) {
    return remoteKey;
  }
  // Never silently attach laptop key to mini (causes Wrong key on phone).
  if (!fallbackLocal) {
    return '';
  }
  return localKey;
}

/** Redact every bearer-like key in a deep link / log line. */
function redactDeepLinkSecrets(deepLink, secrets = []) {
  let out = String(deepLink || '');
  for (const secret of secrets) {
    const s = String(secret || '').trim();
    if (s.length >= 8) {
      out = out.split(s).join(`${s.slice(0, 12)}…`);
    }
  }
  // Belt-and-suspenders: query param keys
  out = out.replace(/([?&](?:key|extraKey|thumbgate)=)[^&]+/gi, (_, p) => `${p}${p.includes('thumbgate') ? 'tg_…' : 'sk-…'}`);
  return out;
}

/**
 * Only include an extra computer when we have a key that authenticates to THAT url.
 * Omitting extras is better than Wrong key for real users.
 */
function buildVerifiedExtraComputer(entry, options = {}) {
  const gatewayUrl = entry?.gatewayUrl?.trim().replace(/\/$/, '');
  if (!gatewayUrl) {
    return null;
  }
  const name = (entry.name || entry.macName || '').replace(/\.local$/i, '').trim();
  let apiKey = entry.apiKey?.trim() || '';
  if (!apiKey) {
    apiKey = resolveApiKeyForGatewayUrl(gatewayUrl, {
      ...options,
      fallbackLocal: false,
      forceRemote: isMacMiniGatewayUrl(gatewayUrl),
    });
  }
  if (!apiKey) {
    return { skipped: true, reason: 'no_verified_key', gatewayUrl, name };
  }
  const auth = verifyGatewayAuthSync(gatewayUrl, apiKey, options);
  if (!auth.ok) {
    return { skipped: true, reason: auth.reason || 'auth_failed', gatewayUrl, name, status: auth.status };
  }
  return {
    gatewayUrl,
    name: name || undefined,
    apiKey,
  };
}

module.exports = {
  DEFAULT_HERMES_ENV,
  readEnvKey,
  readLocalApiKey,
  gatewayUrlHost,
  isMacMiniGatewayUrl,
  isLoopbackGatewayUrl,
  selectPhysicalAdbSerial,
  resolveApiKeyForGatewayUrl,
  verifyGatewayAuth,
  verifyGatewayAuthSync,
  redactDeepLinkSecrets,
  buildVerifiedExtraComputer,
};
