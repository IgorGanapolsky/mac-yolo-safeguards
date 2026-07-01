'use strict';

const http = require('http');
const { URL } = require('url');
const { RelayStore, THUMBGATE_LEASH_PRODUCT_ID } = require('./store');

const VERSION = '0.1.0';
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DB_PATH = process.env.HERMES_MOBILE_DB_PATH || '';

const store = new RelayStore(DB_PATH);

// --- Brute-force protection for the unauthenticated pairing endpoint ---
// The pair code is the only thing between a stranger and a worker's agent, so cap how
// fast one client can guess. With the high-entropy code + 256-bit QR secret, this makes
// pairing brute-force infeasible (account takeover -> agent RCE once chat ships).
const PAIR_RL_WINDOW_MS = 60 * 1000;
const PAIR_RL_MAX = 10;
const pairCompleteHits = new Map(); // clientIp -> timestamp[]
let storePurchaseVerifier = defaultStorePurchaseVerifier;

function clientIp(req) {
  const fly = req.headers['fly-client-ip'];
  if (fly) return String(fly);
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function allowPairComplete(req, now = Date.now()) {
  const ip = clientIp(req);
  const recent = (pairCompleteHits.get(ip) || []).filter((t) => now - t < PAIR_RL_WINDOW_MS);
  recent.push(now);
  pairCompleteHits.set(ip, recent);
  if (pairCompleteHits.size > 5000) {
    for (const [key, hits] of pairCompleteHits) {
      if (!hits.length || now - hits[hits.length - 1] > PAIR_RL_WINDOW_MS) {
        pairCompleteHits.delete(key);
      }
    }
  }
  return recent.length <= PAIR_RL_MAX;
}

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

function normalizeThumbgateLeashReceipt(body) {
  const platform = String(body.platform || '').trim().toLowerCase();
  const productId = String(body.product_id || body.productId || '').trim();
  if (platform !== 'android' && platform !== 'ios') {
    return { ok: false, error: 'invalid_platform' };
  }
  if (productId !== THUMBGATE_LEASH_PRODUCT_ID) {
    return { ok: false, error: 'invalid_product' };
  }
  const purchaseToken = String(body.purchase_token || body.purchaseToken || '').trim();
  const transactionId = String(body.transaction_id || body.transactionId || '').trim();
  const signedTransaction = String(body.signed_transaction || body.signedTransaction || '').trim();
  if (platform === 'android' && !purchaseToken) {
    return { ok: false, error: 'missing_purchase_token' };
  }
  if (platform === 'ios' && !transactionId && !signedTransaction) {
    return { ok: false, error: 'missing_transaction' };
  }
  return {
    ok: true,
    receipt: {
      platform,
      product_id: productId,
      purchase_token: purchaseToken || null,
      transaction_id: transactionId || null,
      signed_transaction: signedTransaction || null,
    },
  };
}

async function defaultStorePurchaseVerifier() {
  return { ok: false, status: 503, error: 'store_verifier_not_configured' };
}

function setStorePurchaseVerifierForTest(verifier) {
  storePurchaseVerifier = verifier || defaultStorePurchaseVerifier;
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
    if (!allowPairComplete(req)) {
      sendJson(res, 429, { error: 'rate_limited' });
      return;
    }
    const body = await readJson(req);
    // Accept the high-entropy QR secret first, falling back to the typed human code.
    const paired = store.completePairing(body.secret || body.code);
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
      // Only report an active worker that is actually live (fresh heartbeat) — no false green.
      active_worker_id: store.activeWorkerId(account),
      tier: store.thumbgateLeashEntitlement(account).active ? 'pro' : 'free',
      entitlement: {
        thumbgate_leash: store.thumbgateLeashEntitlement(account),
      },
      activity_count: events.length,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/v1/entitlements/thumbgate-leash/verify') {
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
    const body = await readJson(req);
    const normalized = normalizeThumbgateLeashReceipt(body);
    if (!normalized.ok) {
      sendJson(res, 400, { error: normalized.error });
      return;
    }
    const verified = await storePurchaseVerifier(normalized.receipt);
    if (!verified?.ok) {
      sendJson(res, Number(verified?.status || 402), {
        error: verified?.error || 'purchase_not_active',
      });
      return;
    }
    const entitlement = store.recordThumbgateLeashEntitlement(account.id, {
      ...verified,
      platform: normalized.receipt.platform,
      product_id: THUMBGATE_LEASH_PRODUCT_ID,
    });
    if (!entitlement) {
      sendJson(res, 402, { error: 'purchase_not_active' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      entitlement: {
        thumbgate_leash: store.thumbgateLeashEntitlement(account),
      },
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

module.exports = {
  server,
  startServer,
  handleRequest,
  normalizeThumbgateLeashReceipt,
  setStorePurchaseVerifierForTest,
  store,
  VERSION,
};

if (require.main === module) {
  startServer(PORT, HOST).then(({ port, host }) => {
    console.log(`hermes-relay listening on http://${host}:${port} version=${VERSION}`);
  });
}
