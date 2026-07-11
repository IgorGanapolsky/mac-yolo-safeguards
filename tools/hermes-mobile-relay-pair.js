#!/usr/bin/env node
'use strict';

/**
 * Pair Hermes Mobile to Hermes Relay (cloud approvals) via deep link.
 *
 * Usage:
 *   node tools/hermes-mobile-relay-pair.js MOON-DUST
 *   node tools/hermes-mobile-relay-pair.js --from-env
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HERMES_ENV = path.join(os.homedir(), '.hermes', '.env');
const RELAY_WORKER_ENV = path.join(os.homedir(), '.hermes', 'relay-worker.env');

function readEnvKey(filePath, names) {
  if (!fs.existsSync(filePath)) return '';
  const text = fs.readFileSync(filePath, 'utf8');
  for (const name of names) {
    const match = text.match(new RegExp(`^${name}=(.+)$`, 'm'));
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  return '';
}

function buildRelayDeepLink(code) {
  const params = new URLSearchParams();
  params.set('relay', code.trim().toUpperCase());
  return `hermes://relay?${params.toString()}`;
}

function adbDevice() {
  const result = spawnSync('adb', ['devices'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const serials = result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((row) => row.trim())
    .filter((row) => row.endsWith('device'))
    .map((row) => row.split(/\s+/)[0]);
  if (serials.length === 0) return null;
  // Prefer a physical USB device over an emulator when both are attached.
  return serials.find((s) => !/^emulator-\d+$/.test(s)) || serials[0];
}

function main() {
  const args = process.argv.slice(2);
  let code = args.find((arg) => !arg.startsWith('--')) || '';
  if (args.includes('--from-env') || !code) {
    code =
      readEnvKey(RELAY_WORKER_ENV, ['HERMES_MOBILE_RELAY_CODE']) ||
      readEnvKey(HERMES_ENV, [
        'HERMES_MOBILE_RELAY_CODE',
        'HERMES_RELAY_PAIR_CODE',
        'MOBILE_RELAY_PAIR_CODE',
      ]) ||
      code;
  }
  if (!code.trim()) {
    console.error(
      'Usage: node tools/hermes-mobile-relay-pair.js <CODE>  (or set HERMES_MOBILE_RELAY_CODE in ~/.hermes/.env)',
    );
    process.exit(1);
  }

  const link = buildRelayDeepLink(code);
  console.log('Hermes Relay pairing');
  console.log('  Deep link:', link);

  const serial = adbDevice();
  if (!serial) {
    console.log('  adb: no device — open deep link manually in Hermes Mobile');
    process.exit(0);
  }

  const quoted = `'${link.replace(/'/g, `'\\''`)}'`;
  const result = spawnSync('adb', ['-s', serial, 'shell', `am start -a android.intent.action.VIEW -d ${quoted}`], {
    encoding: 'utf8',
  });
  if (result.status === 0) {
    console.log(`  adb: opened on ${serial}`);
  } else {
    console.error('  adb: intent failed');
    process.exit(1);
  }
}

main();
