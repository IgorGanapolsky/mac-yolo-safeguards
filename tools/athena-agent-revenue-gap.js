#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REPO = path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards');

const ATHENA_CLAIMS = {
  source: 'ConnexAI Athena AI agents page',
  category: 'AI customer engagement and contact-center agents',
  outcomes: [
    'prospect, qualify leads, book meetings, and resolve customer enquiries',
    'voice, chat, email, and digital channels',
    '10x more interactions handled',
    '70% decrease in handle times',
    '65% reduction of inbound calls',
    '24/7 AI agent availability',
    '5x faster data processing',
  ],
};

const CAPABILITIES = [
  {
    key: 'buyer_signal_monitoring',
    weight: 14,
    title: 'Buyer-signal monitoring',
    evidencePatterns: ['outreach-queue', 'prospect-score', 'buyer', 'qualified'],
    action: 'Keep Hermes focused on explicit AI-agent reliability pain: VAPI, Retell, GHL, n8n, Meta lead sync, webhook, and support automation failures.',
  },
  {
    key: 'qualification_pipeline',
    weight: 14,
    title: 'Qualification and pipeline state',
    evidencePatterns: ['pipeline-status', 'pipeline-summary', 'qualification', 'prospect-score'],
    action: 'Require every lead to have stage, pain, assets, offer fit, next action, and payment ask eligibility before Hermes spends more cycles.',
  },
  {
    key: 'payment_path',
    weight: 12,
    title: 'Payment and checkout path',
    evidencePatterns: ['stripe', 'checkout', 'cleared payment', 'record-cleared-payment'],
    action: 'Only ask for payment when a lead has a matched $499 diagnostic scope and a verified payment route.',
  },
  {
    key: 'fulfillment_offer',
    weight: 14,
    title: 'Reliability diagnostic fulfillment',
    evidencePatterns: ['Reliability Diagnostic', 'hardening sprint', 'diagnostic', 'root cause', 'proof artifacts'],
    action: 'Keep the first offer as AI Automation Workflow Reliability Diagnostic, then upsell repair sprint and monitoring.',
  },
  {
    key: 'omnichannel_surfaces',
    weight: 10,
    title: 'Omnichannel operating surfaces',
    evidencePatterns: ['Telegram', 'Gmail', 'Reddit', 'Skool', 'LinkedIn', 'email', 'DM'],
    action: 'Use Hermes for async text channels only; no phone calls. Route voice-agent buyers into written log/repo/trace diagnostics.',
  },
  {
    key: 'metrics_and_observability',
    weight: 12,
    title: 'Metrics and observability',
    evidencePatterns: ['revenue-control', 'captured_cents', 'readiness', 'self-harness', 'observability', 'latency', 'cost'],
    action: 'Track next-dollar distance, paid obligations, model cost, failure recurrence, and delivery acceptance before claiming progress.',
  },
  {
    key: 'continuous_improvement',
    weight: 12,
    title: 'Continuous improvement loop',
    evidencePatterns: ['self-harness', 'memory-readiness', 'lessons', 'RAG', 'reflection', 'postmortem'],
    action: 'Feed repeated Hermes failures into self-harness and local memory rather than repeating approval prompts.',
  },
  {
    key: 'call_center_ai_lane',
    weight: 12,
    title: 'Voice/support-agent reliability lane',
    evidencePatterns: ['Retell', 'VAPI', 'GHL', 'WhatsApp', 'Meta API', 'support automation', 'voice'],
    action: 'Create a specific lead lane for voice/support AI teams: stuck calls, lead sync drops, bad handoffs, calendar failures, and webhook loops.',
  },
];

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    json: false,
    failOnLow: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--fail-on-low') args.failOnLow = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readText(filePath, maxBytes = 500000) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch (_) {
    return '';
  }
}

function collectCorpus(repo) {
  const files = [
    'docs/REVENUE-OPERATING-PLAN.md',
    'docs/SALES-CLOSE-KIT.md',
    'docs/AI-AGENT-HARDENING.md',
    'docs/MEDIA-CONTENT-INGESTION.md',
    'tools/sofa-monetization-lane.js',
    'tools/revenue-control-checks.js',
    'tools/hermes-self-harness.js',
    'tools/tencentdb-memory-readiness.js',
    'tools/merge-gateway-readiness.js',
    'tools/hermes-contribution-opportunities.js',
    'tools/outreach-queue.js',
    'tools/prospect-score.js',
    'tools/pipeline-summary.js',
    'tools/record-cleared-payment.js',
  ];
  const entries = files.map((relativePath) => ({
    relativePath,
    text: readText(path.join(repo, relativePath)),
  }));
  return entries.filter((entry) => entry.text.length > 0);
}

function statusForCapability(capability, corpusText) {
  const matchedPatterns = capability.evidencePatterns.filter((pattern) => new RegExp(escapeRegExp(pattern), 'i').test(corpusText));
  return {
    ...capability,
    matchedPatterns,
    pass: matchedPatterns.length > 0,
    status: matchedPatterns.length > 0 ? 'OK' : 'GAP',
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPlan(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const corpus = options.corpus || collectCorpus(repo);
  const corpusText = corpus.map((entry) => `${entry.relativePath}\n${entry.text}`).join('\n');
  const capabilities = CAPABILITIES.map((capability) => statusForCapability(capability, corpusText));
  const maxScore = CAPABILITIES.reduce((sum, capability) => sum + capability.weight, 0);
  const passedScore = capabilities.reduce((sum, capability) => sum + (capability.pass ? capability.weight : 0), 0);
  const readiness = Math.round((passedScore / maxScore) * 100);
  const gaps = capabilities.filter((capability) => !capability.pass).map((capability) => capability.title);

  const positioning = {
    category: 'AI support and voice-agent reliability diagnostics',
    buyer: 'teams already using AI agents for support, voice, lead qualification, booking, GHL/CRM sync, or webhook-heavy automation',
    hook: 'Your AI agents already promise 24/7 resolution and lower handle time; I find the reliability leak stopping that from showing up in production.',
    paidAsk: '$499 diagnostic for one repeated failure pattern, credited toward a scoped repair sprint when there is an obvious fix.',
    disqualify: [
      'no live workflow or logs',
      'wants a generic chatbot build',
      'requires phone calls before written assets',
      'no owner access to the failing workflow',
    ],
  };

  return {
    checkedAt: new Date().toISOString(),
    source: ATHENA_CLAIMS,
    repo,
    readiness,
    corpusFiles: corpus.map((entry) => entry.relativePath),
    capabilities,
    gaps,
    positioning,
    nextActions: [
      'Prioritize prospects mentioning broken VAPI, Retell, GHL, WhatsApp, Meta lead sync, n8n, booking, or support-agent workflows.',
      'Reply with one useful technical observation first, then ask for logs/repo/trace only when the pain matches the diagnostic.',
      'Do not compete with ConnexAI as a full contact-center platform; sell reliability diagnostics for teams whose AI agent platform is already failing.',
      'Add a private lead tag ai_support_voice_reliability so Hermes can score these buyers separately from generic AI-agent chatter.',
      'Use outcome metrics in copy: interactions handled, handle time, inbound deflection, availability, processing speed, and failure recurrence.',
    ],
  };
}

function render(plan) {
  const lines = [
    '# Athena-Style Agent Revenue Gap',
    '',
    `Readiness: ${plan.readiness}/100`,
    `Category: ${plan.positioning.category}`,
    `Buyer: ${plan.positioning.buyer}`,
    `Hook: ${plan.positioning.hook}`,
    `Paid ask: ${plan.positioning.paidAsk}`,
    '',
    '## ConnexAI Outcome Frame',
    '',
    ...plan.source.outcomes.map((outcome) => `- ${outcome}`),
    '',
    '## Capability Check',
    '',
  ];
  for (const capability of plan.capabilities) {
    lines.push(`- ${capability.status} ${capability.title} (${capability.weight})`);
    lines.push(`  Action: ${capability.action}`);
  }
  if (plan.gaps.length) {
    lines.push('', '## Gaps', '');
    for (const gap of plan.gaps) lines.push(`- ${gap}`);
  }
  lines.push('', '## Next Actions', '');
  for (const action of plan.nextActions) lines.push(`- ${action}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/athena-agent-revenue-gap.js [--json] [--fail-on-low]');
    return;
  }
  const plan = buildPlan(args);
  if (args.json) console.log(JSON.stringify(plan, null, 2));
  else process.stdout.write(render(plan));
  if (args.failOnLow && plan.readiness < 70) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  ATHENA_CLAIMS,
  CAPABILITIES,
  buildPlan,
  collectCorpus,
  parseArgs,
  render,
};
