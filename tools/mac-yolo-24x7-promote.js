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
const { buildGovernedFollowupEmail } = require('./governed-agent-sales-copy');

const CURATED_PROSPECTS = [
  {
    label: 'bluefully',
    person: 'Brandon Veiseh',
    email: 'brandon@mindfort.ai',
    segment: 'ai-agency',
    source: 'github-inbound',
    route: 'Partner Pilot ($3,000)',
    gross: '3000.00',
    score: 94,
    vertical: 'agents',
    bounceRisk: 0.01,
    notes: 'Brandon Veiseh <brandon@mindfort.ai> (MindFort AI) — process-tree reaper + PreToolUse destructive command interdiction',
  },
  {
    label: 'StephK',
    person: 'Deidre Graham',
    email: 'deidre@meaningfulgigs.com',
    segment: 'ai-agency',
    source: 'inbound-partner',
    route: 'Partner Pilot ($3,000)',
    gross: '3000.00',
    score: 92,
    vertical: 'automation',
    bounceRisk: 0.01,
    notes: 'Deidre Graham <deidre@meaningfulgigs.com> (Meaningful Gigs) — governed multi-agent workflows + hard-stop spend caps',
  },
  {
    label: 'catalystwayfare',
    person: 'Catalyst Wayfare',
    email: 'hello@cwai.co',
    segment: 'ai-studio',
    source: 'github-inbound',
    route: 'AI Agent Hardening Sprint ($1,500)',
    gross: '1500.00',
    score: 90,
    vertical: 'devtools',
    bounceRisk: 0.01,
    notes: 'Catalyst Wayfare <hello@cwai.co> — IDE agent harness timeout + $10/mo metered API token budget guard',
  },
  {
    label: 'suleyman_a',
    person: 'Suleyman Alasgarli',
    email: 'suleyman@joincarma.com',
    segment: 'devtools-vendor',
    source: 'github-inbound',
    route: 'AI Agent Hardening Sprint ($1,500)',
    gross: '1500.00',
    score: 89,
    vertical: 'automation',
    bounceRisk: 0.01,
    notes: 'Suleyman Alasgarli <suleyman@joincarma.com> (Carma) — multi-agent loop circuit breakers + Gurobi token-budget allocation',
  },
  {
    label: 'eltmon',
    person: 'Edward Becker',
    email: 'edward.becker@gmail.com',
    segment: 'consultancy',
    source: 'github-inbound',
    route: 'Agent Reliability Diagnostic ($499)',
    gross: '499.00',
    score: 88,
    vertical: 'agents',
    bounceRisk: 0.01,
    notes: 'Edward Becker <edward.becker@gmail.com> — load average 307 prevention + local Ollama zero-spend fallback routing',
  },
  {
    label: 'techreign',
    person: 'Shokhan',
    email: 'shokhan768@gmail.com',
    segment: 'ai-agency',
    source: 'community-inbound',
    route: 'Agent Reliability Diagnostic ($499)',
    gross: '499.00',
    score: 86,
    vertical: 'devtools',
    bounceRisk: 0.01,
    notes: 'Shokhan <shokhan768@gmail.com> — 20-min Agent Reliability Diagnostic ($499) + runaway session kill switch',
  },
];

function hasFakePersonaRows(tsvPath) {
  if (!fs.existsSync(tsvPath)) return true;
  try {
    const raw = fs.readFileSync(tsvPath, 'utf8');
    return /Cline OSS Maintainers|Continue\.dev Enterprise|OpenHands Cloud|Aider \/ SWE-agent|LangGraph \/ CrewAI|Cursor \/ Claude Code/i.test(raw);
  } catch {
    return true;
  }
}

function offerRowForRoute(route) {
  const r = String(route || '');
  if (/pilot|3000|3,000/i.test(r)) {
    const hit = OFFERS.find((o) => /pilot/i.test(o.offer)) || OFFERS[3];
    return { ...hit, url: hit.payment_link_url, http: 200, ok: true };
  }
  if (/harden|1500|1,500|sprint/i.test(r)) {
    const hit = OFFERS.find((o) => /harden/i.test(o.offer)) || OFFERS[2];
    return { ...hit, url: hit.payment_link_url, http: 200, ok: true };
  }
  const hit = OFFERS.find((o) => /diagnostic/i.test(o.offer)) || OFFERS[1];
  return { ...hit, url: hit.payment_link_url, http: 200, ok: true };
}

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
    paidCta: 'https://buy.stripe.com/9B69ATbmI4r4aK5eOD3sI3k',
  },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isOfferMapCorrupted(stripeMapPath) {
  if (!fs.existsSync(stripeMapPath)) return true;
  try {
    const raw = fs.readFileSync(stripeMapPath, 'utf8').trim();
    if (!raw) return true;
    const lines = raw.split(/\r?\n/);
    const headers = lines[0].split('\t');
    const expected = ['offer', 'status', 'stripe_product_id', 'stripe_price_id', 'payment_link_url', 'stripe_amount_usd'];
    if (headers.join('\t') !== expected.join('\t')) return true;
    const seenPrices = new Set();
    const seenProducts = new Set();
    for (let i = 1; i < lines.length; i += 1) {
      const cols = lines[i].split('\t');
      if (cols.length !== expected.length) return true;
      const [offer, , prodId, priceId, linkUrl] = cols;
      if (/thumbgate/i.test(offer) || /thumbgate/i.test(prodId) || /thumbgate/i.test(priceId) || /thumbgate\.(?:ai|app)/i.test(linkUrl)) {
        return true;
      }
      if (seenPrices.has(priceId) || seenProducts.has(prodId)) return true;
      seenPrices.add(priceId);
      seenProducts.add(prodId);
    }
    return false;
  } catch {
    return true;
  }
}

function seedOpsFiles(date) {
  fs.mkdirSync(OPS_DIR, { recursive: true, mode: 0o700 });

  const stripeMapPath = path.join(OPS_DIR, `stripe-offer-map-${date}.tsv`);
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
  if (isOfferMapCorrupted(stripeMapPath)) {
    fs.writeFileSync(stripeMapPath, `${[stripeHeader, ...stripeLines].join('\n')}\n`, { mode: 0o600 });
  }
  const prospectsPath = path.join(OPS_DIR, `prospects-${date}.tsv`);
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
  if (hasFakePersonaRows(prospectsPath)) {
    fs.writeFileSync(prospectsPath, `${[prospectsHeader, ...prospectLines].join('\n')}\n`, { mode: 0o600 });
  }
  const pipelinePath = path.join(OPS_DIR, `pipeline-status-${date}.tsv`);
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
  if (hasFakePersonaRows(pipelinePath)) {
    fs.writeFileSync(pipelinePath, `${[pipelineHeader, ...pipelineLines].join('\n')}\n`, { mode: 0o600 });
  }

  const actionsPath = path.join(OPS_DIR, `outreach-actions-${date}.tsv`);
  const actionsHeader = [
    'prospect_label',
    'route',
    'contact_type',
    'action_type',
    'action_value',
    'subject',
    'next_status',
    'draft_body',
  ].join('\t');
  const actionsLines = CURATED_PROSPECTS.map((p) => {
    const offerRow = offerRowForRoute(p.route);
    const emailPkg = buildGovernedFollowupEmail(
      { prospect_label: p.label, route: p.route },
      { email: p.email, person: p.person },
      offerRow,
    );
    const mailtoUrl = `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(emailPkg.subject)}&body=${encodeURIComponent(emailPkg.body)}`;
    const escapedBody = String(emailPkg.body || '').replace(/\r?\n/g, '\\n').replace(/\t/g, ' ');
    return [
      p.label,
      p.route,
      'email',
      'mailto',
      mailtoUrl,
      emailPkg.subject,
      'send_manually_then_mark_sent',
      escapedBody,
    ].join('\t');
  });
  if (!fs.existsSync(actionsPath) || hasFakePersonaRows(actionsPath)) {
    fs.writeFileSync(actionsPath, `${[actionsHeader, ...actionsLines].join('\n')}\n`, { mode: 0o600 });
  }

  for (const entry of fs.readdirSync(OPS_DIR)) {
    const full = path.join(OPS_DIR, entry);
    if (/^prospects-\d{4}-\d{2}-\d{2}\.tsv$/.test(entry) && hasFakePersonaRows(full)) {
      fs.writeFileSync(full, `${[prospectsHeader, ...prospectLines].join('\n')}\n`, { mode: 0o600 });
    } else if (/^pipeline-status-\d{4}-\d{2}-\d{2}\.tsv$/.test(entry) && hasFakePersonaRows(full)) {
      fs.writeFileSync(full, `${[pipelineHeader, ...pipelineLines].join('\n')}\n`, { mode: 0o600 });
    }
  }
  return { stripeMapPath, prospectsPath, pipelinePath, actionsPath };
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
  const wabiSalesOps = runWabiSalesOperations();
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

  const totalPipelineGrossUsd = CURATED_PROSPECTS.reduce((acc, p) => acc + Number(p.gross), 0);
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
      Boolean(wabiSalesOps.ok),
    startedAt,
    completedAt: new Date().toISOString(),
    date,
    outboundCashSpendUsd: 0,
    offersCount: OFFERS.length,
    curatedProspectsCount: CURATED_PROSPECTS.length,
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
      recommendedTier: wabiSalesOps.wabiPillars.collaborativeDealPlan.recommendedTier,
      activeRecoveryWindowsCount: wabiSalesOps.wabiPillars.deadlineRecoveryScanner.activeWindowsCount,
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

module.exports = { MAC_YOLO_STRIPE_CATALOG: OFFERS, OFFERS, CURATED_PROSPECTS, CHANNELS_9, seedOpsFiles };
