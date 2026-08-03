#!/usr/bin/env node
'use strict';

/**
 * harness-smeval.js — Node twin of the smevals *architecture* (not the Python package).
 *
 * Decision: D-2026-08-03-eval-architecture.md
 * - run ≠ grade (fixtures are "runs"; gates are graders)
 * - config can label harness assumptions (fixture configs only in v1)
 * - CI offline; no uvx/smevals/llm required
 *
 * Usage:
 *   node tools/harness-smeval.js run evals/ship-honesty [--json]
 *   node tools/harness-smeval.js report evals/ship-honesty [--json]
 *   node tools/harness-smeval.js list evals/ship-honesty
 *
 * Exit 0 if all task expects match grades; 1 otherwise.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const {
  evaluateShipClaim,
  summarizeResults,
} = require('./ship-claim-gate');
const { scoreTaste } = require('./taste-gate');

function parseArgs(argv) {
  const out = { cmd: 'run', evalDir: null, json: false, help: false };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else rest.push(a);
  }
  if (rest[0] && ['run', 'report', 'list', 'grade'].includes(rest[0])) {
    out.cmd = rest.shift();
  }
  out.evalDir = rest[0]
    ? path.resolve(rest[0])
    : path.join(ROOT, 'evals', 'ship-honesty');
  return out;
}

function loadEval(evalDir) {
  const metaPath = path.join(evalDir, 'eval.yaml');
  const metaRaw = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, 'utf8') : '';
  const nameMatch = metaRaw.match(/^name:\s*(.+)$/m);
  const tasksDir = path.join(evalDir, 'tasks');
  if (!fs.existsSync(tasksDir)) {
    throw new Error(`No tasks/ under ${evalDir}`);
  }
  const tasks = fs
    .readdirSync(tasksDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const full = path.join(tasksDir, f);
      const task = JSON.parse(fs.readFileSync(full, 'utf8'));
      task._file = full;
      return task;
    });
  return {
    name: nameMatch ? nameMatch[1].trim() : path.basename(evalDir),
    dir: evalDir,
    metaRaw,
    tasks,
  };
}

/**
 * Grade one task (fixture run). Pure enough for unit tests.
 */
function gradeTask(task) {
  const domain = task.domain || 'ship_status';
  const expect = String(task.expect || 'pass').toLowerCase();
  const claim = task.claim || task.text || task.output || '';

  let grade;
  if (domain === 'promo_social' || domain === 'outreach_email' || domain === 'product_ui') {
    const taste = scoreTaste(claim, domain);
    grade = {
      grader: 'taste-gate',
      ok: taste.ok,
      score: taste.score,
      threshold: taste.threshold,
      code: taste.code,
      details: taste.dimensions,
      message: taste.message,
    };
  } else {
    // ship_status / default → ship-claim-gate (+ taste soft metric)
    const resultsSummary = task.results ? summarizeResults(task.results) : null;
    const ship = evaluateShipClaim({
      claim,
      resultsSummary,
      requireSha: task.requireSha || null,
      requireUrl: task.requireUrl || null,
      checkDevice: Boolean(task.device),
      device: task.device || null,
    });
    const taste = scoreTaste(claim, 'ship_status');
    grade = {
      grader: 'ship-claim-gate+taste',
      ok: ship.ok,
      score: ship.ok ? 1 : 0,
      tasteScore: taste.score,
      code: ship.code,
      blocks: ship.blocks,
      warnings: ship.warnings,
      message: ship.ok ? 'ship ALLOW' : ship.blocks.join('; '),
    };
  }

  const expectPass = expect === 'pass' || expect === 'allow';
  const expectFail = expect === 'fail' || expect === 'block';
  let matched = false;
  if (expectPass) matched = grade.ok === true;
  else if (expectFail) matched = grade.ok === false;
  else matched = false;

  return {
    task: task.name || path.basename(task._file || 'task', '.json'),
    domain,
    expect: expectPass ? 'pass' : 'fail',
    matched,
    grade,
    claimPreview: String(claim).slice(0, 120),
  };
}

function runEval(evalDir) {
  const ev = loadEval(evalDir);
  const results = ev.tasks.map(gradeTask);
  const pass = results.filter((r) => r.matched).length;
  const fail = results.filter((r) => !r.matched).length;
  return {
    ok: fail === 0 && results.length > 0,
    eval: ev.name,
    dir: ev.dir,
    total: results.length,
    pass,
    fail,
    results,
    message:
      fail === 0
        ? `harness-smeval PASS ${ev.name} ${pass}/${results.length}`
        : `harness-smeval FAIL ${ev.name} ${fail}/${results.length} mismatched expects`,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`harness-smeval — Node run/grade suite (smevals architecture, our gates)

  node tools/harness-smeval.js run [evals/ship-honesty] [--json]
  node tools/harness-smeval.js list [evals/ship-honesty]

See docs/DECISIONS/D-2026-08-03-eval-architecture.md`);
    process.exit(0);
  }

  if (args.cmd === 'list') {
    const ev = loadEval(args.evalDir);
    if (args.json) {
      console.log(JSON.stringify({ name: ev.name, tasks: ev.tasks.map((t) => t.name) }, null, 2));
    } else {
      console.log(`${ev.name} (${ev.tasks.length} tasks)`);
      for (const t of ev.tasks) {
        console.log(`  - ${t.name} expect=${t.expect} domain=${t.domain}`);
      }
    }
    process.exit(0);
  }

  // run | report | grade → same offline grade of fixtures
  const report = runEval(args.evalDir);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(report.message);
    for (const r of report.results) {
      const mark = r.matched ? 'OK  ' : 'MISS';
      console.log(
        `  ${mark} ${r.task} expect=${r.expect} graded=${r.grade.ok ? 'pass' : 'fail'} (${r.grade.grader})`,
      );
      if (!r.matched) {
        console.log(`       ${r.grade.message || r.grade.code}`);
      }
    }
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  loadEval,
  gradeTask,
  runEval,
  parseArgs,
};

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('harness-smeval error:', e.message || e);
    process.exit(2);
  }
}
