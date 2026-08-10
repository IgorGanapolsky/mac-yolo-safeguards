#!/usr/bin/env node
'use strict';
// hermes-mobile-ci-proof-gate.js — staleness-aware durable proof gate for Hermes Mobile.
//
// The Hermes Mobile continuous-E2E LaunchAgent records its most recent result to
// hermes-mobile/docs/proofs/continuous/latest.json. That file is the *durable proof*
// of device verification. `verify-continuous-e2e.sh --strict` treats any `e2e=pass`
// as a green light regardless of how old it is — a stale pass from weeks ago would
// wrongly gate a CI ship even though the working tree has moved on.
//
// This gate closes that gap: it requires a *well-formed AND fresh* e2e=pass record.
// It is the CI-side counterpart of the durable-proof read the manual verification
// contract already performs. It never re-runs Maestro (a device/emulator is not safe
// to assume in CI); it gates on the durable record the E2E holder publishes.
//
// Exit codes: 0 = gate passes, 1 = gate blocks (record missing/stale/not-pass).
// Flags:
//   --json            emit machine-readable result on stdout
//   --fresh-hours N   freshness window (default 168 = 7 days)
//   --path PATH       override latest.json path
const fs = require('fs');
const path = require('path');

function defaultJsonPath() {
  const here = __dirname; // .../tools
  const root = path.resolve(here, '..');
  return path.join(root, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
}

function parseArgs(argv) {
  const flags = { freshHours: 168, json: false, jsonPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '--fresh-hours') flags.freshHours = Number(argv[++i]);
    else if (a === '--path') flags.jsonPath = argv[++i];
  }
  return flags;
}

function parseRecord(raw) {
  if (!raw || !raw.trim()) return { ok: false, reason: 'latest.json is empty' };
  let rec;
  try {
    rec = JSON.parse(raw);
  } catch (e) {
    return { ok: false, reason: 'latest.json is not valid JSON: ' + e.message };
  }
  if (typeof rec !== 'object' || rec === null) {
    return { ok: false, reason: 'latest.json root is not an object' };
  }
  const missing = ['updatedAt', 'unit', 'e2e'].filter((k) => !(k in rec));
  if (missing.length > 0) {
    return { ok: false, reason: `latest.json missing fields: ${missing.join(', ')}` };
  }
  return { ok: true, rec };
}

function ageHours(updatedAt) {
  const t = Date.parse(updatedAt);
  if (Number.isNaN(t)) return null; // unparseable timestamp -> cannot verify freshness
  return (Date.now() - t) / 3600_000;
}

function gate(jsonPath, freshHours) {
  if (!fs.existsSync(jsonPath)) {
    return {
      pass: false,
      reason: `continuous E2E proof missing (${jsonPath}). Has the continuous-E2E holder published a cycle yet?`,
      e2e: 'missing',
      updatedAt: '',
    };
  }
  let raw;
  try {
    raw = fs.readFileSync(jsonPath, 'utf8');
  } catch (e) {
    return { pass: false, reason: `cannot read proof file: ${e.message}`, e2e: 'unreadable', updatedAt: '' };
  }
  const parsed = parseRecord(raw);
  if (!parsed.ok) {
    return { pass: false, reason: parsed.reason, e2e: 'malformed', updatedAt: '' };
  }
  const rec = parsed.rec;
  const age = ageHours(rec.updatedAt, rec.detail);
  const e2e = rec.e2e || 'missing';
  const unit = rec.unit || 'missing';

  if (age === null) {
    return {
      pass: false,
      reason: `proof timestamp unparseable: "${rec.updatedAt}"`,
      e2e, unit, updatedAt: rec.updatedAt,
    };
  }
  if (age > freshHours) {
    return {
      pass: false,
      reason: `continuous E2E proof is stale (${roundedHours(age)}h > ${freshHours}h window). Re-run the E2E cycle.`,
      e2e, unit, updatedAt: rec.updatedAt, ageHours: age,
    };
  }
  if (e2e !== 'pass') {
    return {
      pass: false,
      reason: `continuous E2E proof is not pass (e2e=${e2e}, unit=${unit}).`,
      e2e, unit, updatedAt: rec.updatedAt, ageHours: age,
    };
  }
  if (unit !== 'pass') {
    return {
      pass: false,
      reason: `continuous E2E proof has unit=${unit} (expected pass).`,
      e2e, unit, updatedAt: rec.updatedAt, ageHours: age,
    };
  }
  return {
    pass: true,
    reason: `fresh continuous E2E proof (e2e=${e2e}, unit=${unit}, ${roundedHours(age)}h old).`,
    e2e, unit, updatedAt: rec.updatedAt, ageHours: age,
  };
}

function roundedHours(h) {
  return Math.round(h * 10) / 10;
}

// Export for unit testing; also runnable directly as a CLI gate.
module.exports = { gate, parseRecord, ageHours, defaultJsonPath, parseArgs };

if (require.main === module) {
  const flags = parseArgs(process.argv.slice(2));
  const jsonPath = flags.jsonPath || defaultJsonPath();
  const out = gate(jsonPath, flags.freshHours);
  if (flags.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(out.pass ? `OK: ${out.reason}` : `BLOCK: ${out.reason}`);
  }
  process.exit(out.pass ? 0 : 1);
}