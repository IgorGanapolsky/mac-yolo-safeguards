'use strict';

/**
 * Unit Tests for NVIDIA Dynamo Distributed Inference Engine (`tools/nvidia-dynamo-inference-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditNvidiaDynamoInferenceEngine, DYNAMO_ARCHITECTURE_CAPABILITIES } = require('../tools/nvidia-dynamo-inference-engine');

console.log('Running test-nvidia-dynamo-inference-engine.js...');

const audit = auditNvidiaDynamoInferenceEngine();
assert.strictEqual(audit.status, 'NVIDIA_DYNAMO_ENGINE_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (NVIDIA_DYNAMO_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(DYNAMO_ARCHITECTURE_CAPABILITIES.length, 4, 'Expected 4 capabilities');

console.log('ok tests/test-nvidia-dynamo-inference-engine.js');
