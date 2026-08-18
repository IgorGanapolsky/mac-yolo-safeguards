#!/usr/bin/env node
'use strict';

/**
 * test-nex-playbook-engine.js
 * ----------------------------
 * Verifies Nex.ai / WUPHF-Style Playbook Orchestrator:
 *   - Teammate registration & discovery
 *   - Playbook execution with multi-step deterministic results
 *   - Failure handling in playbook steps
 *   - Doctor check
 */

const assert = require('assert');
const {
  NexTeammateRegistry,
  PlaybookEngine,
  runDoctor,
} = require('../tools/nex-playbook-engine');

async function runAllTests() {
  console.log('🧪 Running Nex.ai Playbook Engine Test Suite...');

  // 1. Teammate Registry Check
  {
    const registry = new NexTeammateRegistry();
    const list = registry.list();
    assert.strictEqual(list.length, 4);
    assert.ok(registry.get('revenue_ralph'));
    assert.ok(registry.get('ship_engineer'));
    assert.ok(registry.get('qa_auditor'));
    console.log('  ✓ Teammate registry check passes');
  }

  // 2. Default Playbook Execution
  {
    const engine = new PlaybookEngine();
    const result = await engine.executePlaybook('b2b_revenue_dispatch');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.playbookId, 'b2b_revenue_dispatch');
    assert.strictEqual(result.stepResults.length, 3);
    assert.strictEqual(result.teammate, 'Revenue Ralph');
    console.log('  ✓ B2B Revenue Playbook execution passes');
  }

  // 3. PR Hygiene Playbook Execution
  {
    const engine = new PlaybookEngine();
    const result = await engine.executePlaybook('pr_hygiene_and_ship');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stepResults.length, 3);
    assert.strictEqual(result.teammate, 'Ship Engineer');
    console.log('  ✓ PR Hygiene Playbook execution passes');
  }

  // 4. Step Failure Interception
  {
    const engine = new PlaybookEngine();
    engine.registerPlaybook('failing_playbook', {
      name: 'Failing Test Playbook',
      assignedTeammate: 'qa_auditor',
      steps: [
        { name: 'Step 1 (Pass)', execute: () => ({ ok: true }) },
        { name: 'Step 2 (Throw)', execute: () => { throw new Error('Simulated step failure'); } },
        { name: 'Step 3 (Skipped)', execute: () => ({ ok: true }) },
      ],
    });

    const result = await engine.executePlaybook('failing_playbook');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.stepResults.length, 2);
    assert.strictEqual(result.stepResults[1].status, 'FAILED');
    assert.strictEqual(result.stepResults[1].error, 'Simulated step failure');
    console.log('  ✓ Playbook step failure interception passes');
  }

  // 5. Doctor Check
  {
    const doc = runDoctor();
    assert.strictEqual(doc.status, 'READY');
    assert.strictEqual(doc.activeTeammates, 4);
    assert.strictEqual(doc.registeredPlaybooks.length >= 3, true);
    console.log('  ✓ Doctor check passes');
  }

  console.log('\n✅ All Nex.ai Playbook Engine tests passed successfully!');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
