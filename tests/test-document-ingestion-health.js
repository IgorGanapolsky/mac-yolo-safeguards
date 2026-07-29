#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const TOOL = path.join(REPO, 'tools', 'document-ingestion-health.js');
const { STAGES, overallGrade, parseArgs } = require(TOOL);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e);
    process.exitCode = 1;
  }
}

test('stages cover required ingestion dimensions', () => {
  const ids = new Set(STAGES.map((s) => s.id));
  for (const id of [
    'parsing',
    'ocr',
    'deduplication',
    'normalization',
    'chunking',
    'metadata',
    'incremental_updates',
    'reindexing',
    'versioning',
  ]) {
    assert.ok(ids.has(id), id);
  }
});

test('each stage has why/risks/measure/grade', () => {
  for (const s of STAGES) {
    assert.ok(s.why && s.why.length > 20);
    assert.ok(s.risks?.length >= 2);
    assert.ok(s.measure?.length >= 1);
    assert.ok(s.grade);
  }
});

test('overallGrade averages letter grades', () => {
  const g = overallGrade(STAGES);
  assert.ok(typeof g === 'string' && g.length >= 1);
});

test('CLI --offline --json exits 0', () => {
  const r = spawnSync(process.execPath, [TOOL, '--offline', '--json'], {
    encoding: 'utf8',
    cwd: REPO,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.stages.length >= 9);
  assert.strictEqual(j.offline, true);
});

test('parseArgs', () => {
  assert.strictEqual(parseArgs(['--offline']).offline, true);
});

if (!process.exitCode) console.log('All document-ingestion-health tests passed.');
