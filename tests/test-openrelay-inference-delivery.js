'use strict';

/**
 * Unit Tests for OpenRelay Inference Delivery Engine (`tools/openrelay-inference-delivery-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditOpenRelayInferenceDelivery, ROUTING_NODES } = require('../tools/openrelay-inference-delivery-engine');

console.log('Running test-openrelay-inference-delivery.js...');

const audit = auditOpenRelayInferenceDelivery();
assert.strictEqual(audit.status, 'OPENRELAY_IDN_ROUTER_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (IDN_ROUTING_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(ROUTING_NODES.length, 3, 'Expected 3 routing mesh nodes');

console.log('ok tests/test-openrelay-inference-delivery.js');
