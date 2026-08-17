/**
 * tests/test-ontoprank-growth-engine.js
 *
 * Test suite for OnTopRank Growth & Credit Escrow Engine:
 * 1. Credit Ledger Lifecycle (Grant -> Reservation in Escrow -> Settlement vs Refund)
 * 2. Reciprocal Credit Earning
 * 3. 14-Day Testing Pack Cohort Tracking & Google Play Compliance Verification
 * 4. Campaign Manager with Multi-App Support (Hermes Mobile + LipoShield)
 */

const assert = require('assert');
const {
  CREDITS_PER_ACTIVITY,
  INITIAL_APP_CREDIT_GRANT,
  CreditEscrowLedger,
  TestingPackCohortManager,
  AppExchangeCampaignManager,
} = require('../tools/ontoprank-growth-engine');

async function runTests() {
  console.log('--- Running OnTopRank Growth Engine Verification Suite ---');

  // Test 1: Credit Escrow Lifecycle
  console.log('1. Testing Credit Escrow Lifecycle...');
  const ledger = new CreditEscrowLedger(30);
  assert.strictEqual(ledger.availableBalance, 30, 'Initial balance must be 30');

  // Reserve for a tester
  const res = ledger.reserveCredits('task_001', 30);
  assert.strictEqual(res.success, true, 'Reservation must succeed');
  assert.strictEqual(ledger.availableBalance, 0, 'Available balance should be 0');
  assert.strictEqual(ledger.escrowBalance, 30, 'Escrow balance should be 30');

  // Attempting second reserve without funds should fail
  const failedRes = ledger.reserveCredits('task_002', 30);
  assert.strictEqual(failedRes.success, false, 'Should fail when insufficient credits');

  // Settle to tester with verified proof
  const settleRes = ledger.settleCredits('task_001', 'tester_alice', true);
  assert.strictEqual(settleRes.success, true, 'Settlement must succeed');
  assert.strictEqual(ledger.escrowBalance, 0, 'Escrow should be 0 after settlement');
  console.log('✓ Credit Escrow Lifecycle (Grant -> Escrow -> Settle) verified');

  // Test 2: Reciprocal Credit Earning & Refund on Rejection
  console.log('2. Testing Reciprocal Earning & Refund...');
  ledger.earnCredits('app_external_123', 30);
  assert.strictEqual(ledger.availableBalance, 30, 'Earned 30 credits');

  // Reserve and refund
  ledger.reserveCredits('task_003', 30);
  assert.strictEqual(ledger.availableBalance, 0);
  const refundRes = ledger.settleCredits('task_003', 'tester_bob', false);
  assert.strictEqual(refundRes.action, 'REFUNDED', 'Must refund to owner on failed proof');
  assert.strictEqual(ledger.availableBalance, 30, 'Available balance restored');
  console.log('✓ Reciprocal Earning & Refund verified');

  // Test 3: 14-Day Testing Pack Cohort Tracking
  console.log('3. Testing 14-Day Testing Pack Cohort Manager...');
  const cohort = new TestingPackCohortManager('com.igor.hermesmobile');
  
  // Enroll 14 testers
  for (let i = 1; i <= 14; i++) {
    cohort.enrollTester(`dev_tester_${i}`, `Dev ${i}`, 'Pixel 9 / S25');
  }
  assert.strictEqual(cohort.cohortMembers.size, 14, 'Must have enrolled 14 testers');

  // Simulate daily engagement
  for (let day = 1; day <= 14; day++) {
    for (let i = 1; i <= 13; i++) {
      cohort.logDailyEngagement(`dev_tester_${i}`, day, `sha256_mock_${day}`);
    }
  }

  const compliance = cohort.evaluateGooglePlayCompliance();
  assert.strictEqual(compliance.isCompliant, true, 'Cohort with 13 testers @ 14 days is compliant');
  assert.strictEqual(compliance.qualifying14DayTestersCount, 13);
  console.log(`✓ 14-Day Cohort Compliance: ${compliance.qualifying14DayTestersCount}/${compliance.requiredTesters} testers verified (Compliant: ${compliance.isCompliant})`);

  // Test 4: Multi-App Campaign Manager
  console.log('4. Testing Multi-App Campaign Manager (Hermes Mobile & LipoShield)...');
  const campaign = new AppExchangeCampaignManager();
  const hermesStatus = campaign.getAppStatus('com.igor.hermesmobile');
  const lipoStatus = campaign.getAppStatus('com.liposhield.app');

  assert(hermesStatus, 'Hermes Mobile must be registered');
  assert(lipoStatus, 'LipoShield must be registered');
  assert.strictEqual(hermesStatus.balance.availableBalance, 30);
  campaign.applyBoost('com.igor.hermesmobile', 2.5);
  assert.strictEqual(campaign.getAppStatus('com.igor.hermesmobile').boostMultiplier, 2.5);
  console.log('✓ Multi-App Campaign Manager verified for Hermes Mobile and LipoShield');

  console.log('\n=== ALL ONTOPRANK GROWTH ENGINE TESTS PASSED (100% GREEN) ===');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
