#!/usr/bin/env node
'use strict';

/**
 * TNS 2026-08-26 steal (FORMAT, not a Perplexity Computer clone):
 *   "Probabilistic reasoning proposes the next action, and deterministic
 *    software decides whether to execute it."
 *   If the sandbox is unavailable, disable tools BEFORE any call.
 *   Permission is not asking a model in English to comply.
 *
 * Product: thumbgate.app hosted Hermes = $10/mo chat on a fenced VPS.
 * ECI: counsel_clearance false — do not expand into a Computer SKU or
 * net-new agent-governance engine. Complementary to Codex #2142.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = 'https://thenewstack.io/perplexity-agent-harness-security/';
const SCHEMA = 'hosted-authority-split/v1';
const MONTHLY_CAP_USD = 10;
const RUNNER_REL = 'services/hermes-cloud-runner/server.js';
const POLICY_REL = 'apps/hermes-control-plane/lib/cloud-tool-policy.ts';

function defaultRepoRoot() {
  return path.resolve(__dirname, '..');
}

function readRepoFile(repoRoot, rel) {
  try {
    return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  } catch {
    return '';
  }
}

function decide(proposal = {}) {
  const action = String(proposal.action || 'text').toLowerCase();
  if (action === 'text' || action === 'chat' || action === 'completion') {
    return {
      allow: true,
      executeTool: false,
      code: 'TEXT_OK',
      reason: 'Reasoning may produce text. Text is not a tool grant.',
    };
  }

  if (proposal.modelSaidSafe === true && proposal.codeApproved !== true) {
    return {
      allow: false,
      executeTool: false,
      code: 'MODEL_CANNOT_GRANT_AUTHORITY',
      reason: 'Permission is not asking a model in English to comply.',
    };
  }

  if (proposal.sandboxReady !== true) {
    return {
      allow: false,
      executeTool: false,
      code: 'SANDBOX_UNAVAILABLE',
      reason: 'Harness disables tool execution before any call when the sandbox is unavailable.',
    };
  }

  return {
    allow: false,
    executeTool: false,
    code: 'HOSTED_CHAT_NO_TOOLS',
    reason: 'thumbgate.app hosted Hermes is $10 chat + in-app approvals, not a Computer clone.',
  };
}

function inspectRunner(repoRoot = defaultRepoRoot()) {
  const src = readRepoFile(repoRoot, RUNNER_REL);
  const hasChat = src.includes('/chat/completions');
  const refusesTools = src.includes('AUTHORITY_DISABLED') && src.includes('assertNoToolAuthority');
  const stringifyLine = src.split('\n').find((line) => line.includes('JSON.stringify({ model:'));
  const sendsToolsArray = stringifyLine ? /\btools\b/.test(stringifyLine) : true;
  const hasGui = /\b(playwright|puppeteer|trycua|\bcua\b|\be2b\b|openclaw)\b/i.test(src);
  return {
    file: RUNNER_REL,
    hasChatCompletions: hasChat,
    refusesTools,
    sendsToolsArray,
    hasGuiDriver: hasGui,
    ok: hasChat && refusesTools && !sendsToolsArray && !hasGui,
  };
}

function inspectAdmissionPolicy(repoRoot = defaultRepoRoot()) {
  const src = readRepoFile(repoRoot, POLICY_REL);
  return {
    file: POLICY_REL,
    present: Boolean(src),
    isCode: src.includes('export function evaluateCloudPromptToolPolicy'),
  };
}

function runDoctor({ repoRoot = defaultRepoRoot() } = {}) {
  const runner = inspectRunner(repoRoot);
  const admission = inspectAdmissionPolicy(repoRoot);
  const weArePerplexityComputer = false;
  const ok = runner.ok && admission.isCode;
  return {
    schema: SCHEMA,
    source: SOURCE,
    product: 'hosted-hermes-chat-on-fenced-vps',
    monthlyCapUsd: MONTHLY_CAP_USD,
    weArePerplexityComputer,
    clonedSku: false,
    originTrialClaimed: false,
    eci: {
      counsel_clearance: false,
      net_new_governance_rnd: 'PAUSE',
      expand_hosted_app: 'PAUSE',
    },
    runner,
    admission,
    ok,
    status: ok ? 'AUTHORITY_IS_CODE' : 'AUTHORITY_GAP',
  };
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'doctor';
  if (cmd === 'decide') {
    const raw = argv[1] && !argv[1].startsWith('-') ? argv[1] : '{}';
    const proposal = JSON.parse(raw);
    const out = decide(proposal);
    console.log(JSON.stringify(out, null, 2));
    process.exitCode = out.executeTool === true ? 0 : out.code === 'TEXT_OK' ? 0 : 1;
    return;
  }
  const doc = runDoctor();
  if (argv.includes('--json') || cmd === 'doctor') {
    console.log(JSON.stringify(doc, null, 2));
  }
  process.exitCode = doc.ok ? 0 : 1;
}

module.exports = {
  SCHEMA,
  SOURCE,
  MONTHLY_CAP_USD,
  decide,
  inspectRunner,
  inspectAdmissionPolicy,
  runDoctor,
  main,
};

if (require.main === module) main();
