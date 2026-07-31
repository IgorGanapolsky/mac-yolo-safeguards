#!/usr/bin/env node
'use strict';

/**
 * Composite production RAG / ingest scorecard.
 *
 * A+ requires every hard gate green — no "mostly fine" rounding up.
 *
 *   node tools/rag-stack-scorecard.js --json
 *   node tools/rag-stack-scorecard.js --heal   # export jsonl + ensure grepae watch/canary
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

function scoreStack(options = {}) {
  const home = options.home || path.join(os.homedir(), '.thumbgate');
  const gates = [];
  const heals = [];

  // Always preflight microbatch (FF isolated grepae when behind origin/main).
  // Without this, dry scorecards fail index-freshness every time main advances
  // between LaunchAgent cycles (measured 2026-07-31: A+ → B+ within minutes).
  {
    const batchArgs = options.heal
      ? ['--once', '--heal', '--json']
      : ['--once', '--json'];
    const batch = runNode('index-microbatch.js', batchArgs, { timeout: 180000 });
    heals.push({
      step: options.heal ? 'index-microbatch-heal' : 'index-microbatch-preflight',
      ok: batch.status === 0 && Boolean(batch.json?.ok ?? true),
      detail: batch.json || batch.stdout.slice(0, 200),
    });
  }

  if (options.heal) {
    const exp = runNode('thumbgate-lessons-export-jsonl.js', ['--dir', home, '--apply', '--json']);
    heals.push({ step: 'export-jsonl', ok: exp.status === 0, detail: exp.json || exp.stdout.slice(0, 200) });
    const ensure = runNode('ensure-grepai-index.js', ['--canary', '--json'], { timeout: 90000 });
    heals.push({ step: 'ensure-grepai', ok: ensure.status === 0, detail: ensure.json || exp.stdout.slice(0, 200) });
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
    weight: 0.18,
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

  // 3) grepae canary + watcher
  const isol = path.join(os.homedir(), '.hermes', 'semantic-index', 'mac-yolo-safeguards');
  const canary = runNode('grepai-index-canary.js', ['--dir', path.join(isol, '.grepai'), '--live', '--json'], {
    timeout: 60000,
  });
  const canOk = Boolean(canary.json && canary.json.ok);
  const status = spawnSync('grepai', ['status'], { cwd: isol, encoding: 'utf8', timeout: 15000 });
  const watchRunning = /Watcher:\s*running/i.test(status.stdout || '');
  const grepaeScore = (canOk ? 0.7 : 0) + (watchRunning ? 0.3 : 0);
  gates.push({
    id: 'grepai',
    hard: true,
    weight: 0.16,
    ok: canOk && watchRunning,
    detail: `canary=${canOk} watcher=${watchRunning ? 'running' : 'down'} bytes=${canary.json?.indexBytes ?? '?'}`,
    score: grepaeScore,
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
  const ndcg = Number(evalJson?.meanNdcgAtK || evalJson?.meanNDCGAtK || 0);
  const precision = Number(evalJson?.meanPrecisionAtK || 0);
  const mrr = Number(evalJson?.meanMRR || 0);
  // A-tier: perfect recall + strong ranking. A+ needs nDCG >= 0.93.
  const evalHardOk = evalPass && recall >= 1 && ndcg >= 0.85;
  const evalScore = !evalPass ? 0 : ndcg >= 0.97 ? 1 : ndcg >= 0.93 ? 0.97 : ndcg >= 0.85 ? 0.9 : 0.7;
  gates.push({
    id: 'harness-eval',
    hard: true,
    weight: 0.14,
    ok: evalHardOk,
    detail: evalPass
      ? `pass ${evalJson.passCount}/${evalJson.caseCount} R=${recall} P=${precision} MRR=${mrr} nDCG=${ndcg.toFixed(4)}`
      : `exit ${evalRun.status} ${(evalRun.stderr || evalRun.stdout || '').slice(0, 120)}`,
    score: evalScore,
  });

  // 4b) generation quality (faithfulness / groundedness / answer relevance)
  const genRun = runNode('rag-generation-eval.js', ['--json'], { timeout: 30000 });
  const gen = genRun.json;
  const genOk = Boolean(gen && gen.ok && gen.measured);
  const genScore = !genOk
    ? 0
    : Math.min(
        1,
        0.34 * Number(gen.meanFaithfulness || 0) +
          0.33 * Number(gen.meanGroundedness || 0) +
          0.33 * Number(gen.meanAnswerRelevance || 0) +
          (gen.passCount === gen.caseCount ? 0.15 : 0),
      );
  gates.push({
    id: 'generation-eval',
    hard: true,
    weight: 0.1,
    ok: genOk,
    detail: genOk
      ? `pass ${gen.passCount}/${gen.caseCount} faith=${gen.meanFaithfulness} ground=${gen.meanGroundedness} rel=${gen.meanAnswerRelevance}`
      : `exit ${genRun.status} ${(genRun.stderr || genRun.stdout || '').slice(0, 120)}`,
    score: Math.min(1, genScore),
  });

  // 5) dual-path (multi-query + RRF + CE-lite rerank)
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
  const multiN = Array.isArray(dual.json?.multiQuery) ? dual.json.multiQuery.length : 0;
  gates.push({
    id: 'dual-path',
    hard: true,
    weight: 0.08,
    ok: dualOk,
    detail: dualOk
      ? `top=${dual.json.matches[0].path} multiQuery=${multiN} rerank=${dual.json.rerank || 'none'}`
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
    weight: 0.08,
    ok: ifaceOk,
    detail: ifaceOk
      ? `${iface.json.contractCount} interfaces ok`
      : `failed=${iface.json?.failed ?? '?'} ${(iface.json?.results || [])
          .filter((r) => !r.ok)
          .map((r) => r.id)
          .join(',')}`,
    score: ifaceOk ? 1 : 0.2,
  });

  // 8) Micro-batch watermark / watcher discipline (InfoQ delta pipeline)
  const batchDry = runNode('index-microbatch.js', ['--once', '--json'], { timeout: 90000 });
  const batchOk = Boolean(batchDry.json && batchDry.json.ok && batchDry.json.watcherRunning !== false);
  gates.push({
    id: 'index-microbatch',
    hard: true,
    weight: 0.07,
    ok: batchOk,
    detail: batchOk
      ? `watcher=${batchDry.json.watcherRunning} skipped=${Boolean(batchDry.json.skipped)} cycles=${batchDry.json.watermark?.cycleCount ?? batchDry.json.previous?.cycleCount ?? 0}`
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
    meanPrecisionAtK: precision,
    meanMRR: mrr,
    generation: genOk
      ? {
          meanFaithfulness: gen.meanFaithfulness,
          meanGroundedness: gen.meanGroundedness,
          meanAnswerRelevance: gen.meanAnswerRelevance,
        }
      : undefined,
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

module.exports = { scoreStack, letterFromScore };
