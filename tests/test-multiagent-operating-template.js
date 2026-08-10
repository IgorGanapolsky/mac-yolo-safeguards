'use strict';

const assert = require('assert');
const { createOperatingTemplate, validateOperatingTemplate } = require('../tools/multiagent-operating-template');

console.log('=== Testing Multi-Agent Minimal Operating Template Generator ===');

const template = createOperatingTemplate({
  goal: 'Implement lead ingestion API',
  acceptanceCriteria: ['Unit tests pass', 'Docker container builds'],
});

const validation = validateOperatingTemplate(template);
assert.strictEqual(validation.valid, true);
assert.strictEqual(validation.missingFields.length, 0);

console.log('✅ Multi-Agent Operating Template Tests PASSED!');
