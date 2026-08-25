'use strict';

const assert = require('node:assert/strict');
const http = require('http');
const test = require('node:test');
const {
  classifyModelTask,
  configFromEnv,
  execute,
  healthServer,
  nextPollDelay,
  pollingSchedule,
  selectExecutionRoute,
  withLeaseRenewal,
} = require('../server');

test('requires control plane, runner, and model provider credentials', () => {
  assert.throws(() => configFromEnv({}), /HERMES_CONTROL_PLANE_URL/);
});

test('normalizes runner configuration without exposing tokens', () => {
  const config = configFromEnv({ HERMES_CONTROL_PLANE_URL: 'https://control.example/', HERMES_CLOUD_RUNNER_TOKEN: 'runner-secret', OPENAI_BASE_URL: 'https://api.example/v1/', OPENAI_API_KEY: 'provider-secret', OPENAI_MODEL: 'model-a', HERMES_CLOUD_RUNNER_ID: 'runner-a' });
  assert.equal(config.controlPlaneUrl, 'https://control.example');
  assert.equal(config.openaiBaseUrl, 'https://api.example/v1');
  assert.equal(config.runnerId, 'runner-a');
});

test('registers optional Poolside models without changing required default credentials', () => {
  const config = configFromEnv({
    HERMES_CONTROL_PLANE_URL: 'https://control.example',
    HERMES_CLOUD_RUNNER_TOKEN: 'runner-secret',
    OPENAI_BASE_URL: 'https://api.example/v1',
    OPENAI_API_KEY: 'provider-secret',
    OPENAI_MODEL: 'model-a',
    POOLSIDE_API_KEY: 'poolside-secret',
  });
  assert.deepEqual(
    { baseUrl: config.poolside.baseUrl, fastModel: config.poolside.fastModel, deepModel: config.poolside.deepModel },
    {
      baseUrl: 'https://inference.poolside.ai/v1',
      fastModel: 'poolside/laguna-xs-2.1',
      deepModel: 'poolside/laguna-s-2.1',
    },
  );
});

test('delegates only eligible coding tasks to the right Poolside tier', () => {
  const config = {
    openaiBaseUrl: 'https://default.example/v1', openaiKey: 'default-key', model: 'default-model',
    poolside: {
      baseUrl: 'https://inference.poolside.ai/v1', apiKey: 'poolside-key',
      fastModel: 'poolside/laguna-xs-2.1', deepModel: 'poolside/laguna-s-2.1',
    },
  };
  assert.equal(selectExecutionRoute(config, { prompt: 'fix this TypeScript test' }).model, 'poolside/laguna-xs-2.1');
  assert.equal(selectExecutionRoute(config, { prompt: 'refactor this multi-file architecture' }).model, 'poolside/laguna-s-2.1');
  assert.equal(selectExecutionRoute(config, { prompt: 'summarize the meeting', category: 'summarization' }).provider, 'configured-default');
  assert.equal(selectExecutionRoute(config, { prompt: 'debug the screenshot', requiresVision: true }).provider, 'configured-default');
  assert.equal(selectExecutionRoute(config, { prompt: 'fix private code', sensitive: true }).provider, 'configured-default');
  assert.equal(selectExecutionRoute(config, { prompt: 'fix config API_KEY=secret-value' }).provider, 'configured-default');
  assert.equal(classifyModelTask({ prompt: 'migrate a large repository', category: 'coding' }).longHorizon, true);
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

test('Poolside execution uses one selected route and never falls through to the default meter', async () => {
  let poolsideCalls = 0;
  let defaultCalls = 0;
  const poolsideServer = http.createServer((_request, response) => {
    poolsideCalls += 1;
    response.setHeader('content-type', 'application/json');
    response.writeHead(503);
    response.end(JSON.stringify({ error: 'poolside unavailable' }));
  });
  const defaultServer = http.createServer((_request, response) => {
    defaultCalls += 1;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: 'unexpected fallback' } }] }));
  });
  await Promise.all([
    new Promise((resolve) => poolsideServer.listen(0, '127.0.0.1', resolve)),
    new Promise((resolve) => defaultServer.listen(0, '127.0.0.1', resolve)),
  ]);
  try {
    const poolsideAddress = poolsideServer.address();
    const defaultAddress = defaultServer.address();
    const config = {
      openaiBaseUrl: `http://127.0.0.1:${defaultAddress.port}`,
      openaiKey: 'default-key',
      model: 'default-model',
      poolside: {
        baseUrl: `http://127.0.0.1:${poolsideAddress.port}`,
        apiKey: 'poolside-key',
        fastModel: 'poolside/laguna-xs-2.1',
        deepModel: 'poolside/laguna-s-2.1',
      },
    };
    await assert.rejects(() => execute(config, { prompt: 'fix this failing JavaScript test' }), /poolside unavailable/);
    assert.equal(poolsideCalls, 1);
    assert.equal(defaultCalls, 0);
  } finally {
    await Promise.all([
      new Promise((resolve) => poolsideServer.close(resolve)),
      new Promise((resolve) => defaultServer.close(resolve)),
    ]);
  }
});

test('health reports model IDs without provider credentials', async () => {
  const config = {
    model: 'default-model',
    poolside: {
      apiKey: 'never-print-this',
      fastModel: 'poolside/laguna-xs-2.1',
      deepModel: 'poolside/laguna-s-2.1',
    },
  };
  const server = healthServer(config, 0);
  await new Promise((resolve) => server.listening ? resolve() : server.once('listening', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const text = await response.text();
    assert.match(text, /poolside\/laguna-xs-2\.1/);
    assert.doesNotMatch(text, /never-print-this/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('renews a cloud lease throughout long-running model work', async () => {
  let renewals = 0;
  const result = await withLeaseRenewal(
    () => new Promise((resolve) => setTimeout(() => resolve('complete'), 60)),
    async () => { renewals += 1; },
    5,
  );
  assert.equal(result, 'complete');
  assert.ok(renewals >= 3, `expected at least 3 renewals, received ${renewals}`);
});
