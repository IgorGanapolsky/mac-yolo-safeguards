import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyHealth, parseArgs } from '../scripts/thumbgate-health-check.mjs';

test('healthy 200 with ok body passes', () => {
  const r = classifyHealth({ status: 200, body: { status: 'ok' } });
  assert.equal(r.ok, true); assert.equal(r.level, 'healthy');
});

test('200 with no health field is reachable (still ok)', () => {
  const r = classifyHealth({ status: 200, body: null });
  assert.equal(r.ok, true); assert.equal(r.level, 'reachable');
});

test('5xx is a server_error failure', () => {
  assert.equal(classifyHealth({ status: 503, body: null }).ok, false);
});

test('429 is rate_limited (the fleet-poller failure mode)', () => {
  const r = classifyHealth({ status: 429, body: null });
  assert.equal(r.ok, false); assert.equal(r.level, 'rate_limited');
});

test('Cloudflare 1027 suspension is caught from the body error code', () => {
  // 1027 is a Cloudflare BODY error, not an HTTP status; it must win over the
  // 5xx bucket that carries it.
  assert.equal(classifyHealth({ status: 200, body: { error: 1027 } }).level, 'suspended');
  assert.equal(classifyHealth({ status: 503, body: { error: 1027 } }).level, 'suspended');
});

test('a bare 4xx with no body is a client_error', () => {
  assert.equal(classifyHealth({ status: 403, body: null }).level, 'client_error');
});

test('network error (status 0) is unreachable', () => {
  assert.equal(classifyHealth({ status: 0, body: null }).level, 'unreachable');
});

test('parseArgs strips trailing slash and reads flags', () => {
  const a = parseArgs(['--url', 'https://app.thumbgate.app/', '--json', '--timeout', '5000']);
  assert.equal(a.url, 'https://app.thumbgate.app');
  assert.equal(a.json, true); assert.equal(a.timeout, 5000);
});

test('200 with ready:false is NOT healthy (missing production config)', () => {
  // The control plane answers 200 { ok: true, ready: false } when required
  // production config is absent. Treating that as healthy suppresses alerts
  // during exactly the outage this monitor exists to catch.
  const r = classifyHealth({ status: 200, body: { ok: true, ready: false } });
  assert.equal(r.ok, false); assert.equal(r.level, 'not_ready');
});

test('200 with ok:false is unhealthy, not "reachable"', () => {
  const r = classifyHealth({ status: 200, body: { ok: false } });
  assert.equal(r.ok, false); assert.equal(r.level, 'unhealthy');
});

test('200 with healthy:false is unhealthy', () => {
  assert.equal(classifyHealth({ status: 200, body: { healthy: false } }).ok, false);
});

test('200 with a degraded/error status string fails', () => {
  for (const s of ['degraded', 'error', 'unhealthy', 'down']) {
    const r = classifyHealth({ status: 200, body: { status: s } });
    assert.equal(r.ok, false, 'a negative status string must not pass');
    assert.equal(r.level, 'degraded');
  }
});
