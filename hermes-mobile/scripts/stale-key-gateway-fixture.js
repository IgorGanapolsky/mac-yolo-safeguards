#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');

const DEFAULT_PORT = 8642;
const GOOD_KEY = 'e2e-good-key';

function json(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type',
  });
  response.end(JSON.stringify(body));
}

function appendAudit(auditPath, event) {
  if (!auditPath) return;
  fs.appendFileSync(auditPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function createFixtureServer(options = {}) {
  const goodKey = options.goodKey || GOOD_KEY;
  const auditPath = options.auditPath || '';
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      });
      response.end();
      return;
    }
    if (url.pathname === '/health') {
      appendAudit(auditPath, { path: url.pathname, status: 200, authenticated: false });
      json(response, 200, {
        status: 'ok',
        hostname: 'Hermes-E2E-Mac',
        local_ip: '127.0.0.1',
        model: 'hermes-e2e-fixture',
      });
      return;
    }

    const bearer = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const authenticated = bearer === goodKey;
    if (!authenticated) {
      appendAudit(auditPath, { path: url.pathname, status: 401, authenticated: false });
      json(response, 401, { detail: 'invalid API key' });
      return;
    }

    if (url.pathname === '/api/sessions') {
      appendAudit(auditPath, { path: url.pathname, status: 200, authenticated: true });
      json(response, 200, { sessions: [] });
      return;
    }
    if (url.pathname === '/v1/capabilities') {
      appendAudit(auditPath, { path: url.pathname, status: 200, authenticated: true });
      json(response, 200, { model: 'hermes-e2e-fixture', tools: [] });
      return;
    }
    appendAudit(auditPath, { path: url.pathname, status: 404, authenticated: true });
    json(response, 404, { detail: 'not found' });
  });
  return server;
}

if (require.main === module) {
  const port = Number.parseInt(process.env.HERMES_STALE_KEY_E2E_PORT || '', 10) || DEFAULT_PORT;
  const server = createFixtureServer({
    goodKey: process.env.HERMES_STALE_KEY_E2E_GOOD_KEY || GOOD_KEY,
    auditPath: process.env.HERMES_STALE_KEY_E2E_AUDIT || '',
  });
  server.listen(port, '127.0.0.1', () => {
    process.stdout.write(`stale-key fixture listening on 127.0.0.1:${port}\n`);
  });
}

module.exports = { DEFAULT_PORT, GOOD_KEY, createFixtureServer };
