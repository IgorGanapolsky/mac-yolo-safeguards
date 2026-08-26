#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const split = require('../tools/hosted-authority-split');
const REPO = path.resolve(__dirname, '..');
const BIN = path.join(REPO, 'bin/hosted-authority');

function run() {
  assert.strictEqual(split.MONTHLY_CAP_USD, 10);
  assert.strictEqual(split.SCHEMA, 'hosted-authority-split/v1');
  assert.ok(split.SOURCE.includes('perplexity-agent-harness-security'));
  console.log('PASS 1 invariants');

  const text = split.decide({ action: 'text' });
  assert.strictEqual(text.code, 'TEXT_OK');
  assert.strictEqual(text.executeTool, false);
  assert.strictEqual(text.allow, true);

  const english = split.decide({
    action: 'tool_call',
    tool: 'bash',
    modelSaidSafe: true,
    sandboxReady: true,
    codeApproved: false,
  });
  assert.strictEqual(english.code, 'MODEL_CANNOT_GRANT_AUTHORITY');
  assert.strictEqual(english.executeTool, false);

  const noBox = split.decide({ action: 'tool_call', tool: 'bash', sandboxReady: false });
  assert.strictEqual(noBox.code, 'SANDBOX_UNAVAILABLE');
  assert.strictEqual(noBox.executeTool, false);

  const evenIfBoxed = split.decide({ action: 'tool_call', tool: 'bash', sandboxReady: true, codeApproved: true });
  assert.strictEqual(evenIfBoxed.code, 'HOSTED_CHAT_NO_TOOLS');
  assert.strictEqual(evenIfBoxed.executeTool, false);
  console.log('PASS 2 decide: text ok; English is not authority; no sandbox; hosted never executes tools');

  const doc = split.runDoctor({ repoRoot: REPO });
  assert.strictEqual(doc.ok, true);
  assert.strictEqual(doc.status, 'AUTHORITY_IS_CODE');
  assert.strictEqual(doc.weArePerplexityComputer, false);
  assert.strictEqual(doc.clonedSku, false);
  assert.strictEqual(doc.runner.refusesTools, true);
  assert.strictEqual(doc.runner.sendsToolsArray, false);
  assert.strictEqual(doc.runner.hasGuiDriver, false);
  assert.strictEqual(doc.admission.isCode, true);
  assert.strictEqual(doc.eci.counsel_clearance, false);
  console.log('PASS 3 doctor: live runner refuses tools; admission is code');

  const doctorCli = spawnSync(process.execPath, [BIN, 'doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(doctorCli.status, 0, doctorCli.stderr);
  const doctorOut = JSON.parse(doctorCli.stdout);
  assert.strictEqual(doctorOut.ok, true);

  const denyCli = spawnSync(process.execPath, [BIN, 'decide', JSON.stringify({ action: 'tool_call', sandboxReady: false })], {
    encoding: 'utf8',
  });
  assert.strictEqual(denyCli.status, 1, denyCli.stderr);
  assert.strictEqual(JSON.parse(denyCli.stdout).code, 'SANDBOX_UNAVAILABLE');
  console.log('PASS 4 CLI doctor 0 / tool-call 1');

  console.log('test-hosted-authority-split: PASS');
}

run();
