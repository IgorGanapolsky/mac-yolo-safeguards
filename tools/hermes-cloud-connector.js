#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_CONFIG = path.join(os.homedir(), '.hermes', 'cloud-connector.json');
const DEFAULT_CONTROL_PLANE = 'https://hermes-agent-control.iganapolsky.chatgpt.site';
const DEFAULT_GATEWAY = 'http://127.0.0.1:4010';
const POLL_MS = 3_000;
const HEARTBEAT_MS = 15_000;

function base64Url(value) { return Buffer.from(value).toString('base64url'); }
function sha256(value) { return base64Url(crypto.createHash('sha256').update(value).digest()); }
function normalizeBaseUrl(value) { return String(value).trim().replace(/\/+$/, ''); }

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
  const response = await fetch(url, options);
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
  process.stdout.write(`\nPair this Hermes machine at ${config.controlPlaneUrl}/dashboard\nCode: ${result.body.userCode}\nFingerprint: ${result.body.fingerprint}\n\n`);
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

async function executeLocal(config, task) {
  const response = await fetch(`${config.gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(process.env.HERMES_GATEWAY_API_KEY ? { authorization: `Bearer ${process.env.HERMES_GATEWAY_API_KEY}` } : {}) },
    body: JSON.stringify({ model: process.env.HERMES_LOCAL_MODEL || 'hermes', messages: [{ role: 'user', content: task.prompt }], stream: false }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Hermes gateway HTTP ${response.status}`);
  return payload.choices?.[0]?.message?.content ?? JSON.stringify(payload);
}

async function cycle(config) {
  await signedPost(config, '/api/device/heartbeat');
  const bodyText = '{}';
  const response = await fetch(`${config.controlPlaneUrl}/api/device/tasks/claim`, {
    method: 'POST', headers: signedHeaders(config, 'POST', '/api/device/tasks/claim', bodyText), body: bodyText,
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
    config = { ...createIdentity(process.env.HERMES_DEVICE_NAME || os.hostname()), controlPlaneUrl: normalizeBaseUrl(process.env.HERMES_CONTROL_PLANE_URL || DEFAULT_CONTROL_PLANE), gatewayUrl: normalizeBaseUrl(process.env.HERMES_GATEWAY_URL || DEFAULT_GATEWAY) };
    saveConfig(configPath, config);
  }
  config.controlPlaneUrl = normalizeBaseUrl(process.env.HERMES_CONTROL_PLANE_URL || config.controlPlaneUrl || DEFAULT_CONTROL_PLANE);
  config.gatewayUrl = normalizeBaseUrl(process.env.HERMES_GATEWAY_URL || config.gatewayUrl || DEFAULT_GATEWAY);
  saveConfig(configPath, config);
  if (!config.deviceId || process.argv.includes('--pair')) await startPairing(config, configPath);
  if (process.argv.includes('--pair-only')) return;
  if (process.argv.includes('--once')) { await cycle(config); return; }
  let lastHeartbeat = 0;
  while (true) {
    try {
      const now = Date.now();
      if (now - lastHeartbeat >= HEARTBEAT_MS) lastHeartbeat = now;
      await cycle(config);
    } catch (error) { console.error(`[hermes-cloud-connector] ${error instanceof Error ? error.message : error}`); }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

module.exports = { canonicalRequest, createIdentity, loadConfig, saveConfig, signedHeaders, sha256 };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
