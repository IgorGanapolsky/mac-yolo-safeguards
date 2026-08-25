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
 *   - HMAC receipts are local simulation only (settlementKind=simulated). They
 *     carry the `x402sim.v2.` prefix, a shape no real x402 envelope can take
 *     (real x402 presents a base64 X-PAYMENT header), so a simulated receipt can
 *     never be mistaken for a real one — and vice versa.
 *   - Every receipt is BOUND to the challenge that was actually issued: the HMAC
 *     covers challengeId + resource + trafficType + amount, the challenge must be
 *     present in the issued store, unexpired, and it is consumed on first use.
 *     A receipt not bound to its challenge proves nothing, so it is rejected.
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

/**
 * Unmistakably-simulated receipt prefix. Real x402 settlement presents a base64
 * X-PAYMENT envelope, so nothing real is shaped like this. Simulated and real
 * receipts therefore cannot share a shape.
 */
const RECEIPT_PREFIX = 'x402sim.v2.';
const RECEIPT_DIGEST_RE = /^[0-9a-f]{64}$/;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

/**
 * The bytes a simulated receipt signs.
 *
 * Binding resource + trafficType + amount — not just the challenge id — is what
 * stops a receipt minted for a cheap crawl challenge from being replayed against
 * an expensive dataset-export challenge. The id alone authenticates nothing
 * about WHAT was challenged.
 */
function receiptBinding({ challengeId, resource, trafficType, amountAtomic }) {
  return [
    'x402-simulated-v2',
    String(challengeId),
    String(resource),
    String(trafficType),
    String(amountAtomic),
  ].join('\n');
}

function simulatedReceipt(binding, secret) {
  const digest = crypto.createHmac('sha256', secret).update(receiptBinding(binding)).digest('hex');
  return `${RECEIPT_PREFIX}${digest}`;
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

  /**
   * Mint the simulated receipt for a challenge this gateway issued.
   * This is the only supported way to produce a receipt: it forces the caller to
   * carry the issued challenge through instead of inventing an id.
   */
  simulatedReceiptForChallenge(challenge) {
    if (!this.hmacSecret) return null;
    const body = challenge && challenge.body ? challenge.body : challenge;
    const accept = body && Array.isArray(body.accepts) ? body.accepts[0] : null;
    if (!body || !accept) return null;
    return simulatedReceipt(
      {
        challengeId: body.challengeId,
        resource: accept.resource,
        trafficType: accept.description,
        amountAtomic: accept.maxAmountRequired,
      },
      this.hmacSecret,
    );
  }

  generateChallenge({ url, trafficType, persist = true }) {
    const rule = ruleFor(trafficType);
    const challengeId = `chal_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const amountAtomic = String(Math.round(rule.priceUsd * 1e6));
    const issuedAt = Date.now();
    const expiresAt = issuedAt + CHALLENGE_TTL_MS;
    const body = {
      x402Version: 1,
      error: 'payment_required',
      challengeId,
      simulated: true,
      settlementKind: 'simulated',
      expiresAt: new Date(expiresAt).toISOString(),
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
            simulated: true,
            settlementKind: 'simulated',
            receiptScheme: `${RECEIPT_PREFIX} (local HMAC simulation — NOT a payment instrument)`,
            merchant: 'cloudflare_monetization_gateway_not_live',
            priceUsd: rule.priceUsd,
          },
        },
      ],
    };
    if (persist) {
      this.recordChallengeIssued({
        challengeId,
        resource: url,
        trafficType: rule.trafficType,
        amountAtomic,
        priceUsd: rule.priceUsd,
        issuedAt,
        expiresAt,
      });
    }
    return {
      statusCode: 402,
      headers: {
        'Content-Type': 'application/json',
        'PAYMENT-REQUIRED': 'x402',
        'X-Settlement-Kind': 'simulated',
      },
      body,
    };
  }

  /** Persist an issued challenge so a receipt can later be checked against it. */
  recordChallengeIssued(record) {
    const ledger = this.readLedger();
    ledger.issuedChallenges[record.challengeId] = { ...record, consumedAt: null };
    this.writeLedger(ledger);
    return record;
  }

  /**
   * Verify a simulated receipt against the challenge that was actually issued.
   *
   * SINGLE USE: a successful verification consumes the challenge, so the same
   * receipt cannot be replayed. Replay protection must not depend on the caller
   * remembering to consume it, so it happens here.
   */
  verifyReceipt(receipt, { challengeId, url = null, trafficType = null } = {}) {
    if (!receipt || typeof receipt !== 'string') {
      return { valid: false, reason: 'missing_receipt' };
    }
    // Anything not carrying the simulation prefix + a full digest is not proof.
    if (!receipt.startsWith(RECEIPT_PREFIX) || !RECEIPT_DIGEST_RE.test(receipt.slice(RECEIPT_PREFIX.length))) {
      return { valid: false, reason: 'prefix_is_not_proof' };
    }
    if (!this.hmacSecret) {
      return { valid: false, reason: 'hmac_secret_unconfigured' };
    }
    // Fail closed before touching the store: with simulation off, no receipt of
    // any shape may be honoured.
    if (!this.allowSimulate) {
      return { valid: false, reason: 'simulate_not_enabled' };
    }
    if (!challengeId) {
      return { valid: false, reason: 'challenge_id_required' };
    }

    const ledger = this.readLedger();
    const issued = ledger.issuedChallenges[challengeId];
    if (!issued) {
      return { valid: false, reason: 'challenge_not_issued' };
    }
    if (issued.consumedAt) {
      return { valid: false, reason: 'challenge_already_consumed' };
    }
    if (Date.now() > issued.expiresAt) {
      return { valid: false, reason: 'challenge_expired' };
    }
    // The receipt must be presented against the same resource and traffic type
    // the challenge was issued for — otherwise a cheap challenge buys an
    // expensive resource.
    if (url !== null && issued.resource !== url) {
      return { valid: false, reason: 'challenge_resource_mismatch' };
    }
    if (trafficType !== null && issued.trafficType !== trafficType) {
      return { valid: false, reason: 'challenge_traffic_type_mismatch' };
    }

    const expected = simulatedReceipt(
      {
        challengeId,
        resource: issued.resource,
        trafficType: issued.trafficType,
        amountAtomic: issued.amountAtomic,
      },
      this.hmacSecret,
    );
    if (!timingEqual(receipt, expected)) {
      return { valid: false, reason: 'hmac_mismatch' };
    }

    issued.consumedAt = new Date().toISOString();
    ledger.issuedChallenges[challengeId] = issued;
    this.writeLedger(ledger);

    return {
      valid: true,
      settlementKind: 'simulated',
      simulated: true,
      liveClaim: false,
      challengeId,
      resource: issued.resource,
      trafficType: issued.trafficType,
      amountAtomic: issued.amountAtomic,
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
      // Pass the live request context so the receipt is checked against the
      // resource and traffic type its challenge was issued for.
      const verification = this.verifyReceipt(receipt, { challengeId, url, trafficType });
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

  readLedger() {
    const empty = {
      capturedRevenueUsd: 0,
      liveSettlements: 0,
      simulatedSettlements: 0,
      challenges: 0,
      issuedChallenges: {},
      events: [],
    };
    try {
      if (fs.existsSync(this.ledgerPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.ledgerPath, 'utf8'));
        return {
          ...empty,
          ...parsed,
          issuedChallenges:
            parsed && typeof parsed.issuedChallenges === 'object' && parsed.issuedChallenges
              ? parsed.issuedChallenges
              : {},
          events: Array.isArray(parsed && parsed.events) ? parsed.events : [],
        };
      }
    } catch {
      /* start clean */
    }
    return empty;
  }

  writeLedger(ledger) {
    // Drop challenges that are long past their window so the store cannot grow
    // without bound.
    const cutoff = Date.now() - CHALLENGE_TTL_MS;
    for (const [id, rec] of Object.entries(ledger.issuedChallenges)) {
      if (!rec || typeof rec.expiresAt !== 'number' || rec.expiresAt < cutoff) {
        delete ledger.issuedChallenges[id];
      }
    }
    // These stay pinned at zero: nothing here settles real money.
    ledger.capturedRevenueUsd = 0;
    ledger.liveSettlements = 0;
    fs.mkdirSync(path.dirname(this.ledgerPath), { recursive: true });
    fs.writeFileSync(this.ledgerPath, JSON.stringify(ledger, null, 2));
    return ledger;
  }

  recordEvent(event) {
    const ledger = this.readLedger();
    ledger.events.push({ ...event, at: new Date().toISOString(), settlementKind: 'simulated' });
    if (event.kind === 'challenge') ledger.challenges = (ledger.challenges || 0) + 1;
    if (event.kind === 'simulated_settlement') {
      ledger.simulatedSettlements = (ledger.simulatedSettlements || 0) + 1;
    }
    return this.writeLedger(ledger);
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
    if (result.decision === 'ALLOW_SIMULATED') {
      console.log('settlement: SIMULATED — local HMAC only. No money moved. Not a payment.');
    }
    if (result.reason) console.log(`reason: ${result.reason}`);
    if (result.challenge) {
      console.log(`challenge: ${result.challenge.body.challengeId} (SIMULATED, expires ${result.challenge.body.expiresAt})`);
    }
  }
  return result.statusCode === 200 ? 0 : 2;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  MonetizationGateway,
  classifyTraffic,
  simulatedReceipt,
  receiptBinding,
  RECEIPT_PREFIX,
  CHALLENGE_TTL_MS,
  RULES,
  AI_CRAWLER_PATTERNS,
  WAITLIST_URL,
  main,
};
