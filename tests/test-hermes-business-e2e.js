'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');
const { canonicalRequest, createIdentity, sha256, syncGatewaySessions } = require('../tools/hermes-cloud-connector');

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

test('signed connector publishes real session context without leaking the local gateway credential', async () => {
  const identity = createIdentity('business-e2e-mac');
  const gatewayCredential = `local-only-${crypto.randomBytes(12).toString('hex')}`;
  let gatewayAuthorization = '';
  let controlPlaneAuthorization = '';
  let receivedSync;

  const gateway = await listen(async (request, response) => {
    gatewayAuthorization = request.headers.authorization || '';
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/api/sessions?')) {
      response.end(JSON.stringify({ data: [{
        id: 'mobile-session-42', title: 'Customer audit', source: 'hermes-mobile', model: 'hermes',
        message_count: 2, last_active_at: '2026-07-20T12:00:00Z',
      }] }));
      return;
    }
    assert.equal(request.url, '/api/sessions/mobile-session-42/messages');
    response.end(JSON.stringify({ data: [
      { role: 'user', content: 'Inspect the production workflow.' },
      { role: 'assistant', content: 'I found a retry loop.' },
    ] }));
  });

  const controlPlane = await listen(async (request, response) => {
    const body = await readBody(request);
    controlPlaneAuthorization = request.headers.authorization || '';
    const timestamp = request.headers['x-hermes-timestamp'];
    const nonce = request.headers['x-hermes-nonce'];
    const signature = request.headers['x-hermes-signature'];
    const canonical = canonicalRequest('POST', request.url, timestamp, nonce, body);
    const publicKey = crypto.createPublicKey({ key: identity.publicJwk, format: 'jwk' });
    assert.equal(request.headers['x-hermes-device'], 'device-e2e');
    assert.equal(crypto.verify('sha256', Buffer.from(canonical), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
    assert.equal(sha256(body), canonical.split('\n').at(-1));
    receivedSync = JSON.parse(body);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true, accepted: receivedSync.sessions.length }));
  });

  const previousCredential = process.env.HERMES_GATEWAY_API_KEY;
  process.env.HERMES_GATEWAY_API_KEY = gatewayCredential;
  try {
    const result = await syncGatewaySessions({
      ...identity,
      deviceId: 'device-e2e',
      sessionGatewayUrl: gateway.url,
      controlPlaneUrl: controlPlane.url,
    });
    assert.equal(result.body.accepted, 1);
  } finally {
    if (previousCredential === undefined) delete process.env.HERMES_GATEWAY_API_KEY;
    else process.env.HERMES_GATEWAY_API_KEY = previousCredential;
    await Promise.all([gateway.close(), controlPlane.close()]);
  }

  assert.equal(gatewayAuthorization, `Bearer ${gatewayCredential}`);
  assert.equal(controlPlaneAuthorization, '');
  assert.equal(JSON.stringify(receivedSync).includes(gatewayCredential), false);
  assert.deepEqual(receivedSync.sessions[0].messages, [
    { role: 'user', content: 'Inspect the production workflow.' },
    { role: 'assistant', content: 'I found a retry loop.' },
  ]);
});

test('billing webhook contract persists events and gates access by payment state', () => {
  const schema = require('node:fs').readFileSync('apps/hermes-control-plane/db/schema.ts', 'utf8');
  const webhook = require('node:fs').readFileSync('apps/hermes-control-plane/app/api/billing/webhook/route.ts', 'utf8');
  assert.match(schema, /billing_events/);
  assert.match(webhook, /INSERT OR IGNORE INTO billing_events/);
  assert.match(webhook, /\["active", "trialing"\]/);
  assert.match(webhook, /"past_due", "unpaid"/);
});

test('thread continuation only advances the sync boundary when context arrived', () => {
  const syncRoute = require('node:fs').readFileSync('apps/hermes-control-plane/app/api/device/sessions/sync/route.ts', 'utf8');
  const threadRoute = require('node:fs').readFileSync('apps/hermes-control-plane/app/api/thread-messages/route.ts', 'utf8');
  assert.match(syncRoute, /snapshot \? now : null/);
  assert.match(syncRoute, /synced_at = COALESCE\(excluded\.synced_at, threads\.synced_at\)/);
  assert.match(threadRoute, /created_at > \?/);
});

test('sellable failover has explicit abuse and inference-cost ceilings', () => {
  const taskRoute = require('node:fs').readFileSync('apps/hermes-control-plane/app/api/tasks/route.ts', 'utf8');
  const syncRoute = require('node:fs').readFileSync('apps/hermes-control-plane/app/api/device/sessions/sync/route.ts', 'utf8');
  const runner = require('node:fs').readFileSync('services/hermes-cloud-runner/server.js', 'utf8');
  assert.match(taskRoute, /TRIAL_CLOUD_TASKS = 5/);
  assert.match(taskRoute, /PRO_CLOUD_TASKS_PER_30_DAYS = 100/);
  assert.match(syncRoute, /MAX_BODY_BYTES = 1_000_000/);
  assert.match(runner, /MODEL_MAX_TOKENS.*2_048/);
  assert.match(runner, /MODEL_TIMEOUT_MS.*75_000/);
});

test('automatic failover is driven by stale heartbeat and returns unclaimed work to the Mac', () => {
  const leases = require('node:fs').readFileSync('apps/hermes-control-plane/lib/task-leases.ts', 'utf8');
  const heartbeat = require('node:fs').readFileSync('apps/hermes-control-plane/app/api/device/heartbeat/route.ts', 'utf8');
  assert.match(leases, /d\.failover_mode = 'auto'/);
  assert.match(leases, /d\.last_seen_at < \?/);
  assert.match(leases, /now - 60_000/);
  assert.match(heartbeat, /'cloud_pending', 'needs_failover', 'offline_blocked'/);
});
