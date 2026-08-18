#!/usr/bin/env node
'use strict';

/**
 * test-revenue-cash-accelerator.js
 * ---------------------------------
 * Verifies Fast-Cash Revenue & Outreach Acceleration Engine:
 *   - High-propensity outreach generation and value calculation
 *   - Value-first organic distribution drafting
 *   - Target offers and booking link integrity
 *   - Doctor check
 */

const assert = require('assert');
const fs = require('fs');
const {
  TARGET_OFFERS,
  generateOutreachPackets,
  generateCommunityPosts,
  runDoctor,
} = require('../tools/revenue-cash-accelerator');

console.log('🧪 Running Revenue Cash Accelerator Test Suite...');

// 1. Offer Integrity
{
  assert.ok(TARGET_OFFERS.partner_pilot);
  assert.strictEqual(TARGET_OFFERS.partner_pilot.priceUsd, 3000);
  assert.ok(TARGET_OFFERS.partner_pilot.bookingLink.includes('cal.com'));
  assert.strictEqual(TARGET_OFFERS.thumbgate_pro.priceUsd, 19);
  console.log('  ✓ Offer definitions and booking links pass');
}

// 2. Outreach Packet Generation
{
  const packets = generateOutreachPackets();
  assert.ok(packets.length >= 3);
  const first = packets[0];
  assert.ok(first.company);
  assert.ok(first.subject);
  assert.ok(first.body.includes('$3,000'));
  assert.ok(first.body.includes('https://cal.com/igor-g-kvqxfo/30min'));
  assert.strictEqual(first.status, 'READY_TO_DISPATCH');
  console.log(`  ✓ Generated ${packets.length} outreach packets ($${packets.reduce((sum, p) => sum + p.valueUsd, 0)} total pipeline)`);
}

// 3. Community Posts Generation
{
  const posts = generateCommunityPosts();
  assert.ok(posts.length >= 2);
  assert.ok(posts[0].content.includes('https://thumbgate.app'));
  assert.ok(posts[1].content.includes('cal.com'));
  console.log('  ✓ Organic conversion posts pass');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.strictEqual(doc.targetDailyNetUsd, 300);
  assert.strictEqual(doc.targetMonthlyNetUsd, 9000);
  console.log('  ✓ Doctor check passes');
}

console.log('\n✅ All Revenue Cash Accelerator tests passed successfully!');
process.exit(0);
