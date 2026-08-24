#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MonetizationGateway,
  classifyTraffic,
  hmacReceipt,
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

  const fake = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'PerplexityBot/1.0',
    receipt: 'x402_sig_valid_proof_token_123',
    challengeId: blocked.challenge.body.challengeId,
  });
  assert.strictEqual(fake.statusCode, 402);
  assert.strictEqual(fake.decision, 'RECEIPT_REJECTED');
  assert.strictEqual(fake.reason, 'prefix_is_not_proof');

  const challengeId = blocked.challenge.body.challengeId;
  const good = hmacReceipt(challengeId, 'test-secret');
  const paid = gateway.handleRequest({
    url: 'https://thumbgate.app/docs',
    userAgent: 'PerplexityBot/1.0',
    receipt: good,
    challengeId,
  });
  assert.strictEqual(paid.statusCode, 200);
  assert.strictEqual(paid.decision, 'ALLOW_SIMULATED');
  assert.strictEqual(paid.liveClaim, false);
  assert.strictEqual(paid.settlementKind, 'simulated');

  const locked = new MonetizationGateway({
    ledgerPath: tmpLedger,
    hmacSecret: 'test-secret',
    allowSimulate: false,
  });
  const refused = locked.handleRequest({
    url: 'https://api.thumbgate.app/mcp/tools/recall',
    userAgent: 'curl/8.0',
    receipt: hmacReceipt('chal_lock', 'test-secret'),
    challengeId: 'chal_lock',
  });
  assert.strictEqual(refused.statusCode, 402);
  assert.strictEqual(refused.reason, 'simulate_not_enabled');

  const ledger = gateway.getLedgerSummary();
  assert.strictEqual(ledger.capturedRevenueUsd, 0);
  assert.strictEqual(ledger.liveSettlements, 0);
  assert.ok(ledger.simulatedSettlements >= 1);

  if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  console.log('ok tests/test-cloudflare-monetization-gateway.js');
}

main();
