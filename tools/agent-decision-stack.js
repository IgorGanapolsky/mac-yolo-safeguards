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
  --skip-local-retrieval
                       Skip local repo retrieval harness query.
  --with-arc           Run ARC-AGI-inspired skill-acquisition probe (tools/arc-skill-efficiency.js).
  --skip-arc           Skip ARC probe (default: run when task mentions model/eval/promote/intelligence).
  --json               Print structured brief only.`;

function parseArgs(argv) {
  const args = {
    task: '',
    ghRun: '',
    graphifyQuery: '',
    skipThumbgate: false,
    skipGraphify: false,
    skipLocalRetrieval: false,
    withArc: false,
    skipArc: false,
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
    else if (arg === '--skip-local-retrieval') args.skipLocalRetrieval = true;
    else if (arg === '--with-arc') args.withArc = true;
    else if (arg === '--skip-arc') args.skipArc = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function shouldRunArcProbe(args) {
  if (args.skipArc) return false;
  if (args.withArc) return true;
  const t = String(args.task || '').toLowerCase();
  return /\b(arc|agi|model\s*promot|benchmark|intelligence|skill.?acquisition|generaliz|fleet\s*model|reasoning\s*eval)\b/.test(
    t,
  );
}

function runArcSkillProbe() {
  const probePath = path.join(REPO, 'tools', 'arc-skill-efficiency.js');
  if (!fs.existsSync(probePath)) {
    return { skipped: true, reason: 'tools/arc-skill-efficiency.js missing' };
  }
  try {
    const { runProbe } = require(probePath);
    const report = runProbe({ minHoldout: 0.8 });
    return {
      schema: report.schema,
      overallStatus: report.overallStatus,
      metrics: report.metrics,
      gates: report.gates,
      recommendation: report.recommendation,
      source: report.source?.philosophy,
    };
  } catch (error) {
    return { error: error.message || String(error) };
  }
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

/**
 * Local repo retrieval for the decision stack.
 * Prefers dual-path (production finalize: doc ACL + turn-trace) so agent RAG
 * is observable and fail-closed. Falls back to plain harness retrieve.
 *
 * Env:
 *   HERMES_TURN_TRACE=0          disable default turn traces
 *   HERMES_RETRIEVE_PRINCIPAL    document ACL principal (e.g. org:demo)
 *   HERMES_DOCUMENT_ACL          path or JSON for hermes-document-acl/v1
 *   HERMES_DECISION_DUAL_PATH=full  also fuse grepae (slower)
 */
function localRetrieval(task, options = {}) {
  const harnessPath = path.join(REPO, 'tools', 'hermes-retrieval-harness.js');
  const dualPathScript = path.join(REPO, 'tools', 'retrieval-dual-path.js');
  if (!fs.existsSync(harnessPath) && !fs.existsSync(dualPathScript)) {
    return { skipped: true, reason: 'retrieval tools missing' };
  }

  const limit = Number(options.limit || 5);
  const principal = options.principal || process.env.HERMES_RETRIEVE_PRINCIPAL || '';
  const acl = options.acl || process.env.HERMES_DOCUMENT_ACL || '';
  // Default ON for live agent path unless explicitly disabled.
  const wantTrace = options.trace !== false && process.env.HERMES_TURN_TRACE !== '0';
  const fullDual = options.fullDualPath === true || process.env.HERMES_DECISION_DUAL_PATH === 'full';

  // Prefer dual-path CLI so ACL + writeTurnTrace always go through production-ops.
  if (fs.existsSync(dualPathScript)) {
    try {
      const args = [
        dualPathScript,
        '--query',
        String(task),
        '--limit',
        String(limit),
        '--json',
        '--no-rerank',
        '--repo',
        REPO,
      ];
      if (!fullDual) args.push('--harness-only');
      if (wantTrace) args.push('--trace');
      if (principal) {
        args.push('--principal', principal);
      }
      if (acl) {
        args.push('--acl', acl);
      }
      const r = spawnSync(process.execPath, args, {
        encoding: 'utf8',
        cwd: REPO,
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (r.status === 0) {
        const body = JSON.parse(r.stdout || '{}');
        const matches = Array.isArray(body.matches) ? body.matches : [];
        return {
          query: String(task).slice(0, 200),
          backend: body.fusion || 'dual-path',
          fileCount: matches.length,
          production: {
            acl: body.acl || null,
            latencyMs: body.latencyMs ?? null,
            traceId: body.traceId || null,
            tracePath: body.tracePath || null,
            traceError: body.traceError || null,
            pathStatus: body.pathStatus || null,
            rewritten: body.rewritten || null,
          },
          citations: matches.map((match) => ({
            path: match.path,
            score: match.rerankScore ?? match.rrfScore ?? match.score,
            reasons: match.reasons || match.sources || match.method || undefined,
            snippet: match.snippet,
          })),
        };
      }
      // Fall through to harness on non-zero dual-path exit.
    } catch {
      /* fall through */
    }
  }

  if (!fs.existsSync(harnessPath)) {
    return { error: 'dual-path failed and harness missing' };
  }
  try {
    const { retrieve } = require(harnessPath);
    const result = retrieve(task, {
      repo: REPO,
      limit,
      maxFiles: 4000,
      maxBytes: 160000,
    });
    // Still apply production-ops finalize when dual-path CLI is unavailable.
    let matches = (result.matches || []).map((m, i) => ({
      path: m.path,
      rank: i + 1,
      score: m.score,
      snippet: m.snippet,
      reasons: m.reasons,
      source: 'harness',
    }));
    let production = { backend: 'harness', fallback: true };
    try {
      const { finalizeRetrieveResult } = require(dualPathScript);
      const finalized = finalizeRetrieveResult(
        {
          query: task,
          matches,
          fusion: 'decision-stack-harness-fallback',
          pathStatus: { harness: 'ok', grepai: 'skipped' },
        },
        {
          principal: principal || undefined,
          acl: acl || undefined,
          trace: wantTrace,
          route: { id: 'agent-decision-stack/localRetrieval' },
          traceDir: options.traceDir,
          _startedAt: Date.now(),
        },
      );
      matches = finalized.matches || matches;
      production = {
        backend: finalized.fusion || 'decision-stack-harness-fallback',
        fallback: true,
        acl: finalized.acl || null,
        latencyMs: finalized.latencyMs ?? null,
        traceId: finalized.traceId || null,
        tracePath: finalized.tracePath || null,
        traceError: finalized.traceError || null,
      };
    } catch (finalizeErr) {
      production.finalizeError = finalizeErr.message || String(finalizeErr);
    }
    return {
      query: String(task).slice(0, 200),
      backend: production.backend || 'harness',
      fileCount: result.fileCount,
      production,
      citations: matches.map((match) => ({
        path: match.path,
        score: match.score,
        reasons: match.reasons,
        snippet: match.snippet,
      })),
    };
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

function readContinuousDeviceVerified() {
  const script = path.join(REPO, 'hermes-mobile', 'scripts', 'verify-continuous-e2e.sh');
  if (!fs.existsSync(script)) {
    return { skipped: true, reason: 'hermes-mobile/scripts/verify-continuous-e2e.sh missing' };
  }
  const result = run('bash', [script, '--json'], { timeout: 20_000 });
  let payload = {};
  try {
    payload = JSON.parse(result.stdout || '{}');
  } catch (error) {
    return {
      error: `invalid verify-continuous-e2e json: ${error.message}`,
      stdout: (result.stdout || '').slice(0, 400),
      status: result.status,
    };
  }
  const e2e = payload.e2e || 'missing';
  const deviceVerified = payload.deviceVerified === true && e2e === 'pass';
  return {
    e2e,
    unit: payload.unit || 'missing',
    updatedAt: payload.updatedAt || '',
    detail: payload.detail || '',
    deviceVerified,
    scriptExit: result.status,
    heuristic: deviceVerified
      ? 'device_e2e_green_ship_claims_allowed_with_unit'
      : 'deviceVerified=false — refuse "device verified" / "works on phone" claims',
  };
}

function mlSystemScoresBrief() {
  const script = path.join(REPO, 'tools', 'ml-system-scores.js');
  if (!fs.existsSync(script)) {
    return { skipped: true, reason: 'tools/ml-system-scores.js missing' };
  }
  const result = run(process.execPath, [script, '--json', '--write'], { timeout: 120_000 });
  try {
    const body = JSON.parse(result.stdout || '{}');
    return {
      system_scores_line: body.system_scores_line || null,
      overall: body.parts?.overall || null,
      ml: body.parts?.ml || null,
      monetization: body.parts?.monetization || null,
      rag: body.parts?.rag || null,
      model_status: body.evidence?.model_status || null,
      status: result.status,
    };
  } catch (error) {
    return {
      error: error.message || String(error),
      stdout: (result.stdout || '').slice(0, 400),
      status: result.status,
    };
  }
}

function recommendNextAction(brief) {
  const continuous = brief.telemetry?.continuousE2e;
  if (continuous && continuous.deviceVerified === false && !continuous.skipped && !continuous.error) {
    return (
      'latest.json e2e is not pass (deviceVerified=false). Fix ship-guard/chat-send continuous ' +
      'flows before any public "device verified" claim; run npm run e2e:continuous:once.'
    );
  }
  const arc = brief.telemetry?.arcSkillEfficiency;
  if (arc && !arc.skipped && !arc.error && arc.overallStatus === 'fail') {
    return (
      'ARC skill-acquisition probe FAIL (holdout induction weak). Do not promote models or claim ' +
      '"smarter agent" from crystallized benchmarks alone; fix few-shot generalization first ' +
      '(node tools/arc-skill-efficiency.js --verbose).'
    );
  }
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
  if (arc && arc.overallStatus === 'pass') {
    return (
      'ARC probe green (skill-acquisition holdout pass). Proceed with change protocol; still verify ' +
      'device/CI gates before ship claims.'
    );
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
  if (!args.skipLocalRetrieval) {
    brief.rag.localRetrieval = localRetrieval(args.graphifyQuery || task);
  }
  brief.telemetry.githubRun = extractGhRunFeatures(args.ghRun);
  brief.telemetry.continuousE2e = readContinuousDeviceVerified();
  if (shouldRunArcProbe(args)) {
    brief.telemetry.arcSkillEfficiency = runArcSkillProbe();
  } else {
    brief.telemetry.arcSkillEfficiency = {
      skipped: true,
      reason: 'not requested (use --with-arc or task keywords: model promote, AGI, benchmark, reasoning eval)',
    };
  }
  // Always attach evidence-backed DS/ML/RAG scores (fail-closed, never invented).
  brief.telemetry.mlSystemScores = mlSystemScoresBrief();
  // ERP-lite: flag spend-intent tasks (does not auto-buy; blocks recommendation drift).
  try {
    const spendGate = require('./operator-spend-gate');
    brief.telemetry.operatorSpendGate = spendGate.evaluateSpendGate({
      action: task,
      message: task,
      log: true,
      agentId: 'agent-decision-stack',
    });
    if (brief.telemetry.operatorSpendGate.decision === 'BLOCK') {
      brief.recommendation =
        `SPEND GATE BLOCK: ${brief.telemetry.operatorSpendGate.reason}. ` +
        'Do not upgrade/pay/buy credits. Use free workarounds or request refund/cancel only. ' +
        'Same-message authorization required for any real spend (I authorize spend $N on …).';
      return brief;
    }
  } catch (error) {
    brief.telemetry.operatorSpendGate = {
      error: error instanceof Error ? error.message : String(error),
    };
  }
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
  if (brief.rag.localRetrieval?.citations?.length) {
    console.log('## Local retrieval citations');
    const prod = brief.rag.localRetrieval.production;
    if (prod) {
      console.log(
        `backend=${brief.rag.localRetrieval.backend || '-'} traceId=${prod.traceId || '-'} latencyMs=${prod.latencyMs ?? '-'}`,
      );
    }
    for (const citation of brief.rag.localRetrieval.citations) {
      console.log(`- ${citation.path} score=${citation.score}`);
    }
    console.log('');
  }
  if (brief.telemetry.githubRun && !brief.telemetry.githubRun.skipped) {
    console.log('## CI telemetry');
    console.log(JSON.stringify(brief.telemetry.githubRun, null, 2));
    console.log('');
  }
  if (brief.telemetry.continuousE2e && !brief.telemetry.continuousE2e.skipped) {
    console.log('## Continuous device E2E (G-05)');
    console.log(
      `deviceVerified=${brief.telemetry.continuousE2e.deviceVerified} e2e=${brief.telemetry.continuousE2e.e2e} unit=${brief.telemetry.continuousE2e.unit}`,
    );
    if (brief.telemetry.continuousE2e.updatedAt) {
      console.log(`updatedAt=${brief.telemetry.continuousE2e.updatedAt}`);
    }
    console.log('');
  }
  if (brief.telemetry.arcSkillEfficiency && !brief.telemetry.arcSkillEfficiency.skipped) {
    const arc = brief.telemetry.arcSkillEfficiency;
    console.log('## ARC skill-acquisition probe (fluid intelligence gate)');
    if (arc.error) {
      console.log(`error=${arc.error}`);
    } else {
      console.log(
        `status=${arc.overallStatus} train=${arc.metrics?.trainAccuracy} holdout=${arc.metrics?.holdoutAccuracy}`,
      );
      console.log(arc.recommendation || '');
    }
    console.log('');
  }
  if (brief.telemetry.mlSystemScores && !brief.telemetry.mlSystemScores.skipped) {
    const ml = brief.telemetry.mlSystemScores;
    console.log('## ML system scores (fail-closed evidence)');
    if (ml.error) {
      console.log(`error=${ml.error}`);
    } else {
      console.log(ml.system_scores_line || '(no line)');
      if (ml.model_status) console.log(`propensity_model=${ml.model_status}`);
    }
    console.log('');
  }
  console.log(`## Recommendation\n${brief.recommendation}`);
}

module.exports = {
  buildBrief,
  extractGhRunFeatures,
  graphifyQuery,
  localRetrieval,
  parseArgs,
  readContinuousDeviceVerified,
  recommendNextAction,
  runArcSkillProbe,
  shouldRunArcProbe,
  thumbgateLessons,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
