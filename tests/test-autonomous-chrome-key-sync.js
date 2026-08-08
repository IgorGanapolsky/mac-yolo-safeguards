'use strict';

/**
 * Unit Tests for Autonomous CEO/CTO Chrome & Key Sync Engine (`tools/autonomous-chrome-key-sync.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { syncChromeApiKeys } = require('../tools/autonomous-chrome-key-sync');

console.log('Running test-autonomous-chrome-key-sync.js...');

const audit = syncChromeApiKeys();
assert.strictEqual(audit.status, 'AUTONOMOUS_CHROME_KEY_SYNC_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (AUTONOMOUS_EXECUTION_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.keychainVaultStatus.gemini, 'ACTIVE_KEYCHAIN', 'Gemini key must be active in macOS Keychain');

console.log('ok tests/test-autonomous-chrome-key-sync.js');
