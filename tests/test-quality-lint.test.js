'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanFile } = require('../tools/test-quality-lint.js');

function withTemp(name, content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tql-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  try { return fn(file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// The three flawed-test failure modes SWE-Bench ProMax (arXiv 2608.09802)
// found in ~60% of unsolved instances, that have bitten this repo.
test('flags no-op, opt-out, and brittle-literal assertions', () => {
  const bad = [
    "const assert = require('node:assert');",
    "test('noop', () => {",
    '  assert.ok(true);',
    '});',
    "test('opt out', () => {",
    '  if (maybe()) {',
    '    assert.equal(a, b);',
    '  }',
    '});',
    "test('brittle', () => {",
    "  expect(output).toContain('this is a long pinned implementation output string that exceeds the limit');",
    '});',
  ].join('\n');
  const cats = withTemp('bad.test.js', bad, (f) => scanFile(f).map((x) => x.category));
  assert.ok(cats.includes('noop-assertion'), 'should flag assert.ok(true)');
  assert.ok(cats.includes('opt-out-assertion'), 'should flag if-guarded assertion with no failing branch');
  assert.ok(cats.includes('brittle-literal-pin'), 'should flag .toContain of a long prose literal');
});

// The overly-broad detector the paper warns about: a descriptive assertion
// MESSAGE (3rd arg of assert.equal) must NOT be mistaken for a pinned value,
// and a guarded block WITH a failing branch is legitimate.
test('does not flag assertion messages or properly-guarded blocks (no false positives)', () => {
  const good = [
    "const assert = require('node:assert');",
    "test('descriptive message is not a pinned value', () => {",
    "  assert.equal(result.status, 'blocked', 'a sender proven not to deliver must be blocked and reported clearly');",
    '});',
    "test('guarded block has a failing branch', () => {",
    '  if (found) {',
    '    assert.ok(found.valid);',
    '  } else {',
    "    throw new Error('expected found');",
    '  }',
    '});',
  ].join('\n');
  const findings = withTemp('good.test.js', good, (f) => scanFile(f));
  assert.strictEqual(findings.length, 0, 'clean test file must produce zero findings, got: ' + JSON.stringify(findings));
});
