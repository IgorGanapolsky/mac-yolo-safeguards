'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { boundContextMessages, canonicalRequest, collectGatewaySessions, createIdentity, executeLocal, loadConfig, saveConfig, signedHeaders, timestampMillis } = require('../tools/hermes-cloud-connector');

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

test('context upload is bounded before it leaves the Mac', () => {
  const messages = Array.from({ length: 70 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn-${index}-` + 'x'.repeat(1_000) }));
  const bounded = boundContextMessages(messages);
  assert.ok(bounded.length <= 60);
  assert.ok(bounded.reduce((total, message) => total + message.content.length, 0) <= 48_000);
  assert.match(bounded.at(-1).content, /^turn-69-/);
});

test('collects real Hermes Mobile session inventory with bounded context', async () => {
  await withServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/api/sessions?')) {
      response.end(JSON.stringify({ data: [{ id: 'mobile_1', title: 'Phone launch', source: 'api_server', model: 'hermes', message_count: 2, last_active: 1_700_000_000 }] }));
      return;
    }
    response.end(JSON.stringify({ data: [{ role: 'user', content: 'continue the launch' }, { role: 'assistant', content: [{ type: 'text', text: 'working' }] }] }));
  }, async (sessionGatewayUrl) => {
    const sessions = await collectGatewaySessions({ sessionGatewayUrl });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'mobile_1');
    assert.equal(sessions[0].messages[1].content, 'working');
    assert.equal(sessions[0].updatedAt, 1_700_000_000_000);
  });
  assert.equal(timestampMillis('2026-07-20T00:00:00Z'), Date.parse('2026-07-20T00:00:00Z'));
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
