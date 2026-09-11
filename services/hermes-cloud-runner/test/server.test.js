'use strict';

const assert = require('node:assert/strict');
const http = require('http');
const test = require('node:test');
const { configFromEnv, execute, executeContinuitySmoke, hopsFromEnv, isRetryableProviderError, nextPollDelay, parseContinuitySmoke, pollingSchedule, publicModelInfo, withLeaseRenewal, HOSTED_SYSTEM_PROMPT } = require('../server');

test('requires control plane, runner, and model provider credentials', () => {
  assert.throws(() => configFromEnv({}), /HERMES_CONTROL_PLANE_URL/);
});

test('hosted hops follow HOSTED_HOP_ORDER without leaking keys', () => {
  const hops = hopsFromEnv({
    OPENAI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    OPENAI_API_KEY: 'gemini-secret',
    OPENAI_MODEL: 'gemini-2.5-flash',
    HOSTED_HOP_ORDER: 'zai,deepseek,primary',
    HOSTED_HOP_2_ID: 'zai',
    HOSTED_HOP_2_BASE_URL: 'https://api.z.ai/api/coding/paas/v4',
    HOSTED_HOP_2_API_KEY: 'zai-secret',
    HOSTED_HOP_2_MODEL: 'glm-5.3',
    HOSTED_HOP_3_ID: 'deepseek',
    HOSTED_HOP_3_BASE_URL: 'https://api.deepseek.com/v1',
    HOSTED_HOP_3_API_KEY: 'ds-secret',
    HOSTED_HOP_3_MODEL: 'deepseek-chat',
  });
  assert.deepEqual(hops.map((hop) => hop.id), ['zai', 'deepseek', 'primary']);
  assert.deepEqual(hops.map((hop) => hop.model), ['glm-5.3', 'deepseek-chat', 'gemini-2.5-flash']);
  assert.equal(JSON.stringify(hopsFromEnv({
    OPENAI_BASE_URL: 'https://example.test/v1',
    OPENAI_API_KEY: 'gemini-secret',
    OPENAI_MODEL: 'gemini-2.5-flash',
  }).map(({ id, model, baseUrl }) => ({ id, model, baseUrl }))).includes('secret'), false);
});

test('quota and credit-limit errors are retryable; 500 is not the only hop killer', () => {
  assert.equal(isRetryableProviderError(429, 'Weekly/Monthly Limit Exhausted'), true);
  assert.equal(isRetryableProviderError(200, 'Credit limit exceeded, please add credits'), true);
  assert.equal(isRetryableProviderError(500, 'disk full'), false);
  assert.equal(isRetryableProviderError(401, 'invalid api key'), false);
});

test('execute fails over to the next hop after a 429', async () => {
  const hits = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    hits.push(url.pathname);
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (url.pathname === '/smart/chat/completions') {
        response.statusCode = 429;
        response.end(JSON.stringify({ error: { message: 'Weekly/Monthly Limit Exhausted. Your limit will reset at 2026-09-12 21:07:02' } }));
        return;
      }
      response.end(JSON.stringify({ choices: [{ message: { content: 'HOP_OK' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const result = await execute({
      hops: [
        { id: 'zai', baseUrl: `http://127.0.0.1:${port}/smart`, key: 'k1', model: 'glm-5.3' },
        { id: 'gemini', baseUrl: `http://127.0.0.1:${port}/cheap`, key: 'k2', model: 'gemini-2.5-flash' },
      ],
    }, { prompt: 'ping', contextMessages: [] });
    assert.equal(result, 'HOP_OK');
    assert.deepEqual(hits, ['/smart/chat/completions', '/cheap/chat/completions']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('execute does not hop after a non-retryable 401', async () => {
  const hits = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    hits.push(url.pathname);
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (url.pathname === '/smart/chat/completions') {
        response.statusCode = 401;
        response.end(JSON.stringify({ error: { message: 'invalid api key' } }));
        return;
      }
      response.end(JSON.stringify({ choices: [{ message: { content: 'SHOULD_NOT_HOP' } }] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await assert.rejects(
      () => execute({
        hops: [
          { id: 'zai-401', baseUrl: `http://127.0.0.1:${port}/smart`, key: 'k1', model: 'glm-5.3' },
          { id: 'gemini-401', baseUrl: `http://127.0.0.1:${port}/cheap`, key: 'k2', model: 'gemini-2.5-flash' },
        ],
      }, { prompt: 'ping', contextMessages: [] }),
      /invalid api key/,
    );
    assert.deepEqual(hits, ['/smart/chat/completions']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('health model info names the host without the key', () => {
  const info = publicModelInfo({
    OPENAI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    OPENAI_MODEL: 'gemini-2.5-flash',
    OPENAI_API_KEY: 'secret-must-not-leak',
  });
  assert.equal(info.hops[0].host, 'generativelanguage.googleapis.com');
  assert.equal(info.hops[0].model, 'gemini-2.5-flash');
  assert.equal(JSON.stringify(info).includes('secret'), false);
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
    assert.equal(received.messages[0].role, 'system');
    assert.equal(received.messages[0].content, HOSTED_SYSTEM_PROMPT);
    assert.deepEqual(received.messages.slice(1).map((message) => message.content), ['original request', 'original answer', 'next step']);
    assert.equal(received.max_tokens, 2048);
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

test('parses Continuity smoke prompts into tick specs', () => {
  const spec = parseContinuitySmoke('Keep a 3-minute Continuity smoke alive on the fenced VPS. Every 30 seconds append one line saying Continuity smoke still alive.');
  assert.deepEqual(spec, { durationMinutes: 3, intervalSeconds: 30, ticks: 6 });
  assert.equal(parseContinuitySmoke('just answer this question'), null);
});

test('executes Continuity smoke ticks on the runner without a model hop', async () => {
  let sleeps = 0;
  const result = await executeContinuitySmoke(
    { durationMinutes: 1, intervalSeconds: 30, ticks: 3 },
    {
      sleep: async () => { sleeps += 1; },
      now: () => new Date('2026-09-11T14:00:00.000Z'),
    },
  );
  assert.equal(sleeps, 2);
  assert.match(result, /ticks: 3/);
  assert.match(result, /tick 3\/3/);
  assert.match(result, /fenced VPS runner/);
});

test('execute routes Continuity smoke away from the model provider', async () => {
  let modelHits = 0;
  const server = http.createServer((_request, response) => {
    modelHits += 1;
    response.writeHead(500);
    response.end('should not hit model');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    const result = await execute(
      { openaiBaseUrl: `http://127.0.0.1:${address.port}`, openaiKey: 'test-key', model: 'test-model' },
      { prompt: 'Keep a 1-minute Continuity smoke alive on the fenced VPS. Every 60 seconds say still alive.' },
    );
    assert.equal(modelHits, 0);
    assert.match(result, /ticks: 1/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
