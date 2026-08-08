'use strict';

/**
 * Unit Tests for Microsoft RPI Unit Test Agent Engine (`tools/microsoft-rpi-unit-test-agent.js`)
 */

const assert = require('assert');
const { planUnitTestGeneration } = require('../tools/microsoft-rpi-unit-test-agent');

console.log('Running test-microsoft-rpi-unit-test-agent.js...');

const result = planUnitTestGeneration();

assert.strictEqual(result.status, 'MICROSOFT_RPI_UNIT_TEST_AGENT_ACTIVE');
assert.strictEqual(result.grade, '10/10 (RPI_TEST_GENERATION_EXCELLENCE)');
assert.strictEqual(result.rpiPipeline.length, 4);
assert.strictEqual(result.hermesMobileValue.length, 3);

console.log('ok tests/test-microsoft-rpi-unit-test-agent.js');
