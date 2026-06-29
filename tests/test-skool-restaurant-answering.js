'use strict';

const assert = require('assert');
const { SkoolRestaurantAnsweringEngine } = require('../tools/skool-restaurant-answering');

console.log('Running Skool Restaurant Answering Engine tests...');

// 1. Initialize engine
const engine = new SkoolRestaurantAnsweringEngine({
  commissionRatePerCover: 1.50,
});

// Test 1: Hours query matching
{
  const result = engine.processSpeechInput('what are your hours for Friday?');
  assert.strictEqual(result.intent, 'HOURS_QUERY');
  assert.strictEqual(result.targetDay, 'friday');
  assert.ok(result.response.includes('from 4 PM - 12 AM'));
  console.log('PASS Hours query matching');
}

// Test 2: Menu query matching (all items)
{
  const result = engine.processSpeechInput('what is on the food menu?');
  assert.strictEqual(result.intent, 'MENU_QUERY');
  assert.strictEqual(result.vegetarianOnly, false);
  assert.ok(result.response.includes('Neon Winged Tacos'));
  console.log('PASS Menu query matching');
}

// Test 3: Menu query matching (vegetarian only)
{
  const result = engine.processSpeechInput('do you have vegetarian dishes?');
  assert.strictEqual(result.intent, 'MENU_QUERY');
  assert.strictEqual(result.vegetarianOnly, true);
  assert.ok(result.response.includes('Ollama Hummus'));
  assert.ok(!result.response.includes('Neon Winged Tacos'));
  console.log('PASS Vegetarian menu query matching');
}

// Test 4: Booking intent matching
{
  const result = engine.processSpeechInput('I want to reserve a table for 4 people.');
  assert.strictEqual(result.intent, 'BOOKING_REQUEST');
  assert.strictEqual(result.partySize, 4);
  console.log('PASS Booking intent matching');
}

// Test 5: Table reservation booking and SMS confirmation
{
  const outcome = engine.createBooking('+15551234567', 4, 'Friday 7:00 PM');
  assert.ok(outcome.booking.bookingId.startsWith('BK-'));
  assert.strictEqual(outcome.booking.partySize, 4);
  assert.strictEqual(outcome.commission, 6.00); // 4 * $1.50
  assert.ok(outcome.smsMessage.includes('confirmed'));
  assert.ok(outcome.smsMessage.includes('Friday 7:00 PM'));
  console.log('PASS Booking reservation booking and SMS dispatch');
}

// Test 6: Toast POS reconciliation & seat attribution
{
  const posChecks = [
    { checkId: 'CHK-998822', phoneNumber: '+15551234567', totalPaid: 125.50 },
  ];
  const reconciliation = engine.reconcilePOSChecks(posChecks);
  assert.strictEqual(reconciliation.totalCommissions, 6.00);
  assert.strictEqual(reconciliation.reconciledBookings.length, 1);
  assert.strictEqual(reconciliation.reconciledBookings[0].amountPaid, 125.50);
  console.log('PASS POS reconciliation & seat attribution');
}

console.log('All Skool Restaurant Answering Engine tests passed successfully!');
process.exit(0);
