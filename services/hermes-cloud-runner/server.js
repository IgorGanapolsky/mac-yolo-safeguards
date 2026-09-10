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

function hopsFromEnv(env = process.env) {
  const collected = new Map();
  const push = (id, baseUrl, key, model) => {
    if (!id || !baseUrl || !key || !model) return;
    collected.set(id, {
      id: String(id),
      baseUrl: stripTrailingSlashes(baseUrl),
      key,
      model: String(model),
    });
  };
  push('primary', env.OPENAI_BASE_URL, env.OPENAI_API_KEY, env.OPENAI_MODEL);
  for (let i = 2; i <= 8; i += 1) {
    push(
      env[`HOSTED_HOP_${i}_ID`] || `hop${i}`,
      env[`HOSTED_HOP_${i}_BASE_URL`],
      env[`HOSTED_HOP_${i}_API_KEY`],
      env[`HOSTED_HOP_${i}_MODEL`],
    );
  }
  const order = String(env.HOSTED_HOP_ORDER || 'primary')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const hops = [];
  for (const id of order) {
    if (collected.has(id)) hops.push(collected.get(id));
  }
  for (const hop of collected.values()) {
    if (!hops.some((item) => item.id === hop.id)) hops.push(hop);
  }
  return hops;
}

function configFromEnv(env = process.env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const hops = hopsFromEnv(env);
  const primary = hops[0];
  return {
    controlPlaneUrl: stripTrailingSlashes(env.HERMES_CONTROL_PLANE_URL), token: env.HERMES_CLOUD_RUNNER_TOKEN,
    openaiBaseUrl: stripTrailingSlashes(env.OPENAI_BASE_URL), openaiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL, runnerId: env.HERMES_CLOUD_RUNNER_ID || os.hostname(),
    hops,
    primaryId: primary?.id || 'primary',
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

const hopCooldowns = new Map();
let lastHop = null;

function isRetryableProviderError(status, text) {
  if (status === 402 || status === 429) return true;
  const raw = String(text || '').toLowerCase();
  return raw.includes('credit limit exceeded')
    || raw.includes('weekly/monthly limit exhausted')
    || raw.includes('quota is exhausted')
    || raw.includes('no deployments available')
    || raw.includes('temporarily overloaded')
    || raw.includes('insufficient quota')
    || raw.includes('code 1310')
    || raw.includes('code:1310')
    || raw.includes('code: 1310');
}

function publicRunnerError(error) {
  const msg = error instanceof Error ? String(error.message || '') : 'runner_error';
  const raw = msg.toLowerCase();
  if (raw.includes('timeout') || raw.includes('abort')) return 'timeout';
  if (raw.includes('401') || raw.includes('auth')) return 'auth';
  if (raw.includes('429') || raw.includes('402') || raw.includes('quota') || raw.includes('credit') || raw.includes('exhausted') || raw.includes('overloaded')) {
    return 'provider_quota';
  }
  return 'runner_error';
}

function hopPublic(hop) {
  let host = null;
  try { host = new URL(hop.baseUrl).host; } catch { host = null; }
  const until = hopCooldowns.get(hop.id) || 0;
  return {
    id: hop.id,
    model: hop.model,
    host,
    coolingDown: until > Date.now(),
    cooldownUntil: until > Date.now() ? until : null,
  };
}

function rememberCooldown(hop, text) {
  const match = /reset at (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/i.exec(String(text || ''));
  let until = Date.now() + 45_000;
  if (match) {
    const parsed = Date.parse(`${match[1].replace(' ', 'T')}Z`);
    if (Number.isFinite(parsed) && parsed > Date.now()) until = parsed;
  }
  hopCooldowns.set(hop.id, until);
}

function hopsFor(config) {
  if (Array.isArray(config.hops) && config.hops.length) return config.hops;
  return [{
    id: 'primary',
    baseUrl: config.openaiBaseUrl,
    key: config.openaiKey,
    model: config.model,
  }];
}

async function completeOnHop(hop, messages) {
  const response = await fetch(`${hop.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${hop.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: hop.model, messages, max_tokens: MODEL_MAX_TOKENS, stream: false }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => ({}));
  const errText = payload.error?.message || payload.error || payload.detail || `Model provider HTTP ${response.status}`;
  if (!response.ok) {
    const error = new Error(typeof errText === 'string' ? errText : `Model provider HTTP ${response.status}`);
    error.status = response.status;
    error.retryable = isRetryableProviderError(response.status, errText);
    throw error;
  }
  return payload.choices?.[0]?.message?.content ?? JSON.stringify(payload);
}

async function execute(config, task) {
  const context = Array.isArray(task.contextMessages)
    ? task.contextMessages.filter((message) => ['user', 'assistant', 'system'].includes(message?.role) && typeof message?.content === 'string')
    : [];
  const messages = [...context, { role: 'user', content: task.prompt }];
  const hops = hopsFor(config);
  const errors = [];
  for (const hop of hops) {
    const cooling = hopCooldowns.get(hop.id) || 0;
    if (cooling > Date.now()) {
      errors.push(`${hop.id}: cooling down`);
      continue;
    }
    try {
      const content = await completeOnHop(hop, messages);
      lastHop = hopPublic(hop);
      hopCooldowns.delete(hop.id);
      return content;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      errors.push(`${hop.id}: ${text}`);
      if (!error?.retryable) throw error;
      rememberCooldown(hop, text);
    }
  }
  throw new Error(`All hosted model hops failed: ${errors.join(' | ')}`);
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

function publicModelInfo(env = process.env) {
  const hops = hopsFromEnv(env).map((hop) => hopPublic(hop));
  const active = lastHop || hops[0] || { model: env.OPENAI_MODEL || null, host: null };
  let modelHost = active.host || null;
  if (!modelHost) {
    try { modelHost = new URL(env.OPENAI_BASE_URL).host; } catch { modelHost = null; }
  }
  return {
    model: active.model || env.OPENAI_MODEL || null,
    modelHost,
    hops: hops.map(({ id, model, host, coolingDown }) => ({ id, model, host, coolingDown })),
    lastHop: lastHop ? { id: lastHop.id, model: lastHop.model, host: lastHop.host } : null,
  };
}

function healthPayload(env = process.env) {
  const model = publicModelInfo(env);
  return {
    ok: !lastError,
    lastPollAt,
    lastTaskAt,
    degraded: Boolean(lastError),
    lastError,
    model: model.model,
    modelHost: model.modelHost,
    hops: model.hops,
    lastHop: model.lastHop,
  };
}

function healthServer(port = Number(process.env.PORT || 8080)) {
  return http.createServer((request, response) => {
    if (request.url !== '/health') { response.writeHead(404).end(); return; }
    response.writeHead(lastError ? 503 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(healthPayload()));
  }).listen(port, '0.0.0.0');
}

async function main() {
  const config = configFromEnv();
  const schedule = pollingSchedule();
  healthServer();
  while (true) {
    let didWork = false;
    try { didWork = await runOnce(config); lastError = null; }
    catch (error) { lastError = publicRunnerError(error); console.error(`[hermes-cloud-runner] ${lastError}`); }
    await new Promise((resolve) => setTimeout(resolve, nextPollDelay(didWork, schedule)));
  }
}

module.exports = {
  callControl, configFromEnv, execute, healthPayload, hopsFromEnv, isRetryableProviderError,
  nextPollDelay, pollingSchedule, publicModelInfo, runOnce, withLeaseRenewal,
};
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
