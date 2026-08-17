'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTONOMOUS_PILLARS, auditAutonomyReadiness, runAutonomyLoop } = require('../tools/autonomous-outcome-engine');

test('Autonomous Outcome Engine Test Suite', async (t) => {
  await t.test('AUTONOMOUS_PILLARS contains all 4 core tenets', () => {
    assert.ok(AUTONOMOUS_PILLARS.ZERO_BABYSITTING);
    assert.ok(AUTONOMOUS_PILLARS.ORIGIN_FIRST_TRUTH);
    assert.ok(AUTONOMOUS_PILLARS.STACKED_VERIFICATION);
    assert.ok(AUTONOMOUS_PILLARS.ATOMIC_SHIPPING);

    assert.equal(AUTONOMOUS_PILLARS.ZERO_BABYSITTING.enforcement, 'auto_advance');
    assert.equal(AUTONOMOUS_PILLARS.STACKED_VERIFICATION.enforcement, 'proof_required');
  });

  await t.test('auditAutonomyReadiness returns READY when workspace files exist', () => {
    const report = auditAutonomyReadiness();
    assert.equal(report.status, 'READY');
    assert.equal(report.checks.planExists, true);
    assert.equal(report.checks.skillsRegistered, true);
    assert.equal(report.issues.length, 0);
  });

  await t.test('runAutonomyLoop executes all 5 stages cleanly', () => {
    const result = runAutonomyLoop('Deploy ThumbGate VPS Landing Fix');
    assert.equal(result.success, true);
    assert.equal(result.task, 'Deploy ThumbGate VPS Landing Fix');
    assert.equal(result.stages.length, 5);
    assert.equal(result.stages[0].stage, 'SCOPE_AND_ORIGIN_AUDIT');
    assert.equal(result.stages[4].stage, 'VERIFIABLE_PROOF');
  });
});
