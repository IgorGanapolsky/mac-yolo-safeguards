#!/usr/bin/env node
'use strict';

/**
 * grepai index canary — detects the silent-empty-index failure mode.
 *
 * Motivation (2026-07-29 audit): .grepai/stats.json showed 100 consecutive
 * searches over five days ALL returning result_count: 0, while .grepai/index.gob
 * was a 384-byte empty shell. Nothing noticed, because an empty result set is
 * indistinguishable from "no match" unless something asserts otherwise.
 *
 * Checks, in order:
 *   1. stats.json tail health — if the last N logged searches (default 15) all
 *      returned zero results, the index is presumed dead. A healthy repo this
 *      size does not produce 15 straight legitimate zero-result queries.
 *   2. index.gob size — an index under MIN_INDEX_BYTES cannot contain a real
 *      chunk set for this repo.
 *   3. (optional, --live) if the grepai binary is on PATH, run a canary query
 *      that MUST return >0 results ("retrieval harness") and fail otherwise.
 *
 * Exit codes: 0 healthy (or --warn-only), 1 unhealthy, 2 usage/skip error.
 *
 * Usage:
 *   node tools/grepai-index-canary.js [--dir .grepai] [--tail 15] [--live] [--warn-only] [--json]
 *
 * Repair runbook (grepai ≥0.35 — there is no `index --rebuild`; watch builds):
 *   1. ollama ps                          # ensure nomic-embed-text is servable
 *   2. Use the isolated clone (NOT the multi-worktree checkout — worktrees fan out):
 *        cd ~/.hermes/semantic-index/mac-yolo-safeguards && git pull --ff-only
 *        rm -f .grepai/index.gob          # only if empty shell (~384 bytes)
 *        grepai watch --background        # full embed; hybrid RRF if config enabled
 *   3. Wait until: grepai status --no-ui  shows Files indexed >> 0 and index size >> 10KB
 *   4. cd that clone && grepai search "retrieval harness" --json | head  # expect >0
 *   5. node tools/grepai-index-canary.js --dir ~/.hermes/semantic-index/mac-yolo-safeguards/.grepai --live
 *
 * Agents in worktrees: prefer MCP mcp-serve on the semantic-index path, or search
 * from that clone — a 384-byte .grepai/index.gob in a worktree is a dead local shell.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const MIN_INDEX_BYTES = 10 * 1024; // an empty gob shell is ~384 bytes
const LIVE_QUERY = 'retrieval harness';

function parseArgs(argv) {
  const args = { dir: path.join(REPO, '.grepai'), tail: 15, live: false, warnOnly: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '');
    else if (a === '--tail') args.tail = Number(argv[++i] || 15);
    else if (a === '--live') args.live = true;
    else if (a === '--warn-only') args.warnOnly = true;
    else if (a === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readStatsTail(statsPath, tail) {
  if (!fs.existsSync(statsPath)) return null;
  const rawText = fs.readFileSync(statsPath, 'utf8');
  let searches = null;
  try {
    const parsed = JSON.parse(rawText);
    searches = Array.isArray(parsed) ? parsed : parsed.searches || parsed.entries || [];
  } catch {
    // grepai writes stats as JSONL (one JSON object per line), not a JSON
    // document — fall back to line-wise parsing.
    searches = [];
    for (const line of rawText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        searches.push(JSON.parse(trimmed));
      } catch {
        // skip unparseable lines rather than failing the whole health check
      }
    }
    if (searches.length === 0) return { parseError: 'neither JSON nor JSONL parseable' };
  }
  if (!Array.isArray(searches) || searches.length === 0) return { searches: [] };
  return { searches: searches.slice(-tail) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const problems = [];
  const info = { dir: args.dir, checkedAt: new Date().toISOString() };

  const statsPath = path.join(args.dir, 'stats.json');
  const stats = readStatsTail(statsPath, args.tail);
  if (stats === null) {
    info.stats = 'absent';
  } else if (stats.parseError) {
    problems.push(`stats.json unparseable: ${stats.parseError}`);
  } else if (stats.searches.length === 0) {
    info.stats = 'empty';
  } else {
    const zeroes = stats.searches.filter((s) => (s.result_count ?? s.resultCount ?? 0) === 0).length;
    info.stats = { tail: stats.searches.length, zeroResult: zeroes };
    if (zeroes === stats.searches.length && stats.searches.length >= Math.min(args.tail, 10)) {
      problems.push(
        `last ${stats.searches.length} searches ALL returned 0 results — index presumed dead (this exact failure ran unnoticed for 5 days before 2026-07-29)`,
      );
    }
  }

  const indexPath = path.join(args.dir, 'index.gob');
  if (fs.existsSync(indexPath)) {
    const bytes = fs.statSync(indexPath).size;
    info.indexBytes = bytes;
    if (bytes < MIN_INDEX_BYTES) {
      problems.push(`index.gob is ${bytes} bytes (< ${MIN_INDEX_BYTES}) — empty shell, not a real index`);
    }
  } else {
    info.indexBytes = null;
  }

  if (args.live) {
    const probe = spawnSync('grepai', ['search', LIVE_QUERY, '--json', '--compact'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 30000,
    });
    if (probe.error && probe.error.code === 'ENOENT') {
      info.live = 'grepai binary not on PATH — live probe skipped';
    } else if (probe.status !== 0) {
      problems.push(`live probe failed (exit ${probe.status}): ${(probe.stderr || '').slice(0, 200)}`);
    } else {
      let count = 0;
      try {
        const body = JSON.parse(probe.stdout);
        count = (body.results || body.matches || body).length || 0;
      } catch {
        count = probe.stdout.trim() ? probe.stdout.trim().split('\n').length : 0;
      }
      info.live = { query: LIVE_QUERY, results: count };
      if (count === 0) problems.push(`live canary query "${LIVE_QUERY}" returned 0 results — must be >0 in this repo`);
    }
  }

  const report = { ok: problems.length === 0, problems, ...info };
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`grepai index canary: ${report.ok ? 'HEALTHY' : args.warnOnly ? 'UNHEALTHY (warn-only)' : 'UNHEALTHY'}`);
    for (const p of problems) console.log(`  - ${p}`);
    if (!report.ok) console.log('  Repair: see runbook header of tools/grepai-index-canary.js');
  }
  process.exit(report.ok || args.warnOnly ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(2);
}
