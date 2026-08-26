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
const {
  blockedReceipt,
  blockedReceiptFromRaw,
  selectPatterns,
} = require('./agentic-pattern-selector');

const REPO = path.resolve(__dirname, '..');

const GOVERNANCE_SCHEMA_VERSION = '2026-07-30-v1';

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
  --skip-governance    Skip semantic-governance / context-definition gate.
  --governance TEXT    Optional governance domain (e.g. 'revenue', 'mobile', 'public-api').
  --evidence TEXT      Concrete signal that justifies a revenue/growth decision.
  --pattern-manifest PATH
                       Optional typed task manifest for deterministic pattern selection.
  --json               Print structured brief only.`;

function parseArgs(argv) {
  const args = {
    task: '',
    ghRun: '',
    graphifyQuery: '',
    governance: '',
    evidence: '',
    patternManifest: '',
    skipThumbgate: false,
    skipGraphify: false,
    skipLocalRetrieval: false,
    skipGovernance: false,
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
    else if (arg === '--governance') args.governance = argv[++i] || '';
    else if (arg === '--evidence') args.evidence = argv[++i] || '';
    else if (arg === '--pattern-manifest') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--pattern-manifest requires a path');
      args.patternManifest = value;
      i += 1;
    }
    else if (arg === '--skip-thumbgate') args.skipThumbgate = true;
    else if (arg === '--skip-graphify') args.skipGraphify = true;
    else if (arg === '--skip-local-retrieval') args.skipLocalRetrieval = true;
    else if (arg === '--skip-governance') args.skipGovernance = true;
    else if (arg === '--with-arc') args.withArc = true;
    else if (arg === '--skip-arc') args.skipArc = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

/**
 * Semantic governance / context-definition gate (InfoQ Anthropic analytics lesson).
 *
 * Many agent failures stem from ambiguous context, not model capability. This gate
 * requires the agent to declare the decision's domain, intent, and success metric
 * before RAG/telemetry are consulted. It returns:
 *   - status 'pass' when the brief contains an explicit task + domain + metric.
 *   - status 'warn' when the task is vague or no success metric is supplied.
 *   - status 'block' when a known anti-pattern is present (e.g., "just do it",
 *     "make it go viral", revenue claims without evidence).
 */
function semanticGovernanceGate(args) {
  const task = String(args.task || '').trim();
  const domain = String(args.governance || '').trim();
  const evidence = args.evidence ? String(args.evidence).trim() : '';
  const lower = task.toLowerCase();

  // Integrity violations always block, regardless of evidence.
  const integrityPatterns = [
    { pattern: /\b(no one will know|skip .* test|fake .* (metric|number|data))\b/, message: 'integrity violation' },
  ];
  const integrityHit = integrityPatterns.find((ap) => ap.pattern.test(lower));
  if (integrityHit) {
    return {
      status: 'block',
      reason: integrityHit.message,
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      required: ['task', 'governance', 'successMetric'],
    };
  }

  // Vague imperatives always block — they cannot be verified.
  const imperativeHit = /\bjust (do|make|ship|push|deploy)\b/.test(lower);
  if (imperativeHit) {
    return {
      status: 'block',
      reason: 'vague imperative without acceptance criteria',
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      required: ['task', 'governance', 'successMetric'],
      suggestions: ['Replace "just X" with a measurable outcome: "Do X so that Y is verifiable by Z".'],
    };
  }

  // Revenue/growth claims require evidence to pass; warn otherwise, block if unmeasurable.
  const revenuePattern = /\b(make money|revenue|profit|\$\d+[kK]|close .* deal)\b/;
  const viralPattern = /\b(make .* go viral|viral growth|growth hack)\b/;
  const hasEvidence = evidence.length > 10;
  if (revenuePattern.test(lower) && !hasEvidence) {
    return {
      status: 'block',
      reason: 'revenue action requires evidence gate; route through tools/revenue-autonomous-loop.js',
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      required: ['task', 'governance', 'successMetric', 'evidence'],
      suggestions: ['Provide --evidence "<concrete signal>" or route through tools/revenue-autonomous-loop.js.'],
    };
  }
  if (revenuePattern.test(lower) && hasEvidence) {
    // Evidence supplied: allow pass only if task also contains an explicit success metric.
    const metricPresent = /\b(within|by|to|at least|under|over|≤|>=|<=|until|reduce|increase|maintain|pass|green|fail|verified)\b/.test(lower);
    return {
      status: metricPresent ? 'pass' : 'warn',
      reason: metricPresent ? 'revenue decision supported by evidence and success metric' : 'revenue decision supported by evidence but no success metric',
      domain,
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      required: ['task', 'governance', 'successMetric', 'evidence'],
      suggestions: metricPresent ? [] : ['Phrase task as "Do X so that Y is measurable by Z".'],
    };
  }
  if (viralPattern.test(lower)) {
    return {
      status: 'block',
      reason: 'unmeasurable growth framing',
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      required: ['task', 'governance', 'successMetric'],
    };
  }

  const domainSet = domain && !/^--/.test(domain);
  const vague = /\b(something|anything|better|improve|fix|handle) *(maybe|just|somehow)?\b/.test(lower);
  const hasMetric = /\b(within|by|to|at least|under|over|≤|>=|<=|until|reduce|increase|maintain|pass|green|fail|verified)\b/.test(lower);
  if (!domainSet || vague || !hasMetric) {
    return {
      status: 'warn',
      reason: `Missing ${!domainSet ? 'governance domain' : vague ? 'specific action' : 'success metric'}`,
      schemaVersion: GOVERNANCE_SCHEMA_VERSION,
      required: ['task', 'governance', 'successMetric'],
      suggestions: [
        'Add --governance <domain> (revenue, mobile, public-api, infra, ai-safety).',
        'Phrase task as "Do X so that Y is measurable by Z"',
      ],
    };
  }
  return {
    status: 'pass',
    domain,
    schemaVersion: GOVERNANCE_SCHEMA_VERSION,
    required: ['task', 'governance', 'successMetric'],
  };
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

function loadPatternReceipt(manifestPath) {
  const resolved = path.resolve(String(manifestPath || ''));
  let raw;
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) throw new Error('pattern manifest must be a regular file');
    if (stat.size > 256 * 1024) throw new Error('pattern manifest exceeds 256 KiB');
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    const message = /exceeds 256 KiB|regular file/.test(error.message)
      ? error.message
      : 'pattern manifest could not be read';
    return blockedReceipt(null, [message]);
  }
  try {
    return selectPatterns(JSON.parse(raw));
  } catch (_error) {
    return blockedReceiptFromRaw(raw, ['pattern manifest JSON is invalid']);
  }
}

function recommendNextAction(brief) {
  if (brief.patterns && !brief.patterns.skipped && brief.patterns.status === 'block') {
    return `BLOCKED by agentic pattern contract: ${brief.patterns.errors[0] || 'invalid pattern manifest'}.`;
  }
  const gov = brief.governance;
  if (gov && gov.status === 'block') {
    return `BLOCKED by semantic governance: ${gov.reason}. Provide --governance <domain> and a measurable success metric before proceeding.`;
  }
  if (gov && gov.status === 'warn') {
    return `GOVERNANCE WARNING: ${gov.reason}. ${gov.suggestions ? gov.suggestions.join('; ') : ''}`;
  }
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

  const patterns = args.patternManifest
    ? loadPatternReceipt(args.patternManifest)
    : { skipped: true, reason: 'no --pattern-manifest supplied' };
  const brief = {
    checkedAt: new Date().toISOString(),
    task,
    patterns,
    governance: { skipped: true, reason: 'not evaluated yet' },
    rag: {},
    telemetry: {},
    recommendation: '',
  };

  if (!patterns.skipped && patterns.status === 'block') {
    brief.governance = { skipped: true, reason: 'blocked by agentic pattern contract' };
    brief.recommendation = recommendNextAction(brief);
    return brief;
  }

  brief.governance = args.skipGovernance ? { skipped: true } : semanticGovernanceGate(args);

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
  const patternBlocked = brief.patterns && !brief.patterns.skipped && brief.patterns.status === 'block';
  const governanceBlocked = brief.governance && !brief.governance.skipped && brief.governance.status === 'block';
  const exitCode = patternBlocked || governanceBlocked ? 1 : 0;
  if (args.json) {
    console.log(JSON.stringify(brief, null, 2));
    process.exit(exitCode);
  }
  console.log(`# Agent decision stack — ${brief.checkedAt}`);
  console.log(`Task: ${brief.task}\n`);
  if (brief.patterns && !brief.patterns.skipped) {
    console.log('## Agentic pattern receipt');
    console.log(`status=${brief.patterns.status} hash=${brief.patterns.receiptHash || '-'}`);
    if (brief.patterns.errors?.length) console.log(`errors=${brief.patterns.errors.join('; ')}`);
    if (brief.patterns.selected?.length) {
      console.log(`selected=${brief.patterns.selected.map((entry) => entry.id).join(',')}`);
      console.log(`gates=${brief.patterns.gates.join(',')}`);
    }
    console.log('');
  }
  if (brief.governance && !brief.governance.skipped) {
    console.log(`## Semantic governance (${brief.governance.schemaVersion || GOVERNANCE_SCHEMA_VERSION})`);
    console.log(`status=${brief.governance.status}${brief.governance.domain ? ` domain=${brief.governance.domain}` : ''}`);
    if (brief.governance.reason) console.log(`reason=${brief.governance.reason}`);
    if (brief.governance.suggestions?.length) {
      console.log('suggestions:');
      for (const s of brief.governance.suggestions) console.log(`  - ${s}`);
    }
    console.log('');
  }
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
  if (exitCode !== 0) process.exit(exitCode);
}

module.exports = {
  buildBrief,
  extractGhRunFeatures,
  graphifyQuery,
  loadPatternReceipt,
  localRetrieval,
  parseArgs,
  readContinuousDeviceVerified,
  recommendNextAction,
  runArcSkillProbe,
  semanticGovernanceGate,
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
