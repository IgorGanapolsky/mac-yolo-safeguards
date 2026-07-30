'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { normalizeLesson, loadLedger, rebuild } = require('../tools/thumbgate-lessons-repair');

test('normalizeLesson maps ledger shapes into sqlite columns', () => {
  const row = normalizeLesson({
    id: 'lesson_abc',
    signal: 'down',
    lesson: 'MISTAKE: do not invent cash',
    feedbackId: 'fb_1',
    tags: ['revenue'],
    createdAt: '2026-07-01T00:00:00Z',
  });
  assert.equal(row.id, 'lesson_abc');
  assert.equal(row.signal, 'negative');
  assert.match(row.context, /invent cash/);
  assert.equal(row.sourceFeedbackId, 'fb_1');
});

test('loadLedger dedupes by id preferring longer context', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-ledger-'));
  fs.writeFileSync(
    path.join(dir, 'lessons-index.jsonl'),
    [
      JSON.stringify({ id: 'x1', signal: 'positive', lesson: 'short' }),
      JSON.stringify({ id: 'x1', signal: 'positive', lesson: 'much longer context about success' }),
      JSON.stringify({ id: 'x2', signal: 'negative', lesson: 'other' }),
    ].join('\n') + '\n',
  );
  const { rows } = loadLedger(dir);
  assert.equal(rows.length, 2);
  const x1 = rows.find((r) => r.id === 'x1');
  assert.match(x1.context, /much longer/);
});

test('rebuild dry-run never mutates sqlite', () => {
  if (spawnSync('sqlite3', ['-version'], { encoding: 'utf8' }).status !== 0) {
    return; // environment without sqlite3
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-repair-'));
  fs.writeFileSync(
    path.join(dir, 'lessons-index.jsonl'),
    JSON.stringify({ id: 'dry1', signal: 'positive', lesson: 'dry run lesson body with enough text' }) + '\n',
  );
  // minimal empty-ish sqlite with schema
  const db = path.join(dir, 'lessons.sqlite');
  const schema = `
    CREATE TABLE lessons (
      id TEXT PRIMARY KEY,
      signal TEXT NOT NULL,
      context TEXT,
      whatWentWrong TEXT,
      whatToChange TEXT,
      whatWorked TEXT,
      domain TEXT,
      tags TEXT,
      rootCause TEXT,
      importance TEXT DEFAULT 'medium',
      skill TEXT,
      timestamp TEXT NOT NULL,
      sourceFeedbackId TEXT,
      pruned INTEGER DEFAULT 0
    );
    CREATE VIRTUAL TABLE lessons_fts USING fts5(
      context, whatWentWrong, whatToChange, whatWorked, rootCause,
      content=lessons, content_rowid=rowid
    );
  `;
  spawnSync('sqlite3', [db], { input: schema, encoding: 'utf8' });
  const report = rebuild({ dir, apply: false });
  assert.equal(report.ok, true);
  assert.equal(report.apply, false);
  assert.equal(report.ledgerUnique, 1);
  const count = spawnSync('sqlite3', [db, 'SELECT COUNT(*) FROM lessons;'], { encoding: 'utf8' });
  assert.equal(count.stdout.trim(), '0');
});
