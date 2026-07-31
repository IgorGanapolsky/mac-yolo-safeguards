#!/usr/bin/env node
'use strict';

/**
 * Micro-batch index controller for grepae + lessons (InfoQ July 2026 delta pipeline).
 *
 * Patterns applied from "From Batch to Micro-Batch Streaming" (Parveen Saini / InfoQ):
 *   1. Prefer micro-batch cycles over pure record-level streaming (grouped index state).
 *   2. Advance via deterministic watermark (git SHA / sqlite mtime), not success-file markers.
 *   3. Skip intermediate commits — only care about latest HEAD vs watermark.
 *   4. Overlapping sliding safety: later cycles re-export lessons / re-canary grepae.
 *   5. Watchdog: restart grepae watcher if down; flag if watermark older than 24h without cycle.
 *   6. Periodic full-rebuild backstop flag every N cycles (does not auto-reindex whole gob —
 *      surfaces needFullRebuild for operators / LaunchAgents).
 *
 * Usage:
 *   node tools/index-microbatch.js --once --json
 *   node tools/index-microbatch.js --once --heal --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ISOLATED = path.join(os.homedir(), '.hermes', 'semantic-index', 'mac-yolo-safeguards');
const WATERMARK = path.join(ISOLATED, '.index-watermark.json');
const LESSONS_DIR = path.join(os.homedir(), '.thumbgate');
const FULL_REBUILD_EVERY = 48; // cycles (~ if hourly LaunchAgent, ~2 days)
const STALE_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const args = { once: true, heal: false, json: false };
  for (const a of argv) {
    if (a === '--once') args.once = true;
    else if (a === '--heal') args.heal = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

function gitSha(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function gitBehind(cwd) {
  spawnSync('git', ['-C', cwd, 'fetch', 'origin', 'main', '--quiet'], {
    encoding: 'utf8',
    timeout: 60000,
  });
  const r = spawnSync('git', ['-C', cwd, 'rev-list', '--count', 'HEAD..origin/main'], {
    encoding: 'utf8',
  });
  if (r.status !== 0) return null;
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) ? n : null;
}

function grepaeWatcherRunning() {
  const r = spawnSync('grepai', ['status'], { cwd: ISOLATED, encoding: 'utf8', timeout: 15000 });
  return /Watcher:\s*running/i.test(r.stdout || '');
}

function startWatcher() {
  const r = spawnSync('grepai', ['watch', '--background'], {
    cwd: ISOLATED,
    encoding: 'utf8',
    timeout: 30000,
  });
  return {
    ok: r.status === 0 || /already running/i.test(`${r.stdout}${r.stderr}`),
    out: `${r.stdout || ''}${r.stderr || ''}`.slice(0, 200),
  };
}

function runNode(script, extra = []) {
  return spawnSync(process.execPath, [path.join(REPO, 'tools', script), ...extra], {
    encoding: 'utf8',
    cwd: REPO,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function mtimeMs(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function runCycle(options = {}) {
  const heal = Boolean(options.heal);
  const prev = readJson(WATERMARK, {
    gitSha: null,
    cycleCount: 0,
    updatedAt: null,
    lessonsSqliteMtime: 0,
  });
  const report = {
    checkedAt: new Date().toISOString(),
    isolated: ISOLATED,
    watermarkPath: WATERMARK,
    previous: prev,
    actions: [],
    ok: false,
  };

  if (!fs.existsSync(ISOLATED)) {
    report.error = `isolated clone missing: ${ISOLATED}`;
    return report;
  }

  const head = gitSha(ISOLATED);
  const behind = gitBehind(ISOLATED);
  report.head = head;
  report.behindOriginMain = behind;

  // Watermark advance: only when HEAD moved OR lessons sqlite newer OR watcher dead.
  const lessonsDb = path.join(LESSONS_DIR, 'lessons.sqlite');
  const lessonsMtime = mtimeMs(lessonsDb);
  const watcherUp = grepaeWatcherRunning();
  report.watcherRunning = watcherUp;

  const headAdvanced = Boolean(head && head !== prev.gitSha);
  const lessonsAdvanced = lessonsMtime > Number(prev.lessonsSqliteMtime || 0);
  const watcherDown = !watcherUp;
  const stale =
    prev.updatedAt && Date.now() - Date.parse(prev.updatedAt) > STALE_MS;

  report.triggers = { headAdvanced, lessonsAdvanced, watcherDown, stale };

  if (!headAdvanced && !lessonsAdvanced && !watcherDown && !stale && !heal) {
    report.note = 'no-op: watermark current, watcher up, lessons unchanged';
    report.ok = true;
    report.skipped = true;
    return report;
  }

  // Micro-batch heal steps (grouped index state — not record-level streaming).
  if (heal || behind > 0) {
    if (behind > 0) {
      const pull = spawnSync('git', ['-C', ISOLATED, 'pull', '--ff-only', 'origin', 'main'], {
        encoding: 'utf8',
        timeout: 120000,
      });
      report.actions.push({
        step: 'git-pull',
        ok: pull.status === 0,
        detail: (pull.stdout || pull.stderr || '').slice(0, 200),
      });
    }
  }

  if (heal || watcherDown) {
    if (!grepaeWatcherRunning()) {
      const started = startWatcher();
      report.actions.push({ step: 'watcher-restart', ok: started.ok, detail: started.out });
    } else {
      report.actions.push({ step: 'watcher-restart', ok: true, detail: 'already running' });
    }
  }

  if (heal || headAdvanced || behind > 0) {
    const ensure = runNode('ensure-grepai-index.js', ['--canary', '--json']);
    let ensureJson = null;
    try {
      ensureJson = JSON.parse(ensure.stdout);
    } catch {
      /* */
    }
    report.actions.push({
      step: 'ensure-grepai',
      ok: ensure.status === 0 && Boolean(ensureJson?.ok || ensureJson?.linked),
      detail: ensureJson || (ensure.stderr || ensure.stdout).slice(0, 200),
    });
  }

  if (heal || lessonsAdvanced) {
    const exp = runNode('thumbgate-lessons-export-jsonl.js', [
      '--dir',
      LESSONS_DIR,
      '--apply',
      '--json',
    ]);
    let expJson = null;
    try {
      expJson = JSON.parse(exp.stdout);
    } catch {
      /* */
    }
    report.actions.push({
      step: 'lessons-export',
      ok: exp.status === 0 && Boolean(expJson?.ok),
      detail: expJson || (exp.stderr || exp.stdout).slice(0, 200),
    });
  }

  const cycleCount = Number(prev.cycleCount || 0) + 1;
  const needFullRebuild = cycleCount % FULL_REBUILD_EVERY === 0;
  const next = {
    gitSha: gitSha(ISOLATED) || head,
    cycleCount,
    updatedAt: new Date().toISOString(),
    lessonsSqliteMtime: lessonsMtime,
    needFullRebuild,
    lastTriggers: report.triggers,
  };
  fs.mkdirSync(path.dirname(WATERMARK), { recursive: true });
  fs.writeFileSync(WATERMARK, JSON.stringify(next, null, 2));
  report.watermark = next;
  report.needFullRebuild = needFullRebuild;
  report.ok = (report.actions.length === 0 || report.actions.every((a) => a.ok)) && grepaeWatcherRunning();
  report.watcherRunning = grepaeWatcherRunning();
  return report;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node tools/index-microbatch.js --once [--heal] [--json]');
      process.exit(0);
    }
    const report = runCycle({ heal: args.heal });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(
        `index-microbatch: ${report.ok ? 'OK' : 'FAIL'}${report.skipped ? ' (skipped)' : ''} cycles=${report.watermark?.cycleCount ?? report.previous?.cycleCount ?? 0}`,
      );
      for (const a of report.actions || []) {
        console.log(`  ${a.ok ? 'OK' : 'FAIL'} ${a.step}`);
      }
      if (report.needFullRebuild) console.log('  note: needFullRebuild backstop flagged this cycle');
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { runCycle, WATERMARK, ISOLATED, FULL_REBUILD_EVERY };
