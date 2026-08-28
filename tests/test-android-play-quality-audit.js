#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  auditR8Config,
  buildBaseResult,
  countMemoryLimiterExits,
  evaluateSample,
  findR8DisableDirectives,
  parseAdbDevices,
  parseGraphicsKiB,
  parseMemTotalMiB,
  parseProcStatus,
  thresholdForRam,
} = require('../hermes-mobile/scripts/android-play-quality-audit.cjs');

const repoRoot = path.resolve(__dirname, '..');
let passed = 0;

function pass(message) {
  console.log('  [PASS]', message);
  passed += 1;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function androidBuildProps(appJson) {
  return appJson.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties',
  )[1].android;
}

function main() {
  const appJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'hermes-mobile/app.json'), 'utf8'),
  );

  const current = auditR8Config(appJson);
  assert.strictEqual(current.ok, true);
  assert.deepStrictEqual(current.disableDirectives, []);
  assert.strictEqual(current.playDexFloorMiB, 10);
  pass('current release config enables R8 minify and resource shrinking');

  assert.deepStrictEqual(
    findR8DisableDirectives([
      '# -dontshrink is only a comment',
      '-dontoptimize',
      '-dontobfuscate # inline explanation',
      '  -dontshrink  ',
      '-keep class example.** { *; }',
    ].join('\n')),
    ['-dontobfuscate', '-dontoptimize', '-dontshrink'],
  );
  pass('R8 disabling directives are found while comments are ignored');

  const disabled = clone(appJson);
  androidBuildProps(disabled).extraProguardRules += '\n-dontoptimize';
  const disabledAudit = auditR8Config(disabled);
  assert.strictEqual(disabledAudit.ok, false);
  assert.match(disabledAudit.failures.join('\n'), /-dontoptimize/);
  pass('R8 policy fails closed when optimization is disabled');

  const proc = parseProcStatus([
    'Name:\thermesmobile',
    'RssAnon:\t1048576 kB',
    'VmSwap:\t262144 kB',
  ].join('\n'));
  assert.deepStrictEqual(proc, { rssAnonKiB: 1048576, vmSwapKiB: 262144 });
  assert.strictEqual(parseMemTotalMiB('MemTotal: 8388608 kB\n'), 8192);
  assert.strictEqual(parseGraphicsKiB(' Graphics: 204800\n'), 204800);
  assert.strictEqual(parseGraphicsKiB('TOTAL RSS: 1000\n'), null);
  pass('Android process, RAM, and Graphics measurements parse deterministically');

  assert.strictEqual(thresholdForRam(3199), null);
  assert.strictEqual(thresholdForRam(3200).tier, '4 GB');
  assert.strictEqual(thresholdForRam(4799).tier, '4 GB');
  assert.strictEqual(thresholdForRam(4800).tier, '6 GB');
  assert.strictEqual(thresholdForRam(6800).tier, '8 GB');
  assert.strictEqual(thresholdForRam(18432), null);
  pass('RAM tiers honor Google Play lower-inclusive boundaries');

  const foregroundRisk = evaluateSample({
    state: 'foreground',
    totalRamMiB: 4000,
    rssAnonKiB: 2048 * 1024,
    vmSwapKiB: 1,
    graphicsKiB: 300 * 1024,
  });
  assert.strictEqual(foregroundRisk.ok, false);
  assert.match(foregroundRisk.violations.join('\n'), /exceeds 2048 MiB/);
  assert.strictEqual(foregroundRisk.bitmapRiskLimitMiB, null);
  pass('foreground Anonymous RSS plus Swap above the 4 GB tier limit fails');

  const backgroundPass = evaluateSample({
    state: 'background',
    totalRamMiB: 6000,
    rssAnonKiB: 900 * 1024,
    vmSwapKiB: 100 * 1024,
    graphicsKiB: 200 * 1024,
  });
  assert.strictEqual(backgroundPass.ok, true);
  assert.strictEqual(backgroundPass.anonymousRssPlusSwapLimitMiB, 1280);
  assert.strictEqual(backgroundPass.bitmapRiskLimitMiB, 200);
  pass('background values at or below both Play risk limits pass');

  const backgroundBitmapRisk = evaluateSample({
    state: 'background',
    totalRamMiB: 8000,
    rssAnonKiB: 500 * 1024,
    vmSwapKiB: 0,
    graphicsKiB: 201 * 1024,
  });
  assert.strictEqual(backgroundBitmapRisk.ok, false);
  assert.match(backgroundBitmapRisk.violations.join('\n'), /Graphics proxy 201 MiB/);
  pass('background Graphics proxy above 200 MiB fails bitmap-risk screening');

  const cached = evaluateSample({
    state: 'cached',
    totalRamMiB: 8000,
    rssAnonKiB: 500 * 1024,
    vmSwapKiB: 0,
    graphicsKiB: 400 * 1024,
  });
  assert.strictEqual(cached.bitmapRiskLimitMiB, 400);
  assert.deepStrictEqual(cached.violations, []);
  assert.match(cached.measurementGaps.join('\n'), /no cached Anonymous RSS/);
  pass('cached bitmap boundary is enforced without inventing an anonymous-memory limit');

  const devices = parseAdbDevices([
    'List of devices attached',
    'R3CY90QPM7E device product:e3q model:SM_S928U',
    'emulator-5554 offline transport_id:2',
    'unauthorized-1 unauthorized transport_id:3',
    '',
  ].join('\n'));
  assert.deepStrictEqual(devices.map((device) => device.serial), ['R3CY90QPM7E']);
  pass('only attached and authorized adb devices are eligible');

  assert.strictEqual(
    countMemoryLimiterExits('description=MemoryLimiter:AnonSwap\nMemoryLimiter'),
    2,
  );
  const base = buildBaseResult(appJson);
  assert.strictEqual(base.proofScope.provesPlayConsoleP90Compliance, false);
  assert.match(base.proofScope.playComplianceRequires, /Play Console/);
  pass('MemoryLimiter evidence counts and local proof cannot masquerade as Play P90');

  console.log('android Play quality audit: %d passed', passed);
}

main();
