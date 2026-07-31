#!/usr/bin/env node
'use strict';

/**
 * Export EVERY row in lessons.sqlite into lessons-index.jsonl.
 *
 * Why: integrity found two pipelines writing one canonical sqlite
 * (lesson_* + mem_*) while the jsonl projection only held lesson_*.
 * Semantic embed coverage can be 100% while ledger projection is ~58%,
 * so any tool that reads jsonl as "the corpus" is blind to mem_*.
 *
 * Usage:
 *   node tools/thumbgate-lessons-export-jsonl.js --dir ~/.thumbgate
 *   node tools/thumbgate-lessons-export-jsonl.js --dir ~/.thumbgate --apply --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveSqlite3() {
  for (const bin of [
    process.env.SQLITE3_BIN,
    '/opt/homebrew/opt/sqlite/bin/sqlite3',
    '/usr/local/opt/sqlite/bin/sqlite3',
    'sqlite3',
  ].filter(Boolean)) {
    if (spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0) return bin;
  }
  return 'sqlite3';
}

function parseArgs(argv) {
  const args = {
    dir: path.join(process.env.HOME || '', '.thumbgate'),
    apply: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '');
    else if (a === '--apply') args.apply = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadSqliteRows(dbPath) {
  const sql = resolveSqlite3();
  const r = spawnSync(
    sql,
    [
      dbPath,
      '-json',
      'SELECT id, signal, context, whatWentWrong, whatToChange, whatWorked, domain, tags, rootCause, importance, skill, timestamp, sourceFeedbackId FROM lessons;',
    ],
    { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'sqlite export failed').slice(0, 400));
  }
  if (!r.stdout.trim()) return [];
  return JSON.parse(r.stdout);
}

function loadExistingJsonl(file) {
  const byId = new Map();
  if (!fs.existsSync(file)) return byId;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const id = row.id || row.feedbackId || row.sourceFeedbackId;
      if (id) byId.set(String(id), row);
    } catch {
      /* skip */
    }
  }
  return byId;
}

function rowToLedger(row) {
  const context = row.context || row.whatWentWrong || row.whatWorked || '';
  return {
    id: String(row.id),
    signal: row.signal || 'negative',
    context: String(context),
    lesson: String(context),
    whatWentWrong: row.whatWentWrong || null,
    whatToChange: row.whatToChange || null,
    whatWorked: row.whatWorked || null,
    domain: row.domain || null,
    tags: row.tags || '',
    rootCause: row.rootCause || null,
    importance: row.importance || 'medium',
    skill: row.skill || null,
    timestamp: row.timestamp || new Date().toISOString(),
    sourceFeedbackId: row.sourceFeedbackId || null,
    exportedFrom: 'lessons.sqlite',
    exportedAt: new Date().toISOString(),
  };
}

function exportJsonl(options = {}) {
  const dir = options.dir;
  const apply = Boolean(options.apply);
  const dbPath = path.join(dir, 'lessons.sqlite');
  const outPath = path.join(dir, 'lessons-index.jsonl');
  const report = {
    dir,
    dbPath,
    outPath,
    apply,
    sqliteCount: 0,
    priorJsonl: 0,
    written: 0,
    added: 0,
    ok: false,
  };
  if (!fs.existsSync(dbPath)) {
    report.error = `lessons.sqlite missing at ${dbPath}`;
    return report;
  }
  const rows = loadSqliteRows(dbPath);
  report.sqliteCount = rows.length;
  const existing = loadExistingJsonl(outPath);
  report.priorJsonl = existing.size;

  // Canonical projection is exactly the sqlite ID set — drop stale jsonl orphans.
  const merged = new Map();
  let droppedOrphans = 0;
  const sqliteIds = new Set(rows.map((r) => String(r.id)));
  for (const id of existing.keys()) {
    if (!sqliteIds.has(id)) droppedOrphans += 1;
  }
  for (const row of rows) {
    const ledger = rowToLedger(row);
    const prev = existing.get(ledger.id);
    if (!prev) {
      merged.set(ledger.id, ledger);
      report.added += 1;
      continue;
    }
    // Prefer longer context (sqlite or existing) but keep sqlite as source of truth for id set.
    const prevCtx = String(prev.context || prev.lesson || '');
    const nextCtx = String(ledger.context || '');
    if (nextCtx.length >= prevCtx.length) merged.set(ledger.id, { ...prev, ...ledger });
    else merged.set(ledger.id, { ...ledger, ...prev, id: ledger.id });
  }
  report.droppedOrphans = droppedOrphans;

  const lines = [...merged.values()]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((r) => JSON.stringify(r));
  report.written = lines.length;
  report.namespaces = {};
  for (const id of merged.keys()) {
    const ns = String(id).includes('_') ? `${String(id).split('_')[0]}_` : '(none)';
    report.namespaces[ns] = (report.namespaces[ns] || 0) + 1;
  }

  if (!apply) {
    report.note = 'dry-run; pass --apply to write lessons-index.jsonl';
    report.ok = report.sqliteCount > 0 && report.written >= report.sqliteCount;
    return report;
  }

  const bak = `${outPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (fs.existsSync(outPath)) fs.copyFileSync(outPath, bak);
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  report.backupPath = fs.existsSync(bak) ? bak : null;
  report.ok = report.written >= report.sqliteCount;
  report.note = `wrote ${report.written} jsonl rows (added ${report.added} from sqlite)`;
  return report;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node tools/thumbgate-lessons-export-jsonl.js --dir PATH [--apply] [--json]');
      process.exit(0);
    }
    const report = exportJsonl(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(report.note || report.error || JSON.stringify(report));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { exportJsonl, rowToLedger, loadSqliteRows };
