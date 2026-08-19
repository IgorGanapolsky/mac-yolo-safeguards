#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const stack = require('../tools/hosted-computer-stack');

const REPO = path.resolve(__dirname, '..');

function tmpRepo(layout) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-computer-stack-'));
  for (const [rel, body] of Object.entries(layout)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return root;
}

function run() {
  assert.strictEqual(stack.MONTHLY_CAP_USD, 10);
  assert.strictEqual(stack.SCHEMA, 'hosted-computer-stack/v1');
  console.log('PASS 1 invariants: $10 cap, schema');

  const factory = stack.inspectFactory(REPO);
  assert.strictEqual(factory.kind, 'CHAT_COMPLETIONS_ONLY');
  assert.strictEqual(factory.hasChatCompletions, true);
  assert.strictEqual(factory.hasGuiOrSandbox, false);
  const runnerSrc = fs.readFileSync(path.join(REPO, factory.file), 'utf8');
  assert.ok(runnerSrc.includes('/chat/completions'));
  assert.ok(!/\b(playwright|puppeteer|cua|e2b|openclaw)\b/i.test(runnerSrc));
  console.log('PASS 2 live factory is chat/completions only (falsifier: no playwright/cua/e2b in runner)');

  const hands = stack.inspectHands(REPO);
  assert.strictEqual(hands.kind, 'POLICY_CUE_NOT_DRIVER');
  assert.strictEqual(hands.hasCueRegex, true);
  assert.strictEqual(hands.hasHealthUrlProbe, true);
  assert.strictEqual(hands.hasGuiDriver, false);
  console.log('PASS 3 live hands is POLICY_CUE_NOT_DRIVER (regex + health URL, not Cua)');

  const manager = stack.inspectManager(REPO);
  assert.strictEqual(manager.kind, 'PARTIAL_ECONOMIC_ROUTER_NOT_WIRED_TO_HOSTED_RUNNER');
  assert.strictEqual(manager.exists, true);
  assert.strictEqual(manager.wiredToHostedRunner, false);
  console.log('PASS 4 live manager is an unwired economic router, not OpenClaw');

  const doc = stack.runDoctor({ repoRoot: REPO });
  assert.strictEqual(doc.weAreOpenClaw, false);
  assert.strictEqual(doc.weAreE2B, false);
  assert.strictEqual(doc.weAreCua, false);
  assert.strictEqual(doc.weArePerplexityComputer, false);
  assert.strictEqual(doc.weAreEigent, false);
  assert.strictEqual(doc.weAreChatGPTComputerHistory, false);
  assert.strictEqual(doc.weAreWindowsRecall, false);
  assert.strictEqual(doc.weAreMacKeylogger, false);
  assert.strictEqual(doc.clonePresent, false);
  assert.strictEqual(doc.status, 'NOT_A_COMPUTER_CLONE');
  assert.strictEqual(doc.product, 'hosted-hermes-chat-on-fenced-vps');
  assert.strictEqual(doc.counsel.expandHostedApp, 'PAUSE');
  assert.strictEqual(doc.counsel.computerHistory, 'FAIL_CLOSED');
  assert.strictEqual(doc.history.kind, 'FAIL_CLOSED');
  assert.strictEqual(doc.history.writesUnencrypted, false);
  assert.strictEqual(doc.leastPrivilege.canReadSecrets, false);
  assert.strictEqual(doc.leastPrivilege.ingestForeignSlackOrDms, false);
  assert.strictEqual(doc.leastPrivilege.capturesKeystrokes, false);
  assert.strictEqual(doc.leastPrivilege.fencedVpsDoesNotGrabCursor, true);
  console.log('PASS 5 doctor: we are not them; hosted chat is the product; not Computer History');

  const clone = stack.classify('install openclaw and wire cua onto e2b');
  assert.strictEqual(clone.place, 'refuse');
  assert.strictEqual(clone.reason, 'CLONE_FORBIDDEN');
  const handsAsk = stack.classify('use playwright to click Gmail');
  assert.strictEqual(handsAsk.place, 'refuse');
  assert.strictEqual(handsAsk.reason, 'HANDS_GAP_POLICY_CUE_NOT_DRIVER');
  const job = stack.classify('Give hosted Hermes a job: watch CI overnight');
  assert.strictEqual(job.place, 'hosted-chat');
  assert.strictEqual(job.reason, 'EXISTING_10USD_HOSTED_HERMES');
  const ordinary = stack.classify('implement a TypeScript helper');
  assert.strictEqual(ordinary.place, 'local');
  const hist = stack.classify('enable ChatGPT Computer History and learn from everything you do on your computer');
  assert.strictEqual(hist.place, 'refuse');
  assert.strictEqual(hist.reason, 'COMPUTER_HISTORY_FORBIDDEN');
  assert.strictEqual(hist.weAreChatGPTComputerHistory, false);
  const recall = stack.classify('turn on Windows Recall screenshots');
  assert.strictEqual(recall.place, 'refuse');
  assert.strictEqual(recall.reason, 'COMPUTER_HISTORY_FORBIDDEN');
  const pulse = stack.classify('Pulse memory of every app');
  assert.strictEqual(pulse.place, 'refuse');
  const chrome = stack.classify('Chrome extension that watches typing');
  assert.strictEqual(chrome.place, 'refuse');
  const otel = stack.classify('OTel of keystrokes');
  assert.strictEqual(otel.place, 'refuse');
  const helper = stack.classify('enable macOS input capture');
  assert.strictEqual(helper.place, 'refuse');
  assert.strictEqual(helper.reason, 'MACOS_INPUT_CAPTURE_DENIED');
  console.log('PASS 6 route: clone/hands/Computer History refuse; hosted job stays existing $10 chat');

  const fake = tmpRepo({
    'services/hermes-cloud-runner/server.js': 'async function execute() { return playwright.click(); }',
    'apps/hermes-control-plane/lib/cloud-tool-policy.ts': 'const HOSTED_BROWSER_CUE_RES = []; import "trycua";',
    'apps/hermes-control-plane/lib/hosted-apphost.ts': 'export function browserHealthUrl() { return "http://cua"; }\ntrycua\n',
    'tools/hermes-economic-router.js': 'module.exports = {};',
  });
  assert.notStrictEqual(stack.inspectFactory(fake).kind, 'CHAT_COMPLETIONS_ONLY');
  assert.strictEqual(stack.inspectHands(fake).kind, 'DRIVER_PRESENT');
  fs.rmSync(fake, { recursive: true, force: true });
  console.log('PASS 7 inspect is not hardcoded: a Cua-shaped tree is reported as a driver');

  const cli = path.join(REPO, 'bin', 'hosted-computer');
  const cliDoc = spawnSync(cli, ['doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliDoc.status, 0, cliDoc.stderr);
  const parsed = JSON.parse(cliDoc.stdout);
  assert.strictEqual(parsed.status, 'NOT_A_COMPUTER_CLONE');
  assert.strictEqual(parsed.factory.kind, 'CHAT_COMPLETIONS_ONLY');
  const cliRefuse = spawnSync(cli, ['route', 'deploy OpenClaw on this Mac'], { encoding: 'utf8' });
  assert.strictEqual(cliRefuse.status, 2, cliRefuse.stderr);
  assert.strictEqual(JSON.parse(cliRefuse.stdout).reason, 'CLONE_FORBIDDEN');
  const cliJob = spawnSync(cli, ['route', 'watch CI on hosted Hermes'], { encoding: 'utf8' });
  assert.strictEqual(cliJob.status, 0, cliJob.stderr);
  assert.strictEqual(JSON.parse(cliJob.stdout).place, 'hosted-chat');
  console.log('PASS 8 CLI doctor + refuse/exit 2 + hosted-chat');

  const cliHist = spawnSync(cli, ['route', 'ship Computer History'], { encoding: 'utf8' });
  assert.strictEqual(cliHist.status, 2, cliHist.stderr);
  assert.strictEqual(JSON.parse(cliHist.stdout).reason, 'COMPUTER_HISTORY_FORBIDDEN');
  const cliCapture = spawnSync(cli, ['route', 'enable macOS input capture'], { encoding: 'utf8' });
  assert.strictEqual(cliCapture.status, 2, cliCapture.stderr);
  assert.strictEqual(JSON.parse(cliCapture.stdout).reason, 'MACOS_INPUT_CAPTURE_DENIED');
  const cliText = spawnSync(cli, ['doctor'], { encoding: 'utf8' });
  assert.strictEqual(cliText.status, 0, cliText.stderr);
  assert.match(cliText.stdout, /ChatGPT Computer History/);
  assert.match(cliText.stdout, /Windows Recall/);
  assert.match(cliText.stdout, /does not grab the cursor/);
  assert.doesNotMatch(cliText.stdout, /learn from everything you do on your computer/);
  console.log('PASS 9 CLI refuses Computer History and input-capture helpers');

  const liveHistory = stack.inspectHistory(REPO);
  assert.strictEqual(liveHistory.kind, 'FAIL_CLOSED');
  assert.strictEqual(liveHistory.writesUnencrypted, false);
  const fakeHist = tmpRepo({
    'tools/mac-computer-history.js': 'fs.writeFileSync(HISTORY_FILE, JSON.stringify(events)); // computer_history.json',
  });
  assert.strictEqual(stack.inspectHistory(fakeHist).kind, 'UNENCRYPTED_COMPUTER_HISTORY');
  fs.rmSync(fakeHist, { recursive: true, force: true });
  console.log('PASS 10 history inspect fail-closed; unencrypted store is reported');

  console.log('\nALL HOSTED-COMPUTER-STACK TESTS PASSED (10/10)');
}

run();
