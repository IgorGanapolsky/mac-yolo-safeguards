'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  boundContextMessages,
  canonicalRequest,
  collectGatewaySessions,
  createIdentity,
  executeLocal,
  gatewayHeaders,
  loadConfig,
  pairingDashboardUrl,
  pairingMatchesControlPlane,
  parseDotEnvValue,
  resolveGatewayApiKey,
  saveConfig,
  selectContextSessionIds,
  signedHeaders,
  syncGatewaySessions,
  timestampMillis,
} = require('../tools/hermes-cloud-connector');

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { return await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('device signature verifies against the paired public JWK', () => {
  const identity = createIdentity('test-mac');
  const config = { ...identity, deviceId: 'device-1' };
  const body = JSON.stringify({ ok: true });
  const headers = signedHeaders(config, 'POST', '/api/device/heartbeat', body, 1_700_000_000_000, 'nonce-1');
  const canonical = canonicalRequest('POST', '/api/device/heartbeat', headers['x-hermes-timestamp'], headers['x-hermes-nonce'], body);
  const publicKey = crypto.createPublicKey({ key: identity.publicJwk, format: 'jwk' });
  assert.equal(crypto.verify('sha256', Buffer.from(canonical), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(headers['x-hermes-signature'], 'base64url')), true);
});

test('connector config is private and round-trips', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-connector-'));
  const file = path.join(root, 'cloud-connector.json');
  saveConfig(file, { deviceId: 'device-1' });
  assert.deepEqual(loadConfig(file), { deviceId: 'device-1' });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('loads the existing local gateway credential without copying it into connector config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-gateway-env-'));
  const envPath = path.join(root, '.env');
  fs.writeFileSync(envPath, "IGNORED=value\nexport API_SERVER_KEY='local-only-key'\n", { mode: 0o600 });
  assert.equal(parseDotEnvValue(fs.readFileSync(envPath, 'utf8'), 'API_SERVER_KEY'), 'local-only-key');
  assert.equal(resolveGatewayApiKey({ env: {}, envPath }), 'local-only-key');
  assert.equal(gatewayHeaders({ env: {}, envPath }).authorization, 'Bearer local-only-key');
  assert.equal(resolveGatewayApiKey({ env: { HERMES_GATEWAY_API_KEY: 'explicit-key' }, envPath }), 'explicit-key');
  assert.equal(gatewayHeaders({ env: {}, envPath: path.join(root, 'missing') }).authorization, undefined);
});

test('pairing link opens the signed-in dashboard with a prefilled short code', () => {
  const target = new URL(pairingDashboardUrl('https://thumbgate.app/', 'ABCD-EFGH'));
  assert.equal(target.origin, 'https://thumbgate.app');
  assert.equal(target.pathname, '/dashboard');
  assert.equal(target.searchParams.get('pair'), 'ABCD-EFGH');
});

test('reuses pairing only for the control-plane origin that issued it', () => {
  const paired = { deviceId: 'device-1', controlPlaneUrl: 'https://thumbgate.app/' };
  assert.equal(pairingMatchesControlPlane(paired, 'https://thumbgate.app'), true);
  assert.equal(pairingMatchesControlPlane(paired, 'https://app.thumbgate.app'), false);
  assert.equal(pairingMatchesControlPlane({ deviceId: 'legacy-device' }, 'https://thumbgate.app'), false);
  assert.equal(pairingMatchesControlPlane({ ...paired, controlPlaneUrl: 'https://old-control.example' }, 'https://thumbgate.app'), false);
  assert.equal(pairingMatchesControlPlane({ ...paired, controlPlaneUrl: 'not-a-url' }, 'https://thumbgate.app'), false);
});

test('context upload is bounded before it leaves the Mac', () => {
  const messages = Array.from({ length: 70 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn-${index}-` + 'x'.repeat(1_000) }));
  const bounded = boundContextMessages(messages);
  assert.ok(bounded.length <= 60);
  assert.ok(bounded.reduce((total, message) => total + message.content.length, 0) <= 48_000);
  assert.match(bounded.at(-1).content, /^turn-69-/);
});

test('bounded context windows rotate across every session instead of starving older chats', () => {
  const sessions = Array.from({ length: 25 }, (_, index) => ({ id: `session-${index}` }));
  const first = selectContextSessionIds(sessions, '', 12);
  const second = selectContextSessionIds(sessions, first.nextCursorId, 12);
  const third = selectContextSessionIds(sessions, second.nextCursorId, 12);
  assert.equal(first.ids.size, 12);
  assert.equal(second.ids.size, 12);
  assert.equal(third.ids.size, 12);
  assert.equal(new Set([...first.ids, ...second.ids, ...third.ids]).size, 25);
  assert.equal(third.nextCursorId, 'session-10');
});

test('collects real Hermes Mobile session inventory with bounded context', async () => {
  let inventoryRequestUrl = '';
  await withServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/api/sessions?')) {
      inventoryRequestUrl = request.url;
      response.end(JSON.stringify({ data: [{ id: 'mobile_1', title: 'Phone launch', source: 'api_server', model: 'hermes', message_count: 2, last_active: 1_700_000_000 }] }));
      return;
    }
    response.end(JSON.stringify({ data: [{ role: 'user', content: 'continue the launch' }, { role: 'assistant', content: [{ type: 'text', text: 'working' }] }] }));
  }, async (sessionGatewayUrl) => {
    const { sessions, nextContextCursorId } = await collectGatewaySessions({ sessionGatewayUrl });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'mobile_1');
    assert.equal(sessions[0].messages[1].content, 'working');
    assert.equal(sessions[0].updatedAt, 1_700_000_000_000);
    assert.equal(nextContextCursorId, 'mobile_1');
  });
  assert.equal(inventoryRequestUrl, '/api/sessions?limit=100');
  assert.equal(timestampMillis('2026-07-20T00:00:00Z'), Date.parse('2026-07-20T00:00:00Z'));
});

test('successful session sync persists context rotation progress', async () => {
  const inventory = Array.from({ length: 80 }, (_, index) => ({
    id: `session-${index}`,
    title: `Session ${index}`,
    message_count: 1,
    last_active: 1_700_000_000 + index,
  }));
  const requestedByCycle = [];
  let activeRequests = [];
  await withServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/api/sessions?')) {
      response.end(JSON.stringify({ data: inventory }));
      return;
    }
    if (request.url.startsWith('/api/sessions/') && request.url.endsWith('/messages')) {
      activeRequests.push(decodeURIComponent(request.url.split('/')[3]));
      response.end(JSON.stringify({ data: [{ role: 'user', content: 'bounded context' }] }));
      return;
    }
    if (request.url === '/api/device/sessions/sync') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const payload = JSON.parse(body);
        assert.equal(payload.sessions.length, 80);
        assert.equal(payload.sessions.filter((session) => session.messages.length > 0).length, 40);
        requestedByCycle.push(activeRequests);
        activeRequests = [];
        response.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  }, async (url) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-context-cursor-'));
    const configPath = path.join(root, 'cloud-connector.json');
    const config = { ...createIdentity('test-mac'), deviceId: 'device-1', controlPlaneUrl: url, sessionGatewayUrl: url };
    saveConfig(configPath, config);
    await syncGatewaySessions(config, { configPath });
    await syncGatewaySessions(config, { configPath });
    assert.equal(loadConfig(configPath).sessionContextCursorId, 'session-79');
  });
  assert.equal(requestedByCycle.length, 2);
  assert.equal(new Set(requestedByCycle.flat()).size, 80);
});

test('resumes the existing Hermes session and carries cloud handoff context', async () => {
  let received;
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = JSON.parse(body);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ message: { role: 'assistant', content: 'resumed on the Mac' } }));
    });
  }, async (sessionGatewayUrl) => {
    const result = await executeLocal({ sessionGatewayUrl }, { sourceSessionId: 'mobile_1', prompt: 'finish it', handoffMessages: [{ role: 'assistant', content: 'cloud result' }] });
    assert.equal(result, 'resumed on the Mac');
  });
  assert.equal(received.message, 'finish it');
  assert.match(received.system_message, /cloud result/);
});
