#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  createDisposableLease,
  spawnDisposableChild,
  extractDisposableIntelligence,
  retireDisposableLease,
} = require('../tools/disposable-agent-lease');
const { runDisposableAgentLifecycleAudit } = require('../tools/ai-am-arena-production-guard');

const now = Date.parse('2026-11-02T18:00:00.000Z');
const good = createDisposableLease({
  objective: 'audit the router guard',
  outcome: 'fixture test passes',
  tools: ['read', 'grep'],
  paths: ['tools/'],
  ttlMinutes: 30,
  nowMs: now,
});
assert.strictEqual(good.valid, true);
assert.strictEqual(good.status, 'active');
assert.strictEqual(good.credentials_issued, false);
assert.strictEqual(good.ttl_minutes, 30);
assert.strictEqual(good.expires_at, '2026-11-02T18:30:00.000Z');

const noOutcome = createDisposableLease({
  objective: 'audit the router guard',
  tools: ['read'],
  paths: ['tools/'],
  ttlMinutes: 30,
  nowMs: now,
});
assert.strictEqual(noOutcome.valid, false);
assert.ok(noOutcome.reasons.includes('outcome_required'));

const tooWide = createDisposableLease({
  objective: 'audit',
  outcome: 'done',
  tools: ['shell', 'read'],
  paths: ['/'],
  ttlMinutes: 90,
  nowMs: now,
});
assert.strictEqual(tooWide.valid, false);
assert.ok(tooWide.reasons.includes('tool_not_allowed'));
assert.ok(tooWide.reasons.includes('path_scope_too_wide'));
assert.ok(tooWide.reasons.includes('ttl_exceeds_30_minutes'));
assert.deepStrictEqual(tooWide.tools, []);

const dissent = spawnDisposableChild(good, { role: 'DeliberateDissent', nowMs: now });
assert.strictEqual(dissent.valid, true);
assert.strictEqual(dissent.can_spawn, false);
assert.strictEqual(dissent.verifies_parent, false);
assert.strictEqual(dissent.ttl_minutes, 10);
assert.deepStrictEqual(dissent.tools, ['read', 'grep']);

const grandchild = spawnDisposableChild(dissent, { role: 'SpecialistDeepDive', nowMs: now });
assert.strictEqual(grandchild.valid, false);
assert.ok(grandchild.reasons.includes('spawn_depth_exceeded'));

const unknown = spawnDisposableChild(good, { role: 'PermanentOrgChartWorker', nowMs: now });
assert.strictEqual(unknown.valid, false);
assert.ok(unknown.reasons.includes('role_not_allowed'));

const scratchOnly = extractDisposableIntelligence({
  thought: 'I checked every line.',
  failed_attempts: ['guessed'],
});
assert.strictEqual(scratchOnly.persisted, false);
assert.strictEqual(scratchOnly.dissent_verified, false);
assert.deepStrictEqual(scratchOnly.dropped_fields, ['thought', 'failed_attempts']);

const kept = extractDisposableIntelligence({
  decision: 'Block an unverified completion past 20 user turns.',
  evidence: 'node tests/test-ai-am-arena-guard.js',
  thought: 'scratch',
});
assert.strictEqual(kept.persisted, true);
assert.deepStrictEqual(kept.kept, {
  decision: 'Block an unverified completion past 20 user turns.',
  evidence: 'node tests/test-ai-am-arena-guard.js',
});
assert.strictEqual(Object.hasOwn(kept.kept, 'thought'), false);
assert.strictEqual(kept.dissent_verified, false);

const early = retireDisposableLease(good, { nowMs: now, outcomeMet: false });
assert.strictEqual(early.status, 'still_active');
assert.strictEqual(early.credentials_revoked, false);
assert.strictEqual(early.locks_deleted, false);
assert.strictEqual(early.compute_released, false);

const done = retireDisposableLease(good, { nowMs: now + 60 * 1000, outcomeMet: true });
assert.strictEqual(done.status, 'retired');
assert.strictEqual(done.locks_deleted, false);

const expired = retireDisposableLease(good, { nowMs: Date.parse(good.expires_at), outcomeMet: false });
assert.strictEqual(expired.status, 'expired');
assert.strictEqual(expired.credentials_revoked, false);

const audit = runDisposableAgentLifecycleAudit({
  objective: 'unit_test_disposable_lifecycle',
  ttlMinutes: 30,
  nowMs: now,
});
assert.strictEqual(audit.lease_valid, true);
assert.strictEqual(audit.sample_only, true);
assert.strictEqual(audit.credentials_issued, false);
assert.strictEqual(audit.locks_deleted, false);
assert.strictEqual(audit.step_5_extract_intelligence_gc.persisted, false);
assert.strictEqual(audit.step_5_extract_intelligence_gc.dissent_verified, false);
assert.strictEqual(audit.step_6_retire.status, 'still_active');
assert.strictEqual(audit.step_3_collaborate_and_spawning_boundaries.dissent_verifies_parent, false);

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'disp-lease-'));
const cli = path.join(__dirname, '..', 'tools', 'disposable-agent.js');
const env = { ...process.env, HOME: home };
const refused = spawnSync(process.execPath, [cli, 'create', 'wide', '90', '/'], { encoding: 'utf8', env });
assert.notStrictEqual(refused.status, 0);
const created = spawnSync(process.execPath, [cli, 'create', 'router-audit', '30', 'tools/'], { encoding: 'utf8', env });
assert.strictEqual(created.status, 0, created.stderr);
const earlyRetire = spawnSync(process.execPath, [cli, 'retire', 'router-audit'], { encoding: 'utf8', env });
assert.notStrictEqual(earlyRetire.status, 0);
fs.writeFileSync(
  path.join(home, '.disposable-sessions', 'router-audit', 'extracted-intelligence.json'),
  JSON.stringify({
    decision: 'keep the lease check',
    evidence: 'node tests/test-disposable-agent-lease.js',
    thought: 'scratch',
  }),
);
const retired = spawnSync(process.execPath, [cli, 'retire', 'router-audit'], { encoding: 'utf8', env });
assert.strictEqual(retired.status, 0, retired.stderr);
const keptFile = JSON.parse(fs.readFileSync(
  path.join(home, '.disposable-sessions', 'router-audit', 'extracted-intelligence.json'),
  'utf8',
));
assert.strictEqual(keptFile.decision, 'keep the lease check');
assert.strictEqual(Object.hasOwn(keptFile, 'thought'), false);
const retirement = JSON.parse(fs.readFileSync(
  path.join(home, '.disposable-sessions', 'router-audit', 'retirement.json'),
  'utf8',
));
assert.strictEqual(retirement.locks_deleted, false);
assert.strictEqual(retirement.credentials_revoked, false);
fs.rmSync(home, { recursive: true, force: true });

console.log('PASS tests/test-disposable-agent-lease.js');
