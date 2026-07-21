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
  executeThreadOperation,
  gatewayHeaders,
  loadConfig,
  pairingDashboardUrl,
  pairingMatchesControlPlane,
  parseDotEnvValue,
  parseTerminalCwd,
  resolveGatewayApiKey,
  resolveWorkspacePath,
  saveConfig,
  selectContextSessionIds,
  signedHeaders,
  syncGatewaySessions,
  timestampMillis,
  withLeaseRenewal,
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

test('reads only the active Hermes terminal workspace from config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-'));
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, [
    'model: glm-coding',
    'terminal:',
    '  backend: local',
    '  cwd: "/Users/example/projects/ThumbGate" # active project',
    'browser:',
    '  cwd: /not-the-terminal-project',
  ].join('\n'));
  assert.equal(parseTerminalCwd(fs.readFileSync(configPath, 'utf8')), '/Users/example/projects/ThumbGate');
  assert.equal(resolveWorkspacePath({ hermesConfigPath: configPath }, { env: {} }), '/Users/example/projects/ThumbGate');
  assert.equal(resolveWorkspacePath({}, { env: { HERMES_WORKSPACE_PATH: '/explicit/project' }, configPath }), '/explicit/project');
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
  await withServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url.startsWith('/api/sessions?')) {
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
  assert.equal(timestampMillis('2026-07-20T00:00:00Z'), Date.parse('2026-07-20T00:00:00Z'));
});

test('successful session sync persists context rotation progress', async () => {
  const inventory = Array.from({ length: 60 }, (_, index) => ({
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
        assert.equal(payload.sessions.length, 60);
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
    assert.equal(loadConfig(configPath).sessionContextCursorId, 'session-19');
  });
  assert.equal(requestedByCycle.length, 2);
  assert.equal(new Set(requestedByCycle.flat()).size, 60);
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

test('creates a persistent Hermes web session and pins the configured project workspace', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-web-session-'));
  const hermesConfigPath = path.join(root, 'config.yaml');
  fs.writeFileSync(hermesConfigPath, 'terminal:\n  cwd: /Users/example/workspace/git/igor/mac-yolo-safeguards\n');
  const requests = [];
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const parsed = body ? JSON.parse(body) : null;
      requests.push({ method: request.method, url: request.url, body: parsed });
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && request.url === '/api/sessions/thumbgate_thread-1') {
        response.statusCode = 404;
        response.end(JSON.stringify({ error: { code: 'session_not_found', message: 'Session not found' } }));
        return;
      }
      if (request.method === 'POST' && request.url === '/api/sessions') {
        response.statusCode = 201;
        response.end(JSON.stringify({ session: { id: parsed.id } }));
        return;
      }
      if (request.method === 'POST' && request.url === '/api/sessions/thumbgate_thread-1/chat') {
        response.end(JSON.stringify({ message: { role: 'assistant', content: 'Active project: mac-yolo-safeguards' } }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: 'unexpected request' }));
    });
  }, async (sessionGatewayUrl) => {
    const result = await executeLocal(
      { sessionGatewayUrl, hermesConfigPath },
      { sourceSessionId: 'thumbgate_thread-1', threadTitle: 'which project are you on?', prompt: 'which project are you on?', handoffMessages: [] },
    );
    assert.equal(result, 'Active project: mac-yolo-safeguards');
  });
  assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
    'GET /api/sessions/thumbgate_thread-1',
    'POST /api/sessions',
    'POST /api/sessions/thumbgate_thread-1/chat',
  ]);
  assert.equal(requests[1].body.id, 'thumbgate_thread-1');
  assert.equal(requests[1].body.title, 'which project are you on?');
  assert.match(requests[1].body.system_prompt, /Active workspace \/ cwd: \/Users\/example\/workspace\/git\/igor\/mac-yolo-safeguards/);
  assert.match(requests[2].body.system_message, /Do not identify yourself as only the underlying model vendor/);
  assert.match(requests[2].body.system_message, /If asked which project is active/);
});

test('fails closed instead of sending an unbound task to a bare model completion', async () => {
  await assert.rejects(
    executeLocal({ sessionGatewayUrl: 'http://127.0.0.1:1' }, { prompt: 'which project?' }),
    /missing its Hermes session binding/,
  );
});

test('renews a local task lease throughout long-running Hermes work', async () => {
  let renewals = 0;
  const result = await withLeaseRenewal(
    () => new Promise((resolve) => setTimeout(() => resolve('complete'), 28)),
    async () => { renewals += 1; },
    5,
  );
  assert.equal(result, 'complete');
  assert.ok(renewals >= 3, `expected at least 3 renewals, received ${renewals}`);
});

test('applies rename and delete operations to the exact Hermes session', async () => {
  const requests = [];
  await withServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null });
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ok: true }));
    });
  }, async (sessionGatewayUrl) => {
    await executeThreadOperation({ sessionGatewayUrl }, {
      operation: 'rename', sourceSessionId: 'session/one', title: 'Revenue plan',
    });
    await executeThreadOperation({ sessionGatewayUrl }, {
      operation: 'delete', sourceSessionId: 'session/one',
    });
  });
  assert.deepEqual(requests, [
    { method: 'PATCH', url: '/api/sessions/session%2Fone', body: { title: 'Revenue plan' } },
    { method: 'DELETE', url: '/api/sessions/session%2Fone', body: null },
  ]);
});

test('clear all uses the gateway bulk delete and falls back without deleting Telegram inbox', async () => {
  const requests = [];
  await withServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    response.setHeader('content-type', 'application/json');
    if (request.method === 'DELETE' && request.url === '/api/sessions') {
      response.statusCode = 405;
      response.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    if (request.method === 'GET' && request.url.startsWith('/api/sessions?')) {
      response.end(JSON.stringify({ data: [{ id: 'keep-me' }, { id: '__telegram_inbox__' }, { id: 'delete-me' }] }));
      return;
    }
    response.end(JSON.stringify({ ok: true }));
  }, async (sessionGatewayUrl) => {
    await executeThreadOperation({ sessionGatewayUrl }, { operation: 'clear_all' });
  });
  assert.deepEqual(requests, [
    'DELETE /api/sessions',
    'GET /api/sessions?limit=60',
    'DELETE /api/sessions/keep-me',
    'DELETE /api/sessions/delete-me',
  ]);
});
