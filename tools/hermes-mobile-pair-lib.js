'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_HERMES_ENV = path.join(os.homedir(), '.hermes', '.env');

/** Known Mac mini Tailscale IPv4 (fleet). */
const MAC_MINI_TAILSCALE_IP = '100.94.135.78';

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
  return host === MAC_MINI_TAILSCALE_IP || /mac-mini|igors-mac-mini/.test(host);
}

/** Loopback / adb-reverse URLs only make sense on a USB-paired phone. */
function isLoopbackGatewayUrl(gatewayUrl) {
  const host = gatewayUrlHost(gatewayUrl);
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '10.0.2.2';
}

/**
 * Classify pairing target so we never write laptop .env key for mini (or vice versa).
 * @returns {'mini'|'loopback'|'local'|'unknown'}
 */
function classifyGatewayHost(gatewayUrl) {
  if (!gatewayUrl?.trim()) return 'unknown';
  if (isMacMiniGatewayUrl(gatewayUrl)) return 'mini';
  if (isLoopbackGatewayUrl(gatewayUrl)) return 'loopback';
  const host = gatewayUrlHost(gatewayUrl);
  if (!host) return 'unknown';
  return 'local';
}

function selectPhysicalAdbSerial(adbDevicesOutput) {
  const devices = String(adbDevicesOutput || '')
    .split(/\r?\n/)
    .map((row) => row.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device');
  return devices.find(([serial]) => !serial.startsWith('emulator-'))?.[0] || null;
}

function fetchRemoteMiniApiKey(options = {}) {
  const host = String(options.sshHost || 'hermes-mini').trim();
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
  return '';
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
 * Fleet Macs can have different API_SERVER_KEY values — bind key to the host being paired.
 *
 * Options:
 * - fallbackLocal (default true for non-strict callers): when false, mini SSH failure returns ''.
 * - allowLocalKeyFallback: dogfood override to use laptop .env for mini.
 * - strictMini (default true): throw MINI_KEY_UNAVAILABLE instead of returning laptop key.
 */
function resolveApiKeyForGatewayUrl(gatewayUrl, options = {}) {
  const hermesEnvPath = options.hermesEnvPath ?? DEFAULT_HERMES_ENV;
  const localKey = readLocalApiKey(hermesEnvPath);
  const allowLocalKeyFallback = options.allowLocalKeyFallback === true;
  const fallbackLocal = allowLocalKeyFallback ? true : options.fallbackLocal !== false;
  const strictMini = options.strictMini !== false && !allowLocalKeyFallback;

  if (!gatewayUrl?.trim()) {
    return localKey;
  }
  if (isLoopbackGatewayUrl(gatewayUrl)) {
    return localKey;
  }
  if (!isMacMiniGatewayUrl(gatewayUrl) && !options.forceRemote) {
    return localKey;
  }

  const host = String(options.sshHost || gatewayUrlHost(gatewayUrl) || 'hermes-mini').trim();
  const remoteKey = fetchRemoteMiniApiKey({ ...options, sshHost: host === MAC_MINI_TAILSCALE_IP ? 'hermes-mini' : host });
  if (remoteKey) {
    return remoteKey;
  }

  if (!fallbackLocal) {
    return '';
  }
  if (strictMini && isMacMiniGatewayUrl(gatewayUrl)) {
    const err = new Error(
      'Mac mini API_SERVER_KEY unavailable via SSH (hermes-mini). ' +
        'Refusing laptop .env key — would poison phone profiles (Wrong key for this computer). ' +
        'Fix SSH to mini or pass --allow-local-key-fallback only for intentional dogfood.',
    );
    err.code = 'MINI_KEY_UNAVAILABLE';
    throw err;
  }
  return localKey;
}

/**
 * Ensure a pairing credential set never cross-binds laptop ↔ mini keys.
 * @returns {{ ok: boolean, errors: string[] }}
 */
function assertHostKeyConsistency(bindings, options = {}) {
  const errors = [];
  const list = Array.isArray(bindings) ? bindings : [];
  const localKey = options.localKey ?? '';
  const miniKey = options.miniKey ?? '';

  for (const item of list) {
    const url = item?.gatewayUrl?.trim() || '';
    const key = item?.apiKey?.trim() || '';
    const hostClass = classifyGatewayHost(url);
    if (!url) {
      errors.push('missing_gateway_url');
      continue;
    }
    if (!key) {
      errors.push(`missing_api_key_for:${hostClass}:${gatewayUrlHost(url) || url}`);
      continue;
    }
    if (hostClass === 'mini') {
      if (localKey && key === localKey && miniKey && miniKey !== localKey) {
        errors.push('mini_url_bound_to_laptop_key');
      }
      if (miniKey && key !== miniKey) {
        errors.push('mini_url_key_mismatch_expected_ssh_key');
      }
    }
    if ((hostClass === 'local' || hostClass === 'loopback') && miniKey && localKey && miniKey !== localKey) {
      if (key === miniKey) {
        errors.push('local_or_usb_url_bound_to_mini_key');
      }
    }
  }

  const miniBinding = list.find((b) => classifyGatewayHost(b?.gatewayUrl) === 'mini');
  const localBinding = list.find((b) => {
    const c = classifyGatewayHost(b?.gatewayUrl);
    return c === 'local' || c === 'loopback';
  });
  if (miniBinding?.apiKey && localBinding?.apiKey && miniKey && localKey && miniKey !== localKey) {
    if (miniBinding.apiKey.trim() === localBinding.apiKey.trim()) {
      errors.push('primary_and_mini_share_same_key_but_fleet_keys_differ');
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Probe wrapper used by resolvePairingBindings (maps verifyGatewayAuthSync → errorMessage). */
function probeGatewayAuthSync(gatewayUrl, apiKey, options = {}) {
  const auth = verifyGatewayAuthSync(gatewayUrl, apiKey, options);
  if (auth.ok) {
    return { ok: true, status: auth.status };
  }
  return {
    ok: false,
    status: auth.status || 0,
    errorMessage:
      auth.reason === 'wrong_key' ? 'Wrong key for this computer' : auth.reason || 'probe_failed',
  };
}

/**
 * Build + validate primary (+ optional extras) before deep-link write.
 * Throws on consistency or auth probe failure.
 */
function resolvePairingBindings(primaryGatewayUrl, options = {}) {
  const hermesEnvPath = options.hermesEnvPath ?? DEFAULT_HERMES_ENV;
  const localKey = readLocalApiKey(hermesEnvPath);
  let miniKey = '';
  try {
    miniKey = fetchRemoteMiniApiKey(options);
  } catch {
    miniKey = '';
  }

  const primaryKey = resolveApiKeyForGatewayUrl(primaryGatewayUrl, {
    ...options,
    hermesEnvPath,
  });
  const bindings = [
    {
      gatewayUrl: primaryGatewayUrl,
      apiKey: primaryKey,
      hostClass: classifyGatewayHost(primaryGatewayUrl),
    },
  ];

  for (const extra of options.extraGatewayUrls || []) {
    const url = String(extra || '').trim();
    if (!url) continue;
    bindings.push({
      gatewayUrl: url,
      apiKey: resolveApiKeyForGatewayUrl(url, {
        ...options,
        hermesEnvPath,
        fallbackLocal: false,
        allowLocalKeyFallback: options.allowLocalKeyFallback,
      }),
      hostClass: classifyGatewayHost(url),
    });
  }

  const consistency = assertHostKeyConsistency(bindings, { localKey, miniKey });
  if (!consistency.ok) {
    const err = new Error(`Pair host/key inconsistency: ${consistency.errors.join(', ')}`);
    err.code = 'HOST_KEY_INCONSISTENT';
    err.errors = consistency.errors;
    throw err;
  }

  if (options.probe !== false) {
    const toProbe = options.probeExtras === true ? bindings : bindings.slice(0, 1);
    for (const binding of toProbe) {
      const probe = probeGatewayAuthSync(binding.gatewayUrl, binding.apiKey, options);
      if (!probe.ok) {
        const err = new Error(
          `Auth probe failed for ${binding.hostClass} ${binding.gatewayUrl}: ${probe.errorMessage || probe.status}`,
        );
        err.code = 'PAIR_AUTH_PROBE_FAILED';
        err.probe = probe;
        err.binding = binding;
        throw err;
      }
    }
  }

  return { bindings, localKey, miniKey, primary: bindings[0] };
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
    try {
      apiKey = resolveApiKeyForGatewayUrl(gatewayUrl, {
        ...options,
        fallbackLocal: false,
        forceRemote: isMacMiniGatewayUrl(gatewayUrl),
        strictMini: false,
      });
    } catch {
      apiKey = '';
    }
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
  MAC_MINI_TAILSCALE_IP,
  readEnvKey,
  readLocalApiKey,
  gatewayUrlHost,
  isMacMiniGatewayUrl,
  isLoopbackGatewayUrl,
  classifyGatewayHost,
  selectPhysicalAdbSerial,
  fetchRemoteMiniApiKey,
  resolveApiKeyForGatewayUrl,
  assertHostKeyConsistency,
  probeGatewayAuthSync,
  resolvePairingBindings,
  verifyGatewayAuth,
  verifyGatewayAuthSync,
  redactDeepLinkSecrets,
  buildVerifiedExtraComputer,
};
