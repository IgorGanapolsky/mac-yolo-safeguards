'use strict';

/**
 * Unit Tests for Cognition Devin & OpenInspect Background Agent Engine (`tools/cognition-devin-background-agent-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditCognitionDevinBackgroundAgentEngine, DEVIN_ARCHITECTURE_PRINCIPLES } = require('../tools/cognition-devin-background-agent-engine');

console.log('Running test-cognition-devin-background-agent.js...');

const audit = auditCognitionDevinBackgroundAgentEngine();
assert.strictEqual(audit.status, 'COGNITION_DEVIN_ENGINE_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (DEVIN_BACKGROUND_AGENT_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(DEVIN_ARCHITECTURE_PRINCIPLES.length, 4, 'Expected 4 architecture principles');

console.log('ok tests/test-cognition-devin-background-agent.js');
