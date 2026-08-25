#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MonetizationGateway,
  classifyTraffic,
  simulatedReceipt,
  RECEIPT_PREFIX,
  WAITLIST_URL,
} = require('../tools/cloudflare-monetization-gateway');

const tmpLedger = path.join(os.tmpdir(), `x402-ledger-${Date.now()}.json`);

function main() {
  assert.strictEqual(
    classifyTraffic({
      url: 'https://thumbgate.app/blog',
      userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    }),
    'PAY_PER_CRAWL',
  );
  assert.strictEqual(
    classifyTraffic({ url: 'https://api.thumbgate.app/mcp/tools/recall', userAgent: 'curl/8.0' }),
    'MCP_TOOL_CALL',
  );
  assert.strictEqual(
    classifyTraffic({
      url: 'https://thumbgate.app/dashboard',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    }),
    'HUMAN_OR_AUTHENTICATED',
  );

  const gateway = new MonetizationGateway({
    ledgerPath: tmpLedger,
    hmacSecret: 'test-secret',
    payTo: '0xabc',
    allowSimulate: true,
  });

  const health = gateway.getHealthStatus();
  assert.strictEqual(health.status, 'WAITLIST');
  assert.strictEqual(health.liveClaim, false);
  assert.strictEqual(health.merchantOfRecord, false);
  assert.strictEqual(health.capturedRevenueUsd, 0);
  assert.strictEqual(health.waitlist, WAITLIST_URL);

  const human = gateway.handleRequest({
    url: 'https://thumbgate.app/pricing',
    userAgent: 'Mozilla/5.0',
  });
  assert.strictEqual(human.statusCode, 200);
  assert.strictEqual(human.decision, 'ALLOW_FREE_ACCESS');

  const blocked = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'PerplexityBot/1.0',
  });
  assert.strictEqual(blocked.statusCode, 402);
  assert.strictEqual(blocked.decision, 'REQUIRE_X402_PAYMENT');
  assert.strictEqual(blocked.liveClaim, false);
  assert.strictEqual(blocked.challenge.body.x402Version, 1);
  assert.ok(blocked.challenge.body.accepts[0].extra.waitlist);

  const bogus = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'PerplexityBot/1.0',
    receipt: 'x402_sig_valid_proof_token_123',
    challengeId: blocked.challenge.body.challengeId,
  });
  assert.strictEqual(bogus.statusCode, 402);
  assert.strictEqual(bogus.decision, 'RECEIPT_REJECTED');
  assert.strictEqual(bogus.reason, 'prefix_is_not_proof');

  // The challenge is labelled simulated on every surface it appears on, so a
  // simulated flow can never be read as a live one.
  assert.strictEqual(blocked.challenge.body.simulated, true);
  assert.strictEqual(blocked.challenge.body.settlementKind, 'simulated');
  assert.strictEqual(blocked.challenge.headers['X-Settlement-Kind'], 'simulated');
  assert.strictEqual(blocked.challenge.body.accepts[0].extra.simulated, true);
  assert.match(blocked.challenge.body.accepts[0].extra.receiptScheme, /NOT a payment instrument/);

  // A correctly bound receipt for the issued challenge clears exactly once.
  const challengeId = blocked.challenge.body.challengeId;
  const good = gateway.simulatedReceiptForChallenge(blocked.challenge);
  assert.ok(good.startsWith(RECEIPT_PREFIX), 'simulated receipts must be unmistakably shaped');
  const okReq = {
    url: 'https://thumbgate.app/docs',
    userAgent: 'PerplexityBot/1.0',
    receipt: good,
    challengeId,
  };
  const cleared = gateway.handleRequest({ ...okReq });
  assert.strictEqual(cleared.statusCode, 200);
  assert.strictEqual(cleared.decision, 'ALLOW_SIMULATED');
  assert.strictEqual(cleared.liveClaim, false);
  assert.strictEqual(cleared.settlementKind, 'simulated');
  assert.strictEqual(cleared.verification.simulated, true);

  // REGRESSION (review thread, tools/cloudflare-monetization-gateway.js:160):
  // replay. The same receipt must not clear a second time.
  const replayed = gateway.handleRequest({ ...okReq });
  assert.strictEqual(replayed.statusCode, 402);
  assert.strictEqual(replayed.decision, 'RECEIPT_REJECTED');
  assert.strictEqual(replayed.reason, 'challenge_already_consumed');

  // REGRESSION: a receipt minted for the low-rate crawl challenge must not clear
  // the higher-rate dataset-export resource. While the HMAC covered only the
  // challenge id, this cross-resource replay succeeded.
  const crawl = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'CCBot/2.0',
  });
  const crawlReceipt = gateway.simulatedReceiptForChallenge(crawl.challenge);
  const crossResource = gateway.handleRequest({
    url: 'https://thumbgate.app/dataset/export',
    userAgent: 'CCBot/2.0',
    receipt: crawlReceipt,
    challengeId: crawl.challenge.body.challengeId,
  });
  assert.strictEqual(crossResource.statusCode, 402);
  assert.strictEqual(crossResource.decision, 'RECEIPT_REJECTED');
  assert.strictEqual(crossResource.reason, 'challenge_resource_mismatch');

  // REGRESSION: a challenge id that was never issued proves nothing, even when
  // the caller can compute a syntactically perfect HMAC over it.
  const forged = simulatedReceipt(
    {
      challengeId: 'chal_never_issued',
      resource: 'https://thumbgate.app/docs',
      trafficType: 'PAY_PER_CRAWL',
      amountAtomic: '5000',
    },
    'test-secret',
  );
  const notIssued = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'PerplexityBot/1.0',
    receipt: forged,
    challengeId: 'chal_never_issued',
  });
  assert.strictEqual(notIssued.decision, 'RECEIPT_REJECTED');
  assert.strictEqual(notIssued.reason, 'challenge_not_issued');

  // A receipt signed with the wrong secret fails on the HMAC comparison.
  const wrongSecret = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'CCBot/2.0',
    receipt: simulatedReceipt(
      {
        challengeId: crawl.challenge.body.challengeId,
        resource: 'https://thumbgate.app/docs',
        trafficType: 'PAY_PER_CRAWL',
        amountAtomic: '5000',
      },
      'not-the-secret',
    ),
    challengeId: crawl.challenge.body.challengeId,
  });
  assert.strictEqual(wrongSecret.decision, 'RECEIPT_REJECTED');
  assert.strictEqual(wrongSecret.reason, 'hmac_mismatch');

  // An expired challenge is refused even with a perfectly bound receipt.
  const expiryGateway = new MonetizationGateway({
    ledgerPath: tmpLedger,
    hmacSecret: 'test-secret',
    payTo: '0xabc',
    allowSimulate: true,
  });
  const expChallenge = expiryGateway.handleRequest({
    url: 'https://thumbgate.app/dataset/export',
    userAgent: 'CCBot/2.0',
  }).challenge;
  const expReceipt = expiryGateway.simulatedReceiptForChallenge(expChallenge);
  const expLedger = expiryGateway.readLedger();
  expLedger.issuedChallenges[expChallenge.body.challengeId].expiresAt = Date.now() - 1000;
  expiryGateway.writeLedger(expLedger);
  const expired = expiryGateway.handleRequest({
    url: 'https://thumbgate.app/dataset/export',
    userAgent: 'CCBot/2.0',
    receipt: expReceipt,
    challengeId: expChallenge.body.challengeId,
  });
  assert.strictEqual(expired.reason, 'challenge_expired');

  // With simulation disabled nothing clears, whatever the receipt looks like.
  const locked = new MonetizationGateway({
    ledgerPath: tmpLedger,
    hmacSecret: 'test-secret',
    allowSimulate: false,
  });
  const lockedChallenge = locked.handleRequest({
    url: 'https://api.thumbgate.app/mcp/tools/recall',
    userAgent: 'curl/8.0',
  }).challenge;
  const refused = locked.handleRequest({
    url: 'https://api.thumbgate.app/mcp/tools/recall',
    userAgent: 'curl/8.0',
    receipt: locked.simulatedReceiptForChallenge(lockedChallenge),
    challengeId: lockedChallenge.body.challengeId,
  });
  assert.strictEqual(refused.statusCode, 402);
  assert.strictEqual(refused.reason, 'simulate_not_enabled');

  // The ledger never reports captured revenue or a live settlement.
  const ledger = gateway.getLedgerSummary();
  assert.strictEqual(ledger.capturedRevenueUsd, 0);
  assert.strictEqual(ledger.liveSettlements, 0);
  assert.strictEqual(ledger.liveClaim, false);
  assert.ok(ledger.simulatedSettlements >= 1);
  assert.ok(ledger.events.every((e) => e.settlementKind === 'simulated'));

  if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  console.log('ok tests/test-cloudflare-monetization-gateway.js');
}

main();
