#!/usr/bin/env node
'use strict';

const http = require('http');
const os = require('os');

const required = ['HERMES_CONTROL_PLANE_URL', 'HERMES_CLOUD_RUNNER_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
const CONTROL_TIMEOUT_MS = Number(process.env.CONTROL_TIMEOUT_MS || 15_000);
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 75_000);
const MODEL_MAX_TOKENS = Number(process.env.MODEL_MAX_TOKENS || 2_048);
const LEASE_RENEW_MS = Number(process.env.LEASE_RENEW_MS || 30_000);
let lastPollAt = 0;
let lastTaskAt = 0;
let lastError = null;

function positiveMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pollingSchedule(env = process.env) {
  const activePollMs = positiveMilliseconds(env.ACTIVE_POLL_MS, 500);
  const idlePollMs = Math.max(
    activePollMs,
    positiveMilliseconds(env.IDLE_POLL_MS || env.POLL_MS, 10_000),
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
    fallbackBaseUrl: env.FALLBACK_OPENAI_BASE_URL ? stripTrailingSlashes(env.FALLBACK_OPENAI_BASE_URL) : null,
    fallbackKey: env.FALLBACK_OPENAI_API_KEY || null,
    fallbackModel: env.FALLBACK_OPENAI_MODEL || null,
  };
}

async function callControl(config, pathname, body = {}) {
  const response = await fetch(`${config.controlPlaneUrl}${pathname}`, {
    method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'x-hermes-runner': config.runnerId, 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(CONTROL_TIMEOUT_MS),
  });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Control plane HTTP ${response.status}`);
  return payload;
}

async function requestCompletions(baseUrl, key, model, messages) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: MODEL_MAX_TOKENS, stream: false }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  const payload = await response.json();
  if (!response.ok) {
    const errMsg = payload.error?.message || payload.error || `Model provider HTTP ${response.status}`;
    const err = new Error(errMsg);
    err.status = response.status;
    err.isQuota = response.status === 429 || /limit exhausted|quota|overloaded/i.test(errMsg);
    throw err;
  }
  return payload.choices?.[0]?.message?.content ?? JSON.stringify(payload);
}

async function execute(config, task) {
  const context = Array.isArray(task.contextMessages)
    ? task.contextMessages.filter((message) => ['user', 'assistant', 'system'].includes(message?.role) && typeof message?.content === 'string')
    : [];
  const messages = [...context, { role: 'user', content: task.prompt }];

  try {
    return await requestCompletions(config.openaiBaseUrl, config.openaiKey, config.model, messages);
  } catch (primaryError) {
    // If primary failed due to quota/rate-limit and fallback is available, attempt fallback
    if (primaryError.isQuota && config.fallbackBaseUrl && config.fallbackKey && config.fallbackModel) {
      try {
        console.warn(`[hermes-cloud-runner] Primary provider hit quota limit (${primaryError.message}). Failing over to fallback ${config.fallbackModel}...`);
        return await requestCompletions(config.fallbackBaseUrl, config.fallbackKey, config.fallbackModel, messages);
      } catch (fallbackError) {
        console.error(`[hermes-cloud-runner] Fallback provider also failed: ${fallbackError.message}`);
      }
    }
    throw primaryError;
  }
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
    response.writeHead(lastError ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: !lastError, lastPollAt, lastTaskAt, degraded: Boolean(lastError) }));
  }).listen(port, '0.0.0.0');
}

async function main() {
  const config = configFromEnv();
  const schedule = pollingSchedule();
  healthServer();
  while (true) {
    let didWork = false;
    try { didWork = await runOnce(config); lastError = null; }
    catch (error) { lastError = error instanceof Error ? error.message : String(error); console.error(`[hermes-cloud-runner] ${lastError}`); }
    await new Promise((resolve) => setTimeout(resolve, nextPollDelay(didWork, schedule)));
  }
}

module.exports = { callControl, configFromEnv, execute, nextPollDelay, pollingSchedule, runOnce, withLeaseRenewal };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
