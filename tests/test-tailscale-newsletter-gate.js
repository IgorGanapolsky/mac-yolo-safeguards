#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  evaluateTailworm,
  evaluateDbAccess,
  rankAttention,
  verifyBlock,
  applyBlock,
  selectConnector,
  refereeSession,
  fixtureReport,
} = require('../tools/tailscale-newsletter-gate');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

const now = Date.parse('2026-10-29T16:00:00Z');
const policy = '{"acls":[]}\n';

check('a missing Tailscale version is below the Tailworm floor', () => {
  const missing = evaluateTailworm({ sshHopCount: 1, openWebFacing: false });
  assert.equal(missing.ok, false);
  assert.equal(missing.versionSafe, false);
  assert.match(missing.issues[0], /not supplied/);
  assert.equal(evaluateTailworm({ tailscaleVersion: '1.104.3', sshHopCount: 1 }).ok, false);
  assert.equal(evaluateTailworm({ tailscaleVersion: '1.104.4', sshHopCount: 1 }).ok, true);
  assert.equal(evaluateTailworm({
    tailscaleVersion: '1.104.4',
    sshHopCount: 2,
    refereeToken: false,
  }).ok, false);
});

check('an on-call write needs an unexpired lease', () => {
  assert.equal(evaluateDbAccess({
    identityRole: 'support',
    sql: 'SELECT id FROM organizations',
  }, now).allowed, true);
  assert.equal(evaluateDbAccess({
    identityRole: 'support',
    sql: 'UPDATE organizations SET plan = "pro"',
  }, now).reason, 'support_is_read_only');
  assert.equal(evaluateDbAccess({
    identityRole: 'on_call',
    sql: 'UPDATE organizations SET plan = "pro"',
    onCallLeaseActive: true,
  }, now).reason, 'lease_expired_or_missing');
  assert.equal(evaluateDbAccess({
    identityRole: 'on_call',
    sql: 'UPDATE organizations SET plan = "pro"',
    lease: { expiresAt: '2026-10-29T15:00:00Z' },
  }, now).allowed, false);
  assert.equal(evaluateDbAccess({
    identityRole: 'on_call',
    sql: 'UPDATE organizations SET plan = "pro"',
    lease: { expiresAt: '2026-10-29T17:00:00Z' },
  }, now).reason, 'on_call_lease');
  assert.equal(evaluateDbAccess({
    identityRole: 'on_call',
    sql: 'SELECT 1 /* DELETE FROM organizations */',
    lease: { expiresAt: '2026-10-29T17:00:00Z' },
  }, now).reason, 'comment_hidden_write');
  assert.equal(evaluateDbAccess({
    identityRole: 'on_call',
    sql: 'UPDATE organizations SET plan = "pro" /* keep */',
    lease: { expiresAt: '2026-10-29T17:00:00Z' },
  }, now).reason, 'on_call_lease');
  assert.equal(evaluateDbAccess({
    identityRole: 'support',
    sql: 'SELECT id FROM organizations',
    staticPasswordOnLaptop: true,
  }, now).reason, 'static_password_on_laptop');
});

check('an empty attention list stays empty', () => {
  const empty = rankAttention([]);
  assert.equal(empty.totalPanes, 0);
  assert.equal(empty.attentionCount, 0);
  assert.equal(empty.top, null);
  assert.equal(empty.voiceSummary, '');
  const ranked = rankAttention([
    { id: 'codex', agent: 'codex', branch: 'fix/db', status: 'ci_failed', unreadMessages: 0 },
    { id: 'claude', agent: 'claude-code', branch: 'feat/gate', status: 'waiting_approval', unreadMessages: 1 },
    { id: 'grok', agent: 'grok', branch: 'agent/newsletter', status: 'merge_ready', unreadMessages: 4 },
  ]);
  assert.equal(ranked.top.id, 'claude');
  assert.equal(ranked.attentionCount, 2);
  assert.match(ranked.voiceSummary, /claude-code on feat\/gate: waiting approval/);
});

check('a named policy block removes byte-identically', () => {
  const proof = verifyBlock(policy, 'temp-oncall', ['// grant']);
  assert.equal(proof.byteIdentical, true);
  assert.equal(proof.beforeSha256, proof.afterSha256);
  assert.throws(() => applyBlock(policy, 'temp-oncall', ['// END SCURGERY:temp-oncall']), /marker/);
});

check('a healthy connector stays sticky inside the margin', () => {
  const stayed = selectConnector([
    { id: 'loop', locality: 'local_loopback', latencyMs: 2, errorRate: 0, successStreak: 4, healthy: true },
    { id: 'lan', locality: 'same_tailnet_lan', latencyMs: 30, errorRate: 0, successStreak: 4, healthy: true },
  ], { currentConnectorId: 'lan' });
  assert.equal(stayed.selected, 'lan');
  assert.equal(stayed.keptSticky, true);
  const switched = selectConnector([
    { id: 'loop', locality: 'local_loopback', latencyMs: 1, errorRate: 0, successStreak: 20, healthy: true },
    { id: 'lan', locality: 'remote_cloud', latencyMs: 400, errorRate: 0.5, successStreak: 0, healthy: true },
  ], { currentConnectorId: 'lan' });
  assert.equal(switched.selected, 'loop');
  assert.equal(switched.keptSticky, false);
  assert.equal(selectConnector([
    { id: 'lan', locality: 'same_tailnet_lan', healthy: false },
  ], { currentConnectorId: 'lan' }).reason, 'no_healthy_connectors');
});

check('a private scoped session is allowed and an open-web session is denied', () => {
  assert.equal(refereeSession({
    tailscaleVersion: '1.104.4',
    sshHopCount: 1,
    command: 'tailscale status',
    openWebFacing: false,
  }).verdict, 'ALLOW');
  assert.equal(refereeSession({
    tailscaleVersion: '1.104.4',
    sshHopCount: 1,
    command: 'rm -rf /',
  }).reason, 'destructive');
  assert.equal(refereeSession({
    tailscaleVersion: '1.104.4',
    sshHopCount: 1,
    command: 'tailscale status',
    openWebFacing: true,
  }).reason, 'open_web');
});

check('the fixture report stays fail-closed', () => {
  const report = fixtureReport(now);
  assert.equal(report.ok, true);
  assert.equal(report.worm.ok, false);
  assert.equal(report.db.allowed, false);
  assert.equal(report.attention.totalPanes, 0);
  const run = spawnSync(process.execPath, [
    path.join(__dirname, '../tools/tailscale-newsletter-gate.js'),
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.fixtures, true);
  assert.equal(body.attention.totalPanes, 0);
});

console.log(`tailscale-newsletter-gate: ${passed} checks passed`);
