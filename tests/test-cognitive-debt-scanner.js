#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanFile, RULES } = require('../tools/cognitive-debt-scanner');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

function withTemp(content, fn, ext = '.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cds-'));
  const file = path.join(dir, 'sample' + ext);
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('flags silent catch with unused var', () => {
  withTemp('try { x(); } catch (e) {}\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'silent-catch'), JSON.stringify(hits));
  });
});

test('allows catch (_) deliberate discard', () => {
  withTemp('try { x(); } catch (_) {}\n', (f) => {
    const hits = scanFile(f);
    assert.ok(!hits.some((h) => h.rule === 'silent-catch'), 'should allow catch (_)');
  });
});

test('flags any-type annotation in ts', () => {
  withTemp('function foo(x: any): void {}\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'any-type'), JSON.stringify(hits));
  }, '.ts');
});

test('does not flag any-type in d.ts', () => {
  withTemp('declare function foo(x: any): void;\n', (f) => {
    const hits = scanFile(f);
    assert.ok(!hits.some((h) => h.rule === 'any-type'), 'should not flag .d.ts');
  });
});

test('flags TODO without owner or deadline', () => {
  withTemp('// TODO: fix this later\nfoo();\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'todo-without-owner'), JSON.stringify(hits));
  });
});

test('allows TODO with owner', () => {
  withTemp('// TODO @agent: fix this later\nfoo();\n', (f) => {
    const hits = scanFile(f);
    assert.ok(!hits.some((h) => h.rule === 'todo-without-owner'), 'should allow TODO with @owner');
  });
});

test('allows TODO with deadline', () => {
  withTemp('// TODO: fix before 2026-09-01\nfoo();\n', (f) => {
    const hits = scanFile(f);
    assert.ok(!hits.some((h) => h.rule === 'todo-without-owner'), 'should allow TODO with deadline');
  });
});

test('flags deeply nested ternary (>3)', () => {
  withTemp('const x = a ? b ? c ? d ? e : 1 : 2 : 3 : 4;\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'deep-nested-ternary'), JSON.stringify(hits));
  });
});

test('flags magic number in condition', () => {
  withTemp('if (x === 42) { doSomething(); }\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'magic-number-in-condition'), JSON.stringify(hits));
  });
});

test('clean file has zero findings', () => {
  withTemp("const MAX_RETRIES = 5;\nif (retries > MAX_RETRIES) { retry(); }\n", (f) => {
    const hits = scanFile(f);
    assert.strictEqual(hits.length, 0, JSON.stringify(hits));
  });
});

test('rules are properly defined', () => {
  assert.ok(Array.isArray(RULES));
  const ids = RULES.map((r) => r.id);
  assert.ok(ids.includes('silent-catch'));
  assert.ok(ids.includes('any-type'));
  assert.ok(ids.includes('todo-without-owner'));
  assert.ok(ids.includes('deep-nested-ternary'));
  assert.ok(ids.includes('magic-number-in-condition'));
});

console.log('test-cognitive-debt-scanner: done');
