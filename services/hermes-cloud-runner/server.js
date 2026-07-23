#!/usr/bin/env node
'use strict';

const http = require('http');
const os = require('os');

const required = ['HERMES_CONTROL_PLANE_URL', 'HERMES_CLOUD_RUNNER_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
const CONTROL_TIMEOUT_MS = Number(process.env.CONTROL_TIMEOUT_MS || 15_000);
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 75_000);
const MODEL_MAX_TOKENS = Number(process.env.MODEL_MAX_TOKENS || 2_048);
const LEASE_RENEW_MS = Number(process.env.LEASE_RENEW_MS || 30_000);
const CONTROL_RETRIES = Math.max(1, Number(process.env.CONTROL_RETRIES || 3));
const CONTROL_RETRY_BASE_MS = Number(process.env.CONTROL_RETRY_BASE_MS || 400);
let lastPollAt = 0;
let lastTaskAt = 0;
let lastError = null;
let consecutiveErrors = 0;

function positiveMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pollingSchedule(env = process.env) {
  const activePollMs = positiveMilliseconds(env.ACTIVE_POLL_MS, 1_000);
  const idlePollMs = Math.max(
    activePollMs,
    positiveMilliseconds(env.IDLE_POLL_MS || env.POLL_MS, 30_000),
  );
  return { activePollMs, idlePollMs };
}

function nextPollDelay(didWork, schedule = pollingSchedule()) {
  return didWork ? schedule.activePollMs : schedule.idlePollMs;
}

function stripTrailingSlashes(value) {
  let normalized = String(value);
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}

function configFromEnv(env = process.env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  return {
    controlPlaneUrl: stripTrailingSlashes(env.HERMES_CONTROL_PLANE_URL), token: env.HERMES_CLOUD_RUNNER_TOKEN,
    openaiBaseUrl: stripTrailingSlashes(env.OPENAI_BASE_URL), openaiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL, runnerId: env.HERMES_CLOUD_RUNNER_ID || os.hostname(),
  };
}

function isTransientControlError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|aborted|fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket|network|Unexpected end of JSON|empty response|502|503|504/i.test(message);
}

async function readJsonBody(response) {
  const text = await response.text();
  if (!text || !text.trim()) {
    if (response.status === 204 || response.ok) return null;
    throw new Error(`Control plane HTTP ${response.status}: empty response`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unexpected end of JSON input (${response.status}): ${reason}`);
  }
}

async function callControlOnce(config, pathname, body = {}) {
  const response = await fetch(`${config.controlPlaneUrl}${pathname}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'x-hermes-runner': config.runnerId,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (response.status === 204) return null;
  const payload = await readJsonBody(response);
  if (!response.ok) {
    const errMsg = payload && typeof payload === 'object' ? (payload.error || payload.message) : null;
    throw new Error(errMsg || `Control plane HTTP ${response.status}`);
  }
  return payload;
}

async function callControl(config, pathname, body = {}, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : CONTROL_RETRIES;
  let lastFailure = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await callControlOnce(config, pathname, body);
    } catch (error) {
      lastFailure = error;
      const transient = isTransientControlError(error);
      if (!transient || attempt >= retries) break;
      const delay = CONTROL_RETRY_BASE_MS * (2 ** (attempt - 1));
      console.warn(`[hermes-cloud-runner] control ${pathname} attempt ${attempt}/${retries} failed (${error instanceof Error ? error.message : String(error)}); retry in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastFailure;
}

async function execute(config, task) {
  const context = Array.isArray(task.contextMessages)
    ? task.contextMessages.filter((message) => ['user', 'assistant', 'system'].includes(message?.role) && typeof message?.content === 'string')
    : [];
  const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages: [...context, { role: 'user', content: task.prompt }], max_tokens: MODEL_MAX_TOKENS, stream: false }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  const payload = await readJsonBody(response);
  if (!response.ok) {
    const errMsg = payload && typeof payload === 'object'
      ? (payload.error?.message || payload.error || payload.message)
      : null;
    throw new Error(errMsg || `Model provider HTTP ${response.status}`);
  }
  return payload?.choices?.[0]?.message?.content ?? JSON.stringify(payload);
}

async function withLeaseRenewal(work, renew, intervalMs = LEASE_RENEW_MS) {
  let stopped = false;
  let renewal = Promise.resolve();
  const timer = setInterval(() => {
    renewal = renewal.then(async () => {
      if (!stopped) await renew();
    }).catch((error) => {
      console.error(`[hermes-cloud-runner] lease renewal failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, intervalMs);
  timer.unref?.();
  try { return await work(); }
  finally {
    stopped = true;
    clearInterval(timer);
    await renewal;
  }
}

async function runOnce(config) {
  lastPollAt = Date.now();
  const claim = await callControl(config, '/api/runner/tasks/claim');
  if (!claim) return false;
  lastTaskAt = Date.now();
  try {
    const result = await withLeaseRenewal(
      () => execute(config, claim.task),
      () => callControl(config, '/api/runner/tasks/renew', { taskId: claim.task.id, leaseToken: claim.task.leaseToken }),
    );
    await callControl(config, '/api/runner/tasks/complete', { taskId: claim.task.id, leaseToken: claim.task.leaseToken, result });
  } catch (error) {
    await callControl(config, '/api/runner/tasks/complete', { taskId: claim.task.id, leaseToken: claim.task.leaseToken, error: error instanceof Error ? error.message : String(error) });
  }
  return true;
}

function healthServer(port = Number(process.env.PORT || 8080)) {
  return http.createServer((request, response) => {
    if (request.url !== '/health') { response.writeHead(404).end(); return; }
    // Only mark degraded after multiple consecutive failures so rare JSON/timeout blips
    // do not flap the health endpoint.
    const degraded = consecutiveErrors >= 3;
    response.writeHead(degraded ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      ok: !degraded,
      lastPollAt,
      lastTaskAt,
      degraded,
      consecutiveErrors,
      lastError,
    }));
  }).listen(port, '0.0.0.0');
}

async function main() {
  const config = configFromEnv();
  const schedule = pollingSchedule();
  healthServer();
  while (true) {
    let didWork = false;
    try {
      didWork = await runOnce(config);
      lastError = null;
      consecutiveErrors = 0;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      consecutiveErrors += 1;
      console.error(`[hermes-cloud-runner] ${lastError}`);
    }
    await new Promise((resolve) => setTimeout(resolve, nextPollDelay(didWork, schedule)));
  }
}

module.exports = {
  callControl,
  callControlOnce,
  configFromEnv,
  execute,
  isTransientControlError,
  nextPollDelay,
  pollingSchedule,
  readJsonBody,
  runOnce,
  withLeaseRenewal,
};
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
