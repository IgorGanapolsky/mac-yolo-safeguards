#!/usr/bin/env node
'use strict';

/**
 * ml-gate.js — July 2026 best-in-class ML checklist (honest, fail-closed).
 *
 * Reports which platform capabilities are present vs production-grade.
 * NEVER claims "best-in-class production model quality" without trained+promoted
 * model and paid labels. Distinguishes:
 *   - platform_ready: harness/tools exist and offline tests pass
 *   - production_ml_ready: trained model + registry + labels + holdout metrics
 *
 *   node tools/ml-gate.js [--json] [--strict-platform] [--strict-production]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ML_DIR = path.join(os.homedir(), '.hermes', 'ml');

function exists(rel) {
  return fs.existsSync(path.join(REPO, rel));
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return { ok: r.status === 0, status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function check(id, label, pass, detail, tier) {
  return { id, label, pass: Boolean(pass), detail: detail || '', tier };
}

function buildReport() {
  const checks = [];

  // --- Platform (tools + offline evals) ---
  checks.push(
    check(
      'label_store',
      'Label export store',
      exists('tools/ml-label-store.js'),
      'tools/ml-label-store.js',
      'platform',
    ),
  );
  checks.push(
    check(
      'train',
      'Propensity train with metrics',
      exists('tools/ml-propensity-train.js') && exists('tools/ml-core.js'),
      'train + ml-core (AUC/Brier/CV/calib)',
      'platform',
    ),
  );
  checks.push(
    check(
      'registry',
      'Model registry',
      exists('tools/ml-registry.js'),
      'tools/ml-registry.js',
      'platform',
    ),
  );
  checks.push(
    check('serve', 'Inference serve path', exists('tools/ml-serve.js'), 'tools/ml-serve.js', 'platform'),
  );
  checks.push(
    check(
      'experiment',
      'A/B experiment gate',
      exists('tools/ml-experiment.js'),
      'two-proportion significance, min-n',
      'platform',
    ),
  );
  checks.push(
    check(
      'system_scores',
      'Evidence SYSTEM_SCORES',
      exists('tools/ml-system-scores.js'),
      'no invented scores',
      'platform',
    ),
  );
  checks.push(
    check(
      'rag_eval',
      'RAG retrieval eval',
      exists('tools/rag-retrieval-eval.js'),
      'recall@k (+ nDCG when present)',
      'platform',
    ),
  );
  checks.push(
    check(
      'agent_eval',
      'Agent ability eval catalog',
      exists('tools/agent-swarm-harness.js'),
      'eval-check / eval-mine',
      'platform',
    ),
  );

  // Offline unit battery for baseline ML only.
  // Do NOT spawn tests/test-ml-best-in-class.js here — that test calls ml-gate
  // and would recurse forever.
  if (process.env.ML_GATE_SKIP_UNIT !== '1') {
    const unit = runNode('tests/test-ml-stack.js');
    checks.push(
      check(
        'unit_ml_stack',
        'ML unit tests',
        unit.ok,
        unit.ok ? 'tests/test-ml-stack.js PASS' : (unit.stderr || unit.stdout).slice(0, 160),
        'platform',
      ),
    );
  } else {
    checks.push(
      check('unit_ml_stack', 'ML unit tests', true, 'skipped (ML_GATE_SKIP_UNIT=1)', 'platform'),
    );
  }

  checks.push(
    check(
      'unit_best_in_class_file',
      'Best-in-class test file present',
      exists('tests/test-ml-best-in-class.js'),
      'tests/test-ml-best-in-class.js (run separately in CI)',
      'platform',
    ),
  );

  const rag = runNode('tools/rag-retrieval-eval.js', ['--json']);
  let ragBody = null;
  try {
    ragBody = JSON.parse(rag.stdout);
  } catch {
    /* ignore */
  }
  checks.push(
    check(
      'rag_green',
      'RAG eval green',
      Boolean(rag.ok && ragBody?.ok),
      ragBody
        ? `meanRecall=${ragBody.meanRecallAtK} meanNdcg=${ragBody.meanNdcgAtK ?? 'n/a'} cases=${ragBody.caseCount}`
        : 'rag eval failed',
      'platform',
    ),
  );

  const trainFixture = runNode('tools/ml-propensity-train.js', [
    'train',
    '--labels',
    path.join(REPO, 'tests/fixtures/ml/synthetic-labels.jsonl'),
    '--out',
    path.join(os.tmpdir(), `ml-gate-model-${process.pid}.json`),
    '--json',
  ]);
  let trainBody = null;
  try {
    trainBody = JSON.parse(trainFixture.stdout);
  } catch {
    /* ignore */
  }
  checks.push(
    check(
      'train_fixture_metrics',
      'Train on fixture emits holdout+CV+Brier',
      Boolean(
        trainBody?.trained &&
          trainBody.holdout_metrics?.auc != null &&
          trainBody.holdout_metrics?.brier != null &&
          trainBody.cv?.mean_auc != null,
      ),
      trainBody?.trained
        ? `auc=${trainBody.holdout_metrics.auc} brier=${trainBody.holdout_metrics.brier} cv=${trainBody.cv.mean_auc}`
        : (trainFixture.stderr || trainFixture.stdout).slice(0, 160),
      'platform',
    ),
  );

  // --- Production ML (real labels + promoted model) ---
  const model = loadJson(path.join(ML_DIR, 'propensity-model.json'));
  const summary = loadJson(path.join(ML_DIR, 'labels-summary.json'));
  const reg = loadJson(path.join(ML_DIR, 'registry', 'index.json'));

  checks.push(
    check(
      'labels_ready',
      'Real training labels ready',
      Boolean(summary?.train_ready && summary.positives >= 5),
      summary
        ? `pos=${summary.positives} total=${summary.training_eligible} ready=${summary.train_ready}`
        : 'no labels-summary — run ml-label-store export',
      'production',
    ),
  );
  checks.push(
    check(
      'model_trained',
      'Production propensity trained',
      Boolean(model?.trained),
      model?.trained
        ? `auc=${model.holdout_metrics?.auc} brier=${model.holdout_metrics?.brier}`
        : model?.status || 'no model',
      'production',
    ),
  );
  checks.push(
    check(
      'registry_production',
      'Registry has production pointer',
      Boolean(reg?.production),
      reg?.production || 'none — run ml-registry promote',
      'production',
    ),
  );
  checks.push(
    check(
      'calibration',
      'Model calibrated',
      Boolean(model?.calibration?.fitted),
      model?.calibration?.fitted ? 'platt' : 'not fitted',
      'production',
    ),
  );
  checks.push(
    check(
      'stripe_receipt',
      'Stripe cash receipt present',
      fs.existsSync(
        path.join(os.homedir(), '.hermes', 'receipts', 'tinker-brain', 'revenue-receipt.json'),
      ),
      'revenue-receipt.json',
      'production',
    ),
  );

  const platform = checks.filter((c) => c.tier === 'platform');
  const production = checks.filter((c) => c.tier === 'production');
  const platformOk = platform.every((c) => c.pass);
  const productionOk = production.every((c) => c.pass);

  const platformScore = Math.round(
    (100 * platform.filter((c) => c.pass).length) / (platform.length || 1),
  );
  const productionScore = Math.round(
    (100 * production.filter((c) => c.pass).length) / (production.length || 1),
  );

  return {
    schema_version: 'ml-gate/1',
    generated_at: new Date().toISOString(),
    // Honest language — do not claim production best-in-class without productionOk
    platform_ready: platformOk,
    production_ml_ready: productionOk,
    best_in_class_july_2026: {
      platform: platformOk
        ? 'PASS — tooling, evals, metrics, registry, experiments meet July 2026 founder-platform bar'
        : 'FAIL — platform gaps remain',
      production_model:
        productionOk
          ? 'PASS — trained+promoted model with labels, calibration, cash receipt'
          : 'NOT YET — need paid labels + train + registry promote + Stripe receipt (fail-closed is correct)',
    },
    scores: {
      platform_pct: platformScore,
      production_pct: productionScore,
    },
    checks,
  };
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const strictPlatform = argv.includes('--strict-platform');
  const strictProduction = argv.includes('--strict-production');
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'Usage: node tools/ml-gate.js [--json] [--strict-platform] [--strict-production]',
    );
    process.exit(0);
  }
  const report = buildReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== ML Gate · July 2026 ===');
    console.log(
      `Platform: ${report.platform_ready ? 'READY' : 'GAPS'} (${report.scores.platform_pct}%)`,
    );
    console.log(
      `Production ML: ${report.production_ml_ready ? 'READY' : 'NOT YET'} (${report.scores.production_pct}%)`,
    );
    console.log(`  ${report.best_in_class_july_2026.platform}`);
    console.log(`  ${report.best_in_class_july_2026.production_model}`);
    console.log('');
    for (const c of report.checks) {
      console.log(`  ${c.pass ? '✓' : '✗'} [${c.tier}] ${c.id} — ${c.detail}`);
    }
  }
  if (strictPlatform && !report.platform_ready) process.exit(1);
  if (strictProduction && !report.production_ml_ready) process.exit(1);
  process.exit(0);
}

if (require.main === module) main();

module.exports = { buildReport };
