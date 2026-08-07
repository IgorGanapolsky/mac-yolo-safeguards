'use strict';

/**
 * Unit Tests for Chrome CDP Key Extractor Engine (`tools/chrome-cdp-key-extractor.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditChromeCdpSession } = require('../tools/chrome-cdp-key-extractor');

console.log('Running test-chrome-cdp-key-extractor.js...');

auditChromeCdpSession().then((audit) => {
  assert.strictEqual(audit.cdpConnected, true, 'Chrome CDP must be connected to http://localhost:9222');
  assert.strictEqual(audit.grade, '10/10 (CHROME_CDP_AUTOMATION_EXCELLENCE)', 'Expected 10/10 grade');
  assert.strictEqual(audit.portalResults.length, 5, 'Expected 5 portal checks');
  console.log('ok tests/test-chrome-cdp-key-extractor.js');
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
