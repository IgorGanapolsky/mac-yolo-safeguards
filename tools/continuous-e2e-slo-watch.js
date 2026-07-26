#!/usr/bin/env node
'use strict';

/**
 * Yellow/red SLO watcher for Hermes Mobile continuous E2E proofs.
 * Reads hermes-mobile/docs/proofs/continuous/latest.json and alerts on
 * transition to skipped (yellow) or fail (red). Idempotent vs state file.
 *
 * Usage:
 *   node tools/continuous-e2e-slo-watch.js
 *   node tools/continuous-e2e-slo-watch.js --json
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const LATEST =
  process.env.HERMES_CONTINUOUS_LATEST_JSON ||
  path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json');
const STATE =
  process.env.HERMES_E2E_SLO_STATE ||
  path.join(process.env.HOME || '', '.hermes/continuous-e2e-slo-state');
const NTFY = process.env.HERMES_E2E_NTFY_TOPIC || 'yolo-guard-fdh8ktuw1vtxb5sb';
const STALE_HOURS = Number(process.env.HERMES_E2E_SLO_STALE_HOURS || '6');

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function ntfy(title, body, priority = 'default') {
  spawnSync(
    'curl',
    [
      '-sS',
      '-m',
      '10',
      '-H',
      `Title: ${title}`,
      '-H',
      `Priority: ${priority}`,
      '-H',
      'Tags: mobile,e2e,slo',
      '-d',
      body.slice(0, 500),
      `https://ntfy.sh/${NTFY}`,
    ],
    { encoding: 'utf8', timeout: 15_000 },
  );
}

function main() {
  const json = process.argv.includes('--json');
  const proof = readJson(LATEST);
  const prev = (fs.existsSync(STATE) ? fs.readFileSync(STATE, 'utf8') : 'unknown').trim();
  if (!proof) {
    const out = { ok: false, reason: 'missing_proof', path: LATEST, prev };
    if (json) console.log(JSON.stringify(out));
    else console.error('continuous-e2e-slo: missing', LATEST);
    process.exitCode = 1;
    return;
  }

  const e2e = String(proof.e2e || 'unknown');
  const updatedAt = proof.updatedAt ? Date.parse(proof.updatedAt) : NaN;
  const ageH = Number.isFinite(updatedAt) ? (Date.now() - updatedAt) / 3_600_000 : Infinity;
  let slo = 'unknown';
  if (e2e === 'pass') slo = 'green';
  else if (e2e === 'fail') slo = 'red';
  else if (e2e === 'skipped') slo = 'yellow';
  if (ageH > STALE_HOURS && e2e !== 'pass') slo = slo === 'red' ? 'red' : 'yellow_stale';

  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  const nextState = `${e2e}|${slo}`;
  if (nextState !== prev) {
    if (slo === 'red') {
      ntfy('Hermes continuous E2E RED', `e2e=${e2e} detail=${String(proof.detail || '').slice(0, 180)} ageH=${ageH.toFixed(1)}`);
    } else if (slo === 'yellow' || slo === 'yellow_stale') {
      ntfy(
        'Hermes continuous E2E YELLOW',
        `e2e=${e2e} slo=${slo} detail=${String(proof.detail || '').slice(0, 160)} ageH=${ageH.toFixed(1)} (not a silent pass)`,
      );
    } else if (slo === 'green' && (prev.includes('red') || prev.includes('yellow') || prev.includes('fail') || prev.includes('skipped'))) {
      ntfy('Hermes continuous E2E green', `e2e=pass recovered (was ${prev})`);
    }
    fs.writeFileSync(STATE, `${nextState}\n`, { mode: 0o600 });
  }

  const out = {
    ok: true,
    path: LATEST,
    e2e,
    slo,
    ageHours: Number(ageH.toFixed(2)),
    detail: proof.detail || null,
    prev,
    transitioned: nextState !== prev,
  };
  if (json) console.log(JSON.stringify(out));
  else console.log(`continuous-e2e-slo e2e=${e2e} slo=${slo} ageH=${ageH.toFixed(1)} transitioned=${out.transitioned}`);

  // Yellow is exit 0 (soft); red is exit 2 so CI/cron can distinguish.
  if (slo === 'red') process.exitCode = 2;
}

main();
