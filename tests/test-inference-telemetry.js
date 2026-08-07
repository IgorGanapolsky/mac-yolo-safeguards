'use strict';

/**
 * Unit Tests for Inference Engineering Engine (`tools/inference-telemetry-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditInferenceEngineeringStack, INFERENCE_TASKS } = require('../tools/inference-telemetry-engine');

console.log('Running test-inference-telemetry.js...');

const audit = auditInferenceEngineeringStack();
assert.strictEqual(audit.status, 'INFERENCE_ENGINEERING_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (INFERENCE_INFRASTRUCTURE_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.tasks.length, 5, 'Expected 5 distinct inference tasks');
assert.strictEqual(INFERENCE_TASKS[1].model, 'vLLM Qwen2.5-Coder-32B', 'Expected vLLM Qwen for code generation');

console.log('ok tests/test-inference-telemetry.js');
