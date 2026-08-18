#!/usr/bin/env node
'use strict';

/**
 * test-wright-sdlc-engine.js
 * --------------------------
 * Verifies Wrights Phased SDLC Engine:
 *   - Work order lifecycle (SPEC -> BUILD -> TEST -> CI_CD -> OBSERVABILITY -> CLOSED)
 *   - Gate enforcement and invalid transition prevention
 *   - Failure marking and blocking
 *   - Receipt export & doctor check
 */

const assert = require('assert');
const {
  WorkOrder,
  WrightSDLCEngine,
  runDoctor,
} = require('../tools/wright-sdlc-engine');

async function runAllTests() {
  console.log('🧪 Running Wrights SDLC Engine Test Suite...');

  // 1. Valid Gate Progression
  {
    const engine = new WrightSDLCEngine();
    const wo = engine.createWorkOrder('WO-TEST-001', 'Test Feature');

    assert.strictEqual(wo.currentPhase, 'SPEC');
    wo.passGate('SPEC', { spec: 'Approved' });
    assert.strictEqual(wo.currentPhase, 'BUILD');
    wo.passGate('BUILD', { commit: 'abc1234' });
    assert.strictEqual(wo.currentPhase, 'TEST');
    wo.passGate('TEST', { testsPassed: 10 });
    assert.strictEqual(wo.currentPhase, 'CI_CD');
    wo.passGate('CI_CD', { pr: 100 });
    assert.strictEqual(wo.currentPhase, 'OBSERVABILITY');
    wo.passGate('OBSERVABILITY', { health: 200 });

    assert.strictEqual(wo.isFullyVerified(), true);
    console.log('  ✓ Sequential phase gate progression passes');
  }

  // 2. Out-of-Order Transition Prevention
  {
    const wo = new WorkOrder('WO-TEST-002', 'Out-of-Order Check');
    assert.throws(() => {
      wo.passGate('TEST', { testsPassed: 5 }); // Should throw because current is SPEC
    }, /Cannot pass gate for TEST/);
    console.log('  ✓ Out-of-order gate transition block passes');
  }

  // 3. Gate Failure & Blocking
  {
    const wo = new WorkOrder('WO-TEST-003', 'Failing Gate Check');
    wo.failGate('SPEC', 'Missing acceptance criteria');
    assert.strictEqual(wo.phases.SPEC.status, 'BLOCKED');
    assert.strictEqual(wo.phases.SPEC.error, 'Missing acceptance criteria');
    console.log('  ✓ Gate failure and blocking passes');
  }

  // 4. Full End-to-End Demo Work Order
  {
    const engine = new WrightSDLCEngine();
    const demo = engine.runDemoWorkOrder();
    assert.strictEqual(demo.isFullyVerified(), true);
    assert.strictEqual(demo.phases.CI_CD.status, 'PASSED');
    assert.strictEqual(demo.phases.OBSERVABILITY.status, 'PASSED');
    console.log('  ✓ Full end-to-end work order execution passes');
  }

  // 5. Doctor Check
  {
    const doc = runDoctor();
    assert.strictEqual(doc.status, 'READY');
    assert.strictEqual(doc.activeWrightRoles.length, 6);
    console.log('  ✓ Doctor check passes');
  }

  console.log('\n✅ All Wrights SDLC Engine tests passed successfully!');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
