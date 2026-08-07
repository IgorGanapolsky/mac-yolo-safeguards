'use strict';

/**
 * Unit Tests for NVIDIA-Inspired Agent Harness Engine (`tools/nvidia-agent-harness-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditNvidiaAgentHarness, NVIDIA_HARNESS_CAPABILITIES } = require('../tools/nvidia-agent-harness-engine');

console.log('Running test-nvidia-agent-harness.js...');

const audit = auditNvidiaAgentHarness();
assert.strictEqual(audit.status, 'NVIDIA_AGENT_HARNESS_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (NVIDIA_HARNESS_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.capabilities.length, 6, 'Expected 6 capabilities');
assert.strictEqual(NVIDIA_HARNESS_CAPABILITIES.filter((c) => c.status === 'ACTIVE').length, 6, 'All 6 capabilities must be active');

console.log('ok tests/test-nvidia-agent-harness.js');
