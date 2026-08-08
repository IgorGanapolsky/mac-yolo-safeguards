'use strict';

/**
 * Unit Tests for FDE Workflow Learning Engine (`tools/fde-workflow-learning-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { recordIncidentLearning, FDE_WORKFLOW_STAGES } = require('../tools/fde-workflow-learning-engine');

console.log('Running test-fde-workflow-learning.js...');

const result = recordIncidentLearning({
  title: 'Test Incident',
  cause: 'Missing edge case validation',
  preventionRule: 'Add unit assertion',
});

assert.strictEqual(result.status, 'FDE_INCIDENT_LEARNED_AND_SAVED', 'Expected INCIDENT_LEARNED status');
assert.strictEqual(result.grade, '10/10 (FDE_CONTINUOUS_LEARNING_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(result.workflowStages.length, 11, 'Expected 11 workflow stages');
assert.deepStrictEqual(result.workflowStages, FDE_WORKFLOW_STAGES, 'Expected exact FDE workflow stages');

console.log('ok tests/test-fde-workflow-learning.js');
