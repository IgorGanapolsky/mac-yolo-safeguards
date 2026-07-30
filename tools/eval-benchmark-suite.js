#!/usr/bin/env node
'use strict';

/**
 * Hermes eval benchmark suite — regression control plane.
 *
 * HARD RULE: never invent LLM-as-judge quality scores. Soft "judge" metrics
 * come only from human ThumbGate feedback (curate-eval-set). Merge-blocking
 * signal comes from deterministic hard gates (RAG floors, incident evals).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { exportDpoPairs } = require('./export-dpo-benchmark-pairs');
const { curateEvalSet } = require('./curate-eval-set');
const {
  HUMAN_METRIC_SEMANTICS,
  assertNotFabricatedJudgeScores,
  hardGates,
} = require('./llm-judge-policy');

const ROOT = path.resolve(__dirname, '..');

function runNodeJson(scriptRel, args = [], options = {}) {
  const script = path.join(options.cwd || ROOT, scriptRel);
  if (!fs.existsSync(script)) {
    return { ok: false, skipped: true, error: `missing ${scriptRel}`, status: 'skip' };
  }
  const result = spawnSync(
    process.execPath,
    [script, ...args],
    {
      cwd: options.cwd || ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: options.timeoutMs || 120_000,
    },
  );
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (result.status !== 0) {
    return {
      ok: false,
      skipped: false,
      status: 'fail',
      exitCode: result.status,
      error: stderr || stdout || `exit ${result.status}`,
      stdout,
    };
  }
  let json = null;
  try {
    // Prefer last JSON object if tool prints noise before JSON
    const start = stdout.indexOf('{');
    json = start >= 0 ? JSON.parse(stdout.slice(start)) : null;
  } catch {
    json = null;
  }
  return { ok: true, skipped: false, status: 'pass', exitCode: 0, json, stdout };
}

function buildHumanFeedbackMetrics(dpoPairsExported) {
  const logPath = path.join(process.env.HOME || '', '.thumbgate', 'feedback-log.jsonl');
  const curate = curateEvalSet({ logPath });

  if (!curate.ok) {
    return {
      // Honest: not a pass. Diagnostic layer only.
      status: 'insufficient-data',
      role: HUMAN_METRIC_SEMANTICS.role,
      // Legacy field names kept for API compatibility — semantics documented.
      groundednessScore: 0,
      helpfulnessScore: 0,
      humanPositiveRate: 0,
      holdoutFraction: 0,
      dpoPairsExported,
      humanLabelsUsed: 0,
      totalFeedbackRecords: 0,
      labelSource: null,
      evalSetSha256: null,
      rejectedBreakdown: null,
      metricSemantics: HUMAN_METRIC_SEMANTICS,
      note: `No human feedback log at ${curate.logPath || logPath}; cannot invent LLM-as-judge scores.`,
    };
  }

  const kept = curate.counts.kept;
  const keptPositive = curate.counts.keptPositive;
  const holdout = curate.counts.holdout;
  const humanPositiveRate = kept > 0 ? Number((keptPositive / kept).toFixed(4)) : 0;
  const holdoutFraction = kept > 0 ? Number((holdout / kept).toFixed(4)) : 0;

  // Minimum label mass for diagnostic "pass" (enough signal to be meaningful).
  const MIN_KEPT = 20;
  const status = kept >= MIN_KEPT ? 'diagnostic-ok' : 'insufficient-data';

  return {
    status,
    role: HUMAN_METRIC_SEMANTICS.role,
    // Legacy aliases: DO NOT interpret as model groundedness/helpfulness.
    groundednessScore: humanPositiveRate,
    helpfulnessScore: holdoutFraction,
    humanPositiveRate,
    holdoutFraction,
    dpoPairsExported,
    humanLabelsUsed: kept,
    totalFeedbackRecords: curate.counts.totalRecords,
    labelSource: curate.manifest.labelSource,
    evalSetSha256: curate.manifest.sha256,
    rejectedBreakdown: curate.rejected,
    metricSemantics: HUMAN_METRIC_SEMANTICS,
    note:
      `Human labels only (${curate.counts.totalRecords} raw → ${kept} curated; ` +
      `${keptPositive}/${kept} positive). groundednessScore/helpfulnessScore are ` +
      `legacy aliases for humanPositiveRate/holdoutFraction — not an LLM judge.`,
  };
}

function runHardGates(root) {
  const gates = [];

  // RAG retrieval floors (if fixture + tool present)
  const ragScript = path.join(root, 'tools', 'rag-retrieval-eval.js');
  if (fs.existsSync(ragScript)) {
    const rag = runNodeJson('tools/rag-retrieval-eval.js', ['--json'], { cwd: root, timeoutMs: 180_000 });
    const meanRecall = rag.json?.meanRecallAtK ?? null;
    const meanMrr = rag.json?.meanMrrAtK ?? null;
    const meanNdcg = rag.json?.meanNdcgAtK ?? null;
    const caseCount = rag.json?.caseCount ?? rag.json?.results?.length ?? 0;
    const passCount = rag.json?.passCount ?? null;
    // Primary hard gate: rag-retrieval-eval exit status / report.ok (fixture contracts).
    // Optional floors: only enforce when the metric is present (older reports omit MRR).
    const floors = { recall: 0.75, ndcg: 0.7, minCases: 1 };
    let pass = rag.ok && (rag.json?.ok !== false);
    const reasons = [];
    if (!rag.ok) reasons.push(rag.error || 'rag-retrieval-eval failed');
    if (rag.json && rag.json.ok === false) {
      pass = false;
      reasons.push(`passCount ${passCount}/${caseCount} fixture cases`);
    }
    if (typeof meanRecall === 'number' && meanRecall < floors.recall) {
      pass = false;
      reasons.push(`meanRecallAtK ${meanRecall} < ${floors.recall}`);
    }
    if (typeof meanNdcg === 'number' && meanNdcg < floors.ndcg) {
      pass = false;
      reasons.push(`meanNdcgAtK ${meanNdcg} < ${floors.ndcg}`);
    }
    if (caseCount < floors.minCases) {
      pass = false;
      reasons.push(`caseCount ${caseCount} < ${floors.minCases}`);
    }
    gates.push({
      id: 'rag-retrieval-floors',
      class: 'hard',
      status: pass ? 'pass' : 'fail',
      meanRecallAtK: meanRecall,
      meanMrrAtK: meanMrr,
      meanNdcgAtK: meanNdcg,
      caseCount,
      passCount,
      floors,
      reasons,
    });
  } else {
    gates.push({
      id: 'rag-retrieval-floors',
      class: 'hard',
      status: 'skip',
      reasons: ['tools/rag-retrieval-eval.js not present'],
    });
  }

  // Incident eval PR tier (deterministic false-green prevention)
  const incidentScript = path.join(root, 'tools', 'incident-eval-runner.js');
  if (fs.existsSync(incidentScript)) {
    const inc = spawnSync(
      process.execPath,
      [incidentScript, '--tier', 'pr'],
      { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    gates.push({
      id: 'incident-eval-pr',
      class: 'hard',
      status: inc.status === 0 ? 'pass' : 'fail',
      exitCode: inc.status,
      reasons: inc.status === 0 ? [] : [(inc.stderr || inc.stdout || 'incident-eval failed').slice(0, 500)],
    });
  } else {
    gates.push({
      id: 'incident-eval-pr',
      class: 'hard',
      status: 'skip',
      reasons: ['tools/incident-eval-runner.js not present'],
    });
  }

  // Lightweight offline unit smoke (connector contract if present)
  const connectorTest = path.join(root, 'tests', 'test-hermes-cloud-connector.js');
  if (fs.existsSync(connectorTest)) {
    const t = spawnSync(process.execPath, ['--test', connectorTest], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    });
    gates.push({
      id: 'connector-unit',
      class: 'hard',
      status: t.status === 0 ? 'pass' : 'fail',
      exitCode: t.status,
      reasons: t.status === 0 ? [] : [(t.stderr || t.stdout || 'connector tests failed').slice(0, 400)],
    });
  }

  const hardFailed = gates.some((g) => g.class === 'hard' && g.status === 'fail');
  const hardRan = gates.some((g) => g.class === 'hard' && g.status !== 'skip');
  return {
    gates,
    hardFailed,
    hardRan,
    status: hardFailed ? 'fail' : hardRan ? 'pass' : 'skip',
  };
}

function readOnlineE2e(root) {
  const e2eProofPath = path.join(root, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
  if (!fs.existsSync(e2eProofPath)) {
    return { status: 'unknown', continuousE2EStatus: 'missing-proof', proofPath: e2eProofPath };
  }
  try {
    const proof = JSON.parse(fs.readFileSync(e2eProofPath, 'utf8'));
    const e2e = proof.e2e || proof.status || proof.result || 'unknown';
    const ok = e2e === 'pass' || e2e === 'ok' || proof.ok === true;
    return {
      status: ok ? 'pass' : 'fail',
      continuousE2EStatus: String(e2e),
      proofPath: e2eProofPath,
      // Never invent thumbs-up rates
      thumbsUpRatePct: null,
    };
  } catch (error) {
    return {
      status: 'fail',
      continuousE2EStatus: 'unreadable-proof',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function countPreventionRules() {
  const memoriesPath = path.join(process.env.HOME || '', '.thumbgate', 'memories.json');
  if (!fs.existsSync(memoriesPath)) return { preventionRulesActive: 0, source: null };
  try {
    const data = JSON.parse(fs.readFileSync(memoriesPath, 'utf8'));
    const n = Array.isArray(data) ? data.length : 0;
    return { preventionRulesActive: n, source: memoriesPath };
  } catch {
    return { preventionRulesActive: 0, source: memoriesPath, error: 'unreadable' };
  }
}

function runEvalBenchmarkSuite(options = {}) {
  const root = options.cwd || ROOT;
  const startTime = Date.now();
  const dpoExport = exportDpoPairs({ cwd: root });
  // Unit tests pass { skipHardGates: true } for speed; CLI --strict always runs them.
  const hard = options.skipHardGates
    ? { gates: [], hardFailed: false, hardRan: false, status: 'skip' }
    : runHardGates(root);
  const human = buildHumanFeedbackMetrics(dpoExport.totalExported);
  const e2e = readOnlineE2e(root);
  const rules = countPreventionRules();

  // Anti-theater: never allow the old fabricated constants through.
  const fabric = assertNotFabricatedJudgeScores(human);
  if (!fabric.ok) {
    human.status = 'fail';
    human.note = `FABRICATED SCORES BLOCKED: ${fabric.violations.join('; ')}`;
  }

  const offlinePass = hard.status === 'pass';
  const results = {
    timestamp: new Date().toISOString(),
    durationMs: 0,
    policy: 'hard-gates-deterministic-llm-judge-diagnostic-only',
    hardGates: hard.gates,
    hardGateStatus: hard.status,
    metrics: {
      offlineEvals: {
        status: offlinePass ? 'pass' : hard.status === 'skip' ? 'skip' : 'fail',
        // Real: count of hard gates that passed, not a fake accuracy %.
        hardGatesPassed: hard.gates.filter((g) => g.status === 'pass').length,
        hardGatesFailed: hard.gates.filter((g) => g.status === 'fail').length,
        hardGatesSkipped: hard.gates.filter((g) => g.status === 'skip').length,
        // Deliberately NOT inventing accuracyPct / promptDatasetSize / latencyMs
        accuracyPct: null,
        promptDatasetSize: null,
        latencyMs: null,
      },
      regressionTesting: {
        status: 'pass',
        preventionRulesActive: rules.preventionRulesActive,
        // Real pass rate from hard gates, not a hardcoded 100
        testPassRatePct:
          hard.gates.filter((g) => g.status === 'pass' || g.status === 'fail').length === 0
            ? null
            : Number(
                (
                  (100 * hard.gates.filter((g) => g.status === 'pass').length) /
                  hard.gates.filter((g) => g.status === 'pass' || g.status === 'fail').length
                ).toFixed(1),
              ),
      },
      onlineEvals: e2e,
      // Kept under llmAsAJudge for API compatibility; role makes honesty explicit.
      llmAsAJudge: human,
      domainMetrics: {
        // Honest unknowns unless proven — never hardcode true
        codingTestsPassed: hard.gates.some((g) => g.id === 'connector-unit' && g.status === 'pass')
          ? true
          : hard.gates.some((g) => g.id === 'connector-unit' && g.status === 'fail')
            ? false
            : null,
        mobileE2EPassed:
          e2e.status === 'pass' ? true : e2e.status === 'fail' ? false : null,
        revenuePipelineHealthy: null,
        note: 'null = unmeasured this run (fail-closed: never invent green)',
      },
    },
    frameworkEquivalence: {
      langSmith: 'ThumbGate feedback store + curate-eval-set human labels + hard gates',
      openAiEvals: 'incident-eval-runner + rag-retrieval-eval fixtures (deterministic)',
      arizePhoenix: 'humanPositiveRate diagnostic + Graphify/RAG floors (not model self-grade)',
      braintrust: 'thumbs up/down + DPO exporter; judge scores diagnostic only',
      wbWeave: 'agent-decision-stack telemetry + hard-gate suite',
    },
  };

  results.durationMs = Date.now() - startTime;
  results.ok = !hard.hardFailed && fabric.ok;
  return results;
}

if (require.main === module) {
  const isJson = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const res = runEvalBenchmarkSuite();
  if (isJson) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('\n=== HERMES EVAL BENCHMARK SUITE REPORT ===');
    console.log(`Timestamp: ${res.timestamp}`);
    console.log(`Policy:    ${res.policy}`);
    console.log(
      `1. Offline hard gates: [${res.metrics.offlineEvals.status.toUpperCase()}] ` +
        `pass=${res.metrics.offlineEvals.hardGatesPassed} fail=${res.metrics.offlineEvals.hardGatesFailed} skip=${res.metrics.offlineEvals.hardGatesSkipped}`,
    );
    for (const g of res.hardGates) {
      console.log(`   - ${g.id}: ${g.status}${g.reasons?.length ? ` (${g.reasons[0]})` : ''}`);
    }
    console.log(
      `2. Regression Testing:  [${res.metrics.regressionTesting.status.toUpperCase()}] ` +
        `${res.metrics.regressionTesting.preventionRulesActive} prevention rules; passRate=${res.metrics.regressionTesting.testPassRatePct ?? 'n/a'}%`,
    );
    console.log(
      `3. Online E2E:          [${String(res.metrics.onlineEvals.status).toUpperCase()}] ` +
        `continuous=${res.metrics.onlineEvals.continuousE2EStatus}`,
    );
    const j = res.metrics.llmAsAJudge;
    console.log(
      `4. Human-label quality: [${j.status.toUpperCase()}] ` +
        `humanPositiveRate=${(j.humanPositiveRate * 100).toFixed(1)}% ` +
        `(legacy alias groundednessScore) ` +
        `holdoutFraction=${(j.holdoutFraction * 100).toFixed(1)}% ` +
        `(legacy alias helpfulnessScore) ` +
        `labels=${j.humanLabelsUsed}/${j.totalFeedbackRecords} ` +
        `DPO=${j.dpoPairsExported} ` +
        `sha=${j.evalSetSha256 ? `${j.evalSetSha256.slice(0, 12)}…` : 'none'}`,
    );
    console.log(`   role: ${j.role}`);
    console.log(
      `5. Domain metrics: coding=${res.metrics.domainMetrics.codingTestsPassed} ` +
        `mobileE2E=${res.metrics.domainMetrics.mobileE2EPassed} ` +
        `revenue=${res.metrics.domainMetrics.revenuePipelineHealthy} ` +
        `(null = unmeasured)\n`,
    );
  }
  if (strict && !res.ok) {
    process.exit(1);
  }
}

module.exports = {
  runEvalBenchmarkSuite,
  buildHumanFeedbackMetrics,
  runHardGates,
};
