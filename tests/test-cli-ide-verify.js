#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  honesty,
  QUESTIONS,
  LAYERS,
  gradeProposal,
  demoProposal,
  main,
} = require('../tools/cli-ide-verify');

const h = honesty();
assert.strictEqual(h.clonedSonar, false);
assert.strictEqual(h.sonarqubeMcp, false);
assert.strictEqual(h.sonarCliSku, false);
assert.strictEqual(h.dualEditCodexContextContract2126, false);
assert.strictEqual(QUESTIONS.length, 4);
assert.strictEqual(LAYERS.find((l) => l.id === 'ci').firstLine, false);
assert.strictEqual(LAYERS.find((l) => l.id === 'local').firstLine, true);

const gold = gradeProposal(demoProposal());
assert.strictEqual(gold.ok, true, JSON.stringify(gold));
assert.deepStrictEqual(gold.surfaces, ['cli', 'ide']);
assert.strictEqual(gold.liveClaim, false);

const polished = gradeProposal({
  ...demoProposal(),
  tests: [],
  hasDiff: true,
});
assert.strictEqual(polished.ok, false);
assert.ok(polished.missing.includes('polished_diff_not_proof'));
assert.ok(polished.missing.includes('tests'));

const ciFirst = gradeProposal({ ...demoProposal(), ciAsFirstLine: true });
assert.strictEqual(ciFirst.ok, false);
assert.ok(ciFirst.missing.includes('ci_is_backstop'));

const curlLive = gradeProposal({
  ...demoProposal(),
  liveClaim: true,
  curlAsLiveProof: true,
});
assert.strictEqual(curlLive.ok, false);
assert.ok(curlLive.missing.includes('curl_is_not_live'));

const findings = gradeProposal({ ...demoProposal(), patternGateFindings: 2 });
assert.strictEqual(findings.ok, false);
assert.ok(findings.missing.includes('known_issue'));

const unpaired = gradeProposal({
  ...demoProposal(),
  changedFiles: ['tools/cli-ide-verify.js'],
  tests: [{ command: 'node tests/test-unrelated.js', exit: 0 }],
});
assert.strictEqual(unpaired.ok, false);
assert.ok(unpaired.missing.includes('paired_test'));

const stolenReceipt = gradeProposal({ schema: 'agent-verification-receipt/v1', stage: 'merge' });
assert.strictEqual(stolenReceipt.ok, false);
assert.ok(stolenReceipt.missing.includes('dual_edit_codex_receipt'));

assert.strictEqual(main(['--demo', '--json']), 0);

const js = fs.readFileSync(path.join(__dirname, '../tools/cli-ide-verify.js'), 'utf8');
assert.doesNotMatch(js, /require\(['"]\.\/coding-context-pack/);
assert.doesNotMatch(js, /require\(['"]\.\/context-vault/);
assert.match(js, /dualEditCodexContextContract2126/);
assert.match(js, /clonedSonar/);

const skill = fs.readFileSync(
  path.join(__dirname, '../.agents/skills/cli-ide-verify/SKILL.md'),
  'utf8',
);
assert.match(skill, /^Weak:/m);
assert.match(skill, /^Gold:/m);
assert.match(skill, /## Rubric/);
assert.doesNotMatch(skill, /sonarqube\.com\/buy/i);

console.log('test-cli-ide-verify: PASS');
