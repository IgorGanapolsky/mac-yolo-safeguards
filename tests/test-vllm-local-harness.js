'use strict';

/**
 * Unit Tests for vLLM Local Harness Engine (`tools/vllm-local-harness-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditVllmHarness, VLLM_HARNESS_CONFIG } = require('../tools/vllm-local-harness-engine');

console.log('Running test-vllm-local-harness.js...');

const audit = auditVllmHarness();
assert.strictEqual(audit.status, 'VLLM_LOCAL_HARNESS_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (VLLM_HIGH_THROUGHPUT_HARNESS_ACTIVE)', 'Expected 10/10 grade');
assert.strictEqual(audit.config.pagedAttentionEnabled, true, 'Expected PagedAttention to be enabled');
assert.strictEqual(audit.integrations.length, 5, 'Expected 5 integrations');

console.log('ok tests/test-vllm-local-harness.js');
