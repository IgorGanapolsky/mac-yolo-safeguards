'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTINUITY_CONFIG, auditContinuityHealth } = require('../tools/thumbgate-vps-continuity');

test('ThumbGate VPS Continuity Test Suite', async (t) => {
  await t.test('CONTINUITY_CONFIG specifies 90s lease and zero surprise egress', () => {
    assert.equal(CONTINUITY_CONFIG.leaseDurationSeconds, 90);
    assert.equal(CONTINUITY_CONFIG.defaultMode, 'vps_247_continuity');
    assert.equal(CONTINUITY_CONFIG.egressModel, 'zero_surprise_egress');
  });

  await t.test('auditContinuityHealth confirms no Mac pairing dependency', () => {
    const health = auditContinuityHealth();
    assert.equal(health.status, 'HEALTHY');
    assert.equal(health.macPairRequired, false);
    assert.equal(health.mode, 'vps_247_continuity');
  });
});
