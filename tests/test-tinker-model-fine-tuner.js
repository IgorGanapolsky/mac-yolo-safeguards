'use strict';

/**
 * Unit Tests for Thinking Machines Lab (Tinker) Model Fine-Tuner Engine (`tools/tinker-model-fine-tuner-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditTinkerHarness, TINKER_HARNESS_CONFIG } = require('../tools/tinker-model-fine-tuner-engine');

console.log('Running test-tinker-model-fine-tuner.js...');

const audit = auditTinkerHarness();
assert.strictEqual(audit.status, 'TINKER_MODEL_HARNESS_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (TINKER_CONTINUOUS_LEARNING_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(audit.loopArchitecture.length, 6, 'Expected 6 loop architecture steps');
assert.strictEqual(TINKER_HARNESS_CONFIG.tinkerRepo, 'thinking-machines-lab/tinker', 'Expected correct Tinker repo name');

console.log('ok tests/test-tinker-model-fine-tuner.js');
