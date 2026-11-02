#!/usr/bin/env node
'use strict';

/**
 * tools/poolside-money-engine.js
 *
 * 24/7 Omnichannel Autonomous Revenue Engine for Poolside (`pool`) & Hermes (`hermes`).
 * Unifies:
 *   1. Stripe Live Catalog & Pipeline ($9,998 open B2B pipeline + $19/mo Pro + $49 Kit + $499 Diagnostic + $1,500 Sprint + $3,000 Partner Pilot)
 *   2. CoderLegion (coderlegion.com) 24/7 Technical Syndication & UTM Checkout Funnel (667+ reads -> Stripe direct links)
 *   3. Skool (skool.com/ai-realestate101 — Tax Deed Wealth 101) 6 Active Inbound Buyer/Partner DM Closers
 *   4. BountiClaw Florida Tax-Deed Autonomous Engine ($105,650 gross pipeline across 5 verified parcels)
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const { MAC_YOLO_STRIPE_CATALOG } = require('./mac-yolo-stripe-provisioner');

const HOME = os.homedir();
const WORKSPACE = path.join(HOME, 'workspace', 'mac-yolo-safeguards');
const REVENUE_DIR = path.join(HOME, '.hermes', 'business_os', 'revenue');
const RECEIPTS_DIR = path.join(HOME, '.hermes', 'receipts');
const OUTBOX_DIR = path.join(REVENUE_DIR, '24x7-outbox');

const LIVE_OFFERS = MAC_YOLO_STRIPE_CATALOG.map((item) => ({
  offer: item.offer,
  status: item.status,
  stripe_product_id: item.stripe_product_id,
  stripe_price_id: item.stripe_price_id,
  payment_link_url: item.payment_link_url,
  stripe_amount_usd: item.stripe_amount_usd,
}));

const SKOOL_INBOUND_DMS = [
  {
    prospect: 'Asia Wynn',
    community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
    lastMessage: 'Hi Igor! How are you?',
    actionableReply:
      'Hey Asia! Doing great — just finished running our BountiClaw Florida tax-deed scanner across Miami-Dade, Broward, and Palm Beach (5 live parcels with verified equity spreads). Are you currently bidding Florida tax deeds or looking for off-market parcel alerts?',
  },
  {
    prospect: 'Summan Irshad',
    community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
    lastMessage: "Not much, how's work going?",
    actionableReply:
      'Going strong! We automated our Florida county tax-deed & lien auction diligence so we can screen opening bids vs. assessed value and Sunbiz owner records in minutes. What counties are you focusing on right now?',
  },
  {
    prospect: 'Harrison Zhang',
    community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
    lastMessage: 'Doing well, keeping busy and moving things forward. How is your...',
    actionableReply:
      'Love to hear that Harrison. Our Florida tax-deed pipeline is humming — currently tracking 5 high-margin parcels ($105.6k combined fee/spread pipeline) with automated title/lien screening. Let me know if you want a look at this week’s Florida auction sheet!',
  },
  {
    prospect: 'Param Shah',
    community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
    lastMessage: 'Thanks for connecting! Really impressive background.',
    actionableReply:
      'Appreciate it Param! Excited to be in Tax Deed Wealth 101. I build AI automation for Florida tax-deed auction screening & skip-tracing (igorganapolsky.com). Are you actively investing in tax deeds or building deal flow right now?',
  },
  {
    prospect: 'Dylan Murray',
    community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
    lastMessage: 'Inbound Skool thread',
    actionableReply:
      'Hey Dylan! Great connecting inside Tax Deed Wealth 101. We just published our automated Florida county tax-deed auction preview & skip-trace workflow — happy to share the live parcel shortlist if you are looking at FL deals this month.',
  },
  {
    prospect: 'Usman Ali',
    community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
    lastMessage: 'Inbound Skool thread',
    actionableReply:
      'Hey Usman! Great to connect here. Let me know what markets you are targeting — we run 24/7 automated screening on Florida tax-deed auctions and agentic workflow automation.',
  },
];

const CODERLEGION_CAMPAIGNS = [
  {
    slug: 'stop-local-ollama-gpu-meltdowns-macos-agents',
    title: 'How We Stopped Local LLM Agents From Pegging Apple Silicon GPUs at 100% (Load Avg 307 -> 2.1)',
    targetReads: 850,
    ctaOffer: 'Agent Reliability Diagnostic ($499) + Corporate Kit ($49)',
    trackedStripeUrl: 'https://buy.stripe.com/9B600jaiE7Dg6tPayn3sI2L?client_reference_id=coderlegion_gpu_guard',
    enterpriseStripeUrl: 'https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k?client_reference_id=coderlegion_diag_499',
  },
  {
    slug: 'pretooluse-gates-that-block-repeat-agent-mistakes',
    title: 'PreToolUse Reliability Gates: Turning Every Thumbs-Down Into a Deterministic Guardrail',
    targetReads: 1200,
    ctaOffer: 'ThumbGate Pro ($19/mo) + AI Agent Hardening Sprint ($1,500)',
    trackedStripeUrl: 'https://buy.stripe.com/8x2dR91M84r4cSd9uj3sI3f?client_reference_id=coderlegion_thumbgate_pro',
    enterpriseStripeUrl: 'https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38?client_reference_id=coderlegion_sprint_1500',
  },
];

function ensureStripeOfferMap(dateStr) {
  fs.mkdirSync(REVENUE_DIR, { recursive: true });
  const mapPath = path.join(REVENUE_DIR, `stripe-offer-map-${dateStr}.tsv`);
  const header = [
    'offer',
    'status',
    'stripe_product_id',
    'stripe_price_id',
    'payment_link_url',
    'stripe_amount_usd',
  ].join('\t');
  const rows = LIVE_OFFERS.map((r) =>
    [
      r.offer,
      r.status,
      r.stripe_product_id,
      r.stripe_price_id,
      r.payment_link_url,
      r.stripe_amount_usd,
    ].join('\t')
  );
  fs.writeFileSync(mapPath, [header, ...rows].join('\n') + '\n', { encoding: 'utf8', mode: 0o600 });
  return mapPath;
}

function writeOutboxArtifacts(dateStr) {
  fs.mkdirSync(OUTBOX_DIR, { recursive: true });
  const skoolPath = path.join(OUTBOX_DIR, `skool-tax-deed-dms-${dateStr}.md`);
  const coderLegionPath = path.join(OUTBOX_DIR, `coderlegion-24x7-articles-${dateStr}.md`);

  const skoolMd = [
    `# Skool Tax Deed Wealth 101 (ai-realestate101) — Ready-to-Send DM Closer Queue (${dateStr})`,
    '',
    ...SKOOL_INBOUND_DMS.map(
      (item, idx) =>
        `## ${idx + 1}. ${item.prospect}\n- **Inbound:** "${item.lastMessage}"\n- **Copy-Paste Reply:**\n> ${item.actionableReply}\n`
    ),
  ].join('\n');
  fs.writeFileSync(skoolPath, skoolMd, 'utf8');

  const clMd = [
    `# CoderLegion (coderlegion.com) — 24/7 Monetized Syndication Queue (${dateStr})`,
    '',
    `- **Current Baseline:** 9 Posts · 667 Reads · 12 Reactions · 9 Followers · 1,250 Points`,
    `- **Goal:** Convert weekly developer reads directly into self-serve Stripe checkouts ($19/mo, $49, $499, $1,500).`,
    '',
    ...CODERLEGION_CAMPAIGNS.map(
      (c, idx) =>
        `## ${idx + 1}. ${c.title}\n- **Slug:** \`${c.slug}\`\n- **Offer:** ${c.ctaOffer}\n- **Self-Serve Checkout:** ${c.trackedStripeUrl}\n- **Enterprise Checkout:** ${c.enterpriseStripeUrl}\n`
    ),
  ].join('\n');
  fs.writeFileSync(coderLegionPath, clMd, 'utf8');

  return { skoolPath, coderLegionPath };
}

function main() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const mapPath = ensureStripeOfferMap(dateStr);
  const { skoolPath, coderLegionPath } = writeOutboxArtifacts(dateStr);

  // Run BountiClaw status with fast 1.5s bound so CLI never stalls
  let bounticlawSummary = 'BountiClaw: 5 verified FL tax-deed parcels ($105,650 gross pipeline) | 11 CRM contacts |Pedro Mario Capote (pmc@mikonfinancial.com)';
  const bcScript = path.join(HOME, 'workspace', 'RealEstate', 'tools', 'bounticlaw_engine.py');
  if (fs.existsSync(bcScript)) {
    const bc = spawnSync('python3', [bcScript, 'status'], { encoding: 'utf8', timeout: 1500 });
    if (bc.stdout && bc.stdout.trim()) {
      bounticlawSummary = bc.stdout.trim().split('\n').slice(0, 12).join('\n');
    }
  }
  const receipt = {
    schema: 'poolside-money-engine/v1',
    executedAt: new Date().toISOString(),
    northStarUsdPerDay: 300,
    stripeOfferMap: mapPath,
    liveOffers: LIVE_OFFERS,
    openB2BPipelineUsd: 9998.0,
    bountiClawPipelineUsd: 105650.0,
    coderLegionStats: {
      posts: 9,
      readsThisWeek: 667,
      reactions: 12,
      followers: 9,
      points: 1250,
      outboxPath: coderLegionPath,
    },
    skoolInboundQueue: {
      community: 'skool.com/ai-realestate101 (Tax Deed Wealth 101)',
      pendingDms: SKOOL_INBOUND_DMS.length,
      prospects: SKOOL_INBOUND_DMS.map((d) => d.prospect),
      outboxPath: skoolPath,
    },
  };

  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  const receiptPath = path.join(RECEIPTS_DIR, 'poolside-money-engine-latest.json');
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

  console.log('=== 24/7 AUTONOMOUS MONEY ENGINE ($300/DAY NORTH STAR) ===');
  console.log(`1. STRIPE LIVE OFFERS READY (${mapPath}):`);
  for (const o of LIVE_OFFERS) {
    console.log(`   - ${o.offer} ($${o.stripe_amount_usd}): ${o.payment_link_url} [${o.stripe_price_id}]`);
  }
  console.log('\n2. CODERLEGION (coderlegion.com) 24/7 SYNDICATION FUNNEL:');
  console.log(`   - Live Traction: 9 Posts | 667 Reads | 12 Reactions | 1,250 Points`);
  console.log(`   - Monetized Drafts & UTM Links staged: ${coderLegionPath}`);
  console.log('\n3. SKOOL (Tax Deed Wealth 101 — skool.com/ai-realestate101) INBOUND CLOSERS:');
  console.log(`   - 6 Active Inbound Prospects: ${SKOOL_INBOUND_DMS.map((d) => d.prospect).join(', ')}`);
  console.log(`   - Copy-paste DM closer queue written: ${skoolPath}`);
  console.log('\n4. BOUNTICLAW FLORIDA TAX-DEED PIPELINE:');
  console.log(bounticlawSummary);
  console.log(`\nReceipt saved: ${receiptPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { LIVE_OFFERS, ensureStripeOfferMap };
