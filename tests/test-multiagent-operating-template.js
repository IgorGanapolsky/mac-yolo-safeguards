'use strict';

const assert = require('assert');
const { MultiagentOperatingTemplate } = require('../tools/multiagent-operating-template');

console.log('=== Testing Multi-Agent Minimal Operating Template Generator ===');

const templateGen = new MultiagentOperatingTemplate();

const template = templateGen.generateTemplate('Ship CORAL evolution engine', [
  'Unit test suite passes',
  'CodeQL gate clean',
]);

const validation = templateGen.validateTemplate(template);
assert.strictEqual(validation.valid, true);
assert.strictEqual(template.acceptanceCriteria.length, 2);
assert.strictEqual(template.roleAssignments.planner.includes('spec'), true);

console.log('✅ Multi-Agent Operating Template Tests PASSED!');
