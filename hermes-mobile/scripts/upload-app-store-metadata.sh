#!/usr/bin/env bash
# Load .env without echoing secrets, then upload ASC listing assets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node <<'NODE'
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env');
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let val = trimmed.slice(eq + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (val) process.env[key] = val;
}

const keyPath = process.env.EXPO_ASC_API_KEY_PATH?.trim();
if (keyPath && fs.existsSync(keyPath)) {
  if (!process.env.EXPO_ASC_API_KEY_ID?.trim()) {
    const kid = path.basename(keyPath).match(/AuthKey_(.+)\.p8/)?.[1];
    if (kid) process.env.EXPO_ASC_API_KEY_ID = kid;
  }
}
if (!process.env.EXPO_ASC_APP_ID?.trim()) {
  process.env.EXPO_ASC_APP_ID = '6786778037';
}
if (!process.env.EXPO_ASC_API_KEY_ISSUER_ID?.trim()) {
  const fallbackEnv = path.join(process.cwd(), '../../LipoShield/.env');
  if (fs.existsSync(fallbackEnv)) {
    for (const line of fs.readFileSync(fallbackEnv, 'utf8').split('\n')) {
      const m = line.match(/^EXPO_ASC_API_KEY_ISSUER_ID=(.+)$/);
      if (m?.[1]?.trim()) {
        process.env.EXPO_ASC_API_KEY_ISSUER_ID = m[1].trim().replace(/^['"]|['"]$/g, '');
        break;
      }
    }
  }
}

const required = ['EXPO_ASC_API_KEY_ID', 'EXPO_ASC_API_KEY_ISSUER_ID', 'EXPO_ASC_API_KEY_PATH'];
for (const key of required) {
  if (!process.env[key]?.trim()) {
    console.error(`Missing ${key} in .env`);
    process.exit(1);
  }
}
if (!fs.existsSync(process.env.EXPO_ASC_API_KEY_PATH)) {
  console.error('EXPO_ASC_API_KEY_PATH file not found');
  process.exit(1);
}

const tmpKey = path.join(require('os').tmpdir(), `asc-api-key-${Date.now()}.json`);
fs.writeFileSync(
  tmpKey,
  JSON.stringify({
    key_id: process.env.EXPO_ASC_API_KEY_ID,
    issuer_id: process.env.EXPO_ASC_API_KEY_ISSUER_ID,
    key: fs.readFileSync(process.env.EXPO_ASC_API_KEY_PATH, 'utf8'),
    duration: 1200,
    in_house: false,
  }),
);

const ascVer = process.env.ASC_APP_VERSION || '1.0';
const rejectFirst = ['1', 'true', 'yes'].includes(
  (process.env.ASC_REJECT_BEFORE_UPLOAD || '').toLowerCase(),
);
const forceReject = ['1', 'true', 'yes'].includes(
  (process.env.ASC_FORCE_REJECT || '').toLowerCase(),
);

// Hard ban: never pull WAITING_FOR_REVIEW just to fix screenshots (publish-ASAP).
if (rejectFirst && !forceReject) {
  console.error(
    'Refusing ASC_REJECT_BEFORE_UPLOAD without ASC_FORCE_REJECT=1. ' +
      'Screenshot edits while WAITING_FOR_REVIEW require removing from review — ' +
      'that conflicts with iOS publish ASAP. Stage assets in repo; upload after unlock.',
  );
  process.exit(2);
}

// Guard: Apple maps both 6.5" and 6.7" framed PNGs into APP_IPHONE_67.
// Shipping _65 + _67 twins caused exact duplicate checksums in the carousel (2026-07-13).
const shotDir = path.join(process.cwd(), 'fastlane/screenshots/en-US');
if (fs.existsSync(shotDir) && !['1', 'true', 'yes'].includes((process.env.ASC_SKIP_SCREENSHOTS || '').toLowerCase())) {
  const names = fs.readdirSync(shotDir).filter((n) => n.endsWith('.png'));
  const has65 = names.some((n) => /_65\.png$/i.test(n));
  const has67 = names.some((n) => /_67\.png$/i.test(n));
  if (has65 && has67) {
    console.error(
      'Refusing deliver: fastlane/screenshots/en-US has both *_65.png and *_67.png. ' +
        'Apple collapses both into APP_IPHONE_67 → duplicate carousel frames. Keep only *_67.png (+ ipad).',
    );
    process.exit(2);
  }
  // Detect identical checksum pairs in the upload set
  const crypto = require('crypto');
  const byHash = new Map();
  for (const n of names) {
    const buf = fs.readFileSync(path.join(shotDir, n));
    const h = crypto.createHash('md5').update(buf).digest('hex');
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(n);
  }
  const dups = [...byHash.entries()].filter(([, files]) => files.length > 1);
  if (dups.length) {
    console.error('Refusing deliver: duplicate screenshot checksums in upload set:');
    for (const [h, files] of dups) console.error(`  ${h}: ${files.join(', ')}`);
    process.exit(2);
  }
}

const args = [
  'deliver',
  '--app_identifier',
  'com.iganapolsky.hermesmobile',
  '--app_version',
  ascVer,
  '--api_key_path',
  tmpKey,
  '--metadata_path',
  'fastlane/metadata/ios',
  '--screenshots_path',
  'fastlane/screenshots',
  '--app_preview_path',
  'fastlane/app_previews',
  '--skip_binary_upload',
  'true',
  '--skip_app_version_update',
  'true',
  '--overwrite_screenshots',
  'true',
  '--overwrite_preview_videos',
  'true',
  '--precheck_include_in_app_purchases',
  'false',
  '--force',
  'true',
];
if (rejectFirst) {
  args.push('--reject_if_possible', 'true');
}
if (['1', 'true', 'yes'].includes((process.env.ASC_SKIP_METADATA || '').toLowerCase())) {
  args.push('--skip_metadata', 'true');
}
if (['1', 'true', 'yes'].includes((process.env.ASC_SKIP_SCREENSHOTS || '').toLowerCase())) {
  args.push('--skip_screenshots', 'true');
}
if (['1', 'true', 'yes'].includes((process.env.ASC_SUBMIT_FOR_REVIEW || '').toLowerCase())) {
  args.push('--submit_for_review', 'true');
  args.push('--automatic_release', 'true');
}

const result = spawnSync('fastlane', args, { stdio: 'inherit', cwd: process.cwd() });
fs.unlinkSync(tmpKey);
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

// Deliver retries can leave identical checksum twins — strip them when editable.
if (!['1', 'true', 'yes'].includes((process.env.ASC_SKIP_SCREENSHOTS || '').toLowerCase())) {
  const dedupe = spawnSync('node', ['scripts/dedupe-asc-screenshots.js'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  if ((dedupe.status ?? 1) !== 0) process.exit(dedupe.status ?? 1);
}
process.exit(0);
NODE
