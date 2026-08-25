#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { exportDpoPairs } = require('./export-dpo-benchmark-pairs');
const { gate: gateMobileProof } = require('./hermes-mobile-ci-proof-gate');

const DEFAULT_E2E_FRESH_HOURS = 168;

function readJson(pathname) {
  if (!pathname || !fs.existsSync(pathname)) return { status: 'missing', value: null };
  try {
    return { status: 'present', value: JSON.parse(fs.readFileSync(pathname, 'utf8')) };
  } catch (error) {
    return { status: 'invalid', value: null, reason: error.message };
  }
}

function measuredCases(value, key) {
  const cases = Array.isArray(value?.[key]) ? value[key] : [];
  const observed = cases.filter((item) => item && typeof item.passed === 'boolean' && typeof item.source === 'string' && item.source.trim());
  if (observed.length === 0) {
    return { status: 'not_measured', total: 0, passed: 0, failed: 0, passRatePct: null };
  }
  const passed = observed.filter((item) => item.passed).length;
  return {
    status: passed === observed.length ? 'pass' : 'fail',
    total: observed.length,
    passed,
    failed: observed.length - passed,
    passRatePct: Number(((passed / observed.length) * 100).toFixed(2)),
  };
}

function measuredBinaryEvents(value, key, field) {
  const events = Array.isArray(value?.[key]) ? value[key] : [];
  const observed = events.filter((item) => item && typeof item[field] === 'boolean' && typeof item.source === 'string' && item.source.trim());
  if (observed.length === 0) return { status: 'not_measured', total: 0, positive: 0, ratePct: null };
  const positive = observed.filter((item) => item[field]).length;
  return {
    status: 'measured',
    total: observed.length,
    positive,
    ratePct: Number(((positive / observed.length) * 100).toFixed(2)),
  };
}

function readE2eProof(proofPath, freshHours = DEFAULT_E2E_FRESH_HOURS) {
  if (!Number.isFinite(freshHours) || freshHours <= 0) {
    return { status: 'fail', proofPath, reason: 'e2eFreshHours must be a positive number' };
  }
  if (!proofPath || !fs.existsSync(proofPath)) {
    return { status: 'not_measured', proofPath, reason: 'continuous E2E proof is missing' };
  }
  const proof = gateMobileProof(proofPath, freshHours);
  return {
    status: proof.pass ? 'pass' : 'fail',
    proofPath,
    capturedAt: proof.updatedAt || null,
    ageHours: proof.ageHours ?? null,
    unit: proof.unit || null,
    e2e: proof.e2e || null,
    reason: proof.reason,
  };
}

function runRegressionTest(testPath) {
  if (!testPath || !fs.existsSync(testPath)) return { status: 'not_run', testPath };
  try {
    execFileSync(process.execPath, ['--test', testPath], { stdio: 'pipe', timeout: 30_000 });
    return { status: 'pass', testPath };
  } catch (error) {
    return {
      status: 'fail',
      testPath,
      exitCode: Number.isInteger(error.status) ? error.status : null,
      reason: error.code || error.message,
    };
  }
}

function runEvalBenchmarkSuite(options = {}) {
  const root = options.cwd || process.cwd();
  const startedAt = Date.now();
  const evidencePath = options.evidencePath || null;
  const evidence = readJson(evidencePath);
  const evidenceValue = evidence.status === 'present' ? evidence.value : null;
  const inputPath = options.inputPath || path.join(os.homedir(), '.thumbgate', 'memories.json');
  const outputPath = options.outputPath || path.join(root, '.thumbgate', 'dpo_pairs.jsonl');
  const dpoExport = exportDpoPairs({
    cwd: root,
    inputPath,
    outputPath,
    minPairs: options.minPairs,
  });
  const connectorTestPath = options.connectorTestPath === undefined
    ? path.join(root, 'tests', 'test-hermes-cloud-connector.js')
    : options.connectorTestPath;
  const e2eProofPath = options.e2eProofPath || path.join(root, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');

  const offlineEvals = measuredCases(evidenceValue, 'offlineCases');
  const onlineEvals = measuredBinaryEvents(evidenceValue, 'onlineEvents', 'positive');
  const groundedness = measuredBinaryEvents(evidenceValue, 'judgeCases', 'grounded');
  const helpfulness = measuredBinaryEvents(evidenceValue, 'judgeCases', 'helpful');
  const regressionTesting = runRegressionTest(connectorTestPath);
  const mobileE2e = readE2eProof(e2eProofPath, options.e2eFreshHours ?? DEFAULT_E2E_FRESH_HOURS);

  const hardFailure = [offlineEvals.status, regressionTesting.status, mobileE2e.status].includes('fail');
  const requiredEvidenceReady = offlineEvals.status === 'pass'
    && onlineEvals.status === 'measured'
    && groundedness.status === 'measured'
    && helpfulness.status === 'measured'
    && regressionTesting.status === 'pass'
    && mobileE2e.status === 'pass'
    && dpoExport.status === 'ready';

  return {
    schema: 'thumbgate/eval-benchmark-v2',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    status: hardFailure ? 'fail' : requiredEvidenceReady ? 'ready' : 'insufficient_evidence',
    evidence: {
      status: evidence.status,
      evidencePath,
      reason: evidence.reason || null,
    },
    metrics: {
      offlineEvals,
      regressionTesting,
      onlineEvals,
      llmAsAJudge: {
        status: groundedness.status === 'measured' && helpfulness.status === 'measured' ? 'measured' : 'not_measured',
        groundedness,
        helpfulness,
      },
      dpoExport,
      domainMetrics: {
        codingRegression: regressionTesting.status,
        mobileE2e,
        revenue: {
          status: 'not_measured',
          reason: 'Revenue requires a fresh payment-provider receipt and is outside this local evaluation suite.',
        },
      },
    },
  };
}

function parseArgs(argv) {
  const options = {};
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--evidence' || arg === '--input' || arg === '--output' || arg === '--min-pairs' || arg === '--e2e-fresh-hours') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} requires a value` };
      index += 1;
      if (arg === '--evidence') options.evidencePath = path.resolve(value);
      if (arg === '--input') options.inputPath = path.resolve(value);
      if (arg === '--output') options.outputPath = path.resolve(value);
      if (arg === '--min-pairs') options.minPairs = Number(value);
      if (arg === '--e2e-fresh-hours') options.e2eFreshHours = Number(value);
      continue;
    }
    return { error: `unknown option: ${arg}` };
  }
  return { options, json };
}

if (require.main === module) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(parsed.error);
    process.exitCode = 2;
  } else {
    const result = runEvalBenchmarkSuite(parsed.options);
    if (parsed.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`ThumbGate evaluation: ${result.status}`);
      console.log(`Offline cases: ${result.metrics.offlineEvals.status} (${result.metrics.offlineEvals.total})`);
      console.log(`Regression test: ${result.metrics.regressionTesting.status}`);
      console.log(`Online feedback: ${result.metrics.onlineEvals.status} (${result.metrics.onlineEvals.total})`);
      console.log(`LLM judge: ${result.metrics.llmAsAJudge.status}`);
      console.log(`DPO export: ${result.metrics.dpoExport.status}`);
      console.log(`Mobile E2E: ${result.metrics.domainMetrics.mobileE2e.status}`);
      console.log('Revenue: not_measured (provider proof required)');
    }
    process.exitCode = result.status === 'fail' ? 1 : result.status === 'ready' ? 0 : 2;
  }
}

module.exports = {
  DEFAULT_E2E_FRESH_HOURS,
  measuredBinaryEvents,
  measuredCases,
  readE2eProof,
  runEvalBenchmarkSuite,
  runRegressionTest,
};
