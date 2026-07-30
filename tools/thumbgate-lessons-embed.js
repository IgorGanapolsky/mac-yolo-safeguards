#!/usr/bin/env node
'use strict';

/**
 * Re-embed ThumbGate lessons with local Ollama nomic-embed-text (real neural vectors).
 * Replaces hashed-TF "embeddings" that the doctor flags as fake.
 *
 * Usage:
 *   node tools/thumbgate-lessons-embed.js --dir ~/.thumbgate --limit 50   # smoke
 *   node tools/thumbgate-lessons-embed.js --dir ~/.thumbgate --apply
 *   node tools/thumbgate-lessons-embed.js --dir /path/to/repo/.thumbgate --apply --json
 *
 * Writes lesson-embeddings.json as { [id]: { hash, vector: number[] } }.
 * Default vector length 384 (truncate nomic 768 prefix for existing 384-d consumers).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

function resolveSqlite3() {
  for (const bin of ['/opt/homebrew/opt/sqlite/bin/sqlite3', '/usr/local/opt/sqlite/bin/sqlite3', 'sqlite3']) {
    if (spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0) return bin;
  }
  return 'sqlite3';
}

function parseArgs(argv) {
  const args = {
    dir: path.join(process.env.HOME || '', '.thumbgate'),
    apply: false,
    json: false,
    limit: 0,
    dims: 384,
    model: 'nomic-embed-text',
    endpoint: '127.0.0.1',
    port: 11434,
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '');
    else if (a === '--apply') args.apply = true;
    else if (a === '--json') args.json = true;
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--dims') args.dims = Number(argv[++i] || 384);
    else if (a === '--model') args.model = argv[++i] || args.model;
    else if (a === '--concurrency') args.concurrency = Number(argv[++i] || 4);
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function loadLessons(dir) {
  const db = path.join(dir, 'lessons.sqlite');
  const out = [];
  if (fs.existsSync(db)) {
    const sql = resolveSqlite3();
    const r = spawnSync(sql, [db, 'SELECT id, context, whatWentWrong, whatToChange, whatWorked, rootCause FROM lessons;'], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    if (r.status === 0) {
      // sqlite default separator |
      for (const line of r.stdout.split('\n')) {
        if (!line.trim()) continue;
        // fragile if | in text — use json mode
      }
    }
    const r2 = spawnSync(
      sql,
      [db, '-json', 'SELECT id, context, whatWentWrong, whatToChange, whatWorked, rootCause FROM lessons;'],
      { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 },
    );
    if (r2.status === 0 && r2.stdout.trim()) {
      try {
        const rows = JSON.parse(r2.stdout);
        for (const row of rows) {
          const text = [row.context, row.whatWentWrong, row.whatToChange, row.whatWorked, row.rootCause]
            .filter(Boolean)
            .join('\n')
            .slice(0, 6000);
          if (text.trim()) out.push({ id: row.id, text });
        }
        return out;
      } catch {
        /* fall through */
      }
    }
  }
  const ledger = path.join(dir, 'lessons-index.jsonl');
  if (fs.existsSync(ledger)) {
    for (const line of fs.readFileSync(ledger, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const raw = JSON.parse(line);
        const id = raw.id || raw.feedbackId;
        const text = raw.context || raw.lesson || raw.whatWentWrong || '';
        if (id && text) out.push({ id: String(id), text: String(text).slice(0, 6000) });
      } catch {
        /* skip */
      }
    }
  }
  return out;
}

function ollamaEmbed(text, options) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: options.model, prompt: text });
    const req = http.request(
      {
        hostname: options.endpoint,
        port: options.port,
        path: '/api/embeddings',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 60000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!Array.isArray(parsed.embedding)) reject(new Error(data.slice(0, 200)));
            else resolve(parsed.embedding);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function truncateOrPad(vector, dims) {
  if (vector.length === dims) return vector;
  if (vector.length > dims) return vector.slice(0, dims);
  return vector.concat(Array(dims - vector.length).fill(0));
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/thumbgate-lessons-embed.js --dir PATH [--apply] [--limit N] [--json]');
    process.exit(0);
  }
  let lessons = loadLessons(args.dir);
  if (args.limit > 0) lessons = lessons.slice(0, args.limit);
  const outPath = path.join(args.dir, 'lesson-embeddings.json');
  const report = {
    dir: args.dir,
    outPath,
    lessonCount: lessons.length,
    apply: args.apply,
    dims: args.dims,
    model: args.model,
    embedded: 0,
    ok: false,
  };
  if (!lessons.length) {
    // Dry-run with empty store is success (CI runners have no ~/.thumbgate lessons).
    // --apply with nothing to write is still a hard failure.
    report.error = 'no lessons to embed';
    report.ok = !args.apply;
    console.log(args.json ? JSON.stringify(report, null, 2) : report.error);
    process.exit(args.apply ? 1 : 0);
  }
  if (!args.apply) {
    report.note = 'dry-run; pass --apply to write lesson-embeddings.json';
    report.ok = true;
    console.log(args.json ? JSON.stringify(report, null, 2) : report.note + ` count=${lessons.length}`);
    process.exit(0);
  }

  // smoke ollama
  await ollamaEmbed('ping', args);

  // Do NOT merge legacy hashed-TF vectors — they poison doctor sampling.
  // Cache only same-run hash→vector for resume within this file if present and neural.
  let cache = {};
  if (fs.existsSync(outPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
        for (const [id, row] of Object.entries(prev)) {
          if (row?.model === args.model && Array.isArray(row.vector) && row.vector.length === args.dims) {
            cache[id] = row;
          }
        }
      }
    } catch {
      cache = {};
    }
  }
  const next = {};

  await mapPool(lessons, args.concurrency, async (lesson) => {
    const hash = crypto.createHash('sha256').update(lesson.text).digest('hex');
    if (cache[lesson.id]?.hash === hash) {
      next[lesson.id] = cache[lesson.id];
      return;
    }
    const emb = await ollamaEmbed(lesson.text, args);
    next[lesson.id] = {
      hash,
      vector: truncateOrPad(emb, args.dims),
      model: args.model,
      dims: args.dims,
      embeddedAt: new Date().toISOString(),
    };
    report.embedded += 1;
    if (report.embedded % 25 === 0) {
      process.stderr.write(`embedded ${report.embedded}/${lessons.length}\n`);
    }
  });

  const bak = `${outPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  if (fs.existsSync(outPath)) fs.copyFileSync(outPath, bak);
  fs.writeFileSync(outPath, JSON.stringify(next));
  report.backupPath = fs.existsSync(bak) ? bak : null;
  report.totalVectors = Object.keys(next).length;
  report.ok = true;
  report.note = `wrote ${report.totalVectors} neural vectors (${report.embedded} newly embedded, cacheHits=${lessons.length - report.embedded})`;
  console.log(args.json ? JSON.stringify(report, null, 2) : report.note);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
