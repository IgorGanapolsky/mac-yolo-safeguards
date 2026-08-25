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


// ---------------------------------------------------------------------------
// no-naive-script-strip — the PR #2010 detection gap.
//
// The old rule matched one spelling, /<script[\s\S]*?<\/script>/, and did not
// even catch that: its patterns looked for an unescaped `</script>` while a
// regex literal in real source always carries `<\/script>`. PR #2010 shipped a
// hand-rolled filter, this gate passed it clean, and CodeQL raised 5 alerts.
// These tests are the guard: they fail the moment the rule narrows again.
// ---------------------------------------------------------------------------

const HTML_RULE = 'no-naive-script-strip';

function htmlHits(source, basename = 'sample.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cqg-html-'));
  const file = path.join(dir, basename);
  fs.writeFileSync(file, source);
  try {
    return scanFile(file).filter((h) => h.rule === HTML_RULE);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('flags the PR #2010 pre-fix kitesurf HTML filter (the code that reached CodeQL)', () => {
  const fixture = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'codeql-pattern-gate', 'pr2010-naive-html-filter.js.txt'),
    'utf8'
  );
  const hits = htmlHits(fixture);
  assert.ok(hits.length >= 3, `expected the pre-fix filter to be flagged, got ${JSON.stringify(hits)}`);
  assert.ok(
    hits.some((h) => /bad-tag-filter/.test(h.message)),
    'expected a js/bad-tag-filter finding'
  );
  assert.ok(
    hits.some((h) => /double-escaping/.test(h.message)),
    'expected a js/double-escaping finding'
  );
  assert.ok(
    hits.every((h) => /html-to-markdown\.js|safe-html-strip\.js/.test(h.message)),
    'every finding must name a sanctioned helper'
  );
});

test('flags the negative-lookahead bypass spelling', () => {
  const src =
    String.raw`const out = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');` + '\n';
  assert.ok(htmlHits(src).length > 0, 'negative-lookahead tag filter must be flagged');
});

test('flags the classic script-strip spelling', () => {
  const src = String.raw`const out = html.replace(/<script[\s\S]*?<\/script>/gi, '');` + '\n';
  assert.ok(htmlHits(src).length > 0, 'classic script strip must be flagged');
});

test('flags an end tag that only tolerates trailing whitespace', () => {
  const src =
    String.raw`const out = html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');` + '\n';
  assert.ok(htmlHits(src).length > 0, '</style\\s*> still misses "</style bar>"');
});

test('flags scanning for the literal string end tag', () => {
  const src = String.raw`const end = html.indexOf('</script>');` + '\n';
  assert.ok(htmlHits(src).length > 0, 'literal "</script>" string scan must be flagged');
});

test('flags entity unescaping that decodes &amp; before other entities', () => {
  const src = String.raw`const t = s.replace(/&amp;/g, '&').replace(/&lt;/g, '<');` + '\n';
  const hits = htmlHits(src);
  assert.ok(
    hits.some((h) => /double-escaping/.test(h.message)),
    `expected js/double-escaping, got ${JSON.stringify(hits)}`
  );
});

test('does NOT flag the sanctioned tokenizer helper', () => {
  // Scanned under a neutral filename so the allowlist cannot do the work:
  // the patterns themselves must leave tokenizer code alone.
  const tokenizer = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'lib', 'html-to-markdown.js'),
    'utf8'
  );
  assert.deepStrictEqual(htmlHits(tokenizer), [], 'tokenizer must not be flagged');
});

test('does NOT flag the sanctioned safe-html-strip helper', () => {
  const helper = fs.readFileSync(
    path.join(__dirname, '..', 'tools', 'lib', 'safe-html-strip.js'),
    'utf8'
  );
  assert.deepStrictEqual(htmlHits(helper), [], 'safe-html-strip must not be flagged');
});

test('does NOT flag attribute-tolerant end tags or an &amp;-last entity chain', () => {
  // The shape main already carries and CodeQL does not report. Flagging it
  // would make the gate cry wolf, and a gate that cries wolf gets disabled.
  const src =
    String.raw`
const clean = String(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
` + '\n';
  assert.deepStrictEqual(htmlHits(src), [], 'safe shapes must stay clean');
});

console.log('test-codeql-pattern-gate: done');
