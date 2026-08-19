#!/usr/bin/env node
'use strict';

/**
 * Hosted Computer stack honesty — we are not Perplexity Computer,
 * and we are not ChatGPT Computer History, Windows Recall, or a Mac input logger.
 *
 * Source (public, format only):
 *   https://www.perplexity.ai/products/computer
 * Contrast (Futurism 2026-08-19): ChatGPT macOS Computer History records
 * local clicks / typing / "events". Files can contain sensitive info and
 * are NOT encrypted. Compared to Windows Recall.
 *
 * Transferable mechanic: a doctor that names layers from live files, not labels.
 * What this is NOT: OpenClaw, Eigent, E2B, trycua/Cua, Agent S,
 * ChatGPT Computer History, Windows Recall, a Mac input logger,
 * or a new hosted SKU.
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
const HISTORY_REL = 'tools/mac-computer-history.js';

const GUI_OR_SANDBOX_RE = /\b(playwright|puppeteer|selenium|trycua|\bcua\b|\be2b\b|openclaw|eigent|agent[\s-]?s)\b/i;

const CLONE_NAME_RE = /\b(openclaw|eigent|\be2b\b|trycua|\bcua\b|agent[\s-]?s)\b/i;
const CLONE_VERB_RE = /\b(install|deploy|clone|vendor|assemble|self-host|wire onto)\b/i;
const HANDS_ASK_RE = /\b(playwright|puppeteer|selenium|computer[ -]use|screenshot[ -]and[ -]click|click gmail|drive the desktop|mousemove)\b/i;
const HOSTED_JOB_RE = /\b(hosted hermes|watch ci|morning digest|long migration|give .{0,40} a job|put hosted hermes to work)\b/i;

const COMPUTER_HISTORY_PRODUCT_RE =
  /\b(chatgpt computer history|computer history|windows recall|mac keylogger|learn from everything you do on your computer|pulse memory of every app|chrome extension that watches typing|otel of keystrokes|recall screenshots)\b/i;
const INPUT_CAPTURE_HELPER_RE =
  /\b(enable macos input capture|capture (clicks|keystrokes)|record (clicks|keystrokes|input events)|input-capture helper)\b/i;

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

function inspectHistory(repoRoot = defaultRepoRoot()) {
  const src = readRepoFile(repoRoot, HISTORY_REL);
  const failClosed =
    /FAIL-CLOSED|FAIL_CLOSED|COMPUTER_HISTORY_DENIED/.test(src)
    && /weAreChatGPTComputerHistory:\s*false/.test(src)
    && /storesUnencryptedHistory:\s*false/.test(src);
  const writesUnencrypted =
    /computer_history\.json/.test(src)
    && /writeFileSync/.test(src)
    && !failClosed;
  let kind = 'MISSING_HISTORY_HELPER';
  if (src && writesUnencrypted) kind = 'UNENCRYPTED_COMPUTER_HISTORY';
  else if (src && failClosed) kind = 'FAIL_CLOSED';
  else if (src) kind = 'UNKNOWN_HISTORY_HELPER';
  return {
    file: HISTORY_REL,
    kind,
    writesUnencrypted,
    failClosed,
    canReadSecrets: false,
    ingestForeignSlackOrDms: false,
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
  const history = inspectHistory(repoRoot);
  const clonePresent = layersAreComputerClone(factory, hands, manager)
    || history.kind === 'UNENCRYPTED_COMPUTER_HISTORY';
  return {
    schema: SCHEMA,
    source: SOURCE,
    weAreOpenClaw: false,
    weAreEigent: false,
    weAreE2B: false,
    weAreCua: false,
    weArePerplexityComputer: false,
    weAreChatGPTComputerHistory: false,
    weAreWindowsRecall: false,
    weAreMacKeylogger: false,
    product: 'hosted-hermes-chat-on-fenced-vps',
    monthlyCapUsd: MONTHLY_CAP_USD,
    manager,
    factory,
    hands,
    history,
    leastPrivilege: {
      canReadSecrets: false,
      ingestForeignSlackOrDms: false,
      capturesKeystrokes: false,
      capturesClicks: false,
      buildsLocalActivityTimeline: false,
      learnsFromEverythingYouDo: false,
      fencedVpsDoesNotGrabCursor: true,
    },
    counsel: {
      expandHostedApp: 'PAUSE',
      netNewGovernanceRnd: 'PAUSE',
      computerHistory: 'FAIL_CLOSED',
    },
    clonePresent,
    status: clonePresent ? 'COMPUTER_CLONE_OR_HISTORY_PRESENT' : 'NOT_A_COMPUTER_CLONE',
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
  if (COMPUTER_HISTORY_PRODUCT_RE.test(text) || INPUT_CAPTURE_HELPER_RE.test(text)) {
    const reason = INPUT_CAPTURE_HELPER_RE.test(text)
      ? 'MACOS_INPUT_CAPTURE_DENIED'
      : 'COMPUTER_HISTORY_FORBIDDEN';
    return {
      place: 'refuse',
      reason,
      product: 'hosted-hermes-chat-on-fenced-vps',
      weAreChatGPTComputerHistory: false,
      weAreWindowsRecall: false,
      weAreMacKeylogger: false,
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
  let openaiLine = null;
  try {
    const { probeOpenAiComputerHistory } = require('./mac-computer-history');
    const probe = probeOpenAiComputerHistory();
    openaiLine = `  openaiOnThisMac=${probe.status} historyFiles=${(probe.historyLikeFiles || []).length} (Hermes weEnableCapture=false)`;
  } catch {
    openaiLine = null;
  }
  const lines = [
    `Hosted Computer stack: ${doc.status} (we are not OpenClaw/E2B/Cua/Perplexity Computer/ChatGPT Computer History/Windows Recall/a Mac keylogger)`,
    `  product=${doc.product} cap=$${doc.monthlyCapUsd}/mo`,
    `  manager=${doc.manager.kind}`,
    `  factory=${doc.factory.kind}`,
    `  hands=${doc.hands.kind}`,
    `  history=${doc.history.kind}`,
    `  leastPrivilege.canReadSecrets=${doc.leastPrivilege.canReadSecrets}`,
    `  fenced VPS does not grab the cursor`,
  ];
  if (openaiLine) lines.push(openaiLine);
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
  inspectHistory,
  inspectManager,
  main,
  runDoctor,
};
