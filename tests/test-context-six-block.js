#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  hostnameOf,
  hostIsOrSubdomain,
} = require('../tools/lib/safe-url-host');
const {
  BLOCK_IDS,
  LAYER_IDS,
  HOSTED_GOLD,
  HOSTED_BAD,
  honesty,
  connectors,
  hostedRubric,
  assemble,
  validatePack,
  grade,
  main,
} = require('../tools/context-six-block');

function mentionsHost(value, host) {
  const blob = JSON.stringify(value);
  const urls = blob.match(/https?:\/\/[^\s"'\\]+/gi) || [];
  for (const raw of urls) {
    if (hostIsOrSubdomain(hostnameOf(raw), host)) {
      return true;
    }
  }
  const tokens = blob.toLowerCase().split(/[^a-z0-9.-]+/);
  return tokens.some((t) => t === host || t.endsWith('.' + host));
}

const h = honesty();
assert.strictEqual(h.clonedEverydayAi, false);
assert.strictEqual(h.clonedChatGptConnectors, false);
assert.strictEqual(h.dualEditContextVault, false);
assert.strictEqual(h.liveClaim, false);
assert.ok(h.steal.some((s) => /six named blocks/i.test(s)));

const pack = assemble({ task: 'hosted_copy' });
assert.strictEqual(pack.status, 'PACKED');
for (const id of BLOCK_IDS) {
  assert.ok(pack.blocks[id], `missing block ${id}`);
}
for (const id of LAYER_IDS) {
  assert.ok(pack.layers[id], `missing layer ${id}`);
}

const ok = validatePack(pack);
assert.strictEqual(ok.ok, true, ok.reason);

const noExamples = assemble();
noExamples.blocks.examples = { gold: [] };
const badEx = validatePack(noExamples);
assert.strictEqual(badEx.ok, false);
assert.ok(badEx.missing.includes('examples.gold_concrete'));

const noRubric = assemble();
noRubric.blocks.rubric = {};
const badRu = validatePack(noRubric);
assert.strictEqual(badRu.ok, false);
assert.ok(badRu.missing.includes('rubric.mustInclude'));

const gold = grade(HOSTED_GOLD);
assert.strictEqual(gold.pass, true);
assert.strictEqual(gold.rubricFirst, true);
assert.deepStrictEqual(gold.failed, []);

const bad = grade(HOSTED_BAD);
assert.strictEqual(bad.pass, false);
assert.ok(bad.failed.some((f) => f.startsWith('forbidden:')));
assert.ok(bad.failed.some((f) => f.startsWith('missing:')));

const abstractOnly = validatePack({
  ...assemble(),
  blocks: {
    ...assemble().blocks,
    examples: { gold: [{ id: 'abstract', text: 'write well', why: 'vague' }] },
  },
});
assert.strictEqual(abstractOnly.ok, false);

const cons = connectors();
assert.ok(cons.every((c) => c.use && c.not));
assert.ok(cons.some((c) => /coding-context-pack/.test(c.use)));
assert.ok(!mentionsHost(cons, 'chatgpt.com'));

const cloned = assemble();
cloned.clonedEverydayAi = true;
assert.strictEqual(validatePack(cloned).ok, false);

const guard = assemble({ task: 'guard_fix' });
assert.strictEqual(validatePack(guard).ok, true);
const guardGold = guard.blocks.examples.gold[0].text;
assert.strictEqual(grade(guardGold, guard.blocks.rubric).pass, true);
assert.strictEqual(grade(guardGold, hostedRubric()).pass, false);

const emptyFile = path.join(os.tmpdir(), `six-block-empty-${process.pid}.txt`);
fs.writeFileSync(emptyFile, '');
const origWrite = process.stdout.write;
process.stdout.write = () => true;
try {
  assert.strictEqual(main(['--grade-file', emptyFile, '--json']), 2);
} finally {
  process.stdout.write = origWrite;
  fs.unlinkSync(emptyFile);
}

process.stdout.write('ok tests/test-context-six-block.js\n');
