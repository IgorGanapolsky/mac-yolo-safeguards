#!/usr/bin/env node
'use strict';

/**
 * hermes-known-state-emulate.js — @workos/emulate patterns for Hermes/ThumbGate
 *
 * WorkOS newsletter (2026-08-04): "@workos/emulate … local API server for
 * development and automated testing. Seed users, orgs, … so every test starts
 * from a known state. Inject validation errors, simulated rate limits, and
 * temporary failures to test unhappy paths."
 *
 * We do NOT buy WorkOS or hit live AuthKit. This is a free, in-process
 * known-state store + optional local HTTP shim for:
 *   - Hermes Mobile pairing (codes, machines, redeem)
 *   - Gateway health + approval gate states
 *   - ThumbGate-ish auth session stubs
 *
 * Usage:
 *   node tools/hermes-known-state-emulate.js --demo --json
 *   node tools/hermes-known-state-emulate.js --serve --port 0 --json
 *   node tools/hermes-known-state-emulate.js --scenario rate_limit --json
 */

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const DEFAULT_SEED = Object.freeze({
  machines: [
    {
      id: 'mac_pro_primary',
      label: 'Mac Pro',
      hostname: 'Igors-MacBook-Pro.local',
      gatewayUrl: 'http://192.168.12.208:8642',
      localIp: '192.168.12.208',
      transport: 'lan',
    },
    {
      id: 'mac_usb_loopback',
      label: 'This Mac · USB',
      hostname: 'Igors-MacBook-Pro.local',
      gatewayUrl: 'http://127.0.0.1:8642',
      localIp: '127.0.0.1',
      transport: 'usb',
    },
  ],
  users: [
    {
      id: 'user_demo_igor',
      email: 'iganapolsky@gmail.com',
      firstName: 'Igor',
      lastName: 'Ganapolsky',
    },
  ],
  pairCodes: [
    {
      code: 'PAIROK01',
      machineId: 'mac_pro_primary',
      expiresInMs: 20 * 60 * 1000,
      singleUse: true,
    },
  ],
  approvals: [
    {
      actionId: 'act_seed_1',
      toolName: 'run_command',
      reason: 'Dangerous command execution',
      command: 'rm -rf /tmp/hermes-emulate-test',
      status: 'pending',
    },
  ],
});

/** Failure modes WorkOS documents; mapped onto Hermes pair/gate surfaces. */
const FAULTS = Object.freeze({
  none: null,
  rate_limit: { httpStatus: 429, error: 'rate_limited', message: 'Too many pair attempts' },
  invalid_code: { httpStatus: 400, error: 'invalid_grant', message: 'Pairing code is invalid or expired' },
  expired_code: { httpStatus: 400, error: 'code_expired', message: 'Pairing code expired' },
  server_error: { httpStatus: 503, error: 'temporary_unavailable', message: 'Gateway temporarily unavailable' },
  webhook_sig: { httpStatus: 401, error: 'invalid_signature', message: 'Webhook signature validation failed' },
});

function nowMs(clock) {
  return typeof clock === 'function' ? clock() : Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * In-memory known-state store (resettable between tests).
 */
function createKnownStateStore(options = {}) {
  const clock = options.clock || (() => Date.now());
  const seed = clone(options.seed || DEFAULT_SEED);
  const fault = options.fault && FAULTS[options.fault] !== undefined ? options.fault : 'none';
  const state = {
    createdAt: nowMs(clock),
    fault,
    machines: new Map(seed.machines.map((m) => [m.id, { ...m }])),
    users: new Map(seed.users.map((u) => [u.id, { ...u }])),
    pairCodes: new Map(),
    sessions: new Map(),
    approvals: new Map(seed.approvals.map((a) => [a.actionId, { ...a }])),
    attemptLog: [],
    rateLimitWindowMs: options.rateLimitWindowMs || 60_000,
    rateLimitMax: options.rateLimitMax || 5,
  };

  for (const entry of seed.pairCodes) {
    const expiresAt = nowMs(clock) + (entry.expiresInMs || 120_000);
    state.pairCodes.set(entry.code.toUpperCase(), {
      code: entry.code.toUpperCase(),
      machineId: entry.machineId,
      expiresAt,
      singleUse: entry.singleUse !== false,
      consumed: false,
    });
  }

  function setFault(name) {
    if (name !== 'none' && !FAULTS[name]) {
      throw new Error(`unknown fault: ${name}`);
    }
    state.fault = name;
    return state.fault;
  }

  function listMachines() {
    return [...state.machines.values()];
  }

  function getMachine(id) {
    return state.machines.get(id) || null;
  }

  function mintPairCode(payload = {}) {
    const code = String(payload.code || crypto.randomBytes(4).toString('hex')).toUpperCase();
    const machineId = payload.machineId || 'mac_pro_primary';
    if (!state.machines.has(machineId)) {
      return { ok: false, error: 'unknown_machine', machineId };
    }
    const expiresAt = nowMs(clock) + (payload.expiresInMs || 20 * 60 * 1000);
    const entry = {
      code,
      machineId,
      expiresAt,
      singleUse: payload.singleUse !== false,
      consumed: false,
    };
    state.pairCodes.set(code, entry);
    return { ok: true, code, expiresAt, machineId };
  }

  function recordAttempt(kind, meta = {}) {
    state.attemptLog.push({ at: nowMs(clock), kind, ...meta });
    // prune old
    const cutoff = nowMs(clock) - state.rateLimitWindowMs;
    state.attemptLog = state.attemptLog.filter((a) => a.at >= cutoff);
  }

  function isRateLimited(kind = 'pair_redeem') {
    if (state.fault === 'rate_limit') return true;
    const recent = state.attemptLog.filter((a) => a.kind === kind).length;
    return recent >= state.rateLimitMax;
  }

  /**
   * Redeem a pairing code → session (happy path) or structured error.
   */
  function redeemPairCode(code, options = {}) {
    recordAttempt('pair_redeem', { code: String(code || '').slice(0, 16) });

    if (state.fault === 'server_error') {
      return { ok: false, ...FAULTS.server_error };
    }
    if (state.fault === 'rate_limit' || isRateLimited('pair_redeem')) {
      return { ok: false, ...FAULTS.rate_limit, retryAfterSec: 1 };
    }
    if (state.fault === 'invalid_code') {
      return { ok: false, ...FAULTS.invalid_code };
    }
    if (state.fault === 'expired_code') {
      return { ok: false, ...FAULTS.expired_code };
    }

    const key = String(code || '').trim().toUpperCase();
    if (!key) {
      return { ok: false, httpStatus: 400, error: 'missing_code', message: 'Pairing code required' };
    }
    const entry = state.pairCodes.get(key);
    if (!entry) {
      return { ok: false, ...FAULTS.invalid_code };
    }
    if (entry.consumed) {
      return { ok: false, httpStatus: 400, error: 'code_consumed', message: 'Pairing code already used' };
    }
    if (entry.expiresAt <= nowMs(clock)) {
      return { ok: false, ...FAULTS.expired_code };
    }

    const machine = state.machines.get(entry.machineId);
    if (!machine) {
      return { ok: false, httpStatus: 500, error: 'machine_missing', message: 'Seed machine vanished' };
    }

    if (entry.singleUse) entry.consumed = true;

    const sessionId = `sess_${crypto.randomBytes(6).toString('hex')}`;
    const session = {
      sessionId,
      machineId: machine.id,
      gatewayUrl: machine.gatewayUrl,
      hostname: machine.hostname,
      transport: machine.transport,
      pairedAt: nowMs(clock),
      deviceId: options.deviceId || 'device_emulate',
    };
    state.sessions.set(sessionId, session);

    return {
      ok: true,
      httpStatus: 200,
      session,
      machine,
    };
  }

  function health(machineId) {
    if (state.fault === 'server_error') {
      return { ok: false, ...FAULTS.server_error, level: 'red' };
    }
    const machine = machineId ? state.machines.get(machineId) : listMachines()[0];
    if (!machine) {
      return { ok: false, httpStatus: 404, error: 'not_found', level: 'red' };
    }
    return {
      ok: true,
      httpStatus: 200,
      level: 'green',
      status: 'ok',
      gatewayState: 'running',
      hostname: machine.hostname,
      localIp: machine.localIp,
      gatewayUrl: machine.gatewayUrl,
      checkedAt: new Date(nowMs(clock)).toISOString(),
    };
  }

  function listApprovals(filter = 'pending') {
    return [...state.approvals.values()].filter((a) =>
      filter === 'all' ? true : a.status === filter,
    );
  }

  function resolveApproval(actionId, decision) {
    if (state.fault === 'webhook_sig') {
      return { ok: false, ...FAULTS.webhook_sig };
    }
    const row = state.approvals.get(actionId);
    if (!row) {
      return { ok: false, httpStatus: 404, error: 'not_found', message: 'Unknown action' };
    }
    if (row.status !== 'pending') {
      return { ok: false, httpStatus: 409, error: 'already_resolved', status: row.status };
    }
    const next = decision === 'allow' || decision === 'approve' ? 'allowed' : 'denied';
    row.status = next;
    row.resolvedAt = nowMs(clock);
    return { ok: true, httpStatus: 200, approval: { ...row } };
  }

  function snapshot() {
    return {
      fault: state.fault,
      machines: listMachines(),
      users: [...state.users.values()],
      pairCodes: [...state.pairCodes.values()].map((c) => ({
        code: c.code,
        machineId: c.machineId,
        expiresAt: c.expiresAt,
        consumed: c.consumed,
        remainingMs: Math.max(0, c.expiresAt - nowMs(clock)),
      })),
      sessions: [...state.sessions.values()],
      approvals: [...state.approvals.values()],
      attemptCount: state.attemptLog.length,
    };
  }

  function reset(nextSeed) {
    const rebuilt = createKnownStateStore({
      seed: nextSeed || seed,
      clock,
      fault: 'none',
      rateLimitWindowMs: state.rateLimitWindowMs,
      rateLimitMax: state.rateLimitMax,
    });
    // mutate in place so callers holding this object still work
    state.fault = rebuilt._state.fault;
    state.machines = rebuilt._state.machines;
    state.users = rebuilt._state.users;
    state.pairCodes = rebuilt._state.pairCodes;
    state.sessions = rebuilt._state.sessions;
    state.approvals = rebuilt._state.approvals;
    state.attemptLog = [];
    return snapshot();
  }

  return {
    _state: state,
    setFault,
    listMachines,
    getMachine,
    mintPairCode,
    redeemPairCode,
    health,
    listApprovals,
    resolveApproval,
    snapshot,
    reset,
    isRateLimited,
    FAULTS,
  };
}

/**
 * Optional HTTP shim (CI browser / fetch tests) — same shape as @workos/emulate.
 */
function startEmulateServer(store, options = {}) {
  const port = options.port != null ? options.port : 0;
  const host = options.host || '127.0.0.1';

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://${host}`);
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };

      // Global inject (WorkOS: inject validation errors / rate limits)
      if (store._state.fault === 'rate_limit' && url.pathname !== '/health') {
        return send(429, { error: 'rate_limited', message: 'Too many requests', retry_after: 1 });
      }
      if (store._state.fault === 'server_error') {
        return send(503, { error: 'temporary_unavailable', message: 'Service temporarily unavailable' });
      }

      if (url.pathname === '/health' && req.method === 'GET') {
        const h = store.health(url.searchParams.get('machineId') || undefined);
        return send(h.httpStatus || (h.ok ? 200 : 500), h);
      }

      if (url.pathname === '/v1/machines' && req.method === 'GET') {
        return send(200, { machines: store.listMachines() });
      }

      if (url.pathname === '/v1/pair/redeem' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', () => {
          let parsed = {};
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch {
            return send(400, { error: 'invalid_json' });
          }
          const result = store.redeemPairCode(parsed.code, { deviceId: parsed.deviceId });
          return send(result.httpStatus || (result.ok ? 200 : 400), result);
        });
        return;
      }

      if (url.pathname === '/v1/approvals' && req.method === 'GET') {
        return send(200, { approvals: store.listApprovals(url.searchParams.get('status') || 'pending') });
      }

      if (url.pathname === '/v1/approvals/resolve' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', () => {
          let parsed = {};
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch {
            return send(400, { error: 'invalid_json' });
          }
          const result = store.resolveApproval(parsed.actionId, parsed.decision);
          return send(result.httpStatus || (result.ok ? 200 : 400), result);
        });
        return;
      }

      if (url.pathname === '/v1/snapshot' && req.method === 'GET') {
        return send(200, store.snapshot());
      }

      return send(404, { error: 'not_found' });
    });

    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        baseUrl: `http://${host}:${addr.port}`,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

/** Named scenarios for CI (every test starts from known state). */
function runScenario(name, options = {}) {
  const clock = options.clock || (() => Date.now());
  const store = createKnownStateStore({ clock, seed: options.seed });

  switch (name) {
    case 'happy_pair': {
      const redeem = store.redeemPairCode('PAIROK01', { deviceId: 'phone_a' });
      return {
        name,
        ok: redeem.ok === true && redeem.session && redeem.machine,
        redeem,
        snapshot: store.snapshot(),
      };
    }
    case 'expired_code': {
      store.setFault('expired_code');
      const redeem = store.redeemPairCode('PAIROK01');
      return {
        name,
        ok: redeem.ok === false && redeem.error === 'code_expired',
        redeem,
      };
    }
    case 'rate_limit': {
      store.setFault('rate_limit');
      const redeem = store.redeemPairCode('PAIROK01');
      return {
        name,
        ok: redeem.ok === false && redeem.httpStatus === 429,
        redeem,
      };
    }
    case 'invalid_code': {
      const redeem = store.redeemPairCode('NOPE1234');
      return {
        name,
        ok: redeem.ok === false && redeem.error === 'invalid_grant',
        redeem,
      };
    }
    case 'single_use_consumed': {
      const first = store.redeemPairCode('PAIROK01');
      const second = store.redeemPairCode('PAIROK01');
      return {
        name,
        ok: first.ok === true && second.ok === false && second.error === 'code_consumed',
        first,
        second,
      };
    }
    case 'approval_allow': {
      const r = store.resolveApproval('act_seed_1', 'allow');
      return {
        name,
        ok: r.ok === true && r.approval.status === 'allowed',
        resolve: r,
      };
    }
    case 'approval_webhook_sig': {
      store.setFault('webhook_sig');
      const r = store.resolveApproval('act_seed_1', 'allow');
      return {
        name,
        ok: r.ok === false && r.error === 'invalid_signature',
        resolve: r,
      };
    }
    case 'health_green': {
      const h = store.health('mac_pro_primary');
      return { name, ok: h.ok === true && h.level === 'green', health: h };
    }
    case 'health_outage': {
      store.setFault('server_error');
      const h = store.health('mac_pro_primary');
      return {
        name,
        ok: h.ok === false && h.httpStatus === 503,
        health: h,
      };
    }
    default:
      return { name, ok: false, error: `unknown scenario: ${name}` };
  }
}

function runAllScenarios(options = {}) {
  const names = [
    'happy_pair',
    'expired_code',
    'rate_limit',
    'invalid_code',
    'single_use_consumed',
    'approval_allow',
    'approval_webhook_sig',
    'health_green',
    'health_outage',
  ];
  const results = names.map((n) => runScenario(n, options));
  const passed = results.filter((r) => r.ok).length;
  return {
    ok: passed === results.length,
    total: results.length,
    passed,
    results,
  };
}

function parseArgs(argv) {
  const args = { json: false, demo: false, serve: false, port: 0, scenario: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--serve') args.serve = true;
    else if (a === '--port') args.port = Number(argv[++i] || 0);
    else if (a === '--scenario') args.scenario = String(argv[++i] || '');
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-known-state-emulate.js --demo [--json]
  node tools/hermes-known-state-emulate.js --scenario happy_pair [--json]
  node tools/hermes-known-state-emulate.js --serve --port 0 [--json]`);
    process.exit(0);
  }

  if (args.scenario) {
    const report = runScenario(args.scenario);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(`${report.ok ? 'PASS' : 'FAIL'} ${report.name}`);
    process.exit(report.ok ? 0 : 1);
  }

  if (args.demo || (!args.serve && !args.scenario)) {
    const report = runAllScenarios();
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log('=== Hermes known-state emulate (WorkOS @workos/emulate steal) ===');
      for (const r of report.results) {
        console.log(`  ${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
      }
      console.log(`\n${report.passed}/${report.total} passed`);
    }
    process.exit(report.ok ? 0 : 1);
  }

  if (args.serve) {
    const store = createKnownStateStore();
    const server = await startEmulateServer(store, { port: args.port });
    const out = { ok: true, baseUrl: server.baseUrl, port: server.port, snapshot: store.snapshot() };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`Emulate server listening at ${server.baseUrl}`);
      console.log('Ctrl+C to stop');
    }
    // keep alive when --serve without auto-exit
    process.on('SIGINT', async () => {
      await server.close();
      process.exit(0);
    });
    return;
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_SEED,
  FAULTS,
  createKnownStateStore,
  startEmulateServer,
  runScenario,
  runAllScenarios,
};
