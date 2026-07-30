#!/usr/bin/env node
'use strict';

/**
 * Rebuild ThumbGate lessons.sqlite FTS corpus from the JSONL ledger.
 *
 * Doctor found store drift: ledger hundreds of rows, sqlite ~3. This tool
 * UPSERTS ledger rows into lessons so FTS5 content triggers repopulate search.
 *
 * Safe defaults:
 *   --dry-run   print counts only (default)
 *   --apply     write sqlite (backs up lessons.sqlite → lessons.sqlite.bak-TIMESTAMP first)
 *
 * Usage:
 *   node tools/thumbgate-lessons-repair.js --dir ~/.thumbgate/projects/default
 *   node tools/thumbgate-lessons-repair.js --dir ~/.thumbgate/projects/default --apply
 *   node tools/thumbgate-lessons-repair.js --json --apply
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/** Prefer Homebrew sqlite (FTS5) over Android platform-tools sqlite3 on PATH. */
function resolveSqlite3() {
  const candidates = [
    process.env.SQLITE3_BIN,
    '/opt/homebrew/opt/sqlite/bin/sqlite3',
    '/usr/local/opt/sqlite/bin/sqlite3',
    'sqlite3',
  ].filter(Boolean);
  for (const bin of candidates) {
    const probe = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (probe.status !== 0) continue;
    const fts = spawnSync(bin, [':memory:', 'CREATE VIRTUAL TABLE t USING fts5(x);'], { encoding: 'utf8' });
    if (fts.status === 0) return bin;
  }
  return 'sqlite3';
}

const SQLITE3 = resolveSqlite3();

function parseArgs(argv) {
  const args = {
    dir: path.join(process.env.HOME || '', '.thumbgate', 'projects', 'default'),
    apply: false,
    json: false,
    limit: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '');
    else if (a === '--apply') args.apply = true;
    else if (a === '--json') args.json = true;
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeLesson(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id || raw.lessonId || raw.sourceFeedbackId || raw.feedbackId;
  if (!id) return null;
  let signal = String(raw.signal || '').toLowerCase();
  if (signal === 'up') signal = 'positive';
  if (signal === 'down') signal = 'negative';
  if (signal !== 'positive' && signal !== 'negative') {
    // Infer from text when ledger uses free-form
    const blob = `${raw.lesson || ''} ${raw.context || ''} ${raw.title || ''}`;
    if (/SUCCESS|positive|worked/i.test(blob)) signal = 'positive';
    else signal = 'negative';
  }
  const context =
    raw.context ||
    raw.lesson ||
    raw.title ||
    raw.whatWentWrong ||
    raw.whatWorked ||
    '';
  const tags = Array.isArray(raw.tags) ? raw.tags.join(',') : raw.tags || '';
  const timestamp = raw.timestamp || raw.createdAt || raw.updatedAt || new Date().toISOString();
  return {
    id: String(id),
    signal,
    context: String(context).slice(0, 8000),
    whatWentWrong: raw.whatWentWrong ? String(raw.whatWentWrong).slice(0, 4000) : null,
    whatToChange: raw.whatToChange || raw.howToAvoid ? String(raw.whatToChange || raw.howToAvoid).slice(0, 4000) : null,
    whatWorked: raw.whatWorked ? String(raw.whatWorked).slice(0, 4000) : null,
    domain: raw.domain || raw.richContext?.domain || null,
    tags: String(tags).slice(0, 1000),
    rootCause: raw.rootCause || raw.diagnosis || null,
    importance: raw.importance || 'medium',
    skill: raw.skill || null,
    timestamp: String(timestamp),
    sourceFeedbackId: raw.sourceFeedbackId || raw.feedbackId || null,
  };
}

function loadLedger(dir) {
  const candidates = [
    path.join(dir, 'lessons-index.jsonl'),
    path.join(dir, 'memory-log.jsonl'),
  ];
  const byId = new Map();
  const sources = [];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    let lines = 0;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      lines += 1;
      let raw;
      try {
        raw = JSON.parse(line);
      } catch {
        continue;
      }
      const row = normalizeLesson(raw);
      if (!row) continue;
      // Prefer richer later rows
      const prev = byId.get(row.id);
      if (!prev || (row.context || '').length >= (prev.context || '').length) {
        byId.set(row.id, row);
      }
    }
    sources.push({ file, lines });
  }
  return { rows: [...byId.values()], sources };
}

function sqliteCount(dbPath) {
  if (!fs.existsSync(dbPath)) return null;
  const r = spawnSync(SQLITE3, [dbPath, 'SELECT COUNT(*) FROM lessons;'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (r.status !== 0) return null;
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

function rebuild(options) {
  const dir = options.dir;
  const dbPath = path.join(dir, 'lessons.sqlite');
  const { rows, sources } = loadLedger(dir);
  const limited = options.limit > 0 ? rows.slice(0, options.limit) : rows;
  const before = sqliteCount(dbPath);

  const report = {
    dir,
    dbPath,
    sources,
    ledgerUnique: rows.length,
    toUpsert: limited.length,
    beforeCount: before,
    apply: Boolean(options.apply),
    afterCount: null,
    backupPath: null,
    ok: false,
  };

  if (!options.apply) {
    report.ok = true;
    report.note = 'dry-run only; pass --apply to write sqlite';
    return report;
  }

  if (spawnSync(SQLITE3, ['-version'], { encoding: 'utf8' }).status !== 0) {
    report.error = 'sqlite3 CLI required';
    return report;
  }
  report.sqlite3 = SQLITE3;

  const schemaSql = `
CREATE TABLE IF NOT EXISTS lessons (
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
CREATE INDEX IF NOT EXISTS idx_lessons_signal ON lessons(signal);
CREATE INDEX IF NOT EXISTS idx_lessons_domain ON lessons(domain);
CREATE INDEX IF NOT EXISTS idx_lessons_timestamp ON lessons(timestamp);
`;
  // FTS5 is optional: some sqlite3 builds ship without the module. Content still lives in lessons.
  const ftsSchemaSql = `
CREATE VIRTUAL TABLE IF NOT EXISTS lessons_fts USING fts5(
  context, whatWentWrong, whatToChange, whatWorked, rootCause,
  content=lessons,
  content_rowid=rowid
);
`;

  if (!fs.existsSync(dbPath)) {
    // Create empty DB with schema so repair can populate a fresh store.
    fs.mkdirSync(dir, { recursive: true });
    const created = spawnSync(SQLITE3, [dbPath], { input: schemaSql, encoding: 'utf8' });
    if (created.status !== 0) {
      report.error = `failed to create lessons.sqlite: ${(created.stderr || '').slice(0, 200)}`;
      return report;
    }
  } else {
    // Ensure base table exists (some dirs have empty/stub sqlite files).
    const has = spawnSync(SQLITE3, [dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name='lessons';"], {
      encoding: 'utf8',
    });
    if (!(has.stdout || '').includes('lessons')) {
      spawnSync(SQLITE3, [dbPath], { input: schemaSql, encoding: 'utf8' });
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.bak-${stamp}`;
  fs.copyFileSync(dbPath, backupPath);
  report.backupPath = backupPath;

  // Batch UPSERT via temp SQL file (triggers keep FTS in sync when present)
  const sqlPath = path.join(dir, `.lessons-repair-${process.pid}.sql`);
  const lines = ['BEGIN;'];
  for (const row of limited) {
    // INSERT OR REPLACE deletes then inserts so FTS delete/insert triggers both fire.
    lines.push(
      `INSERT OR REPLACE INTO lessons (id, signal, context, whatWentWrong, whatToChange, whatWorked, domain, tags, rootCause, importance, skill, timestamp, sourceFeedbackId, pruned)
       VALUES (${sqlQuote(row.id)}, ${sqlQuote(row.signal)}, ${sqlQuote(row.context)}, ${sqlQuote(row.whatWentWrong)}, ${sqlQuote(row.whatToChange)}, ${sqlQuote(row.whatWorked)}, ${sqlQuote(row.domain)}, ${sqlQuote(row.tags)}, ${sqlQuote(row.rootCause)}, ${sqlQuote(row.importance)}, ${sqlQuote(row.skill)}, ${sqlQuote(row.timestamp)}, ${sqlQuote(row.sourceFeedbackId)}, 0);`,
    );
  }
  lines.push('COMMIT;');
  fs.writeFileSync(sqlPath, lines.join('\n'));
  const run = spawnSync(SQLITE3, [dbPath], {
    encoding: 'utf8',
    input: fs.readFileSync(sqlPath, 'utf8'),
    timeout: 180000,
    maxBuffer: 40 * 1024 * 1024,
  });
  try {
    fs.unlinkSync(sqlPath);
  } catch {
    /* ignore */
  }
  if (run.status !== 0) {
    report.error = (run.stderr || run.stdout || 'sqlite3 failed').slice(0, 500);
    return report;
  }

  const ftsProbe = spawnSync(SQLITE3, [dbPath, "CREATE VIRTUAL TABLE IF NOT EXISTS __fts5_probe USING fts5(x); DROP TABLE IF EXISTS __fts5_probe;"], {
    encoding: 'utf8',
  });
  const fts5Available = ftsProbe.status === 0;
  if (fts5Available) {
    const schemaRun = spawnSync(SQLITE3, [dbPath], { input: ftsSchemaSql, encoding: 'utf8' });
    if (schemaRun.status !== 0) {
      report.ftsRebuild = (schemaRun.stderr || schemaRun.stdout || 'fts schema failed').slice(0, 200);
    } else {
      const rebuildFts = spawnSync(
        SQLITE3,
        [dbPath, "INSERT INTO lessons_fts(lessons_fts) VALUES('rebuild');"],
        { encoding: 'utf8', timeout: 120000 },
      );
      report.ftsRebuild = rebuildFts.status === 0 ? 'ok' : (rebuildFts.stderr || 'failed').slice(0, 200);
    }
  } else {
    report.ftsRebuild = 'skipped-no-fts5-module';
  }

  report.afterCount = sqliteCount(dbPath);
  const baseOk = report.afterCount !== null && report.afterCount >= Math.min(limited.length, 1);
  // FTS is the search path — base-table success alone must not report ok when rebuild fails.
  const ftsOk =
    report.ftsRebuild === 'ok' ||
    report.ftsRebuild === 'skipped-no-fts5-module' ||
    !fts5Available;
  report.ok = baseOk && ftsOk;
  if (baseOk && !ftsOk) {
    report.error = `lessons upserted but FTS rebuild failed: ${report.ftsRebuild}`;
  }
  report.note = `upserted ${limited.length}; before=${before} after=${report.afterCount}; fts=${report.ftsRebuild || 'n/a'}`;
  return report;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(`Usage: node tools/thumbgate-lessons-repair.js [--dir PATH] [--apply] [--json] [--limit N]`);
      process.exit(0);
    }
    const report = rebuild(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.note || report.error || JSON.stringify(report));
      if (report.backupPath) console.log(`backup: ${report.backupPath}`);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { rebuild, normalizeLesson, loadLedger };
