'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { RelayStore } = require('../store');
const { startServer, store } = require('../server');

function request(baseUrl, method, pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : '';
    const req = http.request(
      url,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(options.auth ? { Authorization: options.auth } : {}),
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: raw ? JSON.parse(raw) : null,
          });
        });
      },
    );
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe('hermes-relay API', () => {
  let baseUrl;
  let workerToken;
  let mobileToken;

  before(async () => {
    process.env.HERMES_MOBILE_DB_PATH = '';
    Object.keys(store.state.accounts).forEach((key) => delete store.state.accounts[key]);
    Object.keys(store.state.workers).forEach((key) => delete store.state.workers[key]);
    Object.keys(store.state.pairCodes).forEach((key) => delete store.state.pairCodes[key]);
    Object.keys(store.state.events).forEach((key) => delete store.state.events[key]);
    Object.keys(store.state.verdicts).forEach((key) => delete store.state.verdicts[key]);
    const started = await startServer(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${started.port}`;
  });

  after(async () => {
    await new Promise((resolve) => require('../server').server.close(resolve));
  });

  it('health responds ok', async () => {
    const res = await request(baseUrl, 'GET', '/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('registers worker, pairs phone, enqueues and verdicts event', async () => {
    const register = await request(baseUrl, 'POST', '/v1/worker/register', {
      body: {
        hostname: 'Mac-mini.local',
        project: 'mac-yolo-safeguards',
        machine_id: 'mac-mini',
      },
    });
    assert.equal(register.status, 200);
    workerToken = register.body.worker_token;

    const pairStart = await request(baseUrl, 'POST', '/v1/pair/start', {
      auth: `Worker ${workerToken}`,
      body: {},
    });
    assert.equal(pairStart.status, 200);
    const pairCode = pairStart.body.code;
    assert.match(pairCode, /^[A-Z]+-[A-Z]+$/);

    const pairComplete = await request(baseUrl, 'POST', '/v1/pair/complete', {
      body: { code: pairCode },
    });
    assert.equal(pairComplete.status, 200);
    mobileToken = pairComplete.body.mobile_token;
    assert.ok(mobileToken);

    const enqueue = await request(baseUrl, 'POST', '/v1/events', {
      auth: `Worker ${workerToken}`,
      body: {
        id: 'evt_test_1',
        event: {
          tool_name: 'Bash',
          hook_event_name: 'PreToolUse',
          tool_input: { command: 'rm -rf /' },
        },
        reason: 'PreToolUse',
      },
    });
    assert.equal(enqueue.status, 200);
    assert.equal(enqueue.body.id, 'evt_test_1');

    const queue = await request(baseUrl, 'GET', '/v1/queue', {
      auth: `Mobile ${mobileToken}`,
    });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.events.length, 1);
    assert.equal(queue.body.workers[0].id, 'mac-mini');
    assert.equal(queue.body.active_worker_id, 'mac-mini');

    const verdict = await request(baseUrl, 'POST', '/v1/verdicts/evt_test_1', {
      auth: `Mobile ${mobileToken}`,
      body: { decision: 'block', reason: 'Rejected from test' },
    });
    assert.equal(verdict.status, 200);
    assert.equal(verdict.body.ok, true);

    const workerVerdicts = await request(baseUrl, 'GET', '/v1/worker/verdicts', {
      auth: `Worker ${workerToken}`,
    });
    assert.equal(workerVerdicts.status, 200);
    assert.equal(workerVerdicts.body.verdicts.length, 1);
    assert.equal(workerVerdicts.body.verdicts[0].decision, 'block');

    const queueAfter = await request(baseUrl, 'GET', '/v1/queue', {
      auth: `Mobile ${mobileToken}`,
    });
    assert.equal(queueAfter.body.events.length, 0);
  });
});

describe('RelayStore', () => {
  it('rejects expired pair codes', () => {
    const relayStore = new RelayStore('');
    const registered = relayStore.registerWorker({ hostname: 'test-mac', machine_id: 'test-mac' });
    const pair = relayStore.startPairing(registered.worker_token);
    relayStore.state.pairCodes[pair.code].expires_at = Date.now() - 1;
    assert.equal(relayStore.completePairing(pair.code), null);
  });
});
