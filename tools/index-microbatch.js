#!/usr/bin/env node
'use strict';

/**
 * Unified retrieval micro-batch controller.
 *
 * grepai source/index truth is owned exclusively by
 * grepai-microbatch-reconciler.js + generation.json. This controller keeps
 * the independent lesson JSONL projection in the same operational cycle and
 * preserves the durable-queue CLI. It never starts a permanent grepai watcher
 * and never advances a second Git watermark.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ISOLATED = path.join(
  process.env.HERMES_SEMANTIC_INDEX_ROOT || path.join(os.homedir(), '.hermes', 'semantic-index'),
  'mac-yolo-safeguards',
);
const LESSONS_DIR = process.env.THUMBGATE_HOME || path.join(os.homedir(), '.thumbgate');
const WATERMARK = path.join(LESSONS_DIR, '.lesson-export-watermark.json');
const FULL_REBUILD_EVERY = 7 * 24 * 60; // compatibility export; reconciler uses elapsed time.

function parseArgs(argv) {
  const args = { once: true, heal: false, json: false, enqueue: false };
  for (const arg of argv) {
    if (arg === '--once') args.once = true;
    else if (arg === '--heal') args.heal = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--enqueue') args.enqueue = true;
    else if (arg === '--help') args.help = true;
    else throw new Error(`Unknown ${arg}`);
  }
  return args;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temp, filePath);
}

function mtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function runNode(script, args = [], options = {}) {
  const result = spawnSync(process.execPath, [path.join(REPO, 'tools', script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: options.timeout || 120_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, ...(options.env || {}) },
  });
  let json = null;
  try { json = JSON.parse(result.stdout || ''); } catch { /* structured failure below */ }
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
    json,
  };
}

function generationCheck(execute = runNode) {
  const result = execute('grepai-mcp-fresh.js', ['check', '--json'], { timeout: 30_000 });
  return {
    ok: result.status === 0 && result.json?.ok === true,
    generationId: result.json?.generationId || null,
    indexedSha: result.json?.indexedSha || null,
    problems: result.json?.problems || [{ code: 'generation_check_failed', detail: result.stderr }],
  };
}

function runCycle(options = {}) {
  const execute = options.execute || runNode;
  const home = options.home || LESSONS_DIR;
  const watermarkPath = options.watermarkPath || path.join(home, path.basename(WATERMARK));
  const lessonsDb = path.join(home, 'lessons.sqlite');
  const previous = readJson(watermarkPath, { lessonsSqliteMtime: 0, updatedAt: null });
  const observedLessonsMtime = options.lessonsMtime ?? mtimeMs(lessonsDb);
  const report = {
    schemaVersion: 'retrieval-microbatch-cycle/v2',
    checkedAt: new Date().toISOString(),
    isolated: ISOLATED,
    watermarkPath,
    previous,
    triggers: {
      generationStale: false,
      lessonsAdvanced: observedLessonsMtime > Number(previous.lessonsSqliteMtime || 0),
    },
    actions: [],
    ok: false,
  };

  let generation = generationCheck(execute);
  report.triggers.generationStale = !generation.ok;

  if (options.heal) {
    const reconcile = execute(
      'grepai-microbatch-reconciler.js',
      ['--once', '--json'],
      { timeout: options.reconcileTimeoutMs || 20 * 60_000 },
    );
    report.actions.push({
      step: 'grepai-generation-reconcile',
      ok: reconcile.status === 0 && reconcile.json?.ok === true,
      detail: reconcile.json || (reconcile.stderr || reconcile.stdout).slice(0, 500),
    });
    generation = generationCheck(execute);
  }

  let lessonsCurrent = !report.triggers.lessonsAdvanced;
  if (options.heal && report.triggers.lessonsAdvanced) {
    const exported = execute(
      'thumbgate-lessons-export-jsonl.js',
      ['--dir', home, '--apply', '--json'],
      { timeout: 120_000 },
    );
    const exportOk = exported.status === 0 && exported.json?.ok === true;
    report.actions.push({
      step: 'lessons-export-jsonl',
      ok: exportOk,
      detail: exported.json || (exported.stderr || exported.stdout).slice(0, 500),
    });
    if (exportOk) {
      lessonsCurrent = true;
      writeJsonAtomic(watermarkPath, {
        schemaVersion: 'lesson-export-watermark/v1',
        lessonsSqliteMtime: observedLessonsMtime,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  report.generation = generation;
  report.lessonsCurrent = lessonsCurrent;
  report.ok = generation.ok && lessonsCurrent && report.actions.every((action) => action.ok);
  report.skipped = report.actions.length === 0;
  return report;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node tools/index-microbatch.js --once [--heal] [--enqueue] [--json]');
      process.exit(0);
    }
    if (args.enqueue) {
      const { enqueue } = require('./durable-job-queue');
      const queued = enqueue({ type: 'index-microbatch', payload: { heal: args.heal, once: true } });
      if (args.json) console.log(JSON.stringify({ enqueued: true, ...queued }, null, 2));
      else console.log(`enqueued job id=${queued.job?.id} type=index-microbatch`);
      process.exit(queued.ok ? 0 : 1);
    }
    const report = runCycle({ heal: args.heal });
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(
        `index-microbatch: ${report.ok ? 'OK' : 'FAIL'} generation=${report.generation.generationId || 'stale'} lessons=${report.lessonsCurrent ? 'current' : 'pending'}`,
      );
      for (const action of report.actions) console.log(`  ${action.ok ? 'OK' : 'FAIL'} ${action.step}`);
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = {
  FULL_REBUILD_EVERY,
  ISOLATED,
  WATERMARK,
  generationCheck,
  parseArgs,
  runCycle,
};
