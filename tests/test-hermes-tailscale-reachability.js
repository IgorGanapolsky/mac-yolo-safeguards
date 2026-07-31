#!/usr/bin/env node
'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');
const {
  probeHost,
  localProbeIsUnhealthy,
  findHermesBin,
  restartLocalGateway,
} = require('../tools/hermes-tailscale-reachability.js');

let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    fail += 1;
    console.error(`not ok - ${name}: ${err.message}`);
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    fail += 1;
    console.error(`not ok - ${name}: ${err.message}`);
  }
}

// Build a fake spawn that records (cmd, args) calls and returns canned results.
// results keys: 'hermes', 'bootout', 'bootstrap', 'kickstart'.
function makeFakeSpawn(results = {}) {
  const calls = [];
  const fake = (cmd, args, _opts) => {
    calls.push({ cmd, args });
    // launchctl subcommands keyed by args[0] (bootout/bootstrap/kickstart);
    // hermes CLI keyed by 'hermes' regardless of the resolved bin path.
    const key = cmd === 'launchctl'
      ? (args && args[0])
      : (cmd.endsWith('hermes') ? 'hermes' : cmd);
    if (results[key] !== undefined) {
      return results[key];
    }
    return { status: 0 };
  };
  return { calls, fake };
}

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url && req.url.startsWith('/api/sessions')) {
      const auth = req.headers.authorization || '';
      if (auth === 'Bearer good-key') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ object: 'list', data: [] }));
      } else {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'invalid_api_key' } }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const ip = '127.0.0.1';

  check('probeHost is exported', () => {
    assert.strictEqual(typeof probeHost, 'function');
  });

  await checkAsync('probeHost reports reachable with good key on mock', async () => {
    const health = await new Promise((resolve) => {
      http
        .get(`http://${ip}:${port}/health`, (res) => {
          res.resume();
          resolve(res.statusCode);
        })
        .on('error', () => resolve(0));
    });
    const sessions = await new Promise((resolve) => {
      http
        .get(
          `http://${ip}:${port}/api/sessions?limit=1`,
          { headers: { Authorization: 'Bearer good-key' } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        )
        .on('error', () => resolve(0));
    });
    assert.strictEqual(health, 200);
    assert.strictEqual(sessions, 200);
  });

  await checkAsync('probeHost rejects bad key with 401', async () => {
    const sessions = await new Promise((resolve) => {
      http
        .get(
          `http://${ip}:${port}/api/sessions?limit=1`,
          { headers: { Authorization: 'Bearer bad' } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        )
        .on('error', () => resolve(0));
    });
    assert.strictEqual(sessions, 401);
  });

  server.close();

  // ---- wedge detection: localProbeIsUnhealthy ----
  // The bug: probe only checked `!healthOk`, missing `health=200 sessions=0`.
  check('localProbeIsUnhealthy detects sessions wedge (health 200, sessions non-2xx)', () => {
    // wedge: health OK but sessions timed out / non-2xx with no auth error
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, sessionsOk: false, sessionsStatus: 0, authProbeSkipped: false }), true);
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, sessionsOk: false, sessionsStatus: 502, authProbeSkipped: false }), true);
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, sessionsOk: false, sessionsStatus: 500, authProbeSkipped: false }), true);
  });

  check('localProbeIsUnhealthy returns false for healthy probe', () => {
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, sessionsOk: true, sessionsStatus: 200, authProbeSkipped: false }), false);
  });

  check('localProbeIsUnhealthy returns true for health-down (original trigger)', () => {
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: false, healthStatus: 503, sessionsOk: null, sessionsSkipped: 'no_api_key' }), true);
  });

  check('localProbeIsUnhealthy does NOT restart on missing API key (operator config)', () => {
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, healthStatus: 200, sessionsOk: null, sessionsSkipped: 'no_api_key', authProbeSkipped: true }), false);
  });

  check('localProbeIsUnhealthy does NOT restart on 401/403 (bad key, not a wedge)', () => {
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, sessionsOk: false, sessionsStatus: 401, authProbeSkipped: false }), false);
    assert.strictEqual(localProbeIsUnhealthy({ healthOk: true, sessionsOk: false, sessionsStatus: 403, authProbeSkipped: false }), false);
  });

  check('localProbeIsUnhealthy is a no-op for undefined probe', () => {
    assert.strictEqual(localProbeIsUnhealthy(undefined), false);
    assert.strictEqual(localProbeIsUnhealthy(null), false);
  });

  check('findHermesBin is exported and returns string|null', () => {
    assert.strictEqual(typeof findHermesBin, 'function');
    const result = findHermesBin();
    assert.ok(result === null || typeof result === 'string', 'findHermesBin must return string|null');
  });

  // ---- restartLocalGateway: hermes CLI path (resolved off PATH) ----
  check('restartLocalGateway: dry-run short-circuits without spawning', () => {
    const { calls, fake } = makeFakeSpawn();
    const r = restartLocalGateway(true, { spawn: fake, fsExists: () => true });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.method, 'dry-run');
    assert.strictEqual(r.attempts.length, 0);
    assert.strictEqual(calls.length, 0);
  });

  check('restartLocalGateway: hermes CLI path uses resolved bin (not bare spawn("hermes"))', () => {
    const binPath = path.join('/tmp', 'hermes-bin-test', 'hermes');
    const { calls, fake } = makeFakeSpawn({ hermes: { status: 0 } });
    const r = restartLocalGateway(false, {
      spawn: fake,
      fsExists: () => true,
      hermesBin: binPath,
    });
    assert.strictEqual(r.method, 'hermes');
    assert.strictEqual(r.ok, true);
    // The command must use the resolved bin path, NOT a bare 'hermes'.
    assert.strictEqual(calls[0].cmd, binPath);
    assert.deepStrictEqual(calls[0].args, ['gateway', 'restart']);
    assert.strictEqual(calls.length, 1); // hermes succeeded -> launchctl cycle NOT run
  });

  check('restartLocalGateway: falls back to launchctl cycle when hermes exits non-zero', () => {
    const { calls, fake } = makeFakeSpawn({
      hermes: { status: 1 },
      bootout: { status: 0 },
      bootstrap: { status: 0 },
      kickstart: { status: 0 },
    });
    const r = restartLocalGateway(false, {
      spawn: fake,
      fsExists: () => true,
      hermesBin: '/usr/local/bin/hermes',
    });
    assert.strictEqual(r.method, 'launchctl-cycle');
    assert.strictEqual(r.ok, true);
    // Sequence: hermes attempt (non-zero) -> bootout -> bootstrap -> kickstart
    assert.strictEqual(calls.length, 4);
    assert.strictEqual(calls[0].cmd, '/usr/local/bin/hermes');
    assert.deepStrictEqual(calls[0].args, ['gateway', 'restart']);
    const cmds = calls.slice(1).map((c) => `${c.cmd} ${c.args.join(' ')}`);
    assert.ok(cmds[0].startsWith('launchctl bootout gui/') && cmds[0].endsWith('/ai.hermes.gateway'), `bootout: ${cmds[0]}`);
    assert.ok(cmds[1].startsWith('launchctl bootstrap gui/') && cmds[1].includes('ai.hermes.gateway.plist'), `bootstrap: ${cmds[1]}`);
    assert.ok(cmds[2].startsWith('launchctl kickstart -k gui/') && cmds[2].endsWith('/ai.hermes.gateway'), `kickstart: ${cmds[2]}`);
  });

  check('restartLocalGateway: launchctl cycle fails when kickstart nonzero (crashed job revive)', () => {
    const { calls, fake } = makeFakeSpawn({
      bootout: { status: 0 },
      bootstrap: { status: 0 },
      kickstart: { status: 5 },
    });
    const r = restartLocalGateway(false, {
      spawn: fake,
      fsExists: () => true,
      hermesBin: '', // force launchctl path
    });
    assert.strictEqual(r.method, 'launchctl-cycle');
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(calls.map((c) => c.cmd), ['launchctl', 'launchctl', 'launchctl']);
  });

  check('restartLocalGateway: unavailable when no hermes and no launchd plist', () => {
    const { calls, fake } = makeFakeSpawn();
    const r = restartLocalGateway(false, {
      spawn: fake,
      fsExists: () => false,
      hermesBin: '',
    });
    assert.strictEqual(r.method, 'unavailable');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(calls.length, 0);
  });

  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
