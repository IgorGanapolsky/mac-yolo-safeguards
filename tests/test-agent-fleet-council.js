'use strict';

/**
 * Unit Tests for Agent Fleet Council Harness (`tools/agent-fleet-council.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { runAgentCouncil, FLEET_PERSONAS } = require('../tools/agent-fleet-council');

console.log('Running test-agent-fleet-council.js...');

// Test 1: Fleet Personas definition
{
  assert.ok(FLEET_PERSONAS.length >= 3, 'Expected at least 3 agent personas');
  const offerScout = FLEET_PERSONAS.find((p) => p.id === 'OFFER_SCOUT');
  assert.ok(offerScout, 'Missing OFFER_SCOUT persona');
}

// Test 2: runAgentCouncil simulation execution
{
  const result = runAgentCouncil({ decision: 'Test Product Launch' });
  assert.strictEqual(result.status, 'COUNCIL_APPROVED', 'Expected COUNCIL_APPROVED status');
  assert.ok(result.consensusScore >= 80, 'Expected consensus score >= 80');
  assert.strictEqual(result.evaluations.length, 3, 'Expected 3 evaluation reports');
}

console.log('ok tests/test-agent-fleet-council.js');
