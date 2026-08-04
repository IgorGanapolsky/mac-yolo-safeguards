'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreRerankStack } = require('../tools/rerank-stack-scorecard');

test('rerank scorecard self-test path scores A+ without live embeds', async () => {
  const report = await scoreRerankStack({ live: false });
  // Without live, live-* gates are skipped as ok=true in scoreRerankStack
  assert.equal(report.hardFail, false);
  assert.equal(report.aPlus, true);
  assert.equal(report.tenTen, true);
  assert.equal(report.scoreOutOf10, 10);
  assert.ok(report.gates.find((g) => g.id === 'self-test-inversion')?.ok);
  assert.ok(report.gates.find((g) => g.id === 'dual-path-wired')?.ok);
});
