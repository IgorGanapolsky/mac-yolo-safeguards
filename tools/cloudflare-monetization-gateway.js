#!/usr/bin/env node
'use strict';

/**
 * Cloudflare Monetization Gateway / x402 policy adapter.
 *
 * Source: https://blog.cloudflare.com/monetization-gateway/
 *
 * Mechanic stolen: HTTP 402 Payment Required + payment-in-the-request (x402).
 * Cloudflare's product is WAITLIST. Pay Per Crawl is private beta.
 *
 * Honesty:
 *   - Never claim LIVE merchant-of-record or settled USDC.
 *   - Prefixes like "x402_" are NOT payment proof.
 *   - HMAC receipts are local simulation only (settlementKind=simulated).
 *   - Do not put x402/USDC in dashboard/landing copy (hosted-source-of-truth).
 *   - hermes-economic-router already treats x402 as paid/external + approval gate.
 *   - ECI: no buyer outreach; this CLI does not charge strangers.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WAITLIST_URL = 'https://blog.cloudflare.com/monetization-gateway/';
const PAY_PER_CRAWL_SIGNUP = 'https://www.cloudflare.com/paypercrawl-signup/';
const X402_SPEC = 'https://www.x402.org/';

const AI_CRAWLER_PATTERNS = [
  /gptbot/i,
  /claudebot/i,
  /perplexitybot/i,
  /bytespider/i,
  /ccbot/i,
  /anthropic-ai/i,
  /google-extended/i,
];

const RULES = [
  {
    id: 'mcp-tool',
    trafficType: 'MCP_TOOL_CALL',
    priceUsd: 0.01,
    match: ({ url, headers }) => /\/mcp\//i.test(url) || Boolean(headers['x-mcp-tool']),
  },
  {
    id: 'dataset-export',
    trafficType: 'DATASET_EXPORT',
    priceUsd: 0.05,
    match: ({ url }) => /\/dataset|\/export/i.test(url),
  },
  {
    id: 'pay-per-crawl',
    trafficType: 'PAY_PER_CRAWL',
    priceUsd: 0.005,
    match: ({ userAgent }) => AI_CRAWLER_PATTERNS.some((p) => p.test(userAgent)),
  },
];

function classifyTraffic({ url = '', userAgent = '', headers = {} } = {}) {
  for (const rule of RULES) {
    if (rule.match({ url, userAgent, headers })) return rule.trafficType;
  }
  return 'HUMAN_OR_AUTHENTICATED';
}

function ruleFor(trafficType) {
  return RULES.find((r) => r.trafficType === trafficType) || RULES[2];
}

function hmacReceipt(challengeId, secret) {
  return crypto.createHmac('sha256', secret).update(`x402:${challengeId}`).digest('hex');
}

function timingEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

class MonetizationGateway {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.payTo = String(options.payTo || this.env.X402_PAY_TO || '').trim() || null;
    this.hmacSecret = String(options.hmacSecret || this.env.X402_HMAC_SECRET || '').trim() || null;
    this.allowSimulate = options.allowSimulate === true || this.env.X402_ALLOW_SIMULATE === '1';
    this.ledgerPath = options.ledgerPath || path.join(os.tmpdir(), 'mac-yolo-x402-ledger.json');
  }

  getHealthStatus() {
    return {
      product: 'Cloudflare Monetization Gateway',
      status: 'WAITLIST',
      liveClaim: false,
      merchantOfRecord: false,
      capturedRevenueUsd: 0,
      waitlist: WAITLIST_URL,
      payPerCrawlSignup: PAY_PER_CRAWL_SIGNUP,
      spec: X402_SPEC,
      payToConfigured: Boolean(this.payTo),
      hmacConfigured: Boolean(this.hmacSecret),
      note: 'Join the Cloudflare waitlist. Do not invent settlement. Stripe $10 hosted remains the live cash path.',
    };
  }

  generateChallenge({ url, trafficType }) {
    const rule = ruleFor(trafficType);
    const challengeId = `chal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const amountAtomic = String(Math.round(rule.priceUsd * 1e6));
    const body = {
      x402Version: 1,
      error: 'payment_required',
      challengeId,
      accepts: [
        {
          scheme: 'exact',
          network: this.payTo ? 'base' : 'unconfigured',
          maxAmountRequired: amountAtomic,
          resource: url,
          description: rule.trafficType,
          mimeType: 'application/json',
          payTo: this.payTo,
          maxTimeoutSeconds: 60,
          asset: 'USDC',
          extra: {
            waitlist: true,
            merchant: 'cloudflare_monetization_gateway_not_live',
            priceUsd: rule.priceUsd,
          },
        },
      ],
    };
    return {
      statusCode: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': 'x402',
      },
      body,
    };
  }

  verifyReceipt(receipt, { challengeId } = {}) {
    if (!receipt || typeof receipt !== 'string') {
      return { valid: false, reason: 'missing_receipt' };
    }
    if (receipt.startsWith('x402_') || receipt.length < 32) {
      return { valid: false, reason: 'prefix_is_not_proof' };
    }
    if (!this.hmacSecret) {
      return { valid: false, reason: 'hmac_secret_unconfigured' };
    }
    if (!challengeId) {
      return { valid: false, reason: 'challenge_id_required' };
    }
    const expected = hmacReceipt(challengeId, this.hmacSecret);
    if (!timingEqual(receipt, expected)) {
      return { valid: false, reason: 'hmac_mismatch' };
    }
    if (!this.allowSimulate) {
      return { valid: false, reason: 'simulate_not_enabled' };
    }
    return {
      valid: true,
      settlementKind: 'simulated',
      liveClaim: false,
      challengeId,
    };
  }

  handleRequest({ url, userAgent = '', headers = {}, receipt = null, challengeId = null } = {}) {
    const trafficType = classifyTraffic({ url, userAgent, headers });
    if (trafficType === 'HUMAN_OR_AUTHENTICATED') {
      return {
        statusCode: 200,
        decision: 'ALLOW_FREE_ACCESS',
        trafficType,
        liveClaim: false,
      };
    }
    if (receipt) {
      const verification = this.verifyReceipt(receipt, { challengeId });
      if (verification.valid) {
        this.recordEvent({
          kind: 'simulated_settlement',
          url,
          trafficType,
          amountUsd: ruleFor(trafficType).priceUsd,
        });
        return {
          statusCode: 200,
          decision: 'ALLOW_SIMULATED',
          trafficType,
          liveClaim: false,
          settlementKind: 'simulated',
          verification,
        };
      }
      return {
        statusCode: 402,
        decision: 'RECEIPT_REJECTED',
        trafficType,
        liveClaim: false,
        reason: verification.reason,
        challenge: this.generateChallenge({ url, trafficType }),
      };
    }
    const challenge = this.generateChallenge({ url, trafficType });
    this.recordEvent({ kind: 'challenge', url, trafficType, amountUsd: 0 });
    return {
      statusCode: 402,
      decision: 'REQUIRE_X402_PAYMENT',
      trafficType,
      liveClaim: false,
      challenge,
    };
  }

  recordEvent(event) {
    let ledger = { capturedRevenueUsd: 0, liveSettlements: 0, simulatedSettlements: 0, challenges: 0, events: [] };
    try {
      if (fs.existsSync(this.ledgerPath)) {
        ledger = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
      }
    } catch {
      /* start clean */
    }
    ledger.events = Array.isArray(ledger.events) ? ledger.events : [];
    ledger.events.push({ ...event, at: new Date().toISOString() });
    if (event.kind === 'challenge') ledger.challenges = (ledger.challenges || 0) + 1;
    if (event.kind === 'simulated_settlement') {
      ledger.simulatedSettlements = (ledger.simulatedSettlements || 0) + 1;
    }
    ledger.capturedRevenueUsd = 0;
    ledger.liveSettlements = 0;
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    fs.writeFileSync(this.ledgerPath, JSON.stringify(ledger, null, 2));
    return ledger;
  }

  getLedgerSummary() {
    try {
      if (fs.existsSync(this.ledgerPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
        parsed.capturedRevenueUsd = 0;
        parsed.liveSettlements = 0;
        parsed.liveClaim = false;
        return parsed;
      }
    } catch {
      /* empty */
    }
    return { capturedRevenueUsd: 0, liveSettlements: 0, simulatedSettlements: 0, challenges: 0, events: [], liveClaim: false };
  }
}

function parseArgs(argv) {
  const out = { json: false, health: false, ledger: false, simulate: false, url: '', userAgent: '', receipt: '', challengeId: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--health') out.health = true;
    else if (argv[i] === '--ledger') out.ledger = true;
    else if (argv[i] === '--simulate') out.simulate = true;
    else if (argv[i] === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === '--user-agent' && argv[i + 1]) out.userAgent = argv[++i];
    else if (argv[i] === '--receipt' && argv[i + 1]) out.receipt = argv[++i];
    else if (argv[i] === '--challenge-id' && argv[i + 1]) out.challengeId = argv[++i];
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const gateway = new MonetizationGateway({ allowSimulate: args.simulate });
  if (args.health) {
    const health = gateway.getHealthStatus();
    if (args.json) console.log(JSON.stringify(health, null, 2));
    else {
      console.log(`gateway: ${health.status} liveClaim=${health.liveClaim} revenueUsd=${health.capturedRevenueUsd}`);
      console.log(`waitlist: ${health.waitlist}`);
    }
    return 0;
  }
  if (args.ledger) {
    const ledger = gateway.getLedgerSummary();
    if (args.json) console.log(JSON.stringify(ledger, null, 2));
    else console.log(`ledger liveClaim=false capturedRevenueUsd=0 simulated=${ledger.simulatedSettlements || 0}`);
    return 0;
  }
  const url = args.url || 'https://thumbgate.app/docs';
  const result = gateway.handleRequest({
    url,
    userAgent: args.userAgent,
    receipt: args.receipt || null,
    challengeId: args.challengeId || null,
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[x402] ${result.statusCode} ${result.decision} liveClaim=${result.liveClaim}`);
    if (result.reason) console.log(`reason: ${result.reason}`);
    if (result.challenge) console.log(`challenge: ${result.challenge.body.challengeId}`);
  }
  return result.statusCode === 200 ? 0 : 2;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  MonetizationGateway,
  classifyTraffic,
  hmacReceipt,
  RULES,
  AI_CRAWLER_PATTERNS,
  WAITLIST_URL,
  main,
};
