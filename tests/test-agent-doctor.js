'use strict';

/**
 * Unit Tests for Agent Doctor Diagnostic Engine (`tools/agent-doctor-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditAgentDoctorHealth } = require('../tools/agent-doctor-engine');

console.log('Running test-agent-doctor.js...');

const audit = auditAgentDoctorHealth();
assert.strictEqual(audit.status, 'AGENT_DOCTOR_HEALTHY', 'Expected HEALTHY status');
assert.strictEqual(audit.grade, '10/10 (AGENT_HEALTH_EXCELLENCE)', 'Expected 10/10 grade');

console.log('ok tests/test-agent-doctor.js');
