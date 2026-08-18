/**
 * tests/test-executive-partner-outreach.js
 *
 * Tests standardized executive partner outreach engine.
 */

'use strict';

const assert = require('assert');
const { ExecutiveOutreachEngine, MANDATORY_SENDER } = require('../tools/executive_partner_outreach');

console.log('--- Running Executive Partner Outreach Tests ---');

const engine = new ExecutiveOutreachEngine();

// Test 1: Mandatory Sender Invariant
console.log('Test 1: Mandatory Sender Address');
assert.strictEqual(engine.sender, 'igor@igorganapolsky.com');
assert.strictEqual(MANDATORY_SENDER, 'igor@igorganapolsky.com');
console.log('✓ Mandatory sender address verified');

// Test 2: Message Composition Validation
console.log('Test 2: Message Composition');
const msg = engine.composeMessage(
  'partner@enterprise.com',
  'Partnership Proposal: ThumbGate AI Governance',
  'Hello from Igor Ganapolsky'
);
assert.strictEqual(msg.sender, 'igor@igorganapolsky.com');
assert.strictEqual(msg.recipient, 'partner@enterprise.com');
assert.strictEqual(msg.subject, 'Partnership Proposal: ThumbGate AI Governance');
console.log('✓ Message composition verified');

// Test 3: Rejection on missing fields
console.log('Test 3: Rejection of incomplete payloads');
assert.throws(() => {
  engine.composeMessage('', 'subject', 'body');
}, /Recipient, subject, and bodyContent are mandatory/);
console.log('✓ Incomplete payload rejection verified');

console.log('\nAll Executive Partner Outreach tests passed successfully! 🎉');
