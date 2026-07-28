#!/usr/bin/env node
'use strict';

/**
 * ml-integrity.js — maniac-grade ML integrity auditor (July 2026).
 *
 * Detects theater and contract breaches:
 *   - untrained / insufficient_labels models marked trained
 *   - missing holdout/CV/Brier metrics on "trained" models
 *   - production registry pointer to untrained or broken artifact
 *   - perfect AUC on tiny holdout without integrity warning
 *   - fake production claims in free text
 *   - serve returning invent scores without model
 *
 *   node tools/ml-integrity.js audit [--model PATH] [--json] [--strict]
 *   node tools/ml-integrity.js validate-model --model PATH [--json] [--strict]
 *   node tools/ml-integrity.js scan-claim --text "…" [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ML_DIR = path.join(os.homedir(), '.hermes', 'ml');
const DEFAULT_MODEL = path.join(ML_DIR, 'propensity-model.json');
const REG_INDEX = path.join(ML_DIR, 'registry', 'index.json');
const LABELS_SUMMARY = path.join(ML_DIR, 'labels-summary.json');

const MIN_HOLDOUT_N_FOR_CLEAN_AUC = 8;
const MIN_POS_PRODUCTION = 5;
const MIN_TOTAL_PRODUCTION = 20;

// Claims that imply production ML quality without evidence.
const FAKE_CLAIM_PATTERNS = [
  /\bbest[- ]in[- ]class\s+(production\s+)?(ml|model|propensity)\b/i,
  /\bproduction[- ]ready\s+(ml|model)\b/i,
  /\b(we\s+have|our)\s+trained\s+production\s+model\b/i,
  /\b100%\s+(auc|accuracy)\b/i,
  /\bauс\s*=\s*1(?:\.0+)?\b/i, // cyrillic lookalike not needed
  /\bauс\s*1\.0\b/i,
  /\bguaranteed\s+(lift|conversion|revenue)\b/i,
  /\bml\s+is\s+(done|complete|finished)\b/i,
];

function parseArgs(argv) {
  const args = {
    command: 'audit',
    json: false,
    strict: false,
    help: false,
    model: '',
    text: '',
    allowToy: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) args.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--model') args.model = path.resolve(rest[++i] || '');
    else if (a === '--text') args.text = rest[++i] || '';
    else if (a === '--allow-toy') args.allowToy = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function loadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (error) {
    return { __parse_error: error.message };
  }
}

function finding(severity, code, message, evidence = {}) {
  return { severity, code, message, evidence };
}

/**
 * Validate a model artifact for integrity.
 * severity: error = hard fail, warn = soft, info = note
 */
function validateModel(model, { allowToy = false, path: modelPath = null } = {}) {
  const findings = [];
  if (!model) {
    findings.push(finding('error', 'model_missing', 'Model file missing or unreadable', { path: modelPath }));
    return { ok: false, findings };
  }
  if (model.__parse_error) {
    findings.push(
      finding('error', 'model_parse_error', `JSON parse failed: ${model.__parse_error}`, {
        path: modelPath,
      }),
    );
    return { ok: false, findings };
  }

  const schema = String(model.schema_version || '');
  if (!schema.startsWith('ml-propensity-model/')) {
    findings.push(
      finding('error', 'bad_schema', `Unexpected schema_version=${schema || 'missing'}`, {
        schema,
      }),
    );
  }

  if (model.trained === true && model.status === 'insufficient_labels') {
    findings.push(
      finding('error', 'trained_vs_status_contradiction', 'trained=true with status=insufficient_labels'),
    );
  }

  if (model.trained === true) {
    if (!Array.isArray(model.weights) || model.weights.length === 0) {
      findings.push(finding('error', 'trained_without_weights', 'trained=true but weights empty'));
    }
    if (typeof model.bias !== 'number') {
      findings.push(finding('error', 'trained_without_bias', 'trained=true but bias missing'));
    }
    const hm = model.holdout_metrics || {};
    if (hm.auc == null) {
      findings.push(finding('error', 'missing_holdout_auc', 'trained model missing holdout_metrics.auc'));
    }
    if (hm.brier == null) {
      findings.push(finding('error', 'missing_holdout_brier', 'trained model missing holdout_metrics.brier'));
    }
    if (hm.n == null || hm.n < 1) {
      findings.push(finding('error', 'missing_holdout_n', 'trained model missing holdout_metrics.n'));
    }
    if (!model.cv || model.cv.mean_auc == null) {
      findings.push(
        finding('warn', 'missing_cv_auc', 'trained model missing cv.mean_auc (July 2026 expects k-fold)'),
      );
    }
    if (!model.calibration || model.calibration.fitted !== true) {
      findings.push(
        finding('warn', 'uncalibrated', 'trained model not Platt-calibrated on holdout'),
      );
    }
    // Toy perfection: perfect AUC on tiny holdout is a common theater smell
    if (
      !allowToy &&
      hm.auc === 1 &&
      typeof hm.n === 'number' &&
      hm.n < MIN_HOLDOUT_N_FOR_CLEAN_AUC
    ) {
      findings.push(
        finding(
          'warn',
          'perfect_auc_tiny_holdout',
          `holdout auc=1 with n=${hm.n} < ${MIN_HOLDOUT_N_FOR_CLEAN_AUC} — treat as toy/fixture, not production proof`,
          { holdout_n: hm.n, auc: hm.auc },
        ),
      );
    }
    if (
      typeof model.positives === 'number' &&
      typeof model.total === 'number' &&
      (model.positives < MIN_POS_PRODUCTION || model.total < MIN_TOTAL_PRODUCTION)
    ) {
      findings.push(
        finding(
          'warn',
          'below_production_label_floor',
          `pos=${model.positives} total=${model.total} below production floor (${MIN_POS_PRODUCTION}/${MIN_TOTAL_PRODUCTION})`,
        ),
      );
    }
  } else if (model.status === 'insufficient_labels') {
    findings.push(
      finding('info', 'fail_closed_ok', 'insufficient_labels is correct fail-closed posture'),
    );
    if (model.trained === true) {
      findings.push(finding('error', 'insufficient_but_trained', 'contradiction'));
    }
  }

  // Weights must be finite
  if (Array.isArray(model.weights)) {
    for (let i = 0; i < model.weights.length; i += 1) {
      if (!Number.isFinite(model.weights[i])) {
        findings.push(
          finding('error', 'non_finite_weight', `weights[${i}] is not finite`, {
            value: model.weights[i],
          }),
        );
      }
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  return {
    ok: errors.length === 0,
    findings,
    trained: Boolean(model.trained),
    status: model.status || null,
    path: modelPath,
  };
}

function scanClaim(text) {
  const hits = [];
  const t = String(text || '');
  for (const re of FAKE_CLAIM_PATTERNS) {
    const m = t.match(re);
    if (m) hits.push({ pattern: re.source, match: m[0] });
  }
  // Allow platform claims
  const platformOk =
    /\bplatform[_ ]ready\b/i.test(t) ||
    /\bfounder-platform bar\b/i.test(t) ||
    /\bproduction_ml_ready=false\b/i.test(t);
  return {
    ok: hits.length === 0 || platformOk,
    hits,
    note:
      hits.length && !platformOk
        ? 'Refuse production-quality claims without production_ml_ready evidence'
        : 'claim scan clean or platform-scoped',
  };
}

function audit({ modelPath = DEFAULT_MODEL, allowToy = false } = {}) {
  const findings = [];
  const model = loadJson(modelPath);
  const modelReport = validateModel(model, { allowToy, path: modelPath });
  findings.push(...modelReport.findings.map((f) => ({ ...f, scope: 'model' })));

  const summary = loadJson(LABELS_SUMMARY);
  if (!summary) {
    findings.push(
      finding('warn', 'no_labels_summary', 'labels-summary.json missing — run ml-label-store export', {
        path: LABELS_SUMMARY,
      }),
    );
  } else if (summary.__parse_error) {
    findings.push(finding('error', 'labels_summary_parse', summary.__parse_error));
  } else if (summary.train_ready && !model?.trained) {
    findings.push(
      finding(
        'warn',
        'labels_ready_model_stale',
        'labels train_ready=true but propensity model not trained — re-run train',
      ),
    );
  }

  const reg = loadJson(REG_INDEX);
  if (reg && !reg.__parse_error) {
    if (reg.production) {
      const entry = (reg.models || []).find((m) => m.id === reg.production);
      if (!entry) {
        findings.push(
          finding('error', 'production_pointer_orphan', `production=${reg.production} not in models[]`),
        );
      } else {
        const prodModel = loadJson(entry.path);
        const prodVal = validateModel(prodModel, { allowToy, path: entry.path });
        if (!prodVal.trained) {
          findings.push(
            finding('error', 'production_untrained', 'registry production points at untrained model', {
              id: reg.production,
            }),
          );
        }
        for (const f of prodVal.findings.filter((x) => x.severity === 'error')) {
          findings.push({ ...f, scope: 'registry_production' });
        }
        // sha mismatch
        if (entry.path && fs.existsSync(entry.path) && entry.sha256) {
          const crypto = require('crypto');
          const actual = crypto.createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex');
          if (actual !== entry.sha256) {
            findings.push(
              finding('error', 'registry_sha_mismatch', 'production artifact sha256 drifted', {
                id: reg.production,
              }),
            );
          }
        }
      }
    }
  }

  // Serve contract: null model must not invent scores
  try {
    const serve = require('./ml-serve');
    const nullScore = serve.scoreOne(null, { agent_stack: 'yes' }, 0.5);
    if (nullScore.ok || nullScore.probability_paid != null) {
      findings.push(
        finding('error', 'serve_invents_without_model', 'ml-serve returned scores without a model'),
      );
    } else {
      findings.push(
        finding('info', 'serve_fail_closed_ok', 'ml-serve refuses scores without model'),
      );
    }
  } catch (error) {
    findings.push(
      finding('error', 'serve_load_failed', error.message || String(error)),
    );
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');
  return {
    schema_version: 'ml-integrity/1',
    generated_at: new Date().toISOString(),
    ok: errors.length === 0,
    error_count: errors.length,
    warn_count: warns.length,
    model_path: modelPath,
    model_trained: Boolean(model?.trained),
    findings,
    principles: [
      'Never invent AUC/cash/production claims',
      'insufficient_labels is success for honesty, not a bug',
      'Perfect AUC on n<8 holdout is toy evidence only',
      'Registry production must point at trained, schema-valid artifacts',
    ],
  };
}

/**
 * Can this model be promoted to production?
 */
function canPromote(model, { allowToy = false, force = false } = {}) {
  const v = validateModel(model, { allowToy });
  const blockers = [];
  if (!model || !model.trained) blockers.push('not_trained');
  if (!v.ok) blockers.push(...v.findings.filter((f) => f.severity === 'error').map((f) => f.code));
  if (!force && !allowToy) {
    const toy = v.findings.find((f) => f.code === 'perfect_auc_tiny_holdout');
    if (toy) blockers.push('perfect_auc_tiny_holdout_use_allow_toy');
    const floor = v.findings.find((f) => f.code === 'below_production_label_floor');
    if (floor) blockers.push('below_production_label_floor');
  }
  return {
    ok: blockers.length === 0,
    blockers,
    findings: v.findings,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-integrity.js audit [--model PATH] [--json] [--strict] [--allow-toy]
  node tools/ml-integrity.js validate-model --model PATH [--json] [--strict]
  node tools/ml-integrity.js scan-claim --text "…" [--json]
  node tools/ml-integrity.js can-promote --model PATH [--json] [--allow-toy]`);
    process.exit(0);
  }

  let result;
  if (args.command === 'audit') {
    result = audit({ modelPath: args.model || DEFAULT_MODEL, allowToy: args.allowToy });
  } else if (args.command === 'validate-model') {
    const p = args.model || DEFAULT_MODEL;
    result = validateModel(loadJson(p), { allowToy: args.allowToy, path: p });
  } else if (args.command === 'scan-claim') {
    if (!args.text) throw new Error('--text required');
    result = scanClaim(args.text);
  } else if (args.command === 'can-promote') {
    const p = args.model || DEFAULT_MODEL;
    result = canPromote(loadJson(p), { allowToy: args.allowToy });
  } else {
    throw new Error(`Unknown command: ${args.command}`);
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.command === 'scan-claim') {
    console.log(`ml-integrity claim: ok=${result.ok} hits=${result.hits.length} — ${result.note}`);
    for (const h of result.hits) console.log(`  hit: ${h.match}`);
  } else if (args.command === 'can-promote') {
    console.log(
      `ml-integrity can-promote: ok=${result.ok}${result.blockers?.length ? ` blockers=${result.blockers.join(',')}` : ''}`,
    );
  } else {
    console.log(
      `ml-integrity ${args.command}: ok=${result.ok} errors=${result.error_count ?? result.findings?.filter((f) => f.severity === 'error').length} warns=${result.warn_count ?? result.findings?.filter((f) => f.severity === 'warn').length}`,
    );
    for (const f of result.findings || []) {
      console.log(`  [${f.severity}] ${f.code}: ${f.message}`);
    }
  }

  const hardFail =
    args.strict &&
    (result.ok === false ||
      (result.error_count != null && result.error_count > 0) ||
      (result.findings && result.findings.some((f) => f.severity === 'error')));
  if (hardFail) process.exit(1);
  if (args.command === 'can-promote' && !result.ok) process.exit(2);
  if (args.command === 'scan-claim' && !result.ok) process.exit(2);
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
  validateModel,
  audit,
  scanClaim,
  canPromote,
  FAKE_CLAIM_PATTERNS,
  MIN_HOLDOUT_N_FOR_CLEAN_AUC,
};
