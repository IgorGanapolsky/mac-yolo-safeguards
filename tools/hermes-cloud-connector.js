#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_CONFIG = path.join(os.homedir(), '.hermes', 'cloud-connector.json');
const DEFAULT_GATEWAY_ENV = path.join(os.homedir(), '.hermes', '.env');
const DEFAULT_CONTROL_PLANE = 'https://thumbgate.app';
const DEFAULT_SESSION_GATEWAY = 'http://127.0.0.1:8642';
const DEFAULT_MODEL_GATEWAY = 'http://127.0.0.1:4010';
const POLL_MS = 3_000;
const HEARTBEAT_MS = 15_000;
const SESSION_SYNC_MS = 60_000;
const SESSION_LIMIT = 60;
// Sessions beyond this limit sync title-only and render "0 synced messages" in
// the web dashboard. 40 covers a typical active week; per-session content stays
// bounded by MAX_CONTEXT_MESSAGES/MAX_CONTEXT_CHARS so sync cost grows linearly.
const CONTEXT_SESSION_LIMIT = 40;
const REQUEST_TIMEOUT_MS = 15_000;
const TASK_TIMEOUT_MS = 75_000;
const MAX_CONTEXT_MESSAGES = 60;
const MAX_CONTEXT_CHARS = 48_000;

function base64Url(value) { return Buffer.from(value).toString('base64url'); }
function sha256(value) { return base64Url(crypto.createHash('sha256').update(value).digest()); }
function normalizeBaseUrl(value) {
  let normalized = String(value).trim();
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

function parseDotEnvValue(source, key) {
  for (const line of String(source).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1] !== key) continue;
    const raw = match[2];
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    return raw.replace(/\s+#.*$/, '').trim();
  }
  return '';
}

function resolveGatewayApiKey(options = {}) {
  const environment = options.env || process.env;
  const direct = environment.HERMES_GATEWAY_API_KEY || environment.API_SERVER_KEY;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const envPath = options.envPath || environment.HERMES_GATEWAY_ENV_PATH || DEFAULT_GATEWAY_ENV;
  try { return parseDotEnvValue(fs.readFileSync(envPath, 'utf8'), 'API_SERVER_KEY'); }
  catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function pairingDashboardUrl(controlPlaneUrl, userCode) {
  const target = new URL('/dashboard', `${normalizeBaseUrl(controlPlaneUrl)}/`);
  target.searchParams.set('pair', userCode);
  return target.toString();
}

function pairingMatchesControlPlane(config, controlPlaneUrl) {
  if (!config?.deviceId || !config?.controlPlaneUrl) return false;
  try {
    return new URL(config.controlPlaneUrl).origin === new URL(controlPlaneUrl).origin;
  } catch {
    return false;
  }
}

function openPairingDashboard(controlPlaneUrl, userCode) {
  if (process.platform !== 'darwin' || process.env.HERMES_CONNECTOR_NO_BROWSER === '1') return false;
  try {
    const opener = childProcess.spawn('/usr/bin/open', [pairingDashboardUrl(controlPlaneUrl, userCode)], {
      detached: true,
      stdio: 'ignore',
    });
    opener.unref();
    return true;
  } catch {
    return false;
  }
}

function createIdentity(name = os.hostname()) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    deviceName: name,
    publicJwk: publicKey.export({ format: 'jwk' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function saveConfig(filePath, config) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, filePath);
  fs.chmodSync(filePath, 0o600);
}

function loadConfig(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

function canonicalRequest(method, pathname, timestamp, nonce, bodyText) {
  return [method.toUpperCase(), pathname, String(timestamp), nonce, sha256(bodyText)].join('\n');
}

function signedHeaders(config, method, pathname, bodyText, now = Date.now(), nonce = crypto.randomBytes(18).toString('base64url')) {
  if (!config.deviceId || !config.privateKeyPem) throw new Error('connector is not paired');
  const canonical = canonicalRequest(method, pathname, now, nonce, bodyText);
  const signature = crypto.sign('sha256', Buffer.from(canonical), { key: config.privateKeyPem, dsaEncoding: 'ieee-p1363' });
  return {
    'content-type': 'application/json',
    'x-hermes-device': config.deviceId,
    'x-hermes-timestamp': String(now),
    'x-hermes-nonce': nonce,
    'x-hermes-signature': base64Url(signature),
  };
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return { response, body };
}

async function startPairing(config, configPath) {
  const result = await jsonRequest(`${config.controlPlaneUrl}/api/pairing/start`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceName: config.deviceName, publicJwk: config.publicJwk }),
  });
  config.deviceCode = result.body.deviceCode;
  saveConfig(configPath, config);
  const opened = openPairingDashboard(config.controlPlaneUrl, result.body.userCode);
  process.stdout.write(`\n${opened ? 'Opened the ThumbGate approval page in your browser.' : `Pair this Hermes machine at ${config.controlPlaneUrl}/dashboard`}\nCode: ${result.body.userCode}\nFingerprint: ${result.body.fingerprint}\n\n`);
  const deadline = Date.now() + result.body.expiresIn * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const response = await fetch(`${config.controlPlaneUrl}/api/pairing/status`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceCode: config.deviceCode }),
    });
    if (response.status === 202) continue;
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Pairing failed (${response.status})`);
    config.deviceId = body.deviceId;
    delete config.deviceCode;
    saveConfig(configPath, config);
    process.stdout.write(`Paired ${config.deviceName} as ${config.deviceId}.\n`);
    return;
  }
  throw new Error('pairing code expired before approval');
}

async function signedPost(config, pathname, payload = {}) {
  const bodyText = JSON.stringify(payload);
  return jsonRequest(`${config.controlPlaneUrl}${pathname}`, {
    method: 'POST', headers: signedHeaders(config, 'POST', pathname, bodyText), body: bodyText,
  });
}

function gatewayHeaders(options = {}) {
  const apiKey = resolveGatewayApiKey(options);
  return { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) };
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content);
  return content.map((part) => typeof part === 'string' ? part : part?.text || '').filter(Boolean).join('\n');
}

function timestampMillis(value, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? Math.floor(value * 1000) : Math.floor(value);
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function gatewayJson(baseUrl, pathname, options = {}) {
  const timeout = options.method === 'POST' ? TASK_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
  const { gatewayEnvPath, ...requestOptions } = options;
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...requestOptions, signal: options.signal || AbortSignal.timeout(timeout),
    headers: { ...gatewayHeaders({ envPath: gatewayEnvPath }), ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Hermes session gateway HTTP ${response.status}`);
  return payload;
}

function boundContextMessages(messages) {
  let chars = 0;
  const bounded = [];
  for (const message of messages.slice(-MAX_CONTEXT_MESSAGES).reverse()) {
    const content = contentText(message.content).trim().slice(0, 8_000);
    const role = ['user', 'assistant', 'system'].includes(message.role) ? message.role : '';
    if (!role || !content || chars + content.length > MAX_CONTEXT_CHARS) continue;
    bounded.unshift({ role, content });
    chars += content.length;
  }
  return bounded;
}

async function collectGatewaySessions(config) {
  const payload = await gatewayJson(config.sessionGatewayUrl, `/api/sessions?limit=${SESSION_LIMIT}`, { gatewayEnvPath: config.gatewayEnvPath });
  const sessions = Array.isArray(payload.data) ? payload.data : [];
  const contextIds = new Set(sessions.slice(0, CONTEXT_SESSION_LIMIT).map((session) => String(session.id)));
  return Promise.all(sessions.map(async (session) => {
    let messages = [];
    if (session.id && contextIds.has(String(session.id))) {
      try {
        const messagePayload = await gatewayJson(config.sessionGatewayUrl, `/api/sessions/${encodeURIComponent(session.id)}/messages`, { gatewayEnvPath: config.gatewayEnvPath });
        messages = boundContextMessages(Array.isArray(messagePayload.data) ? messagePayload.data : []);
      } catch (error) {
        console.error(`[hermes-cloud-connector] context sync skipped for ${session.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    const preview = String(session.preview || messages.at(-1)?.content || '').slice(0, 500);
    return {
      id: String(session.id), title: String(session.title || preview || 'Hermes session').slice(0, 120),
      source: String(session.source || 'hermes-mobile').slice(0, 40), model: session.model ? String(session.model).slice(0, 120) : undefined,
      preview, messageCount: Number(session.message_count || messages.length || 0),
      updatedAt: timestampMillis(session.last_active_at ?? session.last_active ?? session.started_at), messages,
    };
  }));
}

async function syncGatewaySessions(config) {
  const sessions = await collectGatewaySessions(config);
  return signedPost(config, '/api/device/sessions/sync', { sessions });
}

async function executeLocal(config, task) {
  if (task.sourceSessionId) {
    const handoff = Array.isArray(task.handoffMessages) && task.handoffMessages.length
      ? `Cloud/web continuation since this Mac last synced:\n${task.handoffMessages.map((message) => `${message.role}: ${message.content}`).join('\n\n').slice(-24_000)}`
      : undefined;
    const payload = await gatewayJson(config.sessionGatewayUrl, `/api/sessions/${encodeURIComponent(task.sourceSessionId)}/chat`, {
      method: 'POST', gatewayEnvPath: config.gatewayEnvPath,
      body: JSON.stringify({ message: task.prompt, ...(handoff ? { system_message: handoff } : {}) }),
    });
    return contentText(payload.message?.content || payload.output || payload.content || payload.response) || JSON.stringify(payload);
  }
  const messages = [...(Array.isArray(task.contextMessages) ? task.contextMessages : []), { role: 'user', content: task.prompt }];
  const payload = await gatewayJson(config.modelGatewayUrl, '/v1/chat/completions', {
    method: 'POST', gatewayEnvPath: config.gatewayEnvPath,
    body: JSON.stringify({ model: process.env.HERMES_LOCAL_MODEL || 'hermes', messages, stream: false }),
  });
  return contentText(payload.choices?.[0]?.message?.content) || JSON.stringify(payload);
}

async function cycle(config, options = {}) {
  if (options.heartbeat !== false) await signedPost(config, '/api/device/heartbeat');
  if (options.syncSessions) {
    try { await syncGatewaySessions(config); }
    catch (error) { console.error(`[hermes-cloud-connector] session sync unavailable: ${error instanceof Error ? error.message : error}`); }
  }
  const bodyText = '{}';
  const response = await fetch(`${config.controlPlaneUrl}/api/device/tasks/claim`, {
    method: 'POST', headers: signedHeaders(config, 'POST', '/api/device/tasks/claim', bodyText), body: bodyText,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 204) return false;
  const claim = await response.json();
  if (!response.ok) throw new Error(claim.error || `Claim failed (${response.status})`);
  try {
    const result = await executeLocal(config, claim.task);
    await signedPost(config, '/api/device/tasks/complete', { taskId: claim.task.id, leaseToken: claim.task.leaseToken, result });
  } catch (error) {
    await signedPost(config, '/api/device/tasks/complete', { taskId: claim.task.id, leaseToken: claim.task.leaseToken, error: error instanceof Error ? error.message : String(error) });
  }
  return true;
}

async function main() {
  const configPath = process.env.HERMES_CONNECTOR_CONFIG || DEFAULT_CONFIG;
  let config = loadConfig(configPath);
  if (!config) {
    config = {
      ...createIdentity(process.env.HERMES_DEVICE_NAME || os.hostname()),
      controlPlaneUrl: normalizeBaseUrl(process.env.HERMES_CONTROL_PLANE_URL || DEFAULT_CONTROL_PLANE),
      sessionGatewayUrl: normalizeBaseUrl(process.env.HERMES_SESSION_GATEWAY_URL || DEFAULT_SESSION_GATEWAY),
      modelGatewayUrl: normalizeBaseUrl(process.env.HERMES_MODEL_GATEWAY_URL || DEFAULT_MODEL_GATEWAY),
    };
    saveConfig(configPath, config);
  }
  config.controlPlaneUrl = normalizeBaseUrl(process.env.HERMES_CONTROL_PLANE_URL || config.controlPlaneUrl || DEFAULT_CONTROL_PLANE);
  config.sessionGatewayUrl = normalizeBaseUrl(process.env.HERMES_SESSION_GATEWAY_URL || config.sessionGatewayUrl || DEFAULT_SESSION_GATEWAY);
  config.modelGatewayUrl = normalizeBaseUrl(process.env.HERMES_MODEL_GATEWAY_URL || config.modelGatewayUrl || config.gatewayUrl || DEFAULT_MODEL_GATEWAY);
  config.gatewayEnvPath = process.env.HERMES_GATEWAY_ENV_PATH || config.gatewayEnvPath || DEFAULT_GATEWAY_ENV;
  saveConfig(configPath, config);
  if (!config.deviceId || process.argv.includes('--pair')) await startPairing(config, configPath);
  if (process.argv.includes('--pair-only')) return;
  if (process.argv.includes('--sync-only')) { await syncGatewaySessions(config); return; }
  if (process.argv.includes('--once')) { await cycle(config, { heartbeat: true, syncSessions: true }); return; }
  let lastHeartbeat = 0;
  let lastSessionSync = 0;
  while (true) {
    try {
      const now = Date.now();
      const heartbeat = now - lastHeartbeat >= HEARTBEAT_MS;
      if (heartbeat) lastHeartbeat = now;
      const syncSessions = now - lastSessionSync >= SESSION_SYNC_MS;
      if (syncSessions) lastSessionSync = now;
      await cycle(config, { heartbeat, syncSessions });
    } catch (error) { console.error(`[hermes-cloud-connector] ${error instanceof Error ? error.message : error}`); }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

module.exports = { boundContextMessages, canonicalRequest, collectGatewaySessions, contentText, createIdentity, executeLocal, gatewayHeaders, loadConfig, pairingDashboardUrl, pairingMatchesControlPlane, parseDotEnvValue, resolveGatewayApiKey, saveConfig, signedHeaders, sha256, syncGatewaySessions, timestampMillis };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
