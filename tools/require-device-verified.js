#!/usr/bin/env node
/**
 * Gate for "shipped on phone" / device UX claims.
 * Exit 0 only when hermes-mobile/docs/proofs/continuous/latest.json has e2e === "pass"
 * (or --allow-ota with a recent OTA receipt path).
 *
 * Usage:
 *   node tools/require-device-verified.js
 *   node tools/require-device-verified.js --json
 *   node tools/require-device-verified.js --allow-ota path/to/ota-receipt.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const latestPath = path.join(
  repoRoot,
  'hermes-mobile/docs/proofs/continuous/latest.json',
);

const args = process.argv.slice(2);
const jsonOut = args.includes('--json');
const allowOtaIdx = args.indexOf('--allow-ota');
const otaPath = allowOtaIdx >= 0 ? args[allowOtaIdx + 1] : null;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const latest = readJson(latestPath) || {};
const e2e = latest.e2e || 'missing';
const unit = latest.unit || 'missing';
let deviceVerified = e2e === 'pass';
let via = deviceVerified ? 'latest.json e2e=pass' : null;

// Crisis 2026-07-15: an OTA receipt alone must NEVER satisfy deviceVerified.
// Production OTA without continuous/fresh-user e2e=pass is how live bugs shipped.
if (!deviceVerified && otaPath) {
  console.error(
    'STRICT: --allow-ota is disabled after 2026-07-15. Require latest.json e2e=pass ' +
      '(or fresh-user Maestro pass). OTA receipt is not device proof.',
  );
}

const result = {
  deviceVerified,
  e2e,
  unit,
  updatedAt: latest.updatedAt || null,
  via,
  latestPath,
};

if (jsonOut) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(
    `deviceVerified=${deviceVerified} e2e=${e2e} unit=${unit}` +
      (via ? ` via=${via}` : ''),
  );
  if (!deviceVerified) {
    console.error(
      'STRICT: refuse phone/ship claim — latest.json e2e must be pass (or pass --allow-ota <receipt>).',
    );
  }
}

process.exit(deviceVerified ? 0 : 1);
