#!/usr/bin/env node
'use strict';

const http = require('http');
const os = require('os');

const required = ['HERMES_CONTROL_PLANE_URL', 'HERMES_CLOUD_RUNNER_TOKEN', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL'];
const POLL_MS = Number(process.env.POLL_MS || 3000);
let lastPollAt = 0;
let lastTaskAt = 0;
let lastError = null;

function configFromEnv(env = process.env) {
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  return {
    controlPlaneUrl: env.HERMES_CONTROL_PLANE_URL.replace(/\/+$/, ''), token: env.HERMES_CLOUD_RUNNER_TOKEN,
    openaiBaseUrl: env.OPENAI_BASE_URL.replace(/\/+$/, ''), openaiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL, runnerId: env.HERMES_CLOUD_RUNNER_ID || os.hostname(),
  };
}

async function callControl(config, pathname, body = {}) {
  const response = await fetch(`${config.controlPlaneUrl}${pathname}`, {
    method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'x-hermes-runner': config.runnerId, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Control plane HTTP ${response.status}`);
  return payload;
}

async function execute(config, task) {
  const response = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST', headers: { authorization: `Bearer ${config.openaiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: task.prompt }], stream: false }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Model provider HTTP ${response.status}`);
  return payload.choices?.[0]?.message?.content ?? JSON.stringify(payload);
}

async function runOnce(config) {
  lastPollAt = Date.now();
  const claim = await callControl(config, '/api/runner/tasks/claim');
  if (!claim) return false;
  lastTaskAt = Date.now();
  try {
    const result = await execute(config, claim.task);
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
    response.end(JSON.stringify({ ok: !lastError, lastPollAt, lastTaskAt, error: lastError }));
  }).listen(port, '0.0.0.0');
}

async function main() {
  const config = configFromEnv();
  healthServer();
  while (true) {
    try { await runOnce(config); lastError = null; }
    catch (error) { lastError = error instanceof Error ? error.message : String(error); console.error(`[hermes-cloud-runner] ${lastError}`); }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

module.exports = { callControl, configFromEnv, execute, runOnce };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
