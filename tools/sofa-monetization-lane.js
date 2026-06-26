#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const DEFAULT_BASE_URL = 'https://agents.stackoverflow.com';
const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards', 'sofa-monetization');

const usage = `Usage:
  node tools/sofa-monetization-lane.js [--base-url URL] [--out-dir dir] [--json]

Sets up the Hermes monetization lane for Stack Overflow for Agents:
- reads public SOFA context pages
- checks whether authenticated API posting is configured
- emits a sellable Hermes Agent Reliability Audit offer
- emits contribution, outreach, and reply-monitoring actions

This tool does not post to SOFA, send outreach, mutate Stripe, or claim revenue.`;

const CONTEXT_PATHS = ['/llms.txt', '/skill.md', '/contribute.md'];

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.SOFA_BASE_URL || DEFAULT_BASE_URL,
    outDir: DEFAULT_OUT_DIR,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base-url') args.baseUrl = requireValue(argv, ++i, arg).replace(/\/+$/, '');
    else if (arg === '--out-dir') args.outDir = requireValue(argv, ++i, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function requestText(url, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = https.get(url, {
      timeout: timeoutMs,
      headers: {
        accept: 'text/markdown,text/plain,*/*',
        'user-agent': 'mac-yolo-safeguards-sofa-monetization/1.0',
      },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          resolve({ ok: false, status: res.statusCode, body: body.slice(0, 1000) });
          return;
        }
        resolve({ ok: true, status: res.statusCode, body });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

function credentialCandidates(env = process.env, home = os.homedir()) {
  const candidates = [];
  if (env.SOFA_API_KEY) {
    candidates.push({ source: 'SOFA_API_KEY', configured: true });
  }
  const localCreds = path.join(home, '.sofa', 'credentials.json');
  if (fs.existsSync(localCreds)) {
    candidates.push({ source: localCreds, configured: true });
  }
  return candidates;
}

function inferSignals(contexts) {
  const joined = contexts.map((item) => item.body || '').join('\n').toLowerCase();
  return {
    publicKnowledgeExchange: /knowledge exchange/.test(joined),
    requiresVerificationLoop: /verify|verification/.test(joined),
    supportsContributionApi: /post\s+\/api\/posts|create posts|reply|vote/.test(joined),
    requiresApiKeyForAgents: /authorization:\s*bearer|api key/.test(joined),
    safeContributionGuardrails: /strip identifiers|secrets|private|human review|link guardrail/.test(joined),
  };
}

function scoreLane(signals, credentials) {
  let score = 0;
  if (signals.publicKnowledgeExchange) score += 15;
  if (signals.requiresVerificationLoop) score += 20;
  if (signals.supportsContributionApi) score += 20;
  if (signals.safeContributionGuardrails) score += 15;
  if (credentials.length > 0) score += 20;
  if (signals.requiresApiKeyForAgents && credentials.length === 0) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function buildOffer(signals) {
  return {
    sku: 'hermes-agent-reliability-audit',
    priceUsd: 300,
    buyer: 'teams building or operating AI agents that stall, hallucinate, lose tool state, or lack proof loops',
    promise: 'Find the first revenue-killing agent reliability leak and return one verified fix path with proof artifacts.',
    diagnostic: [
      'Webhook/session delivery check',
      'Tool-call timeout and stuck-turn audit',
      'Context-window and model-routing check',
      'Verification-loop and post-task contribution check',
      'Next-dollar score instrumentation check',
    ],
    proofAssets: [
      'before/after gateway or agent-state evidence',
      'one failing-to-passing local test or command',
      'one reusable SOFA-ready TIL/blueprint draft when the lesson is generic',
    ],
    rationale: signals.requiresVerificationLoop
      ? 'SOFA rewards verified agent-operation knowledge; Hermes can monetize by selling verification and reliability fixes, then recycling generic lessons into reputation and inbound demand.'
      : 'SOFA appears relevant, but local context fetch did not prove the verification loop.',
  };
}

function buildActions({ baseUrl, signals, credentials, score }) {
  const actions = [
    {
      priority: 1,
      lane: 'productize',
      action: 'Package Hermes Agent Reliability Audit as the $300 offer for AI-agent operators.',
      proof: 'offer packet includes buyer, promise, diagnostic scope, and proof assets',
    },
    {
      priority: 2,
      lane: 'distribution',
      action: 'Use SOFA search/contribution workflow to find agent-stall, webhook, tool-timeout, and verification-loop threads; reply only with generalized evidence-backed guidance.',
      proof: signals.supportsContributionApi ? 'SOFA API contribution workflow detected in /skill.md' : 'SOFA API workflow not proven',
    },
    {
      priority: 3,
      lane: 'authority',
      action: 'Convert each non-private Hermes fix into one SOFA TIL or blueprint draft after local verification.',
      proof: signals.safeContributionGuardrails ? 'contribution abstraction and review guardrails detected in /contribute.md' : 'contribution guardrails not proven',
    },
    {
      priority: 4,
      lane: 'revenue',
      action: 'Route interested operators to the existing $300 checkout only after a public problem statement matches the audit scope.',
      proof: 'keeps SOFA useful; avoids spam and links only when buyer intent exists in a direct conversation',
    },
  ];
  if (credentials.length === 0) {
    actions.unshift({
      priority: 0,
      lane: 'setup',
      action: `Create/store SOFA API credentials through ${baseUrl}/api/onboarding before automated search/post workflows.`,
      proof: 'no SOFA_API_KEY or ~/.sofa/credentials.json detected',
    });
  }
  if (score < 60) {
    actions.push({
      priority: 5,
      lane: 'validation',
      action: 'Do not rely on SOFA as a primary lead channel until context/API readiness reaches 60/100.',
      proof: `current readiness score ${score}/100`,
    });
  }
  return actions;
}

function renderMarkdown(report) {
  const lines = [
    '# SOFA Hermes Monetization Lane',
    '',
    `Base URL: ${report.baseUrl}`,
    `Readiness score: ${report.score}/100`,
    `Credentials configured: ${report.credentials.length > 0 ? 'yes' : 'no'}`,
    '',
    '## Offer',
    '',
    `SKU: ${report.offer.sku}`,
    `Price: $${report.offer.priceUsd}`,
    `Buyer: ${report.offer.buyer}`,
    `Promise: ${report.offer.promise}`,
    '',
    '## Diagnostic Scope',
    '',
    ...report.offer.diagnostic.map((item) => `- ${item}`),
    '',
    '## Actions',
    '',
    ...report.actions.map((item) => `- P${item.priority} ${item.lane}: ${item.action} Proof: ${item.proof}`),
    '',
    '## Context Checks',
    '',
    ...report.contexts.map((item) => `- ${item.ok ? 'PASS' : 'FAIL'} ${item.path} status=${item.status || 'n/a'}`),
  ];
  return `${lines.join('\n')}\n`;
}

async function collect(options = {}) {
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const fetcher = options.fetcher || requestText;
  const contexts = [];
  for (const contextPath of CONTEXT_PATHS) {
    const result = await fetcher(`${baseUrl}${contextPath}`);
    contexts.push({
      path: contextPath,
      ok: Boolean(result.ok),
      status: result.status || null,
      error: result.error || null,
      chars: result.body ? result.body.length : 0,
      body: result.body || '',
    });
  }
  const credentials = credentialCandidates(options.env || process.env, options.home || os.homedir());
  const signals = inferSignals(contexts);
  const score = scoreLane(signals, credentials);
  const offer = buildOffer(signals);
  const actions = buildActions({ baseUrl, signals, credentials, score });
  return {
    checkedAt: new Date().toISOString(),
    baseUrl,
    score,
    signals,
    credentials,
    contexts: contexts.map(({ body, ...rest }) => rest),
    offer,
    actions,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }
  const report = await collect(args);
  fs.mkdirSync(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, 'latest.json');
  const mdPath = path.join(args.outDir, 'latest.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));
  const output = { ...report, artifacts: { json: jsonPath, markdown: mdPath } };
  if (args.json) console.log(JSON.stringify(output, null, 2));
  else process.stdout.write(renderMarkdown(output));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    console.error('');
    console.error(usage);
    process.exit(2);
  });
}

module.exports = {
  CONTEXT_PATHS,
  buildActions,
  buildOffer,
  collect,
  credentialCandidates,
  inferSignals,
  parseArgs,
  renderMarkdown,
  scoreLane,
};
