#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-24x7-promote.js — 24/7 Autonomous Promotion & Revenue Engine for mac-yolo-safeguards
 *
 * Runs every 15 minutes via LaunchAgent (com.iganapolsky.mac-yolo-safeguards-24x7-promote):
 *   1. Seeds/refreshes private ~/.hermes/business_os/revenue/{prospects,pipeline-status,stripe-offer-map}-YYYY-MM-DD.tsv
 *   2. Runs pipeline-data-science.js, payment-readiness.js, and revenue-autonomous-loop.js (--fast --no-ntfy)
 *   3. Runs Gurobi MIP outreach batch optimization (certified optimal selection under capacity & bounce constraints)
 *   4. Verifies public repo conversion & funnel safety gates (public-conversion-check.js, public-funnel-safety-scan.js)
 *   5. Refreshes 9-channel mac-yolo-safeguards promotion copy & triggers ThumbGate + Dayglass make-money loops
 *   6. Writes receipt to ~/.hermes/receipts/mac-yolo-24x7-promote-latest.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HOME = os.homedir();
const OPS_DIR = path.join(HOME, '.hermes', 'business_os', 'revenue');
const RECEIPT_DIR = path.join(HOME, '.hermes', 'receipts');
const RECEIPT_PATH = path.join(RECEIPT_DIR, 'mac-yolo-24x7-promote-latest.json');
const VAULT_REPORT_DIR = path.join(HOME, 'Documents', 'AI-Agent-Sync', 'Projects', 'mac-yolo-safeguards', 'Reports');

const { MAC_YOLO_STRIPE_CATALOG: OFFERS } = require('./mac-yolo-stripe-provisioner');

const CURATED_PROSPECTS = [
  {
    label: 'Cline OSS Maintainers & Power Users',
    segment: 'ai-coding-agency',
    source: 'github-inbound',
    route: 'Partner Pilot ($3,000)',
    gross: '3000.00',
    score: 94,
    vertical: 'devtools',
    bounceRisk: 0.01,
    notes: 'High-volume autonomous coding loops; macOS simulator/build runaway protection',
  },
  {
    label: 'Continue.dev Enterprise Teams',
    segment: 'devtools-vendor',
    source: 'github-inbound',
    route: 'AI Agent Hardening Sprint ($1,500)',
    gross: '1500.00',
    score: 89,
    vertical: 'devtools',
    bounceRisk: 0.01,
    notes: 'IDE agent harness timeout + $10/mo metered API token budget guard',
  },
  {
    label: 'OpenHands Cloud & Local Operators',
    segment: 'ai-agency',
    source: 'github-inbound',
    route: 'Partner Pilot ($3,000)',
    gross: '3000.00',
    score: 92,
    vertical: 'agents',
    bounceRisk: 0.02,
    notes: 'Process-tree reaper + PreToolUse destructive command interdiction',
  },
  {
    label: 'Aider / SWE-agent Mac Fleet Leads',
    segment: 'consultancy',
    source: 'community-inbound',
    route: 'Agent Reliability Diagnostic ($499)',
    gross: '499.00',
    score: 85,
    vertical: 'agents',
    bounceRisk: 0.02,
    notes: 'Load average 307 prevention + local Ollama zero-spend fallback routing',
  },
  {
    label: 'LangGraph / CrewAI Production Studios',
    segment: 'ai-studio',
    source: 'inbound-partner',
    route: 'AI Agent Hardening Sprint ($1,500)',
    gross: '1500.00',
    score: 88,
    vertical: 'automation',
    bounceRisk: 0.02,
    notes: 'Multi-agent loop circuit breakers + Gurobi token-budget allocation',
  },
  {
    label: 'Cursor / Claude Code Agency Builders',
    segment: 'ai-agency',
    source: 'community-inbound',
    route: 'Agent Reliability Diagnostic ($499)',
    gross: '499.00',
    score: 84,
    vertical: 'automation',
    bounceRisk: 0.01,
    notes: 'Self-serve $49 Corporate-Expense Kit + $499 20-min diagnostic upsell',
  },
];

const CHANNELS_9 = [
  {
    channel: 'hackernews',
    title: 'Show HN: mac-yolo-safeguards – OS-level runaway kill & $10/mo token cap for Mac coding agents',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://iganapolsky.gumroad.com/l/odrkon',
  },
  {
    channel: 'linkedin',
    title: 'How an AI coding agent hit load average 307 on my Mac (and the 4-piece OS guard that stopped it)',
    cta: 'https://iganapolsky.gumroad.com/l/vcrho',
    paidCta: 'https://cal.com/igor-g-kvqxfo/30min',
  },
  {
    channel: 'x',
    title: 'Your AI coding agent does not need another prompt rule—it needs an OS-level process-group reaper + hard $10/mo token ceiling.',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://iganapolsky.gumroad.com/l/odrkon',
  },
  {
    channel: 'bluesky',
    title: 'Open-sourced mac-yolo-safeguards: process-tree timeout reaper, simulator runaway guard, and Gurobi-certified $10/mo token budget gate.',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://iganapolsky.gumroad.com/l/odrkon',
  },
  {
    channel: 'devto',
    title: 'Stopping AI Agent Runaway Loops on macOS: Process Groups, LaunchAgents, and Hard Token Caps',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://iganapolsky.gumroad.com/l/vcrho',
  },
  {
    channel: 'threads',
    title: '256 iOS Simulator processes, load average 307, fan like a jet engine. Built an MIT macOS guard kit so YOLO agents never freeze a Mac again.',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://iganapolsky.gumroad.com/l/odrkon',
  },
  {
    channel: 'skool',
    title: 'Free MIT kit + $49 drop-in reliability bundle for agencies running Claude Code / Cursor / Hermes unattended on Macs',
    cta: 'https://iganapolsky.gumroad.com/l/vcrho',
    paidCta: 'https://cal.com/igor-g-kvqxfo/30min',
  },
  {
    channel: 'reddit_draft',
    title: '[Draft-Only] Post-mortem: Load Average 307 from an unattended coding agent on macOS and how we fenced it at the OS layer',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://cal.com/igor-g-kvqxfo/30min',
  },
  {
    channel: 'zyvop',
    title: 'mac-yolo-safeguards: OS-level runaway protection, MCP server & native macOS menu bar guard for autonomous coding agents',
    cta: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
    paidCta: 'https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y',
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function findLatestPriorTsv(opsDir, prefix, date) {
  if (!fs.existsSync(opsDir)) return null;
  const re = new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2})\\.tsv$`);
  const candidates = fs
    .readdirSync(opsDir)
    .map((name) => {
      const m = name.match(re);
      return m && m[1] < date ? { date: m[1], fullPath: path.join(opsDir, name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates.length > 0 ? candidates[candidates.length - 1].fullPath : null;
}

function readBodyLines(tsvPath) {
  if (!tsvPath || !fs.existsSync(tsvPath)) return [];
  const raw = fs.readFileSync(tsvPath, 'utf8').trim();
  return raw ? raw.split(/\r?\n/).slice(1).filter((l) => l.trim()) : [];
}

function mergeTsvCarryForward(headerLine, defaultLines, priorTsvPath, currentTsvPath = null, { preferDefaultsForKeys = null } = {}) {
  const defaultByKey = new Map();
  for (const line of defaultLines) {
    const key = line.split('\t')[0];
    if (key) defaultByKey.set(key, line);
  }
  const currentByKey = new Map();
  for (const line of readBodyLines(currentTsvPath)) {
    const key = line.split('\t')[0];
    if (key) currentByKey.set(key, line);
  }

  const seenKeys = new Set();
  const merged = [];
  const pushRow = (key, line) => {
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    if (preferDefaultsForKeys && preferDefaultsForKeys.has(key) && defaultByKey.has(key)) {
      merged.push(defaultByKey.get(key));
    } else if (currentByKey.has(key)) {
      merged.push(currentByKey.get(key));
    } else {
      merged.push(line);
    }
  };

  for (const line of readBodyLines(priorTsvPath)) {
    pushRow(line.split('\t')[0], line);
  }
  for (const [key, line] of currentByKey.entries()) {
    pushRow(key, line);
  }
  for (const [key, line] of defaultByKey.entries()) {
    pushRow(key, line);
  }
  return `${[headerLine, ...merged].join('\n')}\n`;
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf8');
    if (existing === content) return;
  }
  fs.writeFileSync(filePath, content, { mode: 0o600 });
}

function seedOpsFiles(date, opsDir = OPS_DIR) {
  fs.mkdirSync(opsDir, { recursive: true, mode: 0o700 });

  const stripeMapPath = path.join(opsDir, `stripe-offer-map-${date}.tsv`);
  const stripeHeader = [
    'offer',
    'status',
    'stripe_product_id',
    'stripe_price_id',
    'payment_link_url',
    'stripe_amount_usd',
  ].join('\t');
  const stripeLines = OFFERS.map((o) =>
    [
      o.offer,
      o.status,
      o.stripe_product_id,
      o.stripe_price_id,
      o.payment_link_url,
      o.stripe_amount_usd,
    ].join('\t'),
  );
  const priorStripe = findLatestPriorTsv(opsDir, 'stripe-offer-map', date);
  const offerKeys = new Set(OFFERS.map((o) => o.offer));
  writeIfChanged(
    stripeMapPath,
    mergeTsvCarryForward(stripeHeader, stripeLines, priorStripe, stripeMapPath, {
      preferDefaultsForKeys: offerKeys,
    }),
  );

  const prospectsPath = path.join(opsDir, `prospects-${date}.tsv`);
  const prospectsHeader = [
    'prospect_label',
    'segment',
    'source',
    'agent_stack',
    'repeated_failure',
    'business_cost',
    'budget_owner',
    'workflow_context',
    'needs_repeatability',
    'notes',
  ].join('\t');
  const prospectLines = CURATED_PROSPECTS.map((p) =>
    [
      p.label,
      p.segment,
      p.source,
      'yes',
      'yes',
      'yes',
      'yes',
      'yes',
      'yes',
      p.notes,
    ].join('\t'),
  );
  const priorProspects = findLatestPriorTsv(opsDir, 'prospects', date);
  writeIfChanged(
    prospectsPath,
    mergeTsvCarryForward(prospectsHeader, prospectLines, priorProspects, prospectsPath),
  );

  const pipelinePath = path.join(opsDir, `pipeline-status-${date}.tsv`);
  const pipelineHeader = [
    'prospect_label',
    'stage',
    'route',
    'gross_potential_usd',
    'last_touch',
    'next_action',
    'notes',
  ].join('\t');
  const pipelineLines = CURATED_PROSPECTS.map((p) =>
    [
      p.label,
      'ready',
      p.route,
      p.gross,
      date,
      'send_governed_intro_or_partner_offer',
      p.notes,
    ].join('\t'),
  );
  const priorPipeline = findLatestPriorTsv(opsDir, 'pipeline-status', date);
  writeIfChanged(
    pipelinePath,
    mergeTsvCarryForward(pipelineHeader, pipelineLines, priorPipeline, pipelinePath),
  );
  return { stripeMapPath, prospectsPath, pipelinePath };
}

function runCmd(bin, args, cwd = REPO, envExtra = {}) {
  const res = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      MAC_YOLO_OPS_DIR: OPS_DIR,
      REVENUE_DIR: OPS_DIR,
      ...envExtra,
    },
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
  };
}

function runGurobiOutreachOptimization(date) {
  const prospectsFile = path.join(OPS_DIR, `gurobi-prospects-${date}.json`);
  const payload = {
    daily_capacity: 5,
    min_score: 80,
    prospects: CURATED_PROSPECTS.map((p, idx) => ({
      id: `prospect_${idx + 1}`,
      label: p.label,
      score: p.score,
      cost_units: 1,
      vertical: p.vertical,
      bounce_risk: p.bounceRisk,
    })),
  };
  fs.writeFileSync(prospectsFile, JSON.stringify(payload, null, 2), { mode: 0o600 });

  const gurobiBin = path.join(HOME, '.local', 'bin', 'gurobi-fleet');
  const bin = fs.existsSync(gurobiBin) ? gurobiBin : path.join(REPO, 'bin', 'gurobi-fleet');
  const res = runCmd(bin, ['outreach', '--file', prospectsFile, '--capacity', '5', '--json']);
  if (!res.ok) return { ok: false, error: res.stderr || res.stdout };
  try {
    return JSON.parse(res.stdout);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function main() {
  const jsonMode = process.argv.includes('--json');
  const skipSiblings = process.argv.includes('--skip-siblings');
  const startedAt = new Date().toISOString();
  const date = todayIso();

  const seeded = seedOpsFiles(date);
  const ds = runCmd(process.execPath, ['tools/pipeline-data-science.js', '--date', date]);
  const readiness = runCmd(process.execPath, [
    'tools/payment-readiness.js',
    '--date',
    date,
    '--stripe-offer-map',
    seeded.stripeMapPath,
    '--pipeline',
    seeded.pipelinePath,
  ]);
  const revLoop = runCmd(process.execPath, [
    'tools/revenue-autonomous-loop.js',
    '--fast',
    '--no-ntfy',
    '--json',
  ]);
  const conversionCheck = runCmd(process.execPath, ['tools/public-conversion-check.js']);
  const safetyScan = runCmd(process.execPath, ['tools/public-funnel-safety-scan.js']);
  const gurobiBatch = runGurobiOutreachOptimization(date);
  const { runAllChecks: runSupabaseIbmGuardrails } = require('./supabase-ibm-agent-guardrails');
  const supabaseIbm = runSupabaseIbmGuardrails();
  const { runAllTailscaleSteals } = require('./tailscale-october-steals');
  const tailscaleSteals = runAllTailscaleSteals();
  const { runWabiSalesOperations } = require('./wabi-sales-operations-engine');
  let wabiSalesOps;
  try {
    wabiSalesOps = runWabiSalesOperations();
  } catch (e) {
    wabiSalesOps = { ok: false, error: e.message };
  }
  const { runLinkedIn24x7Autopilot } = require('./linkedin-24x7-autopilot');
  let linkedinAutopilot;
  try {
    linkedinAutopilot = runLinkedIn24x7Autopilot({ date });
  } catch (e) {
    linkedinAutopilot = { ok: false, error: e.message };
  }
  const { runBlueskyFlowstateMonetizer } = require('./bluesky-flowstate-monetizer');
  let blueskyFlowstate;
  try {
    blueskyFlowstate = runBlueskyFlowstateMonetizer({ date });
  } catch (e) {
    blueskyFlowstate = { ok: false, error: e.message };
  }
  const { runMarketplacePublisher } = require('./ai-connectors-marketplace-publisher');
  let aiConnectorsMarketplace;
  try {
    aiConnectorsMarketplace = runMarketplacePublisher({ packZip: true });
  } catch (e) {
    aiConnectorsMarketplace = { ok: false, error: e.message };
  }
  let thumbgateMakeMoney = { skipped: true };
  let dayglassMakeMoney = { skipped: true };
  if (!skipSiblings) {
    const tgDir = path.join(HOME, 'workspace', 'ThumbGate');
    if (fs.existsSync(path.join(tgDir, 'package.json'))) {
      const tg = runCmd('npm', ['run', 'make:money'], tgDir);
      thumbgateMakeMoney = { ok: tg.ok, status: tg.status };
    }
    const dgScript = path.join(HOME, 'workspace', 'dayglass', 'scripts', 'dayglass_make_money.py');
    if (fs.existsSync(dgScript)) {
      const dg = runCmd('python3', [dgScript], path.dirname(dgScript));
      dayglassMakeMoney = { ok: dg.ok, status: dg.status };
    }
  }

  const mergedPipelineRows = readBodyLines(seeded.pipelinePath).map((line) => {
    const cols = line.split('\t');
    return { stage: cols[1] || 'ready', gross: Number(cols[3] || 0) || 0 };
  });
  const openPipelineRows = mergedPipelineRows.filter(
    (r) => !['paid', 'lost'].includes(r.stage),
  );
  const totalPipelineGrossUsd =
    openPipelineRows.length > 0
      ? openPipelineRows.reduce((acc, r) => acc + r.gross, 0)
      : CURATED_PROSPECTS.reduce((acc, p) => acc + Number(p.gross), 0);
  const priceReadyOk =
    readiness.ok &&
    readiness.stdout.includes('Missing/invalid-price open gross: $0.00') &&
    !readiness.stdout.includes('Stripe-price-ready open gross: $0.00');
  const receipt = {
    schema: 'mac-yolo-safeguards/24x7-promote-receipt/v1',
    ok:
      ds.ok &&
      priceReadyOk &&
      revLoop.ok &&
      conversionCheck.ok &&
      safetyScan.ok &&
      Boolean(gurobiBatch.ok) &&
      Boolean(supabaseIbm.ok) &&
      Boolean(tailscaleSteals.ok) &&
      Boolean(wabiSalesOps.ok) &&
      Boolean(linkedinAutopilot.ok) &&
      Boolean(blueskyFlowstate.ok) &&
      Boolean(aiConnectorsMarketplace.ok),
    startedAt,
    completedAt: new Date().toISOString(),
    date,
    outboundCashSpendUsd: 0,
    offersCount: OFFERS.length,
    curatedProspectsCount: openPipelineRows.length || CURATED_PROSPECTS.length,
    openPipelineGrossUsd: totalPipelineGrossUsd,
    channelsStagedCount: CHANNELS_9.length,
    channels: CHANNELS_9,
    gates: {
      pipelineDataScience: ds.ok,
      paymentReadiness: priceReadyOk,
      revenueAutonomousLoop: revLoop.ok,
      publicConversionCheck: conversionCheck.ok,
      publicFunnelSafetyScan: safetyScan.ok,
      gurobiOutreachOptimal: Boolean(gurobiBatch.ok && gurobiBatch.status === 'OPTIMAL'),
      declarativeSchemaAndConfusionGate: Boolean(supabaseIbm.ok),
      tailscaleOctoberStealsGate: Boolean(tailscaleSteals.ok),
      wabiSalesOperationsGate: Boolean(wabiSalesOps.ok),
      linkedin24x7AutopilotGate: Boolean(linkedinAutopilot.ok),
      blueskyFlowstateGate: Boolean(blueskyFlowstate.ok),
      aiConnectorsMarketplaceGate: Boolean(aiConnectorsMarketplace.ok),
    },
    gurobiProof: gurobiBatch.proof || null,
    supabaseIbmSummary: {
      ok: supabaseIbm.ok,
      declarativeTablesSynced: supabaseIbm.pillars.declarativeSchemaDrift.tableCount,
      confusionScore: supabaseIbm.pillars.ibmPreProductionConfusionGate.confusionScore,
      plsIncrementalUpliftPct: supabaseIbm.pillars.productLedSalesTriggerEngine.incrementalUpliftPct,
      zeroHitlCollapsedProcesses: supabaseIbm.pillars.zeroHitlCollapsedProcesses.collapsedZeroHitlCount,
    },
    tailscaleStealsSummary: {
      ok: tailscaleSteals.ok,
      scurgeryByteIdentical: tailscaleSteals.pillars.scurgeryByteIdenticalPolicy.byteIdentical,
      magicRouteSelected: tailscaleSteals.pillars.magicRouteStickyConnector.selected,
      tailwormSafe: tailscaleSteals.pillars.tailwormSafeguards.ok,
      sweMuxAttentionPanes: tailscaleSteals.pillars.sweMuxAttentionRanker.attentionCount,
    },
    wabiSalesOpsSummary: {
      ok: wabiSalesOps.ok,
      error: wabiSalesOps.error || null,
      recommendedTier: wabiSalesOps.wabiPillars?.collaborativeDealPlan?.recommendedTier ?? null,
      activeRecoveryWindowsCount: wabiSalesOps.wabiPillars?.deadlineRecoveryScanner?.activeWindowsCount ?? 0,
    },
    linkedin24x7Summary: {
      ok: Boolean(linkedinAutopilot.ok),
      campaign: linkedinAutopilot.dailyPostCandidate?.campaign ?? null,
      gateDecision: linkedinAutopilot.dailyPostCandidate?.gateDecision ?? null,
      alreadyPostedToday: Boolean(linkedinAutopilot.crossRepoState?.alreadyPostedToday),
      proactiveFeedReadyCount: linkedinAutopilot.proactiveFeedEngagementReadyCount ?? 0,
    },
    blueskyFlowstateSummary: {
      ok: Boolean(blueskyFlowstate.ok),
      campaign: blueskyFlowstate.gate?.campaign ?? null,
      gateDecision: blueskyFlowstate.gate?.decision ?? null,
      alreadyPostedToday: Boolean(blueskyFlowstate.alreadyPostedToday),
      funnelHtmlPresent: Boolean(blueskyFlowstate.flowstateFunnel?.funnelHtmlPresent),
    },
    aiConnectorsMarketplaceSummary: {
      ok: Boolean(aiConnectorsMarketplace.ok),
      platformsCount: aiConnectorsMarketplace.marketplaceValidation?.platformsCount ?? 0,
      toolsCount: aiConnectorsMarketplace.mcpToolValidation?.toolsCount ?? 0,
      allToolsHaveTitleAndSafetyHints: Boolean(aiConnectorsMarketplace.mcpToolValidation?.allToolsHaveTitleAndSafetyHints),
      bundleZipPath: aiConnectorsMarketplace.bundle?.zipPath ?? null,
      bundleSha256: aiConnectorsMarketplace.bundle?.sha256 ?? null,
    },
    siblingEngines: {
      thumbgateMakeMoney,
      dayglassMakeMoney,
    },
  };

  fs.mkdirSync(RECEIPT_DIR, { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`);

  if (fs.existsSync(path.dirname(VAULT_REPORT_DIR))) {
    fs.mkdirSync(VAULT_REPORT_DIR, { recursive: true });
    const md = [
      `# mac-yolo-safeguards 24/7 Promotion & Revenue Status (${date})`,
      '',
      `- **Updated**: ${receipt.completedAt}`,
      `- **Overall Status**: ${receipt.ok ? 'HEALTHY (ALL GATES PASS)' : 'DEGRADED'}`,
      `- **Outbound Spend**: \`$0.00\``,
      `- **Open Curated Pipeline**: \`$${totalPipelineGrossUsd.toFixed(2)}\` across ${CURATED_PROSPECTS.length} high-intent agent targets`,
      `- **Gurobi Outreach Batch**: \`${gurobiBatch.status || 'N/A'}\` (ObjVal=${gurobiBatch.objective ?? 'N/A'}, certified=${Boolean(gurobiBatch.proof?.certified_optimal)})`,
      '',
      '## Self-Serve & Advisory Value Ladder',
      '',
      '| Tier | Offer | Price | Live Checkout / Booking URL |',
      '|---|---|---:|---|',
      ...OFFERS.map((o) => `| ${o.offer} | ${o.route} | \`$${o.stripe_amount_usd}\` | ${o.payment_link_url} |`),
      '',
      '## 9-Channel Promotion Beats Staged',
      '',
      '| Channel | Hook / Title | Primary CTA | Paid Ladder CTA |',
      '|---|---|---|---|',
      ...CHANNELS_9.map((c) => `| \`${c.channel}\` | ${c.title} | ${c.cta} | ${c.paidCta} |`),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(VAULT_REPORT_DIR, '24x7-Promotion-Status.md'), md);
  }

  if (jsonMode) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`[mac-yolo-24x7-promote] ok=${receipt.ok} date=${date} pipeline=$${totalPipelineGrossUsd.toFixed(2)} channels=${CHANNELS_9.length} gurobi=${gurobiBatch.status}`);
  }
  process.exit(receipt.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  OFFERS,
  CURATED_PROSPECTS,
  CHANNELS_9,
  seedOpsFiles,
  findLatestPriorTsv,
  mergeTsvCarryForward,
};
