'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_HERMES_ENV = path.join(os.homedir(), '.hermes', '.env');

/** Known Mac mini Tailscale IPv4 (fleet). */
const MAC_MINI_TAILSCALE_IP = '100.94.135.78';

/** Android application id — used to confirm the setup intent actually reached the foreground app. */
const ANDROID_PACKAGE_NAME = 'com.iganapolsky.hermesmobile';

function sleepSync(ms) {
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuffer, 0, 0, ms);
}

/** Write a complete replacement in the destination directory, then rename atomically. */
function atomicWriteFileSync(filePath, content, options = {}) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const mode = options.mode ?? 0o600;
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let fd;
  try {
    fd = fs.openSync(tempPath, 'wx', mode);
    fs.writeFileSync(fd, content);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tempPath, filePath);
    fs.chmodSync(filePath, mode);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(tempPath, { force: true });
  }
}

/**
 * Cross-process synchronous lock using an atomic mkdir. A dead writer cannot wedge pairing
 * forever: a lock older than staleMs is reclaimed, while healthy contenders wait boundedly.
 */
function withDirectoryLockSync(lockPath, callback, options = {}) {
  const waitMs = options.waitMs ?? 5000;
  const retryMs = options.retryMs ?? 25;
  const staleMs = options.staleMs ?? 30_000;
  const deadline = Date.now() + waitMs;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs > staleMs) {
          fs.rmSync(lockPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
        continue;
      }
      if (Date.now() >= deadline) {
        const timeout = new Error(`Timed out waiting for pairing state lock: ${lockPath}`);
        timeout.code = 'PAIR_STATE_LOCK_TIMEOUT';
        throw timeout;
      }
      sleepSync(retryMs);
    }
  }

  try {
    return callback();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

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
 * A fleet address can be "remote" from one Mac and local from another. In particular,
 * 100.94.135.78 is the mini from the MacBook, but it is the mini's own address when this
 * CLI runs on the mini. Treat explicit local tailnet addresses and this host's names as
 * local before applying the fleet-specific mini SSH rule.
 */
function isGatewayUrlLocalToMachine(gatewayUrl, options = {}) {
  const host = gatewayUrlHost(gatewayUrl);
  if (!host) return false;
  if (isLoopbackGatewayUrl(gatewayUrl)) return true;
  const localHosts = new Set(
    [
      ...(options.localGatewayHosts || []),
      os.hostname(),
      `${os.hostname()}.local`,
    ]
      .map((value) => String(value || '').trim().toLowerCase().replace(/\.$/, ''))
      .filter(Boolean),
  );
  return localHosts.has(host.replace(/\.$/, ''));
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

/** USB Hermes paths: gateway chat + pair.json sweep (Mac mini discovery). */
const USB_ADB_REVERSE_PORTS = [8642, 8765];

function adbReverseList(serial, options = {}) {
  const adbBin = options.adbCommand ?? 'adb';
  const result = spawnSync(adbBin, ['-s', serial, 'reverse', '--list'], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return result.status === 0 ? result.stdout : '';
}

function adbReverseHasPort(serial, port, options = {}) {
  return adbReverseList(serial, options).includes(`tcp:${port}`);
}

function setupUsbAdbReverses(serial, options = {}) {
  const ports = options.ports ?? USB_ADB_REVERSE_PORTS;
  const adbBin = options.adbCommand ?? 'adb';
  const failures = [];
  for (const port of ports) {
    const result = spawnSync(adbBin, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    if (result.status !== 0) {
      failures.push(port);
    }
  }
  return { ok: failures.length === 0, failures, ports };
}

function assertUsbAdbReverses(serial, options = {}) {
  const ports = options.ports ?? USB_ADB_REVERSE_PORTS;
  const requiredPorts = options.requiredPorts ?? ports;
  const missing = requiredPorts.filter((port) => !adbReverseHasPort(serial, port, options));
  return { ok: missing.length === 0, missing, ports: requiredPorts };
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
  if (isGatewayUrlLocalToMachine(gatewayUrl, options)) {
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

/**
 * Serialized pairing handshake (2026-07-14 prevent-recurrence): T-330.
 *
 * Root cause of the recurring pairing defect: `hermes-mobile-pair.js` fired the primary
 * `hermes://setup` intent and the secondary `hermes://dev/leash-unlock` intent back-to-back
 * with zero delay. On a cold-starting app (fresh install / Metro reload) the second intent
 * could race the first — the app hadn't finished processing setup before the unlock intent
 * landed, occasionally dropping the app to the launcher or applying the unlock before the
 * gateway profile existed. Fix: wait for a foreground ack (the Hermes app is the resumed
 * activity) before sending any secondary intent, with a bounded timeout so pairing never
 * hangs indefinitely on a device that can't report focus (e.g. locked screen).
 */

/** Pure parser — testable without adb. Accepts `dumpsys window windows` (or `activity activities`) output. */
function isAppForegroundOutput(dumpsysOutput, packageName = ANDROID_PACKAGE_NAME) {
  const text = String(dumpsysOutput || '');
  const focusLine = text
    .split(/\r?\n/)
    .find((line) => /mCurrentFocus|mFocusedApp|mResumedActivity/.test(line));
  return typeof focusLine === 'string' && focusLine.includes(packageName);
}

/**
 * Poll for the setup intent's foreground ack before sending any secondary intent.
 * @param {string|null} serial adb serial (null = default/only device)
 * @param {string} packageName Android application id
 * @param {{
 *   execImpl?: (serial: string|null) => string,
 *   sleepImpl?: (ms: number) => void,
 *   timeoutMs?: number,
 *   pollIntervalMs?: number,
 * }} [options]
 * @returns {{ ok: boolean, waitedMs: number, attempts: number }}
 */
function waitForForegroundAck(serial, packageName = ANDROID_PACKAGE_NAME, options = {}) {
  const timeoutMs = options.timeoutMs ?? 8000;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const execImpl =
    options.execImpl ??
    ((s) => {
      const args = s
        ? ['-s', s, 'shell', 'dumpsys', 'window', 'windows']
        : ['shell', 'dumpsys', 'window', 'windows'];
      const result = spawnSync('adb', args, { encoding: 'utf8', timeout: 8000 });
      return result.status === 0 ? result.stdout || '' : '';
    });
  const sleepImpl = options.sleepImpl ?? ((ms) => spawnSync('sleep', [String(Math.max(ms, 0) / 1000)]));

  const start = Date.now();
  let attempts = 0;
  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    if (isAppForegroundOutput(execImpl(serial), packageName)) {
      return { ok: true, waitedMs: Date.now() - start, attempts };
    }
    if (Date.now() - start >= timeoutMs) break;
    sleepImpl(Math.min(pollIntervalMs, timeoutMs - (Date.now() - start)));
  }
  return { ok: false, waitedMs: Date.now() - start, attempts };
}

/**
 * Secretless one-time pairing code (T-330 priority 3): the deep link carries an opaque
 * single-use `code` instead of the raw gateway API key. The phone exchanges the code for
 * credentials over the same trusted local connection (LAN pair server or adb-reverse
 * loopback) and stores them via Android Keystore (`secureCredentials` / SecureStore) —
 * never as a query-string argument that can land in adb logs, shell history, or a
 * screenshot of the deep link.
 */
const PAIRING_CODE_TTL_MS = 120_000;
const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

function generatePairingCode(length = 8) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += PAIRING_CODE_ALPHABET[crypto.randomInt(PAIRING_CODE_ALPHABET.length)];
  }
  return out;
}

/** In-memory single-use code → credential-payload store with TTL expiry. */
function createPairingCodeStore() {
  return new Map();
}

function putPairingCode(store, payload, options = {}) {
  const code = options.code || generatePairingCode();
  const ttlMs = options.ttlMs ?? PAIRING_CODE_TTL_MS;
  store.set(code, { payload, expiresAt: Date.now() + ttlMs, consumed: false });
  return code;
}

/** Single-use consume: returns payload once, then the code is dead even if re-requested before expiry. */
function takePairingCode(store, code) {
  const entry = store.get(String(code || '').trim());
  if (!entry) {
    return { ok: false, reason: 'not_found' };
  }
  if (entry.consumed) {
    return { ok: false, reason: 'already_consumed' };
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(code);
    return { ok: false, reason: 'expired' };
  }
  entry.consumed = true;
  store.delete(code);
  return { ok: true, payload: entry.payload };
}

function pruneExpiredPairingCodes(store) {
  const now = Date.now();
  for (const [code, entry] of store.entries()) {
    if (now > entry.expiresAt || entry.consumed) {
      store.delete(code);
    }
  }
}

module.exports = {
  DEFAULT_HERMES_ENV,
  MAC_MINI_TAILSCALE_IP,
  ANDROID_PACKAGE_NAME,
  atomicWriteFileSync,
  withDirectoryLockSync,
  isAppForegroundOutput,
  waitForForegroundAck,
  PAIRING_CODE_TTL_MS,
  generatePairingCode,
  createPairingCodeStore,
  putPairingCode,
  takePairingCode,
  pruneExpiredPairingCodes,
  readEnvKey,
  readLocalApiKey,
  gatewayUrlHost,
  isMacMiniGatewayUrl,
  isLoopbackGatewayUrl,
  isGatewayUrlLocalToMachine,
  classifyGatewayHost,
  selectPhysicalAdbSerial,
  USB_ADB_REVERSE_PORTS,
  adbReverseList,
  adbReverseHasPort,
  setupUsbAdbReverses,
  assertUsbAdbReverses,
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
