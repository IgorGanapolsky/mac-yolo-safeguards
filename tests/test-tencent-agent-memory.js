'use strict';

/**
 * Unit Tests for Tencent AI Lab Multi-Agent Memory Engine (`tools/tencent-agent-memory-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditTencentDbAgentMemory } = require('../tools/tencent-agent-memory-engine');

console.log('Running test-tencent-agent-memory.js...');

const audit = auditTencentDbAgentMemory();
assert.strictEqual(audit.status, 'TENCENT_AGENT_MEMORY_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (TENCENT_CLOUD_AI_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.capabilities.length, 4, 'Expected 4 capabilities');

console.log('ok tests/test-tencent-agent-memory.js');
