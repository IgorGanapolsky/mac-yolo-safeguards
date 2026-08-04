'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTRACTS, validateInterfaces, checkContract } = require('../tools/retrieval-interface-contracts');

test('contracts declare mesh layers and owners', () => {
  assert.ok(CONTRACTS.length >= 5);
  for (const c of CONTRACTS) {
    assert.ok(c.id && c.owner && c.layer && Array.isArray(c.requiredPaths));
  }
  const layers = new Set(CONTRACTS.map((c) => c.layer));
  assert.ok(layers.has('serving'));
  assert.ok(layers.has('canonical') || layers.has('projection'));
});

test('checkContract fails closed on missing path', () => {
  const r = checkContract({
    id: 'x.missing',
    owner: 't',
    layer: 'serving',
    requiredPaths: ['/definitely/not/a/real/path-xyz'],
    description: 'x',
  });
  assert.equal(r.ok, false);
  assert.equal(r.missing.length, 1);
});

test('validateInterfaces returns stable report shape', () => {
  const report = validateInterfaces({
    contracts: [
      {
        id: 'self',
        owner: 't',
        layer: 'governance',
        requiredPaths: [require('path').join(__dirname, '../tools/retrieval-interface-contracts.js')],
        description: 'self',
      },
    ],
  });
  assert.equal(report.ok, true);
  assert.equal(report.contractCount, 1);
  assert.equal(report.failed, 0);
});
