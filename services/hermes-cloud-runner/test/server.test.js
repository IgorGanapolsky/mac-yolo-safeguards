'use strict';

const assert = require('node:assert/strict');
const http = require('http');
const test = require('node:test');
const { configFromEnv, execute, nextPollDelay, pollingSchedule, withLeaseRenewal } = require('../server');

test('requires control plane, runner, and model provider credentials', () => {
  assert.throws(() => configFromEnv({}), /HERMES_CONTROL_PLANE_URL/);
});

test('normalizes runner configuration without exposing tokens', () => {
  const config = configFromEnv({ HERMES_CONTROL_PLANE_URL: 'https://control.example/', HERMES_CLOUD_RUNNER_TOKEN: 'runner-secret', OPENAI_BASE_URL: 'https://api.example/v1/', OPENAI_API_KEY: 'provider-secret', OPENAI_MODEL: 'model-a', HERMES_CLOUD_RUNNER_ID: 'runner-a' });
  assert.equal(config.controlPlaneUrl, 'https://control.example');
  assert.equal(config.openaiBaseUrl, 'https://api.example/v1');
  assert.equal(config.runnerId, 'runner-a');
});

test('backs off empty cloud polls while draining active work quickly', () => {
  const defaults = pollingSchedule({});
  assert.deepEqual(defaults, { activePollMs: 1_000, idlePollMs: 30_000 });
  assert.equal(nextPollDelay(false, defaults), 30_000);
  assert.equal(nextPollDelay(true, defaults), 1_000);
  assert.deepEqual(pollingSchedule({ POLL_MS: '15000', ACTIVE_POLL_MS: '500' }), {
    activePollMs: 500,
    idlePollMs: 15_000,
  });
});

test('cloud execution preserves the synced thread context', async () => {
  let received;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = JSON.parse(body);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: 'cloud continued' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const result = await execute({ openaiBaseUrl: `http://127.0.0.1:${address.port}`, openaiKey: 'test-key', model: 'test-model' }, {
      prompt: 'next step', contextMessages: [{ role: 'user', content: 'original request' }, { role: 'assistant', content: 'original answer' }],
    });
    assert.equal(result, 'cloud continued');
    assert.deepEqual(received.messages.map((message) => message.content), ['original request', 'original answer', 'next step']);
    assert.equal(received.max_tokens, 2048);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('renews a cloud lease throughout long-running model work', async () => {
  let renewals = 0;
  const result = await withLeaseRenewal(
    () => new Promise((resolve) => setTimeout(() => resolve('complete'), 28)),
    async () => { renewals += 1; },
    5,
  );
  assert.equal(result, 'complete');
  assert.ok(renewals >= 3, `expected at least 3 renewals, received ${renewals}`);
});
