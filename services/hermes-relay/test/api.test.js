'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { RelayStore } = require('../store');
const {
  setStorePurchaseVerifierForTest,
  setThumbgateCaptureForwarderForTest,
  startServer,
  store,
} = require('../server');
const { createApprovalIntegrity } = require('../approval-integrity');

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
          ...(options.headers || {}),
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
    Object.keys(store.state.entitlements).forEach((key) => delete store.state.entitlements[key]);
    setStorePurchaseVerifierForTest(null);
    setThumbgateCaptureForwarderForTest(null);
    const started = await startServer(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${started.port}`;
    const register = await request(baseUrl, 'POST', '/v1/worker/register', {
      body: {
        hostname: 'Mac-mini.local',
        project: 'mac-yolo-safeguards',
        machine_id: 'mac-mini',
      },
    });
    workerToken = register.body.worker_token;
    const pairStart = await request(baseUrl, 'POST', '/v1/pair/start', {
      auth: `Worker ${workerToken}`,
      body: {},
    });
    const pairComplete = await request(baseUrl, 'POST', '/v1/pair/complete', {
      body: { code: pairStart.body.code },
    });
    mobileToken = pairComplete.body.mobile_token;
  });

  after(async () => {
    setStorePurchaseVerifierForTest(null);
    setThumbgateCaptureForwarderForTest(null);
    await new Promise((resolve) => require('../server').server.close(resolve));
  });

  it('binds allow to an unexpired exact approval digest and rejects tampering', async () => {
    const payload = {
      actionId: 'evt_integrity_1',
      toolName: 'Bash',
      command: 'npm test',
      workspacePath: '/repo',
    };
    const integrity = createApprovalIntegrity(payload);
    const enqueue = await request(baseUrl, 'POST', '/v1/events', {
      auth: `Worker ${workerToken}`,
      body: {
        id: payload.actionId,
        event: { tool_name: payload.toolName, tool_input: { command: payload.command } },
        approval_integrity: integrity,
      },
    });
    assert.equal(enqueue.status, 200);

    const mismatch = await request(baseUrl, 'POST', '/v1/verdicts/evt_integrity_1', {
      auth: `Mobile ${mobileToken}`,
      body: { decision: 'allow', approval_digest: '0'.repeat(64) },
    });
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error, 'approval_digest_mismatch');

    const allowed = await request(baseUrl, 'POST', '/v1/verdicts/evt_integrity_1', {
      auth: `Mobile ${mobileToken}`,
      body: { decision: 'allow', approval_digest: integrity.digest },
    });
    assert.equal(allowed.status, 200);
    const workerVerdicts = await request(baseUrl, 'GET', '/v1/worker/verdicts', {
      auth: `Worker ${workerToken}`,
    });
    assert.equal(workerVerdicts.body.verdicts[0].approval_digest, integrity.digest);
    assert.equal(workerVerdicts.body.verdicts[0].approval_integrity.digest, integrity.digest);
  });

  it('fails closed for expired, redacted, and truncated mobile approvals', async () => {
    const cases = [
      createApprovalIntegrity(
        { actionId: 'evt_expired', toolName: 'Bash', command: 'npm test' },
        { now: Date.now() - 10_000, ttlMs: 1 },
      ),
      createApprovalIntegrity({
        actionId: 'evt_redacted',
        toolName: 'Bash',
        command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"',
      }),
      createApprovalIntegrity({
        actionId: 'evt_truncated',
        toolName: 'Bash',
        command: 'x'.repeat(5000),
      }),
    ];
    for (const integrity of cases) {
      const id = integrity.display.action_id;
      await request(baseUrl, 'POST', '/v1/events', {
        auth: `Worker ${workerToken}`,
        body: { id, event: { tool_name: 'Bash' }, approval_integrity: integrity },
      });
      const verdict = await request(baseUrl, 'POST', `/v1/verdicts/${id}`, {
        auth: `Mobile ${mobileToken}`,
        body: { decision: 'allow', approval_digest: integrity.digest },
      });
      assert.equal(verdict.status, 409);
      const denied = await request(baseUrl, 'POST', `/v1/verdicts/${id}`, {
        auth: `Mobile ${mobileToken}`,
        body: { decision: 'block', reason: 'Fail closed' },
      });
      assert.equal(denied.status, 200);
    }
    await request(baseUrl, 'GET', '/v1/worker/verdicts', {
      auth: `Worker ${workerToken}`,
    });
  });

  it('proxies sanitized ThumbGate capture only for a paired mobile token', async () => {
    setThumbgateCaptureForwarderForTest(async (body) => ({
      ok: true,
      body: {
        accepted: body.signal === 'up',
        secret_redacted: !body.context.includes('very-sensitive-value'),
      },
    }));
    const unauthorized = await request(baseUrl, 'POST', '/v1/thumbgate/capture', {
      body: { signal: 'up', context: 'Approved call' },
    });
    assert.equal(unauthorized.status, 401);
    const captured = await request(baseUrl, 'POST', '/v1/thumbgate/capture', {
      auth: `Mobile ${mobileToken}`,
      body: { signal: 'up', context: 'token=very-sensitive-value-12345' },
    });
    assert.equal(captured.status, 200);
    assert.equal(captured.body.accepted, true);
    assert.equal(captured.body.secret_redacted, true);
  });

  it('health responds ok', async () => {
    const res = await request(baseUrl, 'GET', '/v1/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('registers worker, pairs phone, enqueues and verdicts event', async () => {
    const pairStart = await request(baseUrl, 'POST', '/v1/pair/start', {
      auth: `Worker ${workerToken}`,
      body: {},
    });
    assert.equal(pairStart.status, 200);
    const pairCode = pairStart.body.code;
    assert.match(pairCode, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.match(pairStart.body.secret, /^[0-9a-f]{64}$/);

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

  it('rejects unauthenticated ThumbGate Leash entitlement verification', async () => {
    const res = await request(baseUrl, 'POST', '/v1/entitlements/thumbgate-leash/verify', {
      body: {
        platform: 'android',
        product_id: 'thumbgate_leash_monthly',
        purchase_token: 'purchase-token',
      },
    });
    assert.equal(res.status, 401);
  });

  it('fails closed when store receipt verifier is not configured', async () => {
    const res = await request(baseUrl, 'POST', '/v1/entitlements/thumbgate-leash/verify', {
      auth: `Mobile ${mobileToken}`,
      body: {
        platform: 'android',
        product_id: 'thumbgate_leash_monthly',
        purchase_token: 'purchase-token',
      },
    });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'store_verifier_not_configured');
  });

  it('records Pro only after a positive store receipt verifier result', async () => {
    setStorePurchaseVerifierForTest(async (receipt) => {
      assert.equal(receipt.platform, 'android');
      assert.equal(receipt.product_id, 'thumbgate_leash_monthly');
      assert.equal(receipt.purchase_token, 'purchase-token');
      return {
        ok: true,
        expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
        transaction_id: 'order-123',
        source: 'test_store_verifier',
      };
    });

    const verify = await request(baseUrl, 'POST', '/v1/entitlements/thumbgate-leash/verify', {
      auth: `Mobile ${mobileToken}`,
      body: {
        platform: 'android',
        product_id: 'thumbgate_leash_monthly',
        purchase_token: 'purchase-token',
      },
    });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.ok, true);
    assert.equal(verify.body.entitlement.thumbgate_leash.active, true);

    const queue = await request(baseUrl, 'GET', '/v1/queue', {
      auth: `Mobile ${mobileToken}`,
    });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.tier, 'pro');
    assert.equal(queue.body.entitlement.thumbgate_leash.active, true);

    setStorePurchaseVerifierForTest(null);
  });
});

describe('hermes-relay pairing security', () => {
  let baseUrl;

  before(async () => {
    const started = await startServer(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${started.port}`;
  });

  it('rate-limits pair/complete and harvests zero tokens under brute force', async () => {
    const attackerIp = '198.51.100.42';
    let saw429 = false;
    let harvested = 0;
    for (let i = 0; i < 14; i += 1) {
      const res = await request(baseUrl, 'POST', '/v1/pair/complete', {
        headers: { 'X-Forwarded-For': attackerIp },
        body: { code: `GUESS-${i.toString().padStart(3, '0')}` },
      });
      if (res.status === 429) saw429 = true;
      if (res.status === 200 && res.body?.mobile_token) harvested += 1;
    }
    assert.equal(saw429, true, 'brute-force must get rate-limited');
    assert.equal(harvested, 0, 'no token may be harvested from guesses');
  });

  it('pairs via the high-entropy QR secret', async () => {
    const reg = await request(baseUrl, 'POST', '/v1/worker/register', {
      body: { hostname: 'secret-mac', machine_id: 'secret-mac' },
    });
    const pair = await request(baseUrl, 'POST', '/v1/pair/start', {
      auth: `Worker ${reg.body.worker_token}`,
      body: {},
    });
    const done = await request(baseUrl, 'POST', '/v1/pair/complete', {
      headers: { 'X-Forwarded-For': '203.0.113.10' },
      body: { secret: pair.body.secret },
    });
    assert.equal(done.status, 200);
    assert.ok(done.body.mobile_token);
  });

  it('rotates the mobile token on re-pair and invalidates the old one', async () => {
    const reg = await request(baseUrl, 'POST', '/v1/worker/register', {
      body: { hostname: 'rotate-mac', machine_id: 'rotate-mac' },
    });
    const wAuth = `Worker ${reg.body.worker_token}`;
    const p1 = await request(baseUrl, 'POST', '/v1/pair/start', { auth: wAuth, body: {} });
    const c1 = await request(baseUrl, 'POST', '/v1/pair/complete', {
      headers: { 'X-Forwarded-For': '203.0.113.11' },
      body: { code: p1.body.code },
    });
    const token1 = c1.body.mobile_token;

    const p2 = await request(baseUrl, 'POST', '/v1/pair/start', { auth: wAuth, body: {} });
    const c2 = await request(baseUrl, 'POST', '/v1/pair/complete', {
      headers: { 'X-Forwarded-For': '203.0.113.12' },
      body: { code: p2.body.code },
    });
    const token2 = c2.body.mobile_token;

    assert.notEqual(token1, token2);
    const oldQueue = await request(baseUrl, 'GET', '/v1/queue', { auth: `Mobile ${token1}` });
    assert.equal(oldQueue.status, 401, 'old token must be invalidated after re-pair');
  });

  it('reports a stale worker as offline and clears active_worker_id', async () => {
    const reg = await request(baseUrl, 'POST', '/v1/worker/register', {
      body: { hostname: 'stale-mac', machine_id: 'stale-mac' },
    });
    const pair = await request(baseUrl, 'POST', '/v1/pair/start', {
      auth: `Worker ${reg.body.worker_token}`,
      body: {},
    });
    const done = await request(baseUrl, 'POST', '/v1/pair/complete', {
      headers: { 'X-Forwarded-For': '203.0.113.13' },
      body: { code: pair.body.code },
    });
    store.state.workers[reg.body.worker_token].last_seen_at = Date.now() - 5 * 60 * 1000;
    const queue = await request(baseUrl, 'GET', '/v1/queue', {
      auth: `Mobile ${done.body.mobile_token}`,
    });
    assert.equal(queue.status, 200);
    assert.equal(queue.body.active_worker_id, null, 'stale worker must not be active');
    assert.equal(queue.body.workers[0].status, 'offline');
  });

  after(async () => {
    await new Promise((resolve) => require('../server').server.close(resolve));
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

  it('still rejects a wrong code as invalid', () => {
    const relayStore = new RelayStore('');
    const registered = relayStore.registerWorker({ hostname: 'wrong-mac', machine_id: 'wrong-mac' });
    relayStore.startPairing(registered.worker_token);
    assert.equal(relayStore.completePairing('NOPE-NOPE'), null);
  });

  it('expires ThumbGate Leash entitlement instead of returning sticky Pro', () => {
    const relayStore = new RelayStore('');
    const registered = relayStore.registerWorker({ hostname: 'pro-mac', machine_id: 'pro-mac' });
    const account = relayStore.state.accounts[registered.account_id];
    const recorded = relayStore.recordThumbgateLeashEntitlement(account.id, {
      platform: 'ios',
      product_id: 'thumbgate_leash_monthly',
      transaction_id: 'tx-1',
      expires_at: Date.now() + 60_000,
      source: 'test',
    });
    assert.ok(recorded);
    assert.equal(relayStore.thumbgateLeashEntitlement(account).active, true);
    relayStore.state.entitlements[account.id].thumbgate_leash.expires_at = Date.now() - 1;
    assert.equal(relayStore.thumbgateLeashEntitlement(account).active, false);
  });
});
