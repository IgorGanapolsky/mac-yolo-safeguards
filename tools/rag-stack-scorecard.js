#!/usr/bin/env node
'use strict';

/**
 * Composite production RAG / ingest scorecard.
 *
 * A+ requires every hard gate green — no "mostly fine" rounding up.
 *
 *   node tools/rag-stack-scorecard.js --json
 *   node tools/rag-stack-scorecard.js --heal   # reconcile source-bound index + lesson export
 */

const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { json: false, heal: false, home: path.join(os.homedir(), '.thumbgate') };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--heal') args.heal = true;
    else if (a === '--home') args.home = path.resolve(argv[++i] || '');
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function runNode(script, extraArgs = [], opts = {}) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'tools', script), ...extraArgs], {
    encoding: 'utf8',
    cwd: REPO,
    timeout: opts.timeout || 120000,
    maxBuffer: 16 * 1024 * 1024,
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* raw */
  }
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', json };
}

function letterFromScore(score, hardFail, extras = {}) {
  if (hardFail) {
    if (score >= 0.92) return 'B+';
    if (score >= 0.85) return 'B';
    if (score >= 0.75) return 'B-';
    if (score >= 0.65) return 'C+';
    if (score >= 0.55) return 'C';
    return 'D';
  }
  // A+ needs high composite AND eval ranking quality (nDCG).
  const ndcg = Number(extras.ndcg || 0);
  if (score >= 0.97 && ndcg >= 0.93) return 'A+';
  if (score >= 0.93) return 'A';
  if (score >= 0.9) return 'A-';
  if (score >= 0.85) return 'B+';
  if (score >= 0.8) return 'B';
  if (score >= 0.75) return 'B-';
  if (score >= 0.65) return 'C+';
  return 'C';
}

function evaluateGrepaiGate(canaryJson, generationJson) {
  const canaryOk = canaryJson?.ok === true && Number(canaryJson?.hits || 0) > 0;
  const generationOk = generationJson?.ok === true
    && Boolean(generationJson?.generationId)
    && /^[a-f0-9]{40}$/i.test(generationJson?.indexedSha || '');
  const canaryHashOk = /^[a-f0-9]{64}$/i.test(canaryJson?.indexSha256 || '');
  const receiptHashOk = /^[a-f0-9]{64}$/i.test(generationJson?.receipt?.indexSha256 || '');
  const sameGeneration = canaryOk && generationOk && canaryHashOk && receiptHashOk
    && canaryJson.generationId === generationJson.generationId
    && canaryJson.indexedSha === generationJson.indexedSha
    && canaryJson.indexSha256 === generationJson.receipt?.indexSha256;
  return {
    ok: canaryOk && generationOk && sameGeneration,
    canaryOk,
    generationOk,
    sameGeneration,
    score: (canaryOk ? 0.3 : 0) + (generationOk ? 0.4 : 0) + (sameGeneration ? 0.3 : 0),
  };
}

function scoreStack(options = {}) {
  const home = options.home || path.join(os.homedir(), '.thumbgate');
  const gates = [];
  const heals = [];

  if (options.heal) {
    // One controller owns both the source-bound grepai generation and lesson export.
    const batch = runNode('index-microbatch.js', ['--once', '--heal', '--json'], {
      timeout: 20 * 60_000,
    });
    heals.push({
      step: 'index-microbatch',
      ok: batch.status === 0 && Boolean(batch.json?.ok ?? true),
      detail: batch.json || batch.stdout.slice(0, 200),
    });
  }

  // 1) ingestion integrity (home lessons + grepae corpus)
  const integ = runNode('ingestion-integrity.js', [
    '--json',
    '--sqlite', path.join(home, 'lessons.sqlite'),
    '--jsonl', path.join(home, 'lessons-index.jsonl'),
    '--embeddings', path.join(home, 'lesson-embeddings.json'),
  ]);
  const integJson = integ.json;
  const integOk = Boolean(integJson && integJson.ok);
  gates.push({
    id: 'ingestion-integrity',
    hard: true,
    weight: 0.22,
    ok: integOk,
    detail: integOk
      ? 'all checks green'
      : `failed=${integJson?.failed ?? '?'} ${(integJson?.checks || [])
          .filter((c) => c.status === 'fail')
          .map((c) => c.name)
          .join(',') || integ.stderr.slice(0, 120)}`,
    score: integOk ? 1 : Math.max(0, 1 - (integJson?.failed || 4) * 0.25),
  });

  // 2) doctor
  const doctor = runNode('thumbgate-lessons-doctor.js', ['--dir', home, '--json']);
  const d = doctor.json || {};
  const emb = d.embeddings || {};
  const embOk =
    d.ok === true &&
    String(emb.status || '').includes('neural') &&
    Number(emb.entries || 0) > 0;
  gates.push({
    id: 'lessons-doctor',
    hard: true,
    weight: 0.12,
    ok: embOk,
    detail: embOk
      ? `${emb.entries}×${emb.dimensions} ${emb.status}`
      : JSON.stringify(d.problems || d.note || d).slice(0, 200),
    score: embOk ? 1 : 0.3,
  });

  // 3) grepai retrieval + exact source-bound generation. A live watcher is not
  // a health signal: the reconciler deliberately stops it before publication.
  const isol = path.join(
    process.env.HERMES_SEMANTIC_INDEX_ROOT || path.join(os.homedir(), '.hermes', 'semantic-index'),
    'mac-yolo-safeguards',
  );
  const canary = runNode(
    'grepai-mcp-fresh.js',
    ['probe', '--query', 'retrieval harness', '--json'],
    { timeout: 150_000 },
  );
  const generation = runNode('grepai-mcp-fresh.js', ['check', '--json'], { timeout: 30_000 });
  const grepaiGate = evaluateGrepaiGate(canary.json, generation.json);
  gates.push({
    id: 'grepai',
    hard: true,
    weight: 0.16,
    ok: grepaiGate.ok,
    detail: `pinnedCanary=${grepaiGate.canaryOk} sameGeneration=${grepaiGate.sameGeneration} generation=${generation.json?.generationId || 'stale'} sha=${generation.json?.indexedSha || '?'} hits=${canary.json?.hits ?? '?'}`,
    score: grepaiGate.score,
  });

  // 4) harness eval (tools/rag-retrieval-eval.js — CI fixture)
  const evalRun = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools', 'rag-retrieval-eval.js'), '--json'],
    {
      encoding: 'utf8',
      cwd: REPO,
      timeout: 180000,
    },
  );
  let evalJson = null;
  try {
    evalJson = JSON.parse(evalRun.stdout);
  } catch {
    evalJson = null;
  }
  const evalPass = Boolean(evalJson && evalJson.ok && evalJson.passCount === evalJson.caseCount);
  const recall = Number(evalJson?.meanRecallAtK || 0);
  const ndcg = Number(evalJson?.meanNdcgAtK || 0);
  // A-tier: perfect recall + strong ranking. A+ needs nDCG >= 0.93.
  const evalHardOk = evalPass && recall >= 1 && ndcg >= 0.85;
  const evalScore = !evalPass ? 0 : ndcg >= 0.97 ? 1 : ndcg >= 0.93 ? 0.97 : ndcg >= 0.85 ? 0.9 : 0.7;
  gates.push({
    id: 'harness-eval',
    hard: true,
    weight: 0.16,
    ok: evalHardOk,
    detail: evalPass
      ? `pass ${evalJson.passCount}/${evalJson.caseCount} recall=${recall} nDCG=${ndcg.toFixed(4)}`
      : `exit ${evalRun.status} ${(evalRun.stderr || evalRun.stdout || '').slice(0, 120)}`,
    score: evalScore,
  });

  // 5) dual-path
  const dual = runNode(
    'retrieval-dual-path.js',
    ['--query', 'hermes cloud connector session recover', '--json', '--limit', '5'],
    { timeout: 90000 },
  );
  const dualOk =
    dual.json &&
    dual.json.pathStatus &&
    dual.json.pathStatus.harness === 'ok' &&
    dual.json.pathStatus.grepai === 'ok' &&
    Array.isArray(dual.json.matches) &&
    dual.json.matches.length > 0;
  gates.push({
    id: 'dual-path',
    hard: true,
    weight: 0.1,
    ok: dualOk,
    detail: dualOk
      ? `top=${dual.json.matches[0].path}`
      : JSON.stringify(dual.json?.pathStatus || dual.stderr || dual.stdout).slice(0, 200),
    score: dualOk ? 1 : 0.2,
  });

  // 6) harness headroom
  const harnessProbe = spawnSync(
    process.execPath,
    [path.join(REPO, 'tools', 'hermes-retrieval-harness.js'), 'retrieve', '--query', 'thumbgate', '--json', '--limit', '3'],
    { encoding: 'utf8', cwd: REPO, timeout: 120000 },
  );
  let fileCount = 0;
  let maxFiles = 12000;
  try {
    const body = JSON.parse(harnessProbe.stdout);
    fileCount = body.fileCount || body.corpusSize || 0;
    maxFiles = body.maxFiles || 12000;
  } catch {
    /* ignore */
  }
  const headroom = maxFiles > 0 ? 1 - fileCount / maxFiles : 0;
  const headroomOk = headroom >= 0.15;
  gates.push({
    id: 'harness-headroom',
    // Hard: A+ must not hide a near-full corpus behind a soft weight.
    hard: true,
    weight: 0.07,
    ok: headroomOk,
    detail: `files=${fileCount} maxFiles=${maxFiles} headroom=${(headroom * 100).toFixed(1)}%`,
    score: headroomOk ? 1 : Math.max(0, headroom / 0.15),
  });

  // 7) Monzo-style governed interfaces (InfoQ July 2026)
  const iface = runNode('retrieval-interface-contracts.js', ['--json']);
  const ifaceOk = Boolean(iface.json && iface.json.ok);
  gates.push({
    id: 'interface-contracts',
    hard: true,
    weight: 0.1,
    ok: ifaceOk,
    detail: ifaceOk
      ? `${iface.json.contractCount} interfaces ok`
      : `failed=${iface.json?.failed ?? '?'} ${(iface.json?.results || [])
          .filter((r) => !r.ok)
          .map((r) => r.id)
          .join(',')}`,
    score: ifaceOk ? 1 : 0.2,
  });

  // 8) Unified micro-batch discipline (InfoQ delta pipeline)
  const batchDry = runNode('index-microbatch.js', ['--once', '--json'], { timeout: 90000 });
  const batchOk = Boolean(
    batchDry.json?.ok
    && batchDry.json?.generation?.ok
    && batchDry.json?.lessonsCurrent,
  );
  gates.push({
    id: 'index-microbatch',
    hard: true,
    weight: 0.07,
    ok: batchOk,
    detail: batchOk
      ? `generation=${batchDry.json.generation.generationId} lessons=current skipped=${Boolean(batchDry.json.skipped)}`
      : JSON.stringify(batchDry.json?.error || batchDry.json?.actions || batchDry.stderr || batchDry.stdout).slice(0, 200),
    score: batchOk ? 1 : 0.2,
  });

  let weighted = 0;
  let weightSum = 0;
  let hardFail = false;
  for (const g of gates) {
    weighted += g.score * g.weight;
    weightSum += g.weight;
    if (g.hard && !g.ok) hardFail = true;
  }
  const score = weightSum ? weighted / weightSum : 0;
  const grade = letterFromScore(score, hardFail, { ndcg });
  const aPlus = grade === 'A+' && !hardFail;

  return {
    checkedAt: new Date().toISOString(),
    home,
    grade,
    score: Number(score.toFixed(4)),
    aPlus,
    hardFail,
    meanNdcgAtK: ndcg,
    meanRecallAtK: recall,
    gates,
    heals: heals.length ? heals : undefined,
    ok: aPlus,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node tools/rag-stack-scorecard.js [--json] [--heal] [--home PATH]');
      process.exit(0);
    }
    const report = scoreStack(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`RAG stack grade: ${report.grade} (score=${report.score}${report.hardFail ? ', hard-fail' : ''})`);
      for (const g of report.gates) {
        console.log(`  ${g.ok ? 'OK' : 'FAIL'} ${g.id}: ${g.detail}`);
      }
      if (!report.aPlus) console.log('A+ not met — re-run with --heal after fixing hard fails.');
    }
    process.exit(report.aPlus ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { evaluateGrepaiGate, scoreStack, letterFromScore };
