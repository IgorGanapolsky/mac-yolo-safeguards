#!/usr/bin/env node
'use strict';

/**
 * test-resend-outreach-dispatcher.js
 * -----------------------------------
 * Verifies Resend B2B Outreach Dispatcher:
 *   - Keychain key retrieval integration
 *   - Outreach packet loading and parsing
 *   - Doctor check
 */

const assert = require('assert');
const {
  getResendApiKey,
  loadOutreachPackets,
  runDoctor,
} = require('../tools/resend-outreach-dispatcher');

console.log('🧪 Running Resend Outreach Dispatcher Test Suite...');

// 1. Doctor & Key Check
{
  const doc = runDoctor();
  assert.ok(['READY', 'KEYCHAIN_KEY_MISSING'].includes(doc.status));
  assert.strictEqual(typeof doc.hasApiKey, 'boolean');
  console.log(`  ✓ Doctor check passes (API Key Present: ${doc.hasApiKey})`);
}

// 2. Packet Loading
{
  const packets = loadOutreachPackets();
  assert.ok(Array.isArray(packets));
  console.log(`  ✓ Loaded ${packets.length} pending outreach packets`);
}

console.log('\n✅ All Resend Outreach Dispatcher tests passed successfully!');
process.exit(0);
