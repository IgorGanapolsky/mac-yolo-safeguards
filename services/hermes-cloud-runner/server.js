#!/usr/bin/env node
'use strict';

const http = require('http');
const os = require('os');

const required = ['HERMES_CONTROL_PLANE_URL', 'HERMES_CLOUD_RUNNER_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
const CONTROL_TIMEOUT_MS = Number(process.env.CONTROL_TIMEOUT_MS || 15_000);
const MODEL_TIMEOUT_MS = Number(process.env.MODEL_TIMEOUT_MS || 75_000);
const MODEL_MAX_TOKENS = Number(process.env.MODEL_MAX_TOKENS || 2_048);
const LEASE_RENEW_MS = Number(process.env.LEASE_RENEW_MS || 30_000);
const POOLSIDE_BASE_URL = 'https://inference.poolside.ai/v1';
const POOLSIDE_FAST_MODEL = 'poolside/laguna-xs-2.1';
const POOLSIDE_DEEP_MODEL = 'poolside/laguna-s-2.1';
let lastPollAt = 0;
let lastTaskAt = 0;
let lastError = null;

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
  const config = {
    controlPlaneUrl: stripTrailingSlashes(env.HERMES_CONTROL_PLANE_URL), token: env.HERMES_CLOUD_RUNNER_TOKEN,
    openaiBaseUrl: stripTrailingSlashes(env.OPENAI_BASE_URL), openaiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL, runnerId: env.HERMES_CLOUD_RUNNER_ID || os.hostname(),
  };
  if (env.POOLSIDE_API_KEY) {
    config.poolside = {
      baseUrl: stripTrailingSlashes(env.POOLSIDE_BASE_URL || POOLSIDE_BASE_URL),
      apiKey: env.POOLSIDE_API_KEY,
      fastModel: env.POOLSIDE_FAST_MODEL || POOLSIDE_FAST_MODEL,
      deepModel: env.POOLSIDE_DEEP_MODEL || POOLSIDE_DEEP_MODEL,
    };
  }
  return config;
}

function classifyModelTask(task = {}) {
  const prompt = typeof task.prompt === 'string' ? task.prompt : '';
  const explicitCategory = typeof task.category === 'string' ? task.category.toLowerCase() : '';
  const coding = explicitCategory
    ? explicitCategory === 'coding'
    : /\b(code|coding|bug|debug|fix|implement|refactor|repository|repo|test|typescript|javascript|python|swift|kotlin|sql|api|function|class|build|compile|lint|pull request|\bpr\b)\b|```/i.test(prompt);
  const longHorizon = task.longHorizon === true
    || task.complexity === 'high'
    || prompt.length > 4_000
    || /\b(long[- ]horizon|architecture|migration|migrate|multi[- ]file|root cause|end[- ]to[- ]end|large repo|large repository|system design)\b/i.test(prompt);
  return {
    coding,
    longHorizon,
    requiresVision: task.requiresVision === true,
    sensitive: task.sensitive === true
      || /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(api[_ -]?key|access[_ -]?token|client[_ -]?secret|password)\s*[:=]/i.test(prompt),
  };
}

function selectExecutionRoute(config, task = {}) {
  const fallback = {
    provider: 'configured-default',
    baseUrl: config.openaiBaseUrl,
    apiKey: config.openaiKey,
    model: config.model,
  };
  const profile = classifyModelTask(task);
  if (!config.poolside || !profile.coding || profile.requiresVision || profile.sensitive) return fallback;
  return {
    provider: 'poolside',
    baseUrl: config.poolside.baseUrl,
    apiKey: config.poolside.apiKey,
    model: profile.longHorizon ? config.poolside.deepModel : config.poolside.fastModel,
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

async function execute(config, task) {
  // Select exactly one provider before the request. A failed paid route is surfaced
  // to the control plane; this function never silently fires a second paid meter.
  const route = selectExecutionRoute(config, task);
  const context = Array.isArray(task.contextMessages)
    ? task.contextMessages.filter((message) => ['user', 'assistant', 'system'].includes(message?.role) && typeof message?.content === 'string')
    : [];
  const response = await fetch(`${route.baseUrl}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${route.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: route.model, messages: [...context, { role: 'user', content: task.prompt }], max_tokens: MODEL_MAX_TOKENS, stream: false }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Model provider HTTP ${response.status}`);
  return payload.choices?.[0]?.message?.content ?? JSON.stringify(payload);
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

function healthServer(config, port = Number(process.env.PORT || 8080)) {
  return http.createServer((request, response) => {
    if (request.url !== '/health') { response.writeHead(404).end(); return; }
    response.writeHead(lastError ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      ok: !lastError,
      lastPollAt,
      lastTaskAt,
      degraded: Boolean(lastError),
      models: {
        default: config.model,
        poolside: config.poolside ? [config.poolside.fastModel, config.poolside.deepModel] : [],
      },
    }));
  }).listen(port, '0.0.0.0');
}

async function main() {
  const config = configFromEnv();
  const schedule = pollingSchedule();
  healthServer(config);
  while (true) {
    let didWork = false;
    try { didWork = await runOnce(config); lastError = null; }
    catch (error) { lastError = error instanceof Error ? error.message : String(error); console.error(`[hermes-cloud-runner] ${lastError}`); }
    await new Promise((resolve) => setTimeout(resolve, nextPollDelay(didWork, schedule)));
  }
}

module.exports = {
  callControl,
  classifyModelTask,
  configFromEnv,
  execute,
  healthServer,
  nextPollDelay,
  pollingSchedule,
  runOnce,
  selectExecutionRoute,
  withLeaseRenewal,
};
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
