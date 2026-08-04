#!/usr/bin/env node
'use strict';

/**
 * Durable job queue in SQLite (DBOS / InfoQ July 2026 pattern).
 *
 * Why external orchestrators hurt reliability for short heal jobs: another
 * process, another failure mode. We keep claim/complete state in one local
 * SQLite file using claim semantics equivalent to SKIP LOCKED:
 *   UPDATE … WHERE status='pending' AND (locked_until IS NULL OR locked_until < now)
 *   ORDER BY id LIMIT 1  (via select-then-update with unique id)
 *
 * Usage:
 *   node tools/durable-job-queue.js enqueue --type index-microbatch --json
 *   node tools/durable-job-queue.js claim --worker w1 --json
 *   node tools/durable-job-queue.js complete --id 3 --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const crypto = require('crypto');

const DEFAULT_DB = path.join(os.homedir(), '.hermes', 'durable-jobs.sqlite');

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

function sql(dbPath, statements, { json = false } = {}) {
  const bin = resolveSqlite3();
  const args = [dbPath];
  if (json) args.push('-json');
  const input = Array.isArray(statements) ? statements.join('\n') : String(statements);
  const r = spawnSync(bin, args, {
    encoding: 'utf8',
    input,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || 'sqlite failed').slice(0, 400));
  }
  if (!json) return r.stdout;
  const t = r.stdout.trim();
  if (!t) return [];
  return JSON.parse(t);
}

function ensureSchema(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sql(dbPath, `
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_by TEXT,
      locked_until TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(status, locked_until, id);
  `);
}

function nowIso() {
  return new Date().toISOString();
}

function enqueue(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB;
  ensureSchema(dbPath);
  const type = String(options.type || '').trim();
  if (!type) throw new Error('--type required');
  const payload = JSON.stringify(options.payload || {});
  const ts = nowIso();
  sql(dbPath, `
    INSERT INTO jobs (type, payload, status, attempts, created_at, updated_at)
    VALUES ('${type.replace(/'/g, "''")}', '${payload.replace(/'/g, "''")}', 'pending', 0, '${ts}', '${ts}');
  `);
  const rows = sql(dbPath, `SELECT id, type, status, created_at FROM jobs ORDER BY id DESC LIMIT 1;`, { json: true });
  return { ok: true, job: rows[0] || null, dbPath };
}

/**
 * Claim one pending job for exclusive work (SKIP LOCKED analogue).
 * Lease default 120s — expired leases can be reclaimed.
 */
function claim(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB;
  ensureSchema(dbPath);
  const worker = String(options.worker || `w-${crypto.randomBytes(3).toString('hex')}`);
  const leaseSec = Number(options.leaseSec || 120);
  const ts = nowIso();
  const until = new Date(Date.now() + leaseSec * 1000).toISOString();

  // Select candidate then lock by id (single-writer local sqlite is enough).
  const candidates = sql(
    dbPath,
    `SELECT id, type, payload, attempts FROM jobs
     WHERE status IN ('pending','running')
       AND (locked_until IS NULL OR locked_until < '${ts}')
       AND status != 'done' AND status != 'failed'
     ORDER BY id ASC LIMIT 1;`,
    { json: true },
  );
  // Re-filter: only pending or expired running
  const cand = (candidates || []).find(Boolean);
  if (!cand) return { ok: true, job: null, worker, dbPath };

  sql(
    dbPath,
    `UPDATE jobs SET status='running', locked_by='${worker.replace(/'/g, "''")}',
      locked_until='${until}', attempts=attempts+1, updated_at='${ts}'
     WHERE id=${Number(cand.id)}
       AND (status='pending' OR (status='running' AND (locked_until IS NULL OR locked_until < '${ts}')));`,
  );
  const locked = sql(
    dbPath,
    `SELECT id, type, payload, attempts, locked_by, locked_until, status FROM jobs WHERE id=${Number(cand.id)};`,
    { json: true },
  );
  const job = locked[0];
  if (!job || job.locked_by !== worker) {
    return { ok: true, job: null, worker, dbPath, note: 'lost race' };
  }
  try {
    job.payload = JSON.parse(job.payload || '{}');
  } catch {
    job.payload = {};
  }
  return { ok: true, job, worker, dbPath };
}

function complete(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB;
  const id = Number(options.id);
  if (!id) throw new Error('--id required');
  const worker = options.worker ? String(options.worker) : null;
  const ts = nowIso();
  const status = options.fail ? 'failed' : 'done';
  const err = options.error ? String(options.error).slice(0, 500).replace(/'/g, "''") : '';
  // Lease ownership required when worker is provided — expired/stolen leases cannot complete.
  if (worker) {
    const rows = sql(
      dbPath,
      `SELECT id, locked_by, status FROM jobs WHERE id=${id};`,
      { json: true },
    );
    const row = rows[0];
    if (!row) return { ok: false, id, error: 'job not found', dbPath };
    if (row.locked_by && row.locked_by !== worker) {
      return {
        ok: false,
        id,
        error: `lease owned by ${row.locked_by}, not ${worker}`,
        dbPath,
      };
    }
  }
  const ownerClause = worker
    ? ` AND (locked_by IS NULL OR locked_by='${worker.replace(/'/g, "''")}')`
    : '';
  sql(
    dbPath,
    `UPDATE jobs SET status='${status}', locked_by=NULL, locked_until=NULL,
      last_error=${err ? `'${err}'` : 'NULL'}, updated_at='${ts}'
     WHERE id=${id}${ownerClause};`,
  );
  const check = sql(dbPath, `SELECT status FROM jobs WHERE id=${id};`, { json: true });
  if (!check[0] || check[0].status !== status) {
    return { ok: false, id, error: 'complete failed (lease/ownership)', dbPath };
  }
  return { ok: true, id, status, dbPath };
}

function parseArgs(argv) {
  const args = { cmd: argv[0] || 'help', json: false, dbPath: DEFAULT_DB, type: '', worker: '', id: 0, fail: false, error: '' };
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--db') args.dbPath = path.resolve(argv[++i] || '');
    else if (a === '--type') args.type = argv[++i] || '';
    else if (a === '--worker') args.worker = argv[++i] || '';
    else if (a === '--id') args.id = Number(argv[++i] || 0);
    else if (a === '--fail') args.fail = true;
    else if (a === '--error') args.error = argv[++i] || '';
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || args.cmd === 'help') {
      console.log('Usage: durable-job-queue.js enqueue|claim|complete [--db PATH] [--json]');
      process.exit(0);
    }
    let report;
    if (args.cmd === 'enqueue') report = enqueue({ dbPath: args.dbPath, type: args.type });
    else if (args.cmd === 'claim') report = claim({ dbPath: args.dbPath, worker: args.worker });
    else if (args.cmd === 'complete') {
      report = complete({
        dbPath: args.dbPath,
        id: args.id,
        fail: args.fail,
        error: args.error,
        worker: args.worker,
      });
    }
    else throw new Error(`Unknown command ${args.cmd}`);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(JSON.stringify(report));
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { enqueue, claim, complete, ensureSchema, DEFAULT_DB };
