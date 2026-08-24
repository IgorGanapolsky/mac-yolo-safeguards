#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { scanFile } = require('../tools/codeql-pattern-gate');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

function withTemp(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqg-'));
  const file = path.join(dir, 'sample.js');
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('flags createSign SHA256', () => {
  withTemp("const s = crypto.createSign('SHA256');\n", (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'no-createSign-SHA256-jwt-handroll'), JSON.stringify(hits));
  });
});

test('flags execSync template', () => {
  withTemp('execSync(`echo ${process.env.X}`);\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'no-execSync-shell-template'));
  });
});

test('flags url.includes host', () => {
  withTemp("if (u.includes('reddit.com')) {}\n", (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'no-url-host-includes-substring'));
  });
});

test('flags env console.log', () => {
  withTemp('console.log(process.env.SECRET_TOKEN);\n', (f) => {
    const hits = scanFile(f);
    assert.ok(hits.some((h) => h.rule === 'no-cleartext-env-log'));
  });
});

test('clean file empty', () => {
  withTemp("const x = 1;\nconsole.log('ok');\n", (f) => {
    const hits = scanFile(f);
    assert.strictEqual(hits.length, 0, JSON.stringify(hits));
  });
});

test('flags any-type annotation in TypeScript', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqg-ts-'));
  const file = path.join(dir, 'sample.ts');
  fs.writeFileSync(file, 'function foo(x: any) { return x; }\n');
  try {
    const hits = scanFile(file);
    assert.ok(hits.some((h) => h.rule === 'no-any-type-annotation'), JSON.stringify(hits));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not flag any-type in test files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqg-ts-test-'));
  const dir2 = path.join(dir, 'tests');
  fs.mkdirSync(dir2);
  const file = path.join(dir2, 'sample.test.ts');
  fs.writeFileSync(file, 'function foo(x: any) { return x; }\n');
  try {
    const hits = scanFile(file);
    assert.ok(!hits.some((h) => h.rule === 'no-any-type-annotation'), 'should not flag test files');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('does not flag any-type in d.ts declaration files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqg-ts-dts-'));
  const file = path.join(dir, 'sample.d.ts');
  fs.writeFileSync(file, 'declare function foo(x: any): void;\n');
  try {
    const hits = scanFile(file);
    assert.ok(!hits.some((h) => h.rule === 'no-any-type-annotation'), 'should not flag .d.ts files');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log('test-codeql-pattern-gate: done');
