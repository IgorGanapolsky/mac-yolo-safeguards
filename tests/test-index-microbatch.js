'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  FULL_REBUILD_EVERY,
  WATERMARK,
  runCycle,
} = require('../tools/index-microbatch');

function response(status, json) {
  return { status, json, stdout: JSON.stringify(json), stderr: '' };
}

test('FULL_REBUILD_EVERY remains a positive compatibility cadence', () => {
  assert.ok(FULL_REBUILD_EVERY >= 2);
});

test('dry cycle is read-only and fails closed on a stale generation', () => {
  const calls = [];
  const report = runCycle({
    home: fs.mkdtempSync(path.join(os.tmpdir(), 'microbatch-dry-')),
    lessonsMtime: 0,
    execute: (script, args) => {
      calls.push([script, ...args]);
      return response(78, { ok: false, problems: [{ code: 'remote_check_stale' }] });
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.generation.ok, false);
  assert.equal(report.actions.length, 0);
  assert.deepEqual(calls, [['grepai-mcp-fresh.js', 'check', '--json']]);
});

test('heal delegates grepai to the source-bound reconciler and exports advanced lessons', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'microbatch-heal-'));
  const calls = [];
  let checks = 0;
  const report = runCycle({
    heal: true,
    home,
    lessonsMtime: 42,
    execute: (script, args) => {
      calls.push([script, ...args]);
      if (script === 'grepai-mcp-fresh.js') {
        checks += 1;
        return checks === 1
          ? response(78, { ok: false, problems: [{ code: 'generation_receipt_missing' }] })
          : response(0, { ok: true, generationId: 'gen-current', indexedSha: 'a'.repeat(40) });
      }
      if (script === 'grepai-microbatch-reconciler.js') return response(0, { ok: true, action: 'published' });
      if (script === 'thumbgate-lessons-export-jsonl.js') return response(0, { ok: true, exported: 454 });
      throw new Error(`unexpected script ${script}`);
    },
  });
  assert.equal(report.ok, true);
  assert.equal(report.generation.generationId, 'gen-current');
  assert.deepEqual(report.actions.map((entry) => entry.step), [
    'grepai-generation-reconcile',
    'lessons-export-jsonl',
  ]);
  assert.ok(calls.some(([script]) => script === 'grepai-microbatch-reconciler.js'));
  const watermark = JSON.parse(fs.readFileSync(path.join(home, path.basename(WATERMARK)), 'utf8'));
  assert.equal(watermark.lessonsSqliteMtime, 42);
});

test('scheduled heal checks origin even while the current receipt is still fresh', () => {
  const calls = [];
  const generation = {
    ok: true,
    generationId: 'gen-a',
    indexedSha: 'a'.repeat(40),
    problems: [],
  };
  const report = runCycle({
    heal: true,
    home: fs.mkdtempSync(path.join(os.tmpdir(), 'microbatch-fresh-')),
    lessonsMtime: 0,
    execute: (script, args) => {
      calls.push([script, ...args]);
      if (script === 'grepai-mcp-fresh.js') return response(0, generation);
      if (script === 'grepai-microbatch-reconciler.js') return response(0, { ok: true, action: 'noop' });
      throw new Error(`unexpected script ${script}`);
    },
  });
  assert.equal(report.ok, true);
  assert.equal(calls.filter(([script]) => script === 'grepai-microbatch-reconciler.js').length, 1);
});

test('controller contains no permanent watcher or independent Git watermark logic', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'index-microbatch.js'), 'utf8');
  assert.doesNotMatch(source, /watch\s+--background|startWatcher|gitBehind|\.index-watermark/);
  assert.match(source, /grepai-microbatch-reconciler\.js/);
  assert.match(source, /grepai-mcp-fresh\.js/);
  assert.ok(WATERMARK.endsWith('.lesson-export-watermark.json'));
});
