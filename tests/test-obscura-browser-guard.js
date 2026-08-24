#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  SOURCE,
  catalog,
  evaluateSsrf,
  evaluateCdpBind,
  evaluateBrowserSession,
  evaluateMcpHttp,
  getHealthStatus,
} = require('../tools/obscura-browser-guard');

function main() {
  assert.strictEqual(SOURCE, 'https://github.com/h4ckf0r0day/obscura');

  const have = catalog('HAVE').map((p) => p.id);
  assert.ok(have.includes('nav-timeout'));

  const skip = catalog('SKIP').map((p) => p.id);
  assert.ok(skip.includes('rust-v8-engine'));
  assert.ok(skip.includes('stealth-fingerprint'));
  assert.ok(skip.includes('residential-proxies'));
  assert.ok(skip.includes('obscura-cloud'));
  assert.ok(skip.includes('continuity-chrome-profile'));

  const adapter = catalog('ADAPTER').map((p) => p.id);
  assert.ok(adapter.includes('ssrf-deny-private'));
  assert.ok(adapter.includes('cdp-loopback-bind'));
  assert.ok(adapter.includes('zero-state-session'));

  for (const row of catalog()) {
    assert.strictEqual(row.liveClaim, row.verdict === 'HAVE');
    assert.strictEqual(row.documentation_url, SOURCE);
  }

  assert.strictEqual(evaluateSsrf('https://example.com/').allowed, true);
  assert.strictEqual(evaluateSsrf('http://127.0.0.1:9222').allowed, false);
  assert.strictEqual(evaluateSsrf('http://10.1.2.3/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://192.168.0.5/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://172.31.0.1/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://169.254.169.254/latest/meta-data/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://100.64.1.1/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://localhost/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://127.0.0.1.nip.io/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://2130706433/').allowed, false);
  assert.strictEqual(evaluateSsrf('http://[::1]/').allowed, false);
  assert.strictEqual(evaluateSsrf('file:///etc/passwd').allowed, false);

  const rebound = evaluateSsrf('https://public.example', { resolvedAddresses: ['10.0.0.9'] });
  assert.strictEqual(rebound.allowed, false);

  const override = evaluateSsrf('http://127.0.0.1/', { allowPrivateNetwork: true });
  assert.strictEqual(override.allowed, true);

  assert.strictEqual(evaluateCdpBind('127.0.0.1').allowed, true);
  assert.strictEqual(evaluateCdpBind('0.0.0.0').allowed, false);
  assert.match(evaluateCdpBind('0.0.0.0').reason, /127\.0\.0\.1/);

  assert.strictEqual(evaluateBrowserSession({ reuseInteractiveChrome: true }).allowed, false);
  assert.strictEqual(evaluateBrowserSession({ persistCookiesAcrossJobs: true }).allowed, false);
  assert.strictEqual(evaluateBrowserSession({}).allowed, true);

  const mcpBad = evaluateMcpHttp({ bindHost: '0.0.0.0', origin: 'https://evil.test' });
  assert.strictEqual(mcpBad.allowed, false);
  assert.strictEqual(mcpBad.status, 403);

  const mcpOk = evaluateMcpHttp({
    bindHost: '127.0.0.1',
    origin: 'https://thumbgate.app',
    allowedOrigins: ['https://thumbgate.app'],
  });
  assert.strictEqual(mcpOk.allowed, true);

  const mcpOriginDeny = evaluateMcpHttp({
    bindHost: '127.0.0.1',
    origin: 'https://evil.test',
    allowedOrigins: ['https://thumbgate.app'],
  });
  assert.strictEqual(mcpOriginDeny.allowed, false);

  const health = getHealthStatus();
  assert.strictEqual(health.liveClaim, false);
  assert.strictEqual(health.product, 'thumbgate.app hosted Hermes');
  assert.ok(health.skipCount >= 4);
  assert.doesNotMatch(JSON.stringify(health), /10\/10/);
  assert.ok(health.skip.includes('continuity-chrome-profile'));
}

main();
console.log('ok tests/test-obscura-browser-guard.js');
