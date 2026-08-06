'use strict';

/**
 * Unit Tests for Fly.io Computers for Agents Harness (`tools/fly-agent-computer-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditFlyAgentComputers } = require('../tools/fly-agent-computer-harness');

console.log('Running test-fly-agent-computer-harness.js...');

const audit = auditFlyAgentComputers();
assert.strictEqual(audit.status, 'FLY_AGENT_COMPUTERS_ACTIVE', 'Expected FLY_AGENT_COMPUTERS_ACTIVE status');
assert.strictEqual(audit.overallRating, '10/10 (FLY_COMPUTERS_FOR_AGENTS_VERIFIED)', 'Expected 10/10 rating');
assert.ok(audit.totalAgentHomes >= 2, 'Expected at least 2 persistent agent homes');

console.log('ok tests/test-fly-agent-computer-harness.js');
