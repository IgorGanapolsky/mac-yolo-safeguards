#!/usr/bin/env node
'use strict';

/**
 * ml-system-scores.js — evidence-backed SYSTEM_SCORES for tinker-brain + decision stack.
 *
 * Never invents numbers. Pulls:
 *   DS  — label store readiness + pipeline label counts
 *   ML  — propensity model train/holdout metrics or insufficient_labels
 *   RAG — tools/rag-retrieval-eval.js meanRecallAtK
 *   MONETIZATION — Stripe receipt external_net (0 if missing)
 *   OVERALL — weighted mean
 *
 *   node tools/ml-system-scores.js [--json] [--write]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const ML_DIR = path.join(os.homedir(), '.hermes', 'ml');
const DEFAULT_OUT = path.join(ML_DIR, 'system-scores.json');
const MODEL_PATH = path.join(ML_DIR, 'propensity-model.json');
const SUMMARY_PATH = path.join(ML_DIR, 'labels-summary.json');
const STRIPE_RECEIPT = path.join(
  os.homedir(),
  '.hermes',
  'receipts',
  'tinker-brain',
  'revenue-receipt.json',
);

function parseArgs(argv) {
  const args = { json: false, write: false, help: false, out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--write') args.write = true;
    else if (a === '--out') args.out = path.resolve(argv[++i] || '');
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function letterGrade(score100) {
  if (score100 >= 90) return 'A';
  if (score100 >= 80) return 'B';
  if (score100 >= 70) return 'C';
  if (score100 >= 60) return 'D';
  return 'F';
}

function runRagEval() {
  const script = path.join(REPO, 'tools', 'rag-retrieval-eval.js');
  if (!fs.existsSync(script)) {
    return { ok: false, meanRecallAtK: 0, detail: 'rag-retrieval-eval.js missing' };
  }
  const r = spawnSync(process.execPath, [script, '--json'], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  try {
    const body = JSON.parse(r.stdout || '{}');
    return {
      ok: Boolean(body.ok),
      meanRecallAtK: Number(body.meanRecallAtK || 0),
      caseCount: body.caseCount || 0,
      passCount: body.passCount || 0,
      detail: `meanRecallAtK=${body.meanRecallAtK} ${body.passCount}/${body.caseCount}`,
    };
  } catch {
    return {
      ok: false,
      meanRecallAtK: 0,
      detail: (r.stderr || r.stdout || 'rag eval failed').slice(0, 200),
    };
  }
}

function scoreDs(summary) {
  if (!summary) {
    return {
      score: 20,
      grade: 'F',
      note: 'no labels-summary; run ml-label-store export',
    };
  }
  let score = 25;
  if (summary.training_eligible > 0) score += 20;
  if (summary.training_eligible >= 20) score += 20;
  if (summary.positives > 0) score += 15;
  if (summary.positives >= 5) score += 15;
  if (summary.train_ready) score += 10;
  score = Math.min(100, score);
  return {
    score,
    grade: letterGrade(score),
    note: `train_eligible=${summary.training_eligible || 0} pos=${summary.positives || 0} ready=${Boolean(summary.train_ready)}`,
  };
}

function scoreMl(model) {
  if (!model) {
    return {
      score: 15,
      grade: 'F',
      note: 'no propensity-model.json; run ml-propensity-train',
    };
  }
  if (!model.trained || model.status === 'insufficient_labels') {
    return {
      score: 35,
      grade: 'F',
      note: `insufficient_labels (pos=${model.positives || 0} total=${model.total || 0}) — correct fail-closed`,
    };
  }
  const auc = model.holdout_metrics?.auc;
  let score = 55;
  if (typeof auc === 'number') {
    // Map AUC 0.5→55, 0.7→75, 0.9→95
    score = Math.round(55 + (auc - 0.5) * 100);
    score = Math.max(40, Math.min(98, score));
  } else if (model.holdout_metrics?.accuracy != null) {
    score = Math.round(40 + model.holdout_metrics.accuracy * 50);
  }
  return {
    score,
    grade: letterGrade(score),
    note: `trained holdout_auc=${auc} acc=${model.holdout_metrics?.accuracy}`,
  };
}

function scoreRag(rag) {
  const mean = Number(rag.meanRecallAtK || 0);
  const score = Math.round(mean * 100);
  return {
    score: Math.max(0, Math.min(100, score)),
    grade: letterGrade(score),
    note: rag.detail || `meanRecallAtK=${mean}`,
  };
}

function scoreMonetization(receipt) {
  if (!receipt || typeof receipt.external_net_cents !== 'number') {
    return {
      score: 0,
      grade: 'F',
      note: 'no Stripe revenue receipt — external cash unverified',
      external_usd: 0,
    };
  }
  const usd = receipt.external_net_cents / 100;
  if (usd <= 0) {
    return {
      score: 10,
      grade: 'F',
      note: receipt.verified
        ? 'Stripe-reconciled $0 external (honest)'
        : 'receipt present but $0 external',
      external_usd: 0,
    };
  }
  // Log-ish scale: $10→40, $100→70, $1000→95
  const score = Math.min(100, Math.round(20 + 25 * Math.log10(usd + 1)));
  return {
    score,
    grade: letterGrade(score),
    note: `external $${usd.toFixed(2)} verified=${Boolean(receipt.verified)}`,
    external_usd: usd,
  };
}

function formatSystemScoresLine(parts) {
  // Match tinker-brain contract style: "DS 55/100 (F); ML 40/100 (F); ..."
  const ds = parts.ds;
  const ml = parts.ml;
  const rag = parts.rag;
  const mon = parts.monetization;
  const overall = parts.overall;
  return (
    `DS ${ds.score}/100 (${ds.grade}); ` +
    `ML ${ml.score}/100 (${ml.grade}); ` +
    `RAG ${rag.score}/100 (${rag.grade}); ` +
    `OVERALL ${overall.score}/100 (${overall.grade}); ` +
    `MONETIZATION ${mon.score}/100`
  );
}

function buildScores() {
  // Best-effort refresh labels summary if export is cheap and business_os may exist
  const labelStore = path.join(REPO, 'tools', 'ml-label-store.js');
  if (fs.existsSync(labelStore)) {
    spawnSync(process.execPath, [labelStore, 'export', '--json'], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
  }
  const trainScript = path.join(REPO, 'tools', 'ml-propensity-train.js');
  if (fs.existsSync(trainScript)) {
    spawnSync(process.execPath, [trainScript, 'train', '--json'], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
  }

  const summary = loadJson(SUMMARY_PATH);
  const model = loadJson(MODEL_PATH);
  const receipt = loadJson(STRIPE_RECEIPT);
  const rag = runRagEval();

  const ds = scoreDs(summary);
  const ml = scoreMl(model);
  const ragS = scoreRag(rag);
  const mon = scoreMonetization(receipt);

  // Weights: RAG+DS matter more until paid labels exist; mon heavily discounted if $0
  const overallScore = Math.round(
    ds.score * 0.25 + ml.score * 0.25 + ragS.score * 0.3 + mon.score * 0.2,
  );
  const overall = {
    score: overallScore,
    grade: letterGrade(overallScore),
    note: 'weighted DS25 ML25 RAG30 MON20',
  };

  const parts = { ds, ml, rag: ragS, monetization: mon, overall };
  const line = formatSystemScoresLine(parts);

  return {
    schema_version: 'ml-system-scores/1',
    generated_at: new Date().toISOString(),
    system_scores_line: line,
    parts,
    evidence: {
      labels_summary: summary,
      model_status: model?.status || 'missing',
      model_trained: Boolean(model?.trained),
      rag,
      stripe_external_usd: mon.external_usd,
    },
    principles: [
      'Never invent scores without evidence files',
      'ML F with insufficient_labels is correct, not a bug',
      'Cash only from Stripe receipt external_net_cents',
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/ml-system-scores.js [--json] [--write] [--out PATH]');
    process.exit(0);
  }
  const report = buildScores();
  if (args.write) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(report, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`SYSTEM_SCORES=${report.system_scores_line}`);
    console.log(
      `  DS=${report.parts.ds.score} (${report.parts.ds.note}); ML=${report.parts.ml.score} (${report.parts.ml.note})`,
    );
    console.log(
      `  RAG=${report.parts.rag.score} (${report.parts.rag.note}); MON=${report.parts.monetization.score} (${report.parts.monetization.note})`,
    );
    if (args.write) console.log(`wrote ${args.out}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

module.exports = {
  buildScores,
  formatSystemScoresLine,
  scoreDs,
  scoreMl,
  scoreRag,
  scoreMonetization,
  letterGrade,
};
