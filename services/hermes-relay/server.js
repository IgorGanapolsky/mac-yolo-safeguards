'use strict';

const http = require('http');
const { URL } = require('url');
const { RelayStore } = require('./store');

const VERSION = '0.1.0';
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.HERMES_MOBILE_DB_PATH || '';

const store = new RelayStore(DB_PATH);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('payload_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function parseAuth(req, scheme) {
  const header = req.headers.authorization || '';
  const prefix = `${scheme} `;
  if (!header.startsWith(prefix)) {
    return '';
  }
  return header.slice(prefix.length).trim();
}

async function handleRequest(req, res) {
  store.pruneExpired();

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && pathname === '/v1/health') {
    sendJson(res, 200, { ok: true, version: VERSION });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/worker/register') {
    const body = await readJson(req);
    const workerToken = parseAuth(req, 'Worker');
    const registered = store.registerWorker({
      worker_token: workerToken || body.worker_token,
      machine_id: body.machine_id,
      hostname: body.hostname,
      project: body.project,
      label: body.label,
      repo: body.repo,
      gateway_ok: body.gateway_ok,
      status: body.status || 'online',
    });
    sendJson(res, 200, registered);
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/worker/heartbeat') {
    const workerToken = parseAuth(req, 'Worker');
    if (!workerToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJson(req);
    const worker = store.heartbeatWorker(workerToken, body);
    if (!worker) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, 200, { ok: true, worker_id: worker.id, last_seen_at: worker.last_seen_at });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/pair/start') {
    const workerToken = parseAuth(req, 'Worker');
    if (!workerToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const pair = store.startPairing(workerToken);
    if (!pair) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, 200, pair);
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/pair/complete') {
    const body = await readJson(req);
    const paired = store.completePairing(body.code);
    if (!paired) {
      sendJson(res, 400, { error: 'invalid_or_expired_code' });
      return;
    }
    sendJson(res, 200, { mobile_token: paired.mobile_token });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/queue') {
    const mobileToken = parseAuth(req, 'Mobile');
    if (!mobileToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const account = store.findAccountByMobileToken(mobileToken);
    if (!account) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const workers = store.listWorkersForAccount(account);
    const events = store.listPendingEvents(account.id);
    sendJson(res, 200, {
      events,
      workers,
      active_worker_id: account.active_worker_id,
      tier: 'free',
      activity_count: events.length,
    });
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/v1/verdicts/')) {
    const mobileToken = parseAuth(req, 'Mobile');
    if (!mobileToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const eventId = decodeURIComponent(pathname.slice('/v1/verdicts/'.length));
    const body = await readJson(req);
    const decision = body.decision === 'block' ? 'block' : 'allow';
    const verdict = store.submitVerdict(mobileToken, eventId, decision, body.reason);
    if (!verdict) {
      sendJson(res, 404, { error: 'event_not_found' });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/test-intercept') {
    const mobileToken = parseAuth(req, 'Mobile');
    if (!mobileToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const event = store.enqueueTestIntercept(mobileToken);
    if (!event) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, 200, { ok: true, id: event.id });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/events') {
    const workerToken = parseAuth(req, 'Worker');
    if (!workerToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const body = await readJson(req);
    const event = store.enqueueEvent(workerToken, body);
    if (!event) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    sendJson(res, 200, { id: event.id, enqueued_at: event.enqueued_at });
    return;
  }

  if (req.method === 'GET' && pathname === '/v1/worker/verdicts') {
    const workerToken = parseAuth(req, 'Worker');
    if (!workerToken) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }
    const verdicts = store.consumeVerdicts(workerToken);
    sendJson(res, 200, { verdicts });
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (error?.message === 'invalid_json') {
      sendJson(res, 400, { error: 'invalid_json' });
      return;
    }
    if (error?.message === 'payload_too_large') {
      sendJson(res, 413, { error: 'payload_too_large' });
      return;
    }
    console.error('request_failed', error);
    sendJson(res, 500, { error: 'internal_error' });
  });
});

function startServer(port = PORT, host = HOST) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      const actualPort =
        address && typeof address === 'object' ? address.port : Number(port) || PORT;
      resolve({ port: actualPort, host });
    });
  });
}

module.exports = { server, startServer, handleRequest, store, VERSION };

if (require.main === module) {
  startServer(PORT, HOST).then(({ port, host }) => {
    console.log(`hermes-relay listening on http://${host}:${port} version=${VERSION}`);
  });
}
