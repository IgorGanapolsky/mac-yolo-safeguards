#!/usr/bin/env node
'use strict';

// Regression tests for the silent recall hole in tools/hermes-retrieval-harness.js.
//
// `retrieve` scores and snippets each file from a PREFIX (`--max-bytes`, default
// 240000). Before this change, everything past the cap was invisible with no
// signal at all: a file whose only relevant content lived past the cap scored 0
// and was dropped from `matches`, indistinguishable from a genuinely irrelevant
// file. These tests pin the signal, not the cap — the cap is unchanged.
//
// Every assertion here was mutation-tested: the harness was broken so the
// property fails, the test was confirmed RED, then restored and confirmed GREEN.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HARNESS = path.join(ROOT, 'tools', 'hermes-retrieval-harness.js');
const {
  DEFAULT_MAX_BYTES,
  formatTruncationWarning,
  parseArgs,
  readTextSlice,
  readTextSliceWithMeta,
  retrieve,
} = require(HARNESS);

let assertions = 0;

function test(name, fn) {
  try {
    fn();
    assertions += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

// A unique token that lives ONLY past the byte cap. If retrieval ever finds it,
// nothing was truncated; if retrieval silently misses it with no warning, the
// recall hole is back.
const DEEP_TOKEN = 'omeganeedle';
const HEAD_TOKEN = 'alphamarker';

function makeRepo(bigBytes, capForFixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-trunc-'));
  const head = `${HEAD_TOKEN} appears in the first line of this file\n`;
  const filler = 'lorem ipsum dolor sit amet consectetur adipiscing elit\n';
  let body = head;
  while (Buffer.byteLength(body, 'utf8') < bigBytes) body += filler;
  body += `${DEEP_TOKEN} lives past the read cap and must not be silently dropped\n`;
  fs.writeFileSync(path.join(dir, 'big.md'), body);
  // Small control file: same head token, comfortably under any cap used here.
  fs.writeFileSync(path.join(dir, 'small.md'), `${head}${filler}`);
  return { dir, capForFixture };
}

function removeRepo(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function captureStderr(fn) {
  const original = console.error;
  const captured = [];
  console.error = (...args) => captured.push(args.join(' '));
  try {
    const value = fn();
    return { value, stderr: captured.join('\n') };
  } finally {
    console.error = original;
  }
}

// ---------------------------------------------------------------------------
// readTextSliceWithMeta: the primitive that knows what it did not read
// ---------------------------------------------------------------------------

test('readTextSliceWithMeta flags a truncated read and reports both byte counts', () => {
  const { dir } = makeRepo(4000);
  try {
    const big = path.join(dir, 'big.md');
    const total = fs.statSync(big).size;
    const meta = readTextSliceWithMeta(big, 1000);
    assert.strictEqual(meta.truncated, true, 'a 1000-byte read of a >1000-byte file is truncated');
    assert.strictEqual(meta.bytesRead, 1000, 'bytesRead must be the cap, not the file size');
    assert.strictEqual(meta.totalBytes, total, 'totalBytes must be the real on-disk size');
    assert.ok(meta.totalBytes > meta.bytesRead, 'totalBytes must exceed bytesRead when truncated');
    assert.strictEqual(Buffer.byteLength(meta.text, 'utf8'), 1000, 'text is exactly the capped prefix');
    assert.ok(!meta.text.includes(DEEP_TOKEN), 'the deep token is genuinely outside the slice');
  } finally {
    removeRepo(dir);
  }
});

test('readTextSliceWithMeta does NOT flag a complete read', () => {
  const { dir } = makeRepo(4000);
  try {
    const small = path.join(dir, 'small.md');
    const total = fs.statSync(small).size;
    const meta = readTextSliceWithMeta(small, 1000000);
    assert.strictEqual(meta.truncated, false, 'a full read must never be reported as truncated');
    assert.strictEqual(meta.bytesRead, total);
    assert.strictEqual(meta.totalBytes, total);
  } finally {
    removeRepo(dir);
  }
});

test('readTextSlice keeps its original string return type (back-compat)', () => {
  const { dir } = makeRepo(4000);
  try {
    const text = readTextSlice(path.join(dir, 'small.md'), 1000000);
    assert.strictEqual(typeof text, 'string');
    assert.ok(text.includes(HEAD_TOKEN));
  } finally {
    removeRepo(dir);
  }
});

// ---------------------------------------------------------------------------
// retrieve: the truncation report and per-match fields
// ---------------------------------------------------------------------------

test('retrieve reports truncation for a file larger than the cap', () => {
  const { dir } = makeRepo(4000);
  try {
    const result = retrieve(HEAD_TOKEN, { repo: dir, maxBytes: 1000, warn: false });
    assert.strictEqual(result.truncation.truncatedFileCount, 1, 'exactly big.md is truncated');
    assert.strictEqual(result.truncation.maxBytes, 1000, 'the report states the cap actually used');
    assert.ok(result.truncation.bytesSkipped > 0, 'bytesSkipped must be non-zero');
    assert.strictEqual(
      result.truncation.bytesSkipped,
      fs.statSync(path.join(dir, 'big.md')).size - 1000,
      'bytesSkipped must equal the unread remainder',
    );
    assert.deepStrictEqual(result.truncation.files.map((f) => f.path), ['big.md']);

    const big = result.matches.find((m) => m.path === 'big.md');
    assert.ok(big, 'big.md still matches on its head token');
    assert.strictEqual(big.truncated, true, 'the match must carry truncated:true');
    assert.strictEqual(big.bytesRead, 1000);
    assert.strictEqual(big.totalBytes, fs.statSync(path.join(dir, 'big.md')).size);
  } finally {
    removeRepo(dir);
  }
});

test('retrieve reports NO truncation when every file fits under the cap', () => {
  const { dir } = makeRepo(4000);
  try {
    fs.rmSync(path.join(dir, 'big.md'));
    const result = retrieve(HEAD_TOKEN, { repo: dir, maxBytes: 1000000, warn: false });
    assert.strictEqual(result.truncation.truncatedFileCount, 0, 'nothing was truncated');
    assert.strictEqual(result.truncation.bytesSkipped, 0);
    assert.deepStrictEqual(result.truncation.files, []);

    const small = result.matches.find((m) => m.path === 'small.md');
    assert.ok(small, 'small.md matches');
    assert.strictEqual(small.truncated, false, 'a fully-read match must be truncated:false');
    assert.strictEqual(small.bytesRead, small.totalBytes, 'a full read scanned every byte');
  } finally {
    removeRepo(dir);
  }
});

// This is the recall hole itself: content past the cap produces ZERO matches.
// That is allowed (the cap is a deliberate cost control) — what is NOT allowed
// is it happening silently.
test('content past the cap yields no match, but the truncation report still fires', () => {
  const { dir } = makeRepo(4000);
  try {
    const result = retrieve(DEEP_TOKEN, { repo: dir, maxBytes: 1000, warn: false });
    assert.strictEqual(result.matches.length, 0, 'the deep token is invisible to scoring — the hole');
    assert.strictEqual(
      result.truncation.truncatedFileCount,
      1,
      'zero matches must be accompanied by a truncation signal, not silence',
    );
    assert.deepStrictEqual(result.truncation.files.map((f) => f.path), ['big.md']);
  } finally {
    removeRepo(dir);
  }
});

// ---------------------------------------------------------------------------
// stderr warning
// ---------------------------------------------------------------------------

test('retrieve writes a truncation warning to stderr by default', () => {
  const { dir } = makeRepo(4000);
  try {
    const { stderr } = captureStderr(() => retrieve(HEAD_TOKEN, { repo: dir, maxBytes: 1000 }));
    assert.ok(/WARNING/.test(stderr), `expected a WARNING on stderr, got: ${JSON.stringify(stderr)}`);
    assert.ok(/truncated read/i.test(stderr), 'the warning must name the failure mode');
    assert.ok(stderr.includes('big.md'), 'the warning must name the truncated file');
    assert.ok(stderr.includes('1000'), 'the warning must state the cap');
  } finally {
    removeRepo(dir);
  }
});

test('retrieve stays silent on stderr when nothing is truncated', () => {
  const { dir } = makeRepo(4000);
  try {
    fs.rmSync(path.join(dir, 'big.md'));
    const { stderr } = captureStderr(() => retrieve(HEAD_TOKEN, { repo: dir, maxBytes: 1000000 }));
    assert.strictEqual(stderr, '', `expected clean stderr, got: ${JSON.stringify(stderr)}`);
  } finally {
    removeRepo(dir);
  }
});

test('formatTruncationWarning summarises overflow beyond the named files', () => {
  const message = formatTruncationWarning({
    maxBytes: 240000,
    truncatedFileCount: 25,
    bytesSkipped: 999,
    files: [{ path: 'a.md', bytesRead: 1, totalBytes: 2 }],
  });
  assert.ok(message.includes('25 file(s)'), 'states the true count');
  assert.ok(message.includes('999 byte(s)'), 'states the skipped bytes');
  assert.ok(message.includes('(+24 more)'), 'does not pretend the named list is complete');
});

// ---------------------------------------------------------------------------
// CLI surface — the warning must reach a real operator, not just a return value
// ---------------------------------------------------------------------------

test('CLI emits the warning on stderr and the report in --json', () => {
  const { dir } = makeRepo(4000);
  try {
    const run = spawnSync(
      process.execPath,
      [HARNESS, 'retrieve', '--query', HEAD_TOKEN, '--repo', dir, '--max-bytes', '1000', '--json'],
      { encoding: 'utf8' },
    );
    assert.strictEqual(run.status, 0, run.stderr);
    assert.ok(/WARNING: truncated read/.test(run.stderr), `stderr lacked the warning: ${run.stderr}`);
    const parsed = JSON.parse(run.stdout);
    assert.strictEqual(parsed.truncation.truncatedFileCount, 1, 'JSON output carries the report');
    assert.strictEqual(parsed.truncation.maxBytes, 1000);
    const big = parsed.matches.find((m) => m.path === 'big.md');
    assert.strictEqual(big.truncated, true, 'JSON match carries truncated:true');
  } finally {
    removeRepo(dir);
  }
});

test('CLI stderr is clean and matches are truncated:false when nothing is capped', () => {
  const { dir } = makeRepo(4000);
  try {
    fs.rmSync(path.join(dir, 'big.md'));
    const run = spawnSync(
      process.execPath,
      [HARNESS, 'retrieve', '--query', HEAD_TOKEN, '--repo', dir, '--json'],
      { encoding: 'utf8' },
    );
    assert.strictEqual(run.status, 0, run.stderr);
    assert.strictEqual(run.stderr.trim(), '', `expected clean stderr, got: ${run.stderr}`);
    const parsed = JSON.parse(run.stdout);
    assert.strictEqual(parsed.truncation.truncatedFileCount, 0);
    assert.strictEqual(parsed.matches.find((m) => m.path === 'small.md').truncated, false);
  } finally {
    removeRepo(dir);
  }
});

test('human-readable render marks the truncated match and appends the warning', () => {
  const { dir } = makeRepo(4000);
  try {
    const run = spawnSync(
      process.execPath,
      [HARNESS, 'retrieve', '--query', HEAD_TOKEN, '--repo', dir, '--max-bytes', '1000'],
      { encoding: 'utf8' },
    );
    assert.strictEqual(run.status, 0, run.stderr);
    assert.ok(/big\.md.*\[TRUNCATED 1000\//.test(run.stdout), `stdout lacked the marker: ${run.stdout}`);
    assert.ok(/WARNING: truncated read/.test(run.stdout), 'the rendered report carries the warning too');
  } finally {
    removeRepo(dir);
  }
});

// ---------------------------------------------------------------------------
// The cap itself must not move — this change adds signal only
// ---------------------------------------------------------------------------

test('the 240000-byte default cap is unchanged', () => {
  assert.strictEqual(DEFAULT_MAX_BYTES, 240000, 'this fix must not change the cost control');
  assert.strictEqual(parseArgs(['retrieve', 'x']).maxBytes, 240000, 'CLI default is still 240000');
});

test('a file just over the default cap truncates with no explicit --max-bytes', () => {
  const { dir } = makeRepo(DEFAULT_MAX_BYTES + 512);
  try {
    const result = retrieve(HEAD_TOKEN, { repo: dir, warn: false });
    assert.strictEqual(result.truncation.maxBytes, 240000, 'the default cap was the one applied');
    assert.strictEqual(result.truncation.truncatedFileCount, 1);
    const big = result.matches.find((m) => m.path === 'big.md');
    assert.strictEqual(big.truncated, true);
    assert.strictEqual(big.bytesRead, 240000, 'read stopped exactly at the default cap');
    assert.ok(big.totalBytes > 240000);
  } finally {
    removeRepo(dir);
  }
});

if (process.exitCode) {
  console.error(`Harness truncation tests: FAIL (${assertions} passed before failure)`);
} else if (assertions === 0) {
  console.error('Harness truncation tests: VACUOUS — no assertions ran');
  process.exitCode = 2;
} else {
  console.log(`Harness truncation tests: PASS (${assertions} cases)`);
}
