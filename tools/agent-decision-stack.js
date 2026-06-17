#!/usr/bin/env node
'use strict';

/**
 * agent-decision-stack.js — gather DS / telemetry / Agentic RAG before non-trivial decisions.
 *
 * Usage:
 *   node tools/agent-decision-stack.js --task "Hermes Firebase CI status" [--json]
 *   node tools/agent-decision-stack.js --task "..." --gh-run 27697975243 --json
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

const usage = `Usage:
  node tools/agent-decision-stack.js --task "<decision context>" [options]

Options:
  --task TEXT          Required. What you are deciding (used for RAG queries).
  --gh-run ID          Optional GitHub Actions run id (repo: IgorGanapolsky/mac-yolo-safeguards).
  --graphify-query     Optional override for graphify query (default: --task).
  --skip-thumbgate     Skip ThumbGate lessons search.
  --skip-graphify      Skip graphify query.
  --json               Print structured brief only.`;

function parseArgs(argv) {
  const args = {
    task: '',
    ghRun: '',
    graphifyQuery: '',
    skipThumbgate: false,
    skipGraphify: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--task') args.task = argv[++i] || '';
    else if (arg === '--gh-run') args.ghRun = argv[++i] || '';
    else if (arg === '--graphify-query') args.graphifyQuery = argv[++i] || '';
    else if (arg === '--skip-thumbgate') args.skipThumbgate = true;
    else if (arg === '--skip-graphify') args.skipGraphify = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function run(cmd, cmdArgs, options = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    encoding: 'utf8',
    cwd: options.cwd || REPO,
    timeout: options.timeout || 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

function graphifyBin() {
  const local = path.join(REPO, '.graphify-venv', 'bin', 'graphify');
  return fs.existsSync(local) ? local : 'graphify';
}

function graphBuilt() {
  return fs.existsSync(path.join(REPO, 'graphify-out', 'graph.json'));
}

function extractGhRunFeatures(runId) {
  if (!runId) return { skipped: true, reason: 'no --gh-run' };
  const result = run('gh', [
    'run',
    'view',
    runId,
    '--repo',
    'IgorGanapolsky/mac-yolo-safeguards',
    '--json',
    'status,conclusion,updatedAt,url,jobs',
  ]);
  if (!result.ok) {
    return { error: result.stderr || result.stdout || `gh exit ${result.status}` };
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    return { error: `invalid gh json: ${error.message}` };
  }
  const androidJob = (payload.jobs || []).find((j) => /android/i.test(j.name || ''));
  const easStep = androidJob?.steps?.find((s) => /build android/i.test(s.name || ''));
  const started = easStep?.startedAt;
  const easMinutes =
    started && easStep?.status === 'in_progress'
      ? Math.round((Date.now() - Date.parse(started)) / 60_000)
      : null;
  return {
    runId,
    url: payload.url,
    status: payload.status,
    conclusion: payload.conclusion || null,
    updatedAt: payload.updatedAt,
    androidJob: androidJob
      ? {
          name: androidJob.name,
          status: androidJob.status,
          conclusion: androidJob.conclusion || null,
          easBuildStep: easStep
            ? {
                status: easStep.status,
                startedAt: easStep.startedAt,
                completedAt: easStep.completedAt,
                minutesInProgress: easMinutes,
              }
            : null,
        }
      : null,
    heuristic:
      easMinutes != null && easMinutes > 60
        ? 'EAS build unusually long — check expo.dev dashboard before claiming ship'
        : payload.status === 'in_progress'
          ? 'wait_for_completion_before_ship_claim'
          : payload.conclusion === 'success'
            ? 'verify_firebase_invite_and_apk_on_device'
            : payload.conclusion === 'failure'
              ? 'read_failed_logs_before_retry'
              : 'unknown',
  };
}

function thumbgateLessons(task) {
  const result = run(
    'npx',
    ['--yes', '--package', 'thumbgate@1.27.6', 'thumbgate', 'lessons', task],
    { timeout: 90_000 },
  );
  if (!result.ok) {
    return { error: result.stderr || result.stdout };
  }
  const lines = result.stdout.split('\n');
  const lessons = [];
  for (const line of lines) {
    const match = line.match(/^\d+\.\s+(MISTAKE|SUCCESS|BLOCKED):\s*(.+)/);
    if (match) {
      lessons.push({ kind: match[1], summary: match[2].slice(0, 240) });
    }
    if (lessons.length >= 5) break;
  }
  return {
    rawPreview: result.stdout.split('\n').slice(0, 18).join('\n'),
    topLessons: lessons,
    antiPatterns: lessons.filter((l) => l.kind === 'MISTAKE').map((l) => l.summary),
  };
}

function graphifyQuery(task) {
  if (!graphBuilt()) {
    return { skipped: true, reason: 'graphify-out/graph.json missing' };
  }
  const query = task.slice(0, 200);
  const result = run(graphifyBin(), ['query', query], { timeout: 60_000 });
  if (!result.ok) {
    return { error: result.stderr || result.stdout };
  }
  const fileHits = [...result.stdout.matchAll(/src=([^\s\]]+)/g)]
    .map((m) => m[1])
    .filter((p) => !p.includes('/Pods/') && !p.includes('node_modules'))
    .slice(0, 12);
  return {
    query,
    relevantFiles: [...new Set(fileHits)],
    preview: result.stdout.split('\n').slice(0, 15).join('\n'),
  };
}

function recommendNextAction(brief) {
  const gh = brief.telemetry?.githubRun;
  if (gh?.status === 'in_progress') {
    return `Poll ${gh.url || 'CI run'}; do not claim Firebase ship until conclusion=success.`;
  }
  if (gh?.conclusion === 'failure') {
    return 'gh run view --log-failed; fix root cause; capture ThumbGate down-signal with log excerpt.';
  }
  if (brief.rag?.thumbgate?.antiPatterns?.length) {
    return `Apply RAG anti-patterns: avoid ${brief.rag.thumbgate.antiPatterns[0].slice(0, 80)}…`;
  }
  return 'Proceed with change protocol; capture lesson after verification.';
}

function buildBrief(args) {
  const task = args.task.trim();
  if (!task) throw new Error('--task is required');

  const brief = {
    checkedAt: new Date().toISOString(),
    task,
    rag: {},
    telemetry: {},
    recommendation: '',
  };

  if (!args.skipThumbgate) {
    brief.rag.thumbgate = thumbgateLessons(task);
  }
  if (!args.skipGraphify) {
    brief.rag.graphify = graphifyQuery(args.graphifyQuery || task);
  }
  brief.telemetry.githubRun = extractGhRunFeatures(args.ghRun);
  brief.recommendation = recommendNextAction(brief);
  return brief;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  const brief = buildBrief(args);
  if (args.json) {
    console.log(JSON.stringify(brief, null, 2));
    return;
  }
  console.log(`# Agent decision stack — ${brief.checkedAt}`);
  console.log(`Task: ${brief.task}\n`);
  if (brief.rag.thumbgate?.topLessons?.length) {
    console.log('## ThumbGate lessons (RAG)');
    for (const lesson of brief.rag.thumbgate.topLessons) {
      console.log(`- [${lesson.kind}] ${lesson.summary}`);
    }
    console.log('');
  }
  if (brief.rag.graphify?.relevantFiles?.length) {
    console.log('## Graphify files');
    for (const file of brief.rag.graphify.relevantFiles) {
      console.log(`- ${file}`);
    }
    console.log('');
  }
  if (brief.telemetry.githubRun && !brief.telemetry.githubRun.skipped) {
    console.log('## CI telemetry');
    console.log(JSON.stringify(brief.telemetry.githubRun, null, 2));
    console.log('');
  }
  console.log(`## Recommendation\n${brief.recommendation}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
