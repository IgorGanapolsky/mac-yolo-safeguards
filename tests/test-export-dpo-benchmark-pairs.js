'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { exportDpoPairs } = require('../tools/export-dpo-benchmark-pairs');

test('exportDpoPairs creates JSONL DPO training pairs file', () => {
  const root = path.join(__dirname, '..');
  const tempOutput = path.join(root, '.thumbgate', 'test_dpo_pairs.jsonl');

  const res = exportDpoPairs({ cwd: root, outputPath: tempOutput });

  assert.ok(res.totalExported > 0);
  assert.ok(fs.existsSync(tempOutput));

  const content = fs.readFileSync(tempOutput, 'utf8');
  assert.ok(content.includes('prompt'));
  assert.ok(content.includes('chosen'));
  assert.ok(content.includes('rejected'));

  fs.unlinkSync(tempOutput);
});
