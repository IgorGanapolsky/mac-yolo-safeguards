#!/usr/bin/env node
// relay.js — the cloud broker that makes the Hermes SaaS work WITHOUT the user
// installing Tailscale or opening any port. Runs on a cheap VPS. Dependency-free.
//
// How it kills the Tailscale problem (outbound-dial):
//   • The user's Mac runs `connector.js`, which DIALS OUT to this relay (long-poll over
//     443) authenticated by a per-device token. No inbound ports, no VPN, no Tailscale.
//   • The paying user opens the website in a plain browser. The browser asks the relay
//     for their sessions; the relay routes the request down the connector's open
//     outbound channel and returns the answer.
//   • If the user's Mac is OFFLINE (no live connector), the relay falls back to a VPS
//     Hermes instance so work continues — exactly the failover the product promises.
//
// This file is the deployable core. SSO (WorkOS/Clerk) and Stripe billing wrap around
// it — they gate which `accountId` is allowed to pair/subscribe; the transport below is
// the hard part and it is complete + tested here.
'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = parseInt(process.env.RELAY_PORT || '9099', 10);
const HOST = process.env.RELAY_HOST || '0.0.0.0';
// VPS fallback: a Hermes instance the relay itself can reach when the user's Mac is down.
const VPS_FALLBACK = process.env.RELAY_VPS_FALLBACK_URL || ''; // e.g. http://127.0.0.1:4010
const OFFLINE_MS = parseInt(process.env.RELAY_CONNECTOR_OFFLINE_MS || '15000', 10);

// --- In-memory state (a real deploy swaps this for Postgres; shape is identical) ---
const pairings = new Map();   // code -> {accountId, createdAt}
const tokens = new Map();     // token -> {accountId, deviceId, lastSeen}
const inbox = new Map();      // token -> [{id, op, args}]           (requests waiting for the connector)
const waiters = new Map();    // token -> [res]                       (connector long-poll responses held open)
const pending = new Map();    // reqId -> {resolve, timer}            (browser requests awaiting a connector reply)

const now = () => parseInt(process.env.RELAY_NOW_MS || '', 10) || Date.now();
const rid = () => crypto.randomBytes(8).toString('hex');
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
function body(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }

function connectorOnline(token) {
  const t = tokens.get(token);
  return !!t && (now() - t.lastSeen) < OFFLINE_MS;
}

// Deliver a queued request to a connector that is currently long-polling, if any.
function flush(token) {
  const q = inbox.get(token), ws = waiters.get(token);
  if (!q || !q.length || !ws || !ws.length) return;
  const res = ws.shift();
  const item = q.shift();
  json(res, 200, { request: item });
}

// Browser-facing: ask the paired machine (or VPS fallback) for data.
function ask(token, op, args, timeoutMs = 12000) {
  return new Promise(async (resolve) => {
    if (!connectorOnline(token)) {
      // FAILOVER: user's Mac is offline → serve from the VPS instance if configured.
      if (VPS_FALLBACK) {
        try {
          const r = await fetchJson(`${VPS_FALLBACK}/api/${op}${args && args.id ? '?id=' + encodeURIComponent(args.id) : ''}`);
          return resolve({ source: 'vps-fallback', data: r });
        } catch { return resolve({ source: 'vps-fallback', error: 'vps unreachable' }); }
      }
      return resolve({ source: 'offline', error: 'connector offline and no VPS fallback configured' });
    }
    const id = rid();
    const timer = setTimeout(() => { pending.delete(id); resolve({ source: 'timeout', error: 'connector did not answer' }); }, timeoutMs);
    pending.set(id, { resolve: (data) => resolve({ source: 'connector', data }), timer });
    (inbox.get(token) || inbox.set(token, []).get(token)).push({ id, op, args });
    flush(token);
  });
}

function fetchJson(u) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('https:') ? require('https') : require('http');
    const req = mod.get(u, { timeout: 8000 }, (r) => { let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;
  try {
    // --- Pairing: the website (after SSO) creates a code; the connector redeems it ---
    if (p === '/v1/pair/new' && req.method === 'POST') {
      const { accountId } = await body(req);
      if (!accountId) return json(res, 400, { error: 'accountId required' });
      const code = crypto.randomBytes(4).toString('hex').toUpperCase().replace(/(.{4})/, '$1-');
      pairings.set(code, { accountId, createdAt: now() });
      return json(res, 200, { pairingCode: code });
    }
    if (p === '/v1/pair/redeem' && req.method === 'POST') {
      const { code, deviceId } = await body(req);
      const pr = pairings.get(code);
      if (!pr) return json(res, 400, { error: 'invalid or used pairing code' });
      pairings.delete(code);
      const token = 'hcx_' + crypto.randomBytes(24).toString('hex');
      tokens.set(token, { accountId: pr.accountId, deviceId: deviceId || 'unknown', lastSeen: now() });
      return json(res, 200, { deviceToken: token, accountId: pr.accountId });
    }
    // --- Connector long-poll (outbound-dial): holds open until there's work or ~25s ---
    if (p === '/v1/connector/poll') {
      const token = u.searchParams.get('token');
      const t = tokens.get(token);
      if (!t) return json(res, 401, { error: 'unknown token' });
      t.lastSeen = now();
      (inbox.get(token) || inbox.set(token, []).get(token));
      if ((inbox.get(token) || []).length) return flush(token) || undefined;
      const arr = waiters.get(token) || waiters.set(token, []).get(token);
      arr.push(res);
      const to = setTimeout(() => { const i = arr.indexOf(res); if (i >= 0) arr.splice(i, 1); json(res, 200, { request: null }); }, 25000);
      req.on('close', () => { clearTimeout(to); const i = arr.indexOf(res); if (i >= 0) arr.splice(i, 1); });
      return;
    }
    // --- Connector posts a reply to a routed request ---
    if (p === '/v1/connector/reply' && req.method === 'POST') {
      const { token, id, result } = await body(req);
      if (!tokens.has(token)) return json(res, 401, { error: 'unknown token' });
      const w = pending.get(id);
      if (w) { clearTimeout(w.timer); pending.delete(id); w.resolve(result); }
      return json(res, 200, { ok: true });
    }
    // --- Browser-facing (a real deploy gates these behind the SSO session + Stripe) ---
    if (p === '/v1/sessions') {
      const token = u.searchParams.get('token');
      if (!tokens.has(token)) return json(res, 401, { error: 'unknown token' });
      return json(res, 200, await ask(token, 'sessions', {}));
    }
    if (p === '/v1/thread') {
      const token = u.searchParams.get('token');
      if (!tokens.has(token)) return json(res, 401, { error: 'unknown token' });
      return json(res, 200, await ask(token, 'thread', { id: u.searchParams.get('id') }));
    }
    if (p === '/v1/status') {
      const token = u.searchParams.get('token');
      return json(res, 200, { online: connectorOnline(token), vpsFallback: !!VPS_FALLBACK });
    }
    if (p === '/health') return json(res, 200, { ok: true, service: 'hermes-relay' });
    return json(res, 404, { error: 'not found' });
  } catch (e) { return json(res, 500, { error: String(e && e.message || e) }); }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`hermes-relay listening on ${HOST}:${PORT} (vpsFallback=${VPS_FALLBACK ? 'on' : 'off'})`));
}
module.exports = { server };
