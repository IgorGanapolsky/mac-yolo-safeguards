#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { reviewJudgment, SOURCE } = require('../tools/agents-judgment-calls-gate');

function ids(report) {
  return report.findings.map((item) => item.id);
}

function kept() {
  return {
    task: 'recommend whether to roll out the subsidy',
    optionA: 'roll out',
    optionB: 'discontinue',
    choice: 'A',
    prior: 'A',
    agentLean: 'B',
    caseForA: 'The local table shows enrolled yield above the board margin.',
    caseForB: 'Yield per operating cost stays under that margin, so discontinue is also reasonable.',
    reason: 'I keep roll out because the local table clears the margin.',
    agentArgument: 'Discontinue, because one season is thin ground for a subsidy.',
    localEvidence: 'read coop-table.csv enrolled yield margin cleared',
    creditedAgent: false,
  };
}

function main() {
  const source = fs.readFileSync(path.join(__dirname, '../tools/agents-judgment-calls-gate.js'), 'utf8');
  assert.strictEqual(SOURCE, 'https://www.anthropic.com/research/agents-judgment-calls');
  assert.ok(!/execSync|writeFile|appendFile|judgment-deferral-audit/.test(source));
  assert.ok(source.includes('measuredDeferral: null'));
  assert.ok(source.includes('calledModel: false'));

  const independent = reviewJudgment(kept());
  assert.strictEqual(independent.ok, true);
  assert.strictEqual(independent.judgment, true);
  assert.strictEqual(independent.measuredDeferral, null);
  assert.strictEqual(independent.calledModel, false);

  const bareMerge = reviewJudgment({ task: 'merge the pull request' });
  assert.strictEqual(bareMerge.ok, false);
  for (const id of ['options_missing', 'one_sided', 'choice_missing', 'prior_missing', 'lean_missing']) {
    assert.ok(ids(bareMerge).includes(id), id);
  }

  const switched = reviewJudgment({
    ...kept(),
    choice: 'B',
    prior: 'A',
    agentLean: 'B',
    reason: 'Discontinue, because one season is thin ground for a subsidy.',
    localEvidence: '',
    creditedAgent: false,
  });
  assert.ok(ids(switched).includes('signoff_without_evidence'));
  assert.ok(ids(switched).includes('switched_to_lean'));
  assert.ok(ids(switched).includes('uncited_agent_wording'));
  assert.strictEqual(switched.measuredDeferral, null);

  const switchedClear = reviewJudgment({
    ...kept(),
    choice: 'B',
    prior: 'A',
    agentLean: 'B',
    reason: 'The fresh run of the yield script exited 2, so I changed my prior.',
    localEvidence: 'node scripts/yield-check.js exit 2',
    creditedAgent: true,
  });
  assert.strictEqual(switchedClear.ok, true);

  const copiedEvidence = reviewJudgment({
    ...kept(),
    choice: 'B',
    prior: 'A',
    agentLean: 'B',
    reason: 'The fresh run failed.',
    localEvidence: 'Discontinue, because one season is thin ground for a subsidy.',
    creditedAgent: true,
  });
  assert.ok(ids(copiedEvidence).includes('evidence_is_agent_text'));

  const sameModel = reviewJudgment({
    ...kept(),
    choice: 'B',
    prior: 'none',
    agentLean: 'B',
    reason: 'The yield script exited 2.',
    localEvidence: 'node scripts/yield-check.js exit 2',
    creditedAgent: true,
    agentModel: 'opus',
    secondModel: 'Opus',
  });
  assert.ok(ids(sameModel).includes('same_model_second_check'));

  const vendor = reviewJudgment({
    ...kept(),
    reason: 'Analysts defer 86% of the time, so follow the lean.',
  });
  assert.ok(ids(vendor).includes('vendor_study_claim'));
  assert.strictEqual(vendor.measuredDeferral, null);

  const typo = reviewJudgment({ task: 'fix the typo in the readme', reason: 'spelling' });
  assert.strictEqual(typo.ok, true);
  assert.strictEqual(typo.judgment, false);

  const oneSided = reviewJudgment({
    ...kept(),
    caseForB: kept().caseForA,
  });
  assert.ok(ids(oneSided).includes('one_sided'));

  const cli = spawnSync(process.execPath, ['tools/agents-judgment-calls-gate.js', '--json'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
  });
  assert.strictEqual(cli.status, 0);
  const host = JSON.parse(cli.stdout);
  assert.strictEqual(host.calledModel, false);
  assert.strictEqual(host.measuredDeferral, null);
  assert.ok(!cli.stdout.includes('86%'));
  assert.ok(!cli.stdout.includes('mode collapse'));

  console.log('test-agents-judgment-calls-gate: PASS');
}

main();
