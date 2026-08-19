#!/usr/bin/env node
'use strict';

/**
 * Hosted Computer stack honesty — we are not Perplexity Computer.
 *
 * Source (public, format only):
 *   https://www.perplexity.ai/products/computer
 *
 * Transferable mechanic: a doctor that names layers from live files, not labels.
 * What this is NOT: OpenClaw, Eigent, E2B, trycua/Cua, Agent S, or a new hosted SKU.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = 'https://www.perplexity.ai/products/computer';
const MONTHLY_CAP_USD = 10;
const SCHEMA = 'hosted-computer-stack/v1';

const FACTORY_REL = 'services/hermes-cloud-runner/server.js';
const HANDS_POLICY_REL = 'apps/hermes-control-plane/lib/cloud-tool-policy.ts';
const HANDS_HEALTH_REL = 'apps/hermes-control-plane/lib/hosted-apphost.ts';
const MANAGER_REL = 'tools/hermes-economic-router.js';

const GUI_OR_SANDBOX_RE = /\b(playwright|puppeteer|selenium|trycua|\bcua\b|\be2b\b|openclaw|eigent|agent[\s-]?s)\b/i;

const CLONE_NAME_RE = /\b(openclaw|eigent|\be2b\b|trycua|\bcua\b|agent[\s-]?s)\b/i;
const CLONE_VERB_RE = /\b(install|deploy|clone|vendor|assemble|self-host|wire onto)\b/i;
const HANDS_ASK_RE = /\b(playwright|puppeteer|selenium|computer[ -]use|screenshot[ -]and[ -]click|click gmail|drive the desktop|mousemove)\b/i;
const HOSTED_JOB_RE = /\b(hosted hermes|watch ci|morning digest|long migration|give .{0,40} a job|put hosted hermes to work)\b/i;

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

function fileExists(repoRoot, rel) {
  try {
    return fs.statSync(path.join(repoRoot, rel)).isFile();
  } catch {
    return false;
  }
}

function inspectFactory(repoRoot = defaultRepoRoot()) {
  const src = readRepoFile(repoRoot, FACTORY_REL);
  const hasChatCompletions = src.includes('/chat/completions');
  const hasExecute = /async function execute\(/.test(src);
  const hasGuiOrSandbox = GUI_OR_SANDBOX_RE.test(src);
  let kind = 'MISSING_RUNNER';
  if (hasGuiOrSandbox) kind = 'HAS_GUI_OR_SANDBOX_HINT';
  else if (hasChatCompletions && hasExecute) kind = 'CHAT_COMPLETIONS_ONLY';
  return {
    file: FACTORY_REL,
    kind,
    hasChatCompletions,
    hasExecute,
    hasGuiOrSandbox,
  };
}

function inspectHands(repoRoot = defaultRepoRoot()) {
  const policy = readRepoFile(repoRoot, HANDS_POLICY_REL);
  const apphost = readRepoFile(repoRoot, HANDS_HEALTH_REL);
  const hasCueRegex = policy.includes('HOSTED_BROWSER_CUE_RES');
  const hasHealthUrlProbe = /export function browserHealthUrl\(/.test(apphost);
  // Cue regex may mention playwright. Vendor names mean an actual driver.
  const driverHint = /\b(trycua|@trycua|\be2b\b|openclaw|eigent)\b/i.test(`${policy}\n${apphost}`);
  let kind = 'NO_HANDS_SURFACE';
  if (driverHint) kind = 'DRIVER_PRESENT';
  else if (hasCueRegex && hasHealthUrlProbe) kind = 'POLICY_CUE_NOT_DRIVER';
  return {
    policyFile: HANDS_POLICY_REL,
    healthFile: HANDS_HEALTH_REL,
    kind,
    hasCueRegex,
    hasHealthUrlProbe,
    hasGuiDriver: driverHint,
  };
}

function inspectManager(repoRoot = defaultRepoRoot()) {
  const exists = fileExists(repoRoot, MANAGER_REL);
  const runner = readRepoFile(repoRoot, FACTORY_REL);
  const wiredToHostedRunner = /hermes-economic-router/.test(runner);
  let kind = 'MISSING_ROUTER';
  if (exists && wiredToHostedRunner) kind = 'WIRED_TO_HOSTED_RUNNER';
  else if (exists) kind = 'PARTIAL_ECONOMIC_ROUTER_NOT_WIRED_TO_HOSTED_RUNNER';
  return {
    file: MANAGER_REL,
    kind,
    exists,
    wiredToHostedRunner,
  };
}

function layersAreComputerClone(factory, hands, manager) {
  return (
    factory.kind === 'HAS_GUI_OR_SANDBOX_HINT'
    || hands.kind === 'DRIVER_PRESENT'
    || manager.kind === 'WIRED_TO_HOSTED_RUNNER'
  );
}

function runDoctor(options = {}) {
  const repoRoot = options.repoRoot || defaultRepoRoot();
  const factory = inspectFactory(repoRoot);
  const hands = inspectHands(repoRoot);
  const manager = inspectManager(repoRoot);
  return {
    schema: SCHEMA,
    source: SOURCE,
    weAreOpenClaw: false,
    weAreEigent: false,
    weAreE2B: false,
    weAreCua: false,
    weArePerplexityComputer: false,
    product: 'hosted-hermes-chat-on-fenced-vps',
    monthlyCapUsd: MONTHLY_CAP_USD,
    manager,
    factory,
    hands,
    counsel: {
      expandHostedApp: 'PAUSE',
      netNewGovernanceRnd: 'PAUSE',
    },
    clonePresent: layersAreComputerClone(factory, hands, manager),
    status: 'NOT_A_COMPUTER_CLONE',
  };
}

function classify(prompt = '') {
  const text = String(prompt);
  if (CLONE_NAME_RE.test(text) && CLONE_VERB_RE.test(text)) {
    return {
      place: 'refuse',
      reason: 'CLONE_FORBIDDEN',
      product: 'hosted-hermes-chat-on-fenced-vps',
    };
  }
  if (HANDS_ASK_RE.test(text)) {
    return {
      place: 'refuse',
      reason: 'HANDS_GAP_POLICY_CUE_NOT_DRIVER',
      product: 'hosted-hermes-chat-on-fenced-vps',
    };
  }
  if (HOSTED_JOB_RE.test(text)) {
    return {
      place: 'hosted-chat',
      reason: 'EXISTING_10USD_HOSTED_HERMES',
      product: 'hosted-hermes-chat-on-fenced-vps',
    };
  }
  return {
    place: 'local',
    reason: 'default-local-fleet-not-computer',
    product: 'hosted-hermes-chat-on-fenced-vps',
  };
}

function formatDoctorText(doc) {
  const lines = [
    `Hosted Computer stack: ${doc.status} (we are not OpenClaw/E2B/Cua/Perplexity Computer)`,
    `  product=${doc.product} cap=$${doc.monthlyCapUsd}/mo`,
    `  manager=${doc.manager.kind}`,
    `  factory=${doc.factory.kind}`,
    `  hands=${doc.hands.kind}`,
  ];
  return lines.join('\n');
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const cmd = argv.find((a) => !a.startsWith('--')) || 'doctor';
  if (cmd === 'route') {
    const prompt = argv.filter((a) => a !== 'route' && a !== '--json').join(' ');
    const decision = classify(prompt);
    const payload = JSON.stringify(decision, null, 2);
    console.log(payload);
    if (decision.place === 'refuse') process.exitCode = 2;
    return decision;
  }
  const doc = runDoctor();
  if (json) {
    console.log(JSON.stringify(doc, null, 2));
  } else {
    console.log(formatDoctorText(doc));
  }
  return doc;
}

if (require.main === module) {
  main();
}

module.exports = {
  SCHEMA,
  SOURCE,
  MONTHLY_CAP_USD,
  classify,
  inspectFactory,
  inspectHands,
  inspectManager,
  main,
  runDoctor,
};
