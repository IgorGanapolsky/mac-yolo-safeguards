#!/usr/bin/env node
'use strict';

/**
 * Hermes relay Mac worker — dials out to cloud relay, forwards GATE.BLOCKED approvals.
 *
 * Usage:
 *   node tools/hermes-relay-worker.js
 *   node tools/hermes-relay-worker.js --pair
 *   node tools/hermes-relay-worker.js --once
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  createApprovalIntegrity,
  validateAllowVerdict,
} = require('../services/hermes-relay/approval-integrity');

const REPO = path.resolve(__dirname, '..');
const HERMES_DIR = path.join(os.homedir(), '.hermes');
const WORKER_ENV = path.join(HERMES_DIR, 'relay-worker.env');
const HERMES_ENV = path.join(HERMES_DIR, '.env');
const DEFAULT_CLOUD_URL = 'https://hermesmobile-cloud.fly.dev';
const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8642';
const HEARTBEAT_MS = 15_000;
const VERDICT_POLL_MS = 2_000;
const RECONNECT_MS = 5_000;

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function writeEnvFile(filePath, values) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, { utf8: true, mode: 0o600 });
}

function mergeEnv() {
  return {
    ...readEnvFile(HERMES_ENV),
    ...readEnvFile(WORKER_ENV),
  };
}

function normalizeBaseUrl(input) {
  return String(input || DEFAULT_CLOUD_URL).trim().replace(/\/+$/, '');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    const message = body?.error || body?.raw || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

function gatewayHealthOk() {
  const result = spawnSync(
    'curl',
    ['-sf', '--max-time', '3', `${DEFAULT_GATEWAY_URL}/health`],
    { encoding: 'utf8' },
  );
  return result.status === 0;
}

function detectHostname() {
  return os.hostname();
}

function detectProject() {
  const cwd = process.cwd();
  if (cwd.includes('mac-yolo-safeguards')) {
    return 'mac-yolo-safeguards';
  }
  return path.basename(cwd) || 'hermes';
}

async function registerWorker(env) {
  const cloudUrl = normalizeBaseUrl(env.HERMES_MOBILE_CLOUD_URL || env.HERMES_RELAY_URL);
  const body = {
    hostname: env.HERMES_RELAY_HOSTNAME || detectHostname(),
    project: env.HERMES_RELAY_PROJECT || detectProject(),
    machine_id: env.HERMES_RELAY_MACHINE_ID || slugify(detectHostname()),
    label: env.HERMES_RELAY_LABEL || detectHostname(),
    repo: REPO,
    gateway_ok: gatewayHealthOk(),
    status: 'online',
  };
  const headers = {
    'Content-Type': 'application/json',
  };
  if (env.HERMES_RELAY_WORKER_TOKEN) {
    headers.Authorization = `Worker ${env.HERMES_RELAY_WORKER_TOKEN}`;
  }
  const registered = await fetchJson(`${cloudUrl}/v1/worker/register`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const nextEnv = {
    ...env,
    HERMES_MOBILE_CLOUD_URL: cloudUrl,
    HERMES_RELAY_WORKER_TOKEN: registered.worker_token,
    HERMES_RELAY_WORKER_ID: registered.worker_id,
    HERMES_RELAY_MACHINE_ID: registered.machine_id,
  };
  writeEnvFile(WORKER_ENV, {
    HERMES_MOBILE_CLOUD_URL: cloudUrl,
    HERMES_RELAY_WORKER_TOKEN: registered.worker_token,
    HERMES_RELAY_WORKER_ID: registered.worker_id,
    HERMES_RELAY_MACHINE_ID: registered.machine_id,
    HERMES_RELAY_HOSTNAME: body.hostname,
    HERMES_RELAY_PROJECT: body.project,
  });
  return nextEnv;
}

function slugify(input) {
  return String(input || 'worker')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'worker';
}

async function startPairing(env) {
  const cloudUrl = normalizeBaseUrl(env.HERMES_MOBILE_CLOUD_URL);
  const pair = await fetchJson(`${cloudUrl}/v1/pair/start`, {
    method: 'POST',
    headers: {
      Authorization: `Worker ${env.HERMES_RELAY_WORKER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  writeEnvFile(WORKER_ENV, {
    ...readEnvFile(WORKER_ENV),
    HERMES_MOBILE_RELAY_CODE: pair.code,
  });
  console.log('Hermes relay pairing code:', pair.code);
  console.log('Deep link: hermes://relay?relay=' + encodeURIComponent(pair.code));
  return pair.code;
}

function buildGateActionMessage(actionId, decision, choice, approvalDigest) {
  return JSON.stringify({
    event: 'GATE.ACTION',
    timestamp: new Date().toISOString(),
    payload: {
      actionId,
      decision,
      choice: choice || (decision === 'reject' ? 'deny' : 'once'),
      source: 'relay_hook',
      operatorNote: `Decision ${decision} from Hermes Mobile relay`,
      approvalDigest: approvalDigest || null,
    },
  });
}

function gateBlockedToRelayEvent(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed?.event !== 'GATE.BLOCKED' || !parsed.payload) {
    return null;
  }
  const payload = parsed.payload;
  if (!payload.actionId || !payload.toolName) {
    return null;
  }
  const approvalIntegrity = createApprovalIntegrity(payload);
  return {
    id: payload.actionId,
    event: {
      tool_name: payload.toolName,
      hook_event_name: payload.reason,
      session_id: payload.sessionKey,
      tool_input: {
        command: payload.command,
        file_path: payload.workspacePath,
      },
    },
    reason: payload.reason,
    source: 'gateway_guard',
    approval_integrity: approvalIntegrity,
  };
}

class GatewayEventsSocket {
  constructor(onGateBlocked, onStatus) {
    this.onGateBlocked = onGateBlocked;
    this.onStatus = onStatus;
    this.ws = null;
    this.shouldRun = true;
    this.reconnectTimer = null;
  }

  stop() {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  connect() {
    if (!this.shouldRun) {
      return;
    }
    const url = DEFAULT_GATEWAY_URL.replace(/^http/i, 'ws') + '/v1/events';
    this.onStatus(`connecting gateway ${url}`);
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => {
      this.onStatus('gateway connected');
    });
    this.ws.addEventListener('message', (event) => {
      const relayEvent = gateBlockedToRelayEvent(String(event.data));
      if (relayEvent) {
        this.onGateBlocked(relayEvent);
      }
    });
    this.ws.addEventListener('close', () => {
      this.onStatus('gateway disconnected');
      this.ws = null;
      if (this.shouldRun) {
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_MS);
      }
    });
    this.ws.addEventListener('error', () => {
      this.onStatus('gateway error');
    });
  }

  sendGateAction(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      return true;
    }
    return false;
  }
}

async function enqueueEvent(env, relayEvent) {
  const cloudUrl = normalizeBaseUrl(env.HERMES_MOBILE_CLOUD_URL);
  return fetchJson(`${cloudUrl}/v1/events`, {
    method: 'POST',
    headers: {
      Authorization: `Worker ${env.HERMES_RELAY_WORKER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(relayEvent),
  });
}

async function heartbeat(env) {
  const cloudUrl = normalizeBaseUrl(env.HERMES_MOBILE_CLOUD_URL);
  return fetchJson(`${cloudUrl}/v1/worker/heartbeat`, {
    method: 'POST',
    headers: {
      Authorization: `Worker ${env.HERMES_RELAY_WORKER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      hostname: env.HERMES_RELAY_HOSTNAME || detectHostname(),
      project: env.HERMES_RELAY_PROJECT || detectProject(),
      status: 'online',
      gateway_ok: gatewayHealthOk(),
    }),
  });
}

async function pollVerdicts(env, gatewaySocket) {
  const cloudUrl = normalizeBaseUrl(env.HERMES_MOBILE_CLOUD_URL);
  const body = await fetchJson(`${cloudUrl}/v1/worker/verdicts`, {
    headers: {
      Authorization: `Worker ${env.HERMES_RELAY_WORKER_TOKEN}`,
    },
  });
  for (const verdict of body.verdicts || []) {
    if (verdict.decision !== 'block') {
      const validation = validateAllowVerdict(
        verdict.approval_integrity,
        { approval_digest: verdict.approval_digest },
        Date.now(),
      );
      if (!validation.ok) {
        console.warn('relay allow verdict rejected:', verdict.event_id, validation.error);
        continue;
      }
    }
    const decision = verdict.decision === 'block' ? 'reject' : 'approve';
    const choice = verdict.decision === 'block' ? 'deny' : 'once';
    const message = buildGateActionMessage(
      verdict.event_id,
      decision,
      choice,
      verdict.approval_digest,
    );
    if (!gatewaySocket.sendGateAction(message)) {
      console.warn('relay verdict dropped — gateway socket not ready:', verdict.event_id);
    } else {
      console.log('relay verdict forwarded:', verdict.event_id, verdict.decision);
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  let env = mergeEnv();

  if (!env.HERMES_RELAY_WORKER_TOKEN) {
    env = await registerWorker(env);
    console.log('Registered relay worker:', env.HERMES_RELAY_WORKER_ID);
  }

  if (args.has('--pair')) {
    await startPairing(env);
    if (args.has('--once')) {
      return;
    }
  }

  const gatewaySocket = new GatewayEventsSocket(
    async (relayEvent) => {
      try {
        await enqueueEvent(env, relayEvent);
        console.log('relay enqueued approval:', relayEvent.id);
      } catch (error) {
        console.error('relay enqueue failed:', error.message);
      }
    },
    (status) => console.log('relay worker:', status),
  );

  gatewaySocket.connect();

  const heartbeatTimer = setInterval(() => {
    heartbeat(env).catch((error) => {
      console.error('relay heartbeat failed:', error.message);
    });
  }, HEARTBEAT_MS);

  const verdictTimer = setInterval(() => {
    pollVerdicts(env, gatewaySocket).catch((error) => {
      console.error('relay verdict poll failed:', error.message);
    });
  }, VERDICT_POLL_MS);

  const shutdown = () => {
    clearInterval(heartbeatTimer);
    clearInterval(verdictTimer);
    gatewaySocket.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (args.has('--once')) {
    await heartbeat(env);
    await pollVerdicts(env, gatewaySocket);
    shutdown();
    return;
  }

  console.log(
    'Hermes relay worker running',
    env.HERMES_RELAY_WORKER_ID,
    normalizeBaseUrl(env.HERMES_MOBILE_CLOUD_URL),
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  buildGateActionMessage,
  gateBlockedToRelayEvent,
  pollVerdicts,
};
