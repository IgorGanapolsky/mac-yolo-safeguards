'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { exportJsonl, rowToLedger } = require('../tools/thumbgate-lessons-export-jsonl');

test('rowToLedger maps sqlite columns into ledger shape', () => {
  const row = rowToLedger({
    id: 'mem_1',
    signal: 'positive',
    context: 'hello',
    whatWentWrong: null,
    timestamp: '2026-07-31T00:00:00Z',
  });
  assert.equal(row.id, 'mem_1');
  assert.equal(row.context, 'hello');
  assert.equal(row.exportedFrom, 'lessons.sqlite');
});

test('export dry-run merges mem_* missing from jsonl', () => {
  if (spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status !== 0) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-jsonl-'));
  const db = path.join(dir, 'lessons.sqlite');
  const schema = `
    CREATE TABLE lessons (
      id TEXT PRIMARY KEY,
      signal TEXT,
      context TEXT,
      whatWentWrong TEXT,
      whatToChange TEXT,
      whatWorked TEXT,
      domain TEXT,
      tags TEXT,
      rootCause TEXT,
      importance TEXT,
      skill TEXT,
      timestamp TEXT,
      sourceFeedbackId TEXT
    );
    INSERT INTO lessons (id, signal, context, timestamp) VALUES
      ('lesson_a', 'positive', 'lesson body', '2026-07-01T00:00:00Z'),
      ('mem_b', 'negative', 'mem body', '2026-07-02T00:00:00Z');
  `;
  spawnSync('sqlite3', [db], { input: schema, encoding: 'utf8' });
  fs.writeFileSync(
    path.join(dir, 'lessons-index.jsonl'),
    `${JSON.stringify({ id: 'lesson_a', context: 'lesson body', signal: 'positive' })}\n`,
  );
  const report = exportJsonl({ dir, apply: false });
  assert.equal(report.sqliteCount, 2);
  assert.equal(report.priorJsonl, 1);
  assert.equal(report.added, 1);
  assert.equal(report.written, 2);
  assert.equal(report.ok, true);
});

test('export --apply writes both namespaces', () => {
  if (spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status !== 0) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-jsonl-apply-'));
  const db = path.join(dir, 'lessons.sqlite');
  spawnSync('sqlite3', [db], {
    input: `
      CREATE TABLE lessons (
        id TEXT PRIMARY KEY, signal TEXT, context TEXT, whatWentWrong TEXT,
        whatToChange TEXT, whatWorked TEXT, domain TEXT, tags TEXT, rootCause TEXT,
        importance TEXT, skill TEXT, timestamp TEXT, sourceFeedbackId TEXT
      );
      INSERT INTO lessons (id, signal, context, timestamp) VALUES
        ('lesson_a', 'positive', 'L', '2026-07-01T00:00:00Z'),
        ('mem_b', 'negative', 'M', '2026-07-02T00:00:00Z');
    `,
    encoding: 'utf8',
  });
  const report = exportJsonl({ dir, apply: true });
  assert.equal(report.ok, true);
  const lines = fs.readFileSync(path.join(dir, 'lessons-index.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const ids = lines.map((l) => JSON.parse(l).id).sort();
  assert.deepEqual(ids, ['lesson_a', 'mem_b']);
});
