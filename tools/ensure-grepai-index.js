#!/usr/bin/env node
'use strict';

/**
 * ensure-grepai-index.js — keep the multi-worktree checkout from searching a dead index.
 *
 * Why
 * ---
 * The canonical grepae index lives in an isolated clone:
 *   ~/.hermes/semantic-index/mac-yolo-safeguards
 * so `grepai watch` does not fan out into every agent worktree.
 *
 * Agents often run from the live multi-worktree checkout, whose local
 * `.grepai/index.gob` can be a 384-byte empty shell while the isolated clone is
 * healthy (measured 2026-07-29: 100 consecutive zero-result searches).
 *
 * This script:
 *   1. Verifies the isolated index is non-empty (or warns + optional --start-watch)
 *   2. Symlinks REPO/.grepai/{index,symbols}.gob → isolated gobs
 *   3. Optionally runs the live canary
 *
 * Usage:
 *   node tools/ensure-grepai-index.js [--start-watch] [--canary] [--json]
 * Exit: 0 ok · 1 isolated index still dead · 2 usage
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ISOLATED = path.join(os.homedir(), '.hermes/semantic-index/mac-yolo-safeguards');
const MIN_BYTES = 10 * 1024;

function parseArgs(argv) {
  // Default: heal watcher when down. Pass --no-start-watch to stay read-only.
  const args = { startWatch: true, canary: false, json: false, help: false };
  for (const a of argv) {
    if (a === '--start-watch') args.startWatch = true;
    else if (a === '--no-start-watch') args.startWatch = false;
    else if (a === '--canary') args.canary = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function bytes(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function symlinkForce(target, linkPath) {
  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath)) {
      fs.unlinkSync(linkPath);
    }
  } catch {
    /* missing is fine */
  }
  fs.symlinkSync(target, linkPath);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/ensure-grepai-index.js [--start-watch] [--canary] [--json]

Point this checkout's .grepai index at the isolated clone and optionally start
watch + canary. See docs/LOCAL-SEMANTIC-CODE-INDEX.md.
`);
    process.exit(0);
  }

  const report = {
    isolated: ISOLATED,
    repo: REPO,
    isolatedBytes: 0,
    linked: false,
    watchStarted: false,
    canary: null,
    ok: false,
  };

  if (!fs.existsSync(ISOLATED)) {
    report.error = `isolated clone missing at ${ISOLATED} — clone origin/main there first`;
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.error(`ensure-grepai-index: FAIL — ${report.error}`);
    process.exit(1);
  }

  const isolGob = path.join(ISOLATED, '.grepai/index.gob');
  const isolSym = path.join(ISOLATED, '.grepai/symbols.gob');
  report.isolatedBytes = bytes(isolGob);

  if (report.isolatedBytes < MIN_BYTES) {
    if (args.startWatch) {
      const start = spawnSync('grepai', ['watch', '--background'], {
        cwd: ISOLATED,
        encoding: 'utf8',
        timeout: 60000,
      });
      report.watchStarted = start.status === 0;
      report.watchOut = (start.stdout || start.stderr || '').slice(0, 400);
    }
    report.error = `isolated index.gob is ${report.isolatedBytes} bytes (< ${MIN_BYTES}) — still empty; wait for watch or rebuild`;
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.error(`ensure-grepai-index: FAIL — ${report.error}`);
      if (report.watchStarted) console.error('  started grepai watch --background on isolated clone; re-run later');
    }
    process.exit(1);
  }

  const repoGrepai = path.join(REPO, '.grepai');
  ensureDir(repoGrepai);
  symlinkForce(isolGob, path.join(repoGrepai, 'index.gob'));
  if (fs.existsSync(isolSym)) {
    symlinkForce(isolSym, path.join(repoGrepai, 'symbols.gob'));
  }
  // Prefer hybrid config from isolated if present
  const isolCfg = path.join(ISOLATED, '.grepai/config.yaml');
  const repoCfg = path.join(repoGrepai, 'config.yaml');
  if (fs.existsSync(isolCfg)) {
    fs.copyFileSync(isolCfg, repoCfg);
  }
  report.linked = true;
  report.repoIndexBytes = bytes(path.join(repoGrepai, 'index.gob'));

  if (args.startWatch) {
    const st = spawnSync('grepai', ['watch', '--status'], { encoding: 'utf8', timeout: 10000 });
    const running = /running|PID/i.test(st.stdout || '');
    if (!running) {
      const start = spawnSync('grepai', ['watch', '--background'], {
        cwd: ISOLATED,
        encoding: 'utf8',
        timeout: 60000,
      });
      report.watchStarted = start.status === 0 || /already running/i.test(start.stderr || start.stdout || '');
    } else {
      report.watchStarted = false;
      report.watchAlready = true;
    }
  }

  if (args.canary) {
    const canary = path.join(REPO, 'tools/grepai-index-canary.js');
    const run = spawnSync(process.execPath, [canary, '--dir', path.join(ISOLATED, '.grepai'), '--live', '--json'], {
      encoding: 'utf8',
      timeout: 60000,
    });
    try {
      report.canary = JSON.parse(run.stdout);
    } catch {
      report.canary = { ok: run.status === 0, raw: (run.stdout || run.stderr || '').slice(0, 300) };
    }
    report.ok = Boolean(report.linked && report.canary && report.canary.ok);
  } else {
    // Prove search from REPO cwd
    const search = spawnSync('grepai', ['search', 'retrieval harness', '--json', '--compact'], {
      cwd: REPO,
      encoding: 'utf8',
      timeout: 30000,
    });
    let n = 0;
    try {
      const body = JSON.parse(search.stdout);
      n = Array.isArray(body) ? body.length : (body.results || body.matches || []).length;
    } catch {
      n = 0;
    }
    report.searchFromRepo = n;
    report.ok = report.linked && n > 0;
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `ensure-grepai-index: ${report.ok ? 'OK' : 'FAIL'} — isolated ${report.isolatedBytes} bytes → linked into REPO .grepai` +
        (report.searchFromRepo != null ? ` · search hits=${report.searchFromRepo}` : '') +
        (report.canary ? ` · canary=${report.canary.ok ? 'HEALTHY' : 'UNHEALTHY'}` : ''),
    );
  }
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message || e);
    process.exit(2);
  }
}

module.exports = { main, MIN_BYTES };
