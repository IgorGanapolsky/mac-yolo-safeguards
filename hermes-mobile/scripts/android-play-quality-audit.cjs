#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_PACKAGE = 'com.iganapolsky.hermesmobile';
const REQUIREMENTS_URL =
  'https://support.google.com/googleplay/android-developer/answer/17492799';

// Google Play app thresholds effective February 2027. Each range includes its
// lower bound and excludes its upper bound.
const APP_ANON_SWAP_THRESHOLDS_MIB = Object.freeze([
  { tier: '4 GB', minTotalMiB: 3200, maxTotalMiB: 4800, foregroundMiB: 2048, backgroundMiB: 1024 },
  { tier: '6 GB', minTotalMiB: 4800, maxTotalMiB: 6800, foregroundMiB: 2304, backgroundMiB: 1280 },
  { tier: '8 GB', minTotalMiB: 6800, maxTotalMiB: 9216, foregroundMiB: 2304, backgroundMiB: 1536 },
  { tier: '12 GB', minTotalMiB: 9216, maxTotalMiB: 14336, foregroundMiB: 3328, backgroundMiB: 1792 },
  { tier: '16 GB', minTotalMiB: 14336, maxTotalMiB: 18432, foregroundMiB: 4352, backgroundMiB: 2048 },
]);

const BITMAP_THRESHOLDS_MIB = Object.freeze({
  userPerceivedService: 200,
  background: 200,
  cached: 400,
});

class AuditBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuditBlockedError';
  }
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parsePositiveInt(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AuditBlockedError(`${flag} must be a non-negative integer`);
  }
  return parsed;
}

function findR8DisableDirectives(extraProguardRules = '') {
  const directives = new Set();
  for (const rawLine of String(extraProguardRules).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const match = line.match(/^-(dontoptimize|dontobfuscate|dontshrink)(?:\s|$)/i);
    if (match) directives.add(`-${match[1].toLowerCase()}`);
  }
  return [...directives].sort();
}

function auditR8Config(appJson) {
  const expo = appJson?.expo ?? appJson ?? {};
  const buildPropsPlugin = (expo.plugins ?? []).find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties',
  );
  const android = buildPropsPlugin?.[1]?.android ?? {};
  const disableDirectives = findR8DisableDirectives(android.extraProguardRules);
  const failures = [];

  if (android.enableMinifyInReleaseBuilds !== true) {
    failures.push('app.json must enable R8 minification for Android release builds');
  }
  if (android.enableShrinkResourcesInReleaseBuilds !== true) {
    failures.push('app.json must enable Android release resource shrinking');
  }
  if (disableDirectives.length > 0) {
    failures.push(`extraProguardRules must not disable R8: ${disableDirectives.join(', ')}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    minifyEnabled: android.enableMinifyInReleaseBuilds === true,
    resourceShrinkingEnabled: android.enableShrinkResourcesInReleaseBuilds === true,
    disableDirectives,
    playDexFloorMiB: 10,
    playRequiredPercentages: {
      optimization: 25,
      obfuscation: 25,
      shrinking: 25,
    },
    percentageProof: 'Play Console app bundle explorer; not derivable from Expo flags alone',
  };
}

function parseNamedKiB(text, field) {
  const match = String(text).match(new RegExp(`^${field}:\\s+(\\d+)\\s+kB\\s*$`, 'im'));
  if (!match) throw new AuditBlockedError(`missing ${field} in Android process status`);
  return Number.parseInt(match[1], 10);
}

function parseProcStatus(text) {
  return {
    rssAnonKiB: parseNamedKiB(text, 'RssAnon'),
    vmSwapKiB: parseNamedKiB(text, 'VmSwap'),
  };
}

function parseMemTotalMiB(text) {
  return round(parseNamedKiB(text, 'MemTotal') / 1024);
}

function parseGraphicsKiB(text) {
  const match = String(text).match(/^\s*Graphics:\s+(\d+)\s*$/im);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseAdbDevices(text) {
  const devices = [];
  for (const rawLine of String(text).split(/\r?\n/).slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (fields[1] !== 'device') continue;
    devices.push({
      serial: fields[0],
      details: fields.slice(2),
    });
  }
  return devices;
}

function thresholdForRam(totalRamMiB) {
  return (
    APP_ANON_SWAP_THRESHOLDS_MIB.find(
      (item) => totalRamMiB >= item.minTotalMiB && totalRamMiB < item.maxTotalMiB,
    ) ?? null
  );
}

function evaluateSample({ state, totalRamMiB, rssAnonKiB, vmSwapKiB, graphicsKiB }) {
  const ramThreshold = thresholdForRam(totalRamMiB);
  const anonSwapKiB = rssAnonKiB + vmSwapKiB;
  const anonSwapMiB = round(anonSwapKiB / 1024);
  const graphicsProxyMiB = graphicsKiB == null ? null : round(graphicsKiB / 1024);
  const anonLimitMiB =
    state === 'foreground'
      ? ramThreshold?.foregroundMiB ?? null
      : state === 'background' || state === 'userPerceivedService'
        ? ramThreshold?.backgroundMiB ?? null
        : null;
  const bitmapLimitMiB = BITMAP_THRESHOLDS_MIB[state] ?? null;
  const violations = [];
  const measurementGaps = [];

  if (anonLimitMiB == null) {
    measurementGaps.push(`Google Play has no ${state} Anonymous RSS + Swap threshold for this RAM tier`);
  } else if (anonSwapKiB > anonLimitMiB * 1024) {
    violations.push(`Anonymous RSS + Swap ${anonSwapMiB} MiB exceeds ${anonLimitMiB} MiB`);
  }

  if (bitmapLimitMiB != null && graphicsProxyMiB == null) {
    measurementGaps.push('dumpsys meminfo did not expose a Graphics value for bitmap-risk screening');
  } else if (bitmapLimitMiB != null && graphicsKiB > bitmapLimitMiB * 1024) {
    violations.push(`Graphics proxy ${graphicsProxyMiB} MiB exceeds bitmap-risk limit ${bitmapLimitMiB} MiB`);
  }

  return {
    state,
    ramTier: ramThreshold?.tier ?? 'not_evaluated',
    totalRamMiB,
    anonymousRssMiB: round(rssAnonKiB / 1024),
    swapMiB: round(vmSwapKiB / 1024),
    anonymousRssPlusSwapMiB: anonSwapMiB,
    anonymousRssPlusSwapLimitMiB: anonLimitMiB,
    graphicsProxyMiB,
    bitmapRiskLimitMiB: bitmapLimitMiB,
    violations,
    measurementGaps,
    ok: violations.length === 0 && measurementGaps.length === 0,
  };
}

function countMemoryLimiterExits(text) {
  return (String(text).match(/MemoryLimiter(?::AnonSwap)?/gi) ?? []).length;
}

function sleepMs(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function commandResult(command, args, { allowFailure = false, timeoutMs = 15000 } = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) {
    throw new AuditBlockedError(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new AuditBlockedError(`${command} ${args.join(' ')} failed (${result.status}): ${detail}`);
  }
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function createAdbRunner(adbPath, serial) {
  return (args, options) => {
    const serialArgs = serial ? ['-s', serial] : [];
    return commandResult(adbPath, [...serialArgs, ...args], options);
  };
}

function readPids(adb, packageName) {
  const result = adb(['shell', 'pidof', packageName], { allowFailure: true });
  const pids = result.stdout.trim().split(/\s+/).filter((value) => /^\d+$/.test(value));
  if (pids.length === 0) {
    throw new AuditBlockedError(`package ${packageName} has no running process`);
  }
  return pids;
}

function collectSample(adb, packageName, state, totalRamMiB) {
  const pids = readPids(adb, packageName);
  let rssAnonKiB = 0;
  let vmSwapKiB = 0;
  for (const pid of pids) {
    const parsed = parseProcStatus(adb(['shell', 'cat', `/proc/${pid}/status`]).stdout);
    rssAnonKiB += parsed.rssAnonKiB;
    vmSwapKiB += parsed.vmSwapKiB;
  }
  const meminfo = adb(['shell', 'dumpsys', 'meminfo', packageName]).stdout;
  return {
    pids,
    ...evaluateSample({
      state,
      totalRamMiB,
      rssAnonKiB,
      vmSwapKiB,
      graphicsKiB: parseGraphicsKiB(meminfo),
    }),
  };
}

function parseArgs(argv) {
  const options = {
    device: false,
    json: false,
    serial: null,
    packageName: DEFAULT_PACKAGE,
    foregroundWaitMs: 3000,
    backgroundWaitMs: 5000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--device') options.device = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--serial') options.serial = argv[++index];
    else if (arg === '--package') options.packageName = argv[++index];
    else if (arg === '--foreground-wait-ms') {
      options.foregroundWaitMs = parsePositiveInt(argv[++index], arg);
    } else if (arg === '--background-wait-ms') {
      options.backgroundWaitMs = parsePositiveInt(argv[++index], arg);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new AuditBlockedError(`unknown argument: ${arg}`);
    }
  }
  if (!options.packageName) throw new AuditBlockedError('--package requires a value');
  if (options.serial === undefined) throw new AuditBlockedError('--serial requires a value');
  return options;
}

function usage() {
  return [
    'Usage: node scripts/android-play-quality-audit.cjs [--json] [--device]',
    '  --device                 measure one installed release app through adb',
    '  --serial SERIAL          select a device when more than one is attached',
    '  --package PACKAGE        Android package (default: free Hermes Mobile package)',
    '  --foreground-wait-ms N   launch stabilization wait (default: 3000)',
    '  --background-wait-ms N   post-Home stabilization wait (default: 5000)',
  ].join('\n');
}

function runDeviceAudit(options) {
  const adbPath = process.env.ANDROID_PLAY_QUALITY_ADB || 'adb';
  const devicesResult = commandResult(adbPath, ['devices', '-l']);
  const devices = parseAdbDevices(devicesResult.stdout);
  let serial = options.serial;
  if (serial) {
    if (!devices.some((device) => device.serial === serial)) {
      throw new AuditBlockedError(`adb device ${serial} is not attached and authorized`);
    }
  } else if (devices.length === 1) {
    serial = devices[0].serial;
  } else if (devices.length === 0) {
    throw new AuditBlockedError('no authorized Android device is attached');
  } else {
    throw new AuditBlockedError('multiple Android devices are attached; pass --serial');
  }

  const adb = createAdbRunner(adbPath, serial);
  const installed = adb(['shell', 'pm', 'path', options.packageName], { allowFailure: true });
  if (installed.status !== 0 || !installed.stdout.includes('package:')) {
    throw new AuditBlockedError(`package ${options.packageName} is not installed on ${serial}`);
  }

  const totalRamMiB = parseMemTotalMiB(adb(['shell', 'cat', '/proc/meminfo']).stdout);
  const sdk = Number.parseInt(adb(['shell', 'getprop', 'ro.build.version.sdk']).stdout.trim(), 10);
  const beforeExitInfo = adb(
    ['shell', 'dumpsys', 'activity', 'exit-info', options.packageName],
    { allowFailure: true },
  ).stdout;

  adb(['shell', 'am', 'force-stop', options.packageName]);
  adb([
    'shell',
    'monkey',
    '-p',
    options.packageName,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  ]);
  sleepMs(options.foregroundWaitMs);
  const foreground = collectSample(adb, options.packageName, 'foreground', totalRamMiB);

  adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
  sleepMs(options.backgroundWaitMs);
  const background = collectSample(adb, options.packageName, 'background', totalRamMiB);

  const afterExitInfo = adb(
    ['shell', 'dumpsys', 'activity', 'exit-info', options.packageName],
    { allowFailure: true },
  ).stdout;
  const priorLimiterExits = countMemoryLimiterExits(beforeExitInfo);
  const observedLimiterExits = countMemoryLimiterExits(afterExitInfo);
  const newMemoryLimiterExitDetected = observedLimiterExits > priorLimiterExits;
  const limiterStatus =
    Number.isFinite(sdk) && sdk >= 37
      ? adb(['shell', 'am', 'memory-limiter', 'status'], { allowFailure: true })
      : null;
  const violations = [...foreground.violations, ...background.violations];
  if (newMemoryLimiterExitDetected) {
    violations.push('a new MemoryLimiter exit appeared during the audit');
  }

  return {
    status: 'measured',
    serial,
    packageName: options.packageName,
    androidApiLevel: Number.isFinite(sdk) ? sdk : null,
    totalRamMiB,
    samples: { foreground, background },
    memoryLimiter: {
      supportedByApiLevel: Number.isFinite(sdk) && sdk >= 37,
      statusCommandExitCode: limiterStatus?.status ?? null,
      status: limiterStatus?.stdout.trim() || null,
      historicalExitMarkers: observedLimiterExits,
      newExitDetectedDuringAudit: newMemoryLimiterExitDetected,
    },
    violations,
    ok: violations.length === 0 && foreground.ok && background.ok,
  };
}

function buildBaseResult(appJson) {
  return {
    schemaVersion: 'hermes-android-play-quality-audit/v1',
    observedAt: new Date().toISOString(),
    requirements: {
      source: REQUIREMENTS_URL,
      enforcementStarts: '2027-02',
      memoryEvaluation: 'Google Play 28-day P90 by app state and device RAM tier',
      dexEvaluation: '25% each for optimization, obfuscation, and shrinking when app DEX exceeds 10 MiB',
    },
    proofScope: {
      localDeviceSample: 'point-in-time diagnostic only',
      provesPlayConsoleP90Compliance: false,
      playComplianceRequires: 'Play Console Android vitals or Google Play Developer Reporting API',
      graphicsValue: 'dumpsys Graphics is a conservative bitmap-risk proxy, not the Play bitmap P90 metric',
    },
    r8: auditR8Config(appJson),
    device: { status: 'not_requested' },
  };
}

function printResult(result, jsonMode) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(`Hermes Android Play quality audit: ${result.ok ? 'PASS' : 'BLOCKED'}`);
  console.log(`R8 config: ${result.r8.ok ? 'PASS' : 'FAIL'}`);
  console.log(`Device evidence: ${result.device.status}`);
  console.log('Proof scope: local samples do not prove Google Play 28-day P90 compliance.');
  if (result.device.reason) console.error(`Blocker: ${result.device.reason}`);
  for (const failure of result.r8.failures) console.error(`- ${failure}`);
  for (const violation of result.device.violations ?? []) console.error(`- ${violation}`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const repoRoot = path.resolve(__dirname, '..');
  const appJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app.json'), 'utf8'));
  const result = buildBaseResult(appJson);
  if (options.device) {
    try {
      result.device = runDeviceAudit(options);
    } catch (error) {
      result.device = {
        status: 'blocked',
        reason: error instanceof Error ? error.message : String(error),
        violations: [],
        ok: false,
      };
    }
  }
  result.ok = result.r8.ok && (!options.device || result.device.ok === true);
  printResult(result, options.json);
  process.exit(result.ok ? 0 : options.device && result.device.status === 'blocked' ? 2 : 1);
}

module.exports = {
  APP_ANON_SWAP_THRESHOLDS_MIB,
  BITMAP_THRESHOLDS_MIB,
  AuditBlockedError,
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
};

if (require.main === module) main();
