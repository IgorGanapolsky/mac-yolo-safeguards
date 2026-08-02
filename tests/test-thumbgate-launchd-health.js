// Unit tests for tools/thumbgate-launchd-health.js — PURE (no launchctl, no live mutation).
// Feeds sample `launchctl list` output through the parser + health assessor.
const { test } = require('node:test');
const assert = require('node:assert');
const { parseLaunchctlList, assessHealth } = require('../tools/thumbgate-launchd-health.js');

const SAMPLE = [
  'PID\tStatus\tLabel',
  '-	0	com.igor.shutdown-simulators',
  '-	0	com.igor.hermes-mobile-continuous-e2e',
  '-	2	com.igor.thumbgate-drift-watch',
  '-	1	com.igor.hermes-cortex-ingest',
  '-	1	com.igor.hermes-mobile-social-content',
  '-	15	com.igor.hermes-litellum',
  '-	78	com.igor.revenue.reddit-reply-monitor',
  '70914	0	com.igor.hermes-litellm',   // running (pid present, status 0) — NOT crashed
  '-	0	com.igor.fleet-heartbeat',
];
const TEXT = SAMPLE.join('\n');

test('parseLaunchctlList: keeps only com.igor.* and classifies crashes', () => {
  const rows = parseLaunchctlList(TEXT);
  assert.equal(rows.length, 9, 'only com.igor.* rows counted');
  const by = (l) => rows.find((r) => r.label === l);
  assert.equal(by('com.igor.shutdown-simulators').crashed, false);
  assert.equal(by('com.igor.hermes-mobile-continuous-e2e').crashed, false);
  assert.equal(by('com.igor.hermes-litellm').crashed, false, 'status 0 = running, not crashed');
  assert.equal(by('com.igor.hermes-litellum').crashed, true, '-15 (SIGTERM) is a crash');
  assert.equal(by('com.igor.hermes-cortex-ingest').crashed, true);
  assert.equal(by('com.igor.revenue.reddit-reply-monitor').crashed, true, 'exit 78 counts as crashed');
  assert.equal(by('com.igor.thumbgate-drift-watch').status, '2');
});

test("parseLaunchctlList: ignores foreign labels + header", () => {
  const rows = parseLaunchctlList('PID\tStatus\tLabel\n-	0	com.apple.somedaemon\n555	1	com.igor.shutdown-simulators\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, 'com.igor.shutdown-simulators');
});

test('assessHealth: flags drift-watch exit-2 as the INCONCLUSIVE self-heal breaker', () => {
  const rows = parseLaunchctlList(TEXT);
  const h = assessHealth(rows, { mcpRegistered: true });
  assert.equal(h.driftWatchInconclusive, true);
  assert.equal(h.mcpRegistered, true);
  assert.equal(h.shutdownSimulatorsLoaded, true);
  assert.equal(h.continuousE2eLoaded, true);
  assert.equal(h.protectedOk, true, 'MCP registered + both protected LAs loaded = OK');
  assert.ok(h.crashed.find((c) => c.label === 'com.igor.hermes-cortex-ingest'));
});

test('assessHealth: unprotected when MCP missing (the "mcp disabled" cause)', () => {
  const rows = parseLaunchctlList('-	0	com.igor.shutdown-simulators\n');
  const h = assessHealth(rows, { mcpRegistered: false });
  assert.equal(h.mcpRegistered, false);
  assert.equal(h.protectedOk, false);
  assert.ok(h.protectedDown.some((d) => /thumbgate MCP not registered/.test(d)));
});

test('assessHealth: continuous-e2e crashed -> protected DOWN', () => {
  const rows = parseLaunchctlList('-	1	com.igor.hermes-mobile-continuous-e2e\n-	0	com.igor.shutdown-simulators\n');
  const h = assessHealth(rows, { mcpRegistered: true });
  assert.equal(h.continuousE2eLoaded, false);
  assert.equal(h.protectedOk, false);
  assert.ok(h.protectedDown.some((d) => /hermes-mobile-continuous-e2e/.test(d)));
});
