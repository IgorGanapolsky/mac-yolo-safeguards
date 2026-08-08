'use strict';

/**
 * Unit Tests for Chrome CDP Key Extractor Engine (`tools/chrome-cdp-key-extractor.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditChromeCdpSession } = require('../tools/chrome-cdp-key-extractor');

console.log('Running test-chrome-cdp-key-extractor.js...');

auditChromeCdpSession().then((audit) => {
  assert.ok(typeof audit.cdpConnected === 'boolean', 'Expected boolean cdpConnected status');
  assert.ok(audit.grade.length > 0, 'Expected non-empty grade string');
  assert.ok(Array.isArray(audit.portalResults), 'Expected array for portalResults');
  console.log('ok tests/test-chrome-cdp-key-extractor.js');
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
