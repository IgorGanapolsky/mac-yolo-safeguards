'use strict';

/**
 * Unit tests for Cloudflare Agents Harness
 */

const assert = require('assert');
const { verifyCloudflareAgentsArchitecture } = require('../tools/cloudflare-agents-harness');

console.log('Testing Cloudflare Agents Harness...');

const summary = verifyCloudflareAgentsArchitecture();
assert.strictEqual(summary.ok, true, 'All Cloudflare Agents checks returned ok=true');
assert.strictEqual(summary.passed, 3, '3 out of 3 checks passed');

console.log('✅ All test-cloudflare-agents-harness tests PASSED cleanly.');
