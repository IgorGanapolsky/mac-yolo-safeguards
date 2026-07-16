#!/usr/bin/env node
'use strict';

/**
 * hermes-observability-gate.js — Structured metrics gate for Hermes ship claims (Grafana theme).
 *
 * Vibes are not enough: e2e=skipped ≠ pass; stale proofs fail freshness SLOs.
 * Complements tools/require-device-verified.js without editing that file (may be locked).
 *
 * Usage:
 *   node tools/hermes-observability-gate.js [--json] [--mode ship|status]
 *   node tools/hermes-observability-gate.js --max-age-min 60 --json
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const LATEST_PATH = path.join(
  REPO,
  'hermes-mobile/docs/proofs/continuous/latest.json',
);

const DEFAULT_SHIP_MAX_AGE_MIN = 120;
const DEFAULT_STATUS_MAX_AGE_MIN = 360;

function parseArgs(argv) {
  const args = {
    json: false,
    mode: 'ship',
    maxAgeMin: null,
    latestPath: LATEST_PATH,
    now: Date.now(),
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--mode') args.mode = argv[++i] || 'ship';
    else if (a === '--max-age-min') args.maxAgeMin = Number(argv[++i]);
    else if (a === '--latest') args.latestPath = path.resolve(argv[++i] || '');
    else if (a === '--now') args.now = Number(argv[++i]) || args.now;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Evaluate continuous proof against observability SLOs.
 * @param {object} latest
 * @param {{ mode?: string, maxAgeMin?: number|null, now?: number }} opts
 */
function evaluateObservability(latest, opts = {}) {
  const mode = opts.mode || 'ship';
  const now = opts.now || Date.now();
  const maxAgeMin =
    opts.maxAgeMin != null && Number.isFinite(opts.maxAgeMin)
      ? opts.maxAgeMin
      : mode === 'ship'
        ? DEFAULT_SHIP_MAX_AGE_MIN
        : DEFAULT_STATUS_MAX_AGE_MIN;

  const e2e = latest?.e2e || 'missing';
  const unit = latest?.unit || 'missing';
  const updatedAt = latest?.updatedAt || null;
  const detail = latest?.detail || null;
  const ageMs = updatedAt ? now - Date.parse(updatedAt) : null;
  const ageMin = ageMs != null && Number.isFinite(ageMs) ? ageMs / 60000 : null;

  const metrics = {
    e2e,
    unit,
    updatedAt,
    proofAgeMs: ageMs,
    proofAgeMin: ageMin != null ? Math.round(ageMin * 10) / 10 : null,
    maxAgeMin,
    mode,
  };

  const violations = [];

  if (mode === 'ship') {
    if (e2e !== 'pass') {
      violations.push({
        code: 'e2e_not_pass',
        message:
          e2e === 'skipped'
            ? 'e2e=skipped is not pass — refuse ship/device-UX claim'
            : `e2e=${e2e} — refuse ship/device-UX claim`,
      });
    }
    if (unit === 'fail') {
      violations.push({ code: 'unit_fail', message: 'unit=fail in continuous proof' });
    }
  } else {
    // status mode: warn-level only for skipped; fail still violates
    if (e2e === 'fail') {
      violations.push({ code: 'e2e_fail', message: 'e2e=fail' });
    }
    if (e2e === 'missing') {
      violations.push({ code: 'e2e_missing', message: 'latest.json missing e2e field' });
    }
  }

  if (ageMin != null && ageMin > maxAgeMin) {
    violations.push({
      code: 'proof_stale',
      message: `proof age ${metrics.proofAgeMin}m exceeds max ${maxAgeMin}m`,
    });
  }
  if (updatedAt == null) {
    violations.push({ code: 'proof_timestamp_missing', message: 'updatedAt missing' });
  }

  const pass = violations.length === 0;
  return {
    pass,
    deviceVerified: e2e === 'pass',
    metrics,
    violations,
    detail,
    latestPath: opts.latestPath || LATEST_PATH,
    guidance:
      e2e === 'skipped'
        ? 'Report skip honestly; kick continuous E2E when phone idle; never equate skipped with pass.'
        : e2e === 'pass'
          ? 'Metrics green for ship language (freshness still required).'
          : 'Investigate continuous E2E before claiming fixed on device.',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-observability-gate.js [--mode ship|status] [--max-age-min N] [--json]`);
    process.exit(0);
  }

  const latest = readJson(args.latestPath) || {};
  const result = evaluateObservability(latest, {
    mode: args.mode,
    maxAgeMin: args.maxAgeMin,
    now: args.now,
    latestPath: args.latestPath,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `observabilityGate pass=${result.pass} e2e=${result.metrics.e2e} unit=${result.metrics.unit}` +
        (result.metrics.proofAgeMin != null
          ? ` ageMin=${result.metrics.proofAgeMin}`
          : ''),
    );
    for (const v of result.violations) {
      console.error(`  VIOLATION ${v.code}: ${v.message}`);
    }
    if (result.guidance) console.log(`  guidance: ${result.guidance}`);
  }

  process.exit(result.pass ? 0 : 1);
}

module.exports = {
  evaluateObservability,
  DEFAULT_SHIP_MAX_AGE_MIN,
  DEFAULT_STATUS_MAX_AGE_MIN,
};

if (require.main === module) {
  main();
}
