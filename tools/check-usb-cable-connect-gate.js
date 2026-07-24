#!/usr/bin/env node
'use strict';

/**
 * USB cable connect gate — prevents "green CI / red dogfood" for the daily class:
 * phone cabled, adb reverse live, gateway healthy, app still sticky-Tailscale Not connected.
 *
 * Layers:
 *   1) STATIC (always) — ranked transport law + handoff source must not regress.
 *   2) DEVICE (when USB Android present, unless --static-only) — reverse + phone→:8642 /health.
 *
 * Exit codes:
 *   0  pass or intentional skip (no phone + not --require-device)
 *   1  policy or device failure
 *   2  usage / infra error
 *
 * Usage:
 *   node tools/check-usb-cable-connect-gate.js
 *   node tools/check-usb-cable-connect-gate.js --json
 *   node tools/check-usb-cable-connect-gate.js --static-only
 *   node tools/check-usb-cable-connect-gate.js --require-device
 *   node tools/check-usb-cable-connect-gate.js --heal-reverse
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HAND_OFF = path.join(
  REPO,
  'hermes-mobile/src/utils/usbTransportHandoff.ts',
);
const SELF_HEAL = path.join(
  REPO,
  'hermes-mobile/src/utils/connectionSelfHeal.ts',
);
const HEADER = path.join(REPO, 'hermes-mobile/src/utils/chatMachineHeader.ts');
const PROOF_DIR = path.join(
  REPO,
  'hermes-mobile/docs/proofs/usb-cable-connect',
);
const PROOF_JSON = path.join(PROOF_DIR, 'latest.json');

/** Frozen ranked law — must appear in docs/gate output; handoff must implement plug→USB. */
const RANKED_TRANSPORT_LAW = [
  '1. live same-Mac USB reverse (/health hostname matches selected Mac)',
  '2. sticky Tailscale for that Mac (phone Tailscale VPN on)',
  '3. Home Wi‑Fi LAN for that Mac',
  '4. other saved computers / pair',
];

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    staticOnly: argv.includes('--static-only'),
    requireDevice: argv.includes('--require-device'),
    healReverse: argv.includes('--heal-reverse'),
  };
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: opts.timeout ?? 15000,
    env: process.env,
  });
  return {
    status: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function firstUsbAndroidSerial() {
  const r = sh('adb', ['devices']);
  if (r.status !== 0) return null;
  for (const line of r.stdout.split('\n').slice(1)) {
    const m = line.match(/^(\S+)\s+device\b/);
    if (!m) continue;
    if (m[1].startsWith('emulator-')) continue;
    return m[1];
  }
  return null;
}

function reverseList(serial) {
  const r = sh('adb', ['-s', serial, 'reverse', '--list']);
  return r.status === 0 ? r.stdout : '';
}

function ensureReverse(serial) {
  for (const port of [8642, 8765]) {
    sh('adb', ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  }
}

function macGatewayHealth() {
  const r = sh('curl', [
    '-sS',
    '-m',
    '3',
    'http://127.0.0.1:8642/health',
  ]);
  if (r.status !== 0 || !r.stdout) {
    return { ok: false, error: r.stderr || 'curl failed', raw: r.stdout };
  }
  try {
    const j = JSON.parse(r.stdout);
    return {
      ok: j.status === 'ok' || j.status === 'healthy' || Boolean(j.hostname),
      hostname: j.hostname || null,
      raw: j,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e), raw: r.stdout };
  }
}

function phoneGatewayHealth(serial) {
  // Phone loopback is only meaningful with adb reverse.
  const r = sh(
    'adb',
    [
      '-s',
      serial,
      'shell',
      'curl -sS -m 4 http://127.0.0.1:8642/health 2>/dev/null || wget -qO- -T 4 http://127.0.0.1:8642/health 2>/dev/null',
    ],
    { timeout: 20000 },
  );
  const body = r.stdout || '';
  if (!body) {
    return { ok: false, error: r.stderr || 'empty phone health', raw: body };
  }
  try {
    // adb shell may append junk; find JSON object
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body;
    const j = JSON.parse(slice);
    return {
      ok: j.status === 'ok' || j.status === 'healthy' || Boolean(j.hostname),
      hostname: j.hostname || null,
      raw: j,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e), raw: body.slice(0, 200) };
  }
}

function checkStaticPolicy() {
  const failures = [];
  const handoff = read(HAND_OFF);
  const heal = read(SELF_HEAL);
  const header = read(HEADER);

  if (!handoff.includes('resolveUsbTransportHandoff')) {
    failures.push('usbTransportHandoff missing resolveUsbTransportHandoff');
  }
  if (!handoff.includes('liveUsbHostname')) {
    failures.push('usbTransportHandoff missing liveUsbHostname gate');
  }
  if (!handoff.includes('foreign_usb_host')) {
    failures.push('usbTransportHandoff missing foreign_usb_host guard');
  }
  // Must allow plug→USB on cellular (live probe is the ghost guard, not Wi‑Fi).
  if (!/cellular/i.test(handoff) && !handoff.includes('Wi‑Fi *or* cellular')) {
    failures.push('usbTransportHandoff must document cellular-safe USB handoff');
  }
  // wifiConnected must not be a hard block when live USB proves cable.
  if (/if\s*\(\s*!input\.wifiConnected\s*\)\s*\{[^}]*return/.test(handoff)) {
    failures.push('usbTransportHandoff must not hard-block on !wifiConnected');
  }

  if (!heal.includes('shouldPreferUsbProbeFirst')) {
    failures.push('connectionSelfHeal missing shouldPreferUsbProbeFirst');
  }
  if (!heal.includes('liveUsbSameMachine')) {
    failures.push('connectionSelfHeal missing liveUsbSameMachine prefer-USB path');
  }
  if (!heal.includes('shouldKeepUsbOverStickyRemote')) {
    failures.push('connectionSelfHeal missing shouldKeepUsbOverStickyRemote');
  }

  // Header: named Mac · USB only with live health; generic when red.
  if (!header.includes('USB_UNKNOWN_MACHINE_LABEL')) {
    failures.push('chatMachineHeader missing USB_UNKNOWN_MACHINE_LABEL');
  }
  if (!header.includes('isLiveUsbHealthIdentity')) {
    failures.push('chatMachineHeader missing isLiveUsbHealthIdentity');
  }

  return failures;
}

function writeProof(report) {
  fs.mkdirSync(PROOF_DIR, { recursive: true });
  fs.writeFileSync(PROOF_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const staticFailures = checkStaticPolicy();
  const report = {
    updatedAt: new Date().toISOString(),
    rankedTransportLaw: RANKED_TRANSPORT_LAW,
    static: {
      ok: staticFailures.length === 0,
      failures: staticFailures,
    },
    device: {
      status: 'skipped',
      serial: null,
      reverse: null,
      macHealth: null,
      phoneHealth: null,
      failures: [],
    },
    proofPath: path.relative(REPO, PROOF_JSON),
  };

  if (staticFailures.length) {
    writeProof(report);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.error('USB cable connect gate STATIC FAIL:');
      for (const f of staticFailures) console.error(`  - ${f}`);
    }
    process.exit(1);
  }

  if (args.staticOnly) {
    report.device.status = 'skipped_static_only';
    writeProof(report);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log('USB cable connect gate: STATIC pass (device skipped)');
    process.exit(0);
  }

  const serial = firstUsbAndroidSerial();
  if (!serial) {
    report.device.status = 'skipped_no_usb_phone';
    writeProof(report);
    if (args.requireDevice) {
      if (args.json) console.log(JSON.stringify(report, null, 2));
      else console.error('USB cable connect gate: --require-device but no USB Android phone');
      process.exit(1);
    }
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log('USB cable connect gate: STATIC pass; DEVICE skipped (no USB phone)');
    process.exit(0);
  }

  report.device.serial = serial;
  if (args.healReverse) {
    ensureReverse(serial);
  }

  const reverses = reverseList(serial);
  report.device.reverse = reverses;
  const deviceFailures = [];
  if (!/tcp:8642/.test(reverses)) {
    deviceFailures.push('adb reverse missing tcp:8642 (chat gateway)');
  }
  if (!/tcp:8765/.test(reverses)) {
    deviceFailures.push('adb reverse missing tcp:8765 (pair server)');
  }

  const macHealth = macGatewayHealth();
  report.device.macHealth = macHealth;
  if (!macHealth.ok) {
    deviceFailures.push(
      `Mac :8642/health not ok (${macHealth.error || 'unknown'})`,
    );
  }

  const phoneHealth = phoneGatewayHealth(serial);
  report.device.phoneHealth = phoneHealth;
  if (!phoneHealth.ok) {
    deviceFailures.push(
      `Phone loopback :8642/health failed — reverse or gateway broken (${phoneHealth.error || 'unknown'})`,
    );
  } else if (!phoneHealth.hostname) {
    deviceFailures.push('Phone /health ok but missing hostname (cannot prove same-Mac USB)');
  }

  report.device.failures = deviceFailures;
  report.device.status = deviceFailures.length ? 'fail' : 'pass';
  writeProof(report);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (deviceFailures.length) {
    console.error('USB cable connect gate DEVICE FAIL:');
    for (const f of deviceFailures) console.error(`  - ${f}`);
    console.error(`serial=${serial}`);
    if (phoneHealth.hostname) console.error(`phone hostname=${phoneHealth.hostname}`);
    console.error('Hint: node tools/hermes-mobile-pair.js  # re-apply reverse + pair');
    console.error('      node tools/check-usb-cable-connect-gate.js --heal-reverse');
  } else {
    console.log(
      `USB cable connect gate: PASS (static + device) serial=${serial} host=${phoneHealth.hostname || macHealth.hostname || '?'}`,
    );
    console.log('Ranked law: live same-Mac USB reverse > sticky Tailscale > LAN > pair');
  }

  process.exit(deviceFailures.length ? 1 : 0);
}

main();
