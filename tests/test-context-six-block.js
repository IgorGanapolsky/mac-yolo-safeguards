#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  BLOCK_IDS,
  LAYER_IDS,
  HOSTED_GOLD,
  HOSTED_BAD,
  honesty,
  connectors,
  assemble,
  validatePack,
  grade,
} = require('../tools/context-six-block');

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
assert.ok(!JSON.stringify(cons).toLowerCase().includes('chatgpt.com'));

const cloned = assemble();
cloned.clonedEverydayAi = true;
assert.strictEqual(validatePack(cloned).ok, false);

process.stdout.write('ok tests/test-context-six-block.js\n');
