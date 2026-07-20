#!/usr/bin/env node
'use strict';

/**
 * USB adb-reverse keepalive + adb-appear auto-pair watchdog
 * (T-332 / T-336 reverse heal; T-ADB-APPEAR-PAIR appear→pair, 2026-07-20).
 *
 * Root cause (reverse): adbd silently drops `adb reverse` tcp:8642/tcp:8765 tunnels
 * with no OS-level notification. The phone app cannot re-establish a host-side
 * tunnel — that is exclusively the Mac's job.
 *
 * Root cause (appear): phones reconnect after sleep/cable events while agents
 * rely on ephemeral /tmp poll scripts. Persist appear→pair here so any authorized
 * physical serial (e.g. R3CY90QPM7E) triggers `tools/hermes-mobile-pair.js` once
 * per appear edge — no 20-minute /tmp watcher.
 *
 * Reverse heal is cheap and lease-free. Appear-pair shells out to hermes-mobile-pair.js
 * (which takes the phone lease) and skips when the pipeline is busy so Maestro /
 * install lanes are never clobbered.
 *
 * CLI:
 *   node tools/hermes-usb-reverse-watchdog.js [--json] [--once] [--no-pair]
 *
 * Exit codes: 0 always (best-effort self-heal must never fail the caller); use
 * --json to inspect.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { USB_ADB_REVERSE_PORTS, assertUsbAdbReverses, setupUsbAdbReverses } = require('./hermes-mobile-pair-lib');
const { pipelineBusyReason } = require('./agent-phone-pipeline-lock');

const NTFY = process.env.HERMES_NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const NTFY_STATE_PATH =
  process.env.HERMES_USB_WATCHDOG_NTFY_STATE ||
  path.join(os.homedir(), '.hermes', 'usb-reverse-watchdog-ntfy.json');
const NTFY_COOLDOWN_MS = Number(process.env.HERMES_USB_WATCHDOG_NTFY_COOLDOWN_MS || 15 * 60 * 1000);

const APPEAR_STATE_PATH =
  process.env.HERMES_USB_APPEAR_PAIR_STATE ||
  path.join(os.homedir(), '.hermes', 'usb-appear-pair-state.json');
const PAIR_SCRIPT =
  process.env.HERMES_USB_APPEAR_PAIR_SCRIPT || path.join(__dirname, 'hermes-mobile-pair.js');
const PAIR_TIMEOUT_MS = Number(process.env.HERMES_USB_APPEAR_PAIR_TIMEOUT_MS || 90_000);
/** Default --open (matches ephemeral adb-appear watcher). Set HERMES_USB_APPEAR_PAIR_OPEN=0 for --no-serve. */
const PAIR_OPEN =
  process.env.HERMES_USB_APPEAR_PAIR_OPEN !== '0' && process.env.HERMES_USB_APPEAR_PAIR_OPEN !== 'false';

function notifyUsbFailure(summary) {
  if (!summary.anyFailed) return { sent: false, reason: 'no_failure' };
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(NTFY_STATE_PATH, 'utf8'));
  } catch {
    state = {};
  }
  const now = Date.now();
  if (state.lastNtfyAt && now - state.lastNtfyAt < NTFY_COOLDOWN_MS) {
    return { sent: false, reason: 'cooldown' };
  }
  const detail = summary.results
    .filter((r) => r.failed.length > 0)
    .map((r) => `${r.serial} missing=${r.failed.join(',')}`)
    .join('; ');
  try {
    execFileSync(
      'curl',
      ['-sS', '-m', '8', '-H', 'Title: Hermes USB reverse FAILED', '-d', detail || 'adb reverse heal failed', NTFY],
      { encoding: 'utf8', timeout: 12_000 },
    );
    state.lastNtfyAt = now;
    fs.mkdirSync(path.dirname(NTFY_STATE_PATH), { recursive: true });
    fs.writeFileSync(NTFY_STATE_PATH, `${JSON.stringify(state)}\n`);
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function runAdb(args, options = {}) {
  const adbBin = options.adbCommand ?? 'adb';
  try {
    const out = execFileSync(adbBin, args, { encoding: 'utf8', timeout: 8000 });
    return { ok: true, stdout: out };
  } catch (err) {
    return { ok: false, stdout: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/** Every authorized ("device" state) USB serial, physical or emulator. */
function listAuthorizedSerials(options = {}) {
  const result = runAdb(['devices', '-l'], options);
  if (!result.ok) {
    return [];
  }
  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .filter((parts) => parts.length >= 2 && parts[1] === 'device')
    .map((parts) => parts[0]);
}

function isPhysicalSerial(serial) {
  return !serial.startsWith('emulator-');
}

/**
 * @returns {{ serial: string, missing: number[], reapplied: number[], failed: number[] }}
 */
function healSerial(serial, options = {}) {
  const before = assertUsbAdbReverses(serial, options);
  if (before.ok) {
    return { serial, missing: [], reapplied: [], failed: [] };
  }
  const setup = setupUsbAdbReverses(serial, { ...options, ports: before.missing });
  const after = assertUsbAdbReverses(serial, { ...options, requiredPorts: before.missing });
  return {
    serial,
    missing: before.missing,
    reapplied: before.missing.filter((port) => !after.missing.includes(port)),
    failed: after.missing,
    setupFailures: setup.failures,
  };
}

function loadAppearState(statePath = APPEAR_STATE_PATH) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return { knownPresent: [], lastPairedAt: {} };
  }
}

function saveAppearState(state, statePath = APPEAR_STATE_PATH) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`);
}

function defaultPairArgs() {
  return PAIR_OPEN ? ['--open'] : ['--no-serve'];
}

/**
 * Edge-trigger: when a physical serial transitions absent→present, run pair once.
 * Busy pipeline → leave serial out of knownPresent so the next tick retries.
 *
 * @returns {{ appeared: string[], pairAttempts: object[], knownPresent: string[] }}
 */
function maybePairOnAppear(serials, options = {}) {
  const statePath = options.appearStatePath || APPEAR_STATE_PATH;
  const state = loadAppearState(statePath);
  const known = new Set(Array.isArray(state.knownPresent) ? state.knownPresent : []);
  const present = serials.filter(isPhysicalSerial);
  const presentSet = new Set(present);

  // Drop serials that left so a reconnect is a fresh appear edge.
  for (const serial of [...known]) {
    if (!presentSet.has(serial)) {
      known.delete(serial);
    }
  }

  const appeared = present.filter((serial) => !known.has(serial));
  const pairAttempts = [];
  const skipPair = options.skipPair === true || process.env.HERMES_USB_APPEAR_PAIR === '0';

  for (const serial of appeared) {
    if (skipPair) {
      known.add(serial);
      pairAttempts.push({ serial, paired: false, reason: 'skip_pair' });
      continue;
    }

    const busy =
      typeof options.pipelineBusyReason === 'function'
        ? options.pipelineBusyReason()
        : pipelineBusyReason();
    if (busy) {
      // Retry next interval — do not mark known.
      pairAttempts.push({ serial, paired: false, reason: `pipeline_busy:${busy}` });
      continue;
    }

    const pairResult = runAppearPair(serial, options);
    pairAttempts.push(pairResult);
    if (pairResult.paired || pairResult.reason === 'skip_pair') {
      known.add(serial);
      state.lastPairedAt = state.lastPairedAt || {};
      if (pairResult.paired) {
        state.lastPairedAt[serial] = new Date().toISOString();
      }
    }
    // Failed pair (non-busy): still mark known so we do not hammer every 15s;
    // reconnect (absent→present) will retry.
    if (!pairResult.paired && pairResult.reason && !String(pairResult.reason).startsWith('pipeline_busy')) {
      known.add(serial);
    }
  }

  state.knownPresent = [...known];
  saveAppearState(state, statePath);
  return {
    appeared,
    pairAttempts,
    knownPresent: state.knownPresent,
  };
}

function runAppearPair(serial, options = {}) {
  const nodeBin = options.nodeCommand || process.execPath;
  const script = options.pairScript || PAIR_SCRIPT;
  const args = options.pairArgs || defaultPairArgs();
  const env = { ...process.env, ...(options.env || {}), HERMES_USB_APPEAR_PAIR_SERIAL: serial };
  if (typeof options.pairRunner === 'function') {
    return options.pairRunner(serial, { nodeBin, script, args, env });
  }
  try {
    const result = spawnSync(nodeBin, [script, ...args], {
      encoding: 'utf8',
      timeout: options.pairTimeoutMs || PAIR_TIMEOUT_MS,
      env,
    });
    const ok = result.status === 0;
    return {
      serial,
      paired: ok,
      status: result.status,
      reason: ok ? 'paired' : `pair_exit_${result.status}`,
      stderr: (result.stderr || '').slice(-500),
    };
  } catch (err) {
    return {
      serial,
      paired: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function runOnce(options = {}) {
  const serials = listAuthorizedSerials(options).filter(isPhysicalSerial);
  const results = serials.map((serial) => healSerial(serial, options));
  const appear = maybePairOnAppear(serials, options);
  return {
    checkedAt: new Date().toISOString(),
    ports: USB_ADB_REVERSE_PORTS,
    devicesChecked: serials.length,
    results,
    healed: results.some((r) => r.reapplied.length > 0),
    anyFailed: results.some((r) => r.failed.length > 0),
    appear,
    paired: appear.pairAttempts.some((a) => a.paired),
  };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const skipPair = args.includes('--no-pair');
  const summary = runOnce({ skipPair });
  const ntfy = notifyUsbFailure(summary);
  summary.ntfy = ntfy;
  if (json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else if (summary.devicesChecked === 0) {
    console.log('hermes-usb-reverse-watchdog: no authorized USB devices attached');
  } else {
    for (const r of summary.results) {
      if (r.missing.length === 0) {
        console.log(`hermes-usb-reverse-watchdog: ${r.serial} — ports ${USB_ADB_REVERSE_PORTS.join(', ')} already live`);
      } else if (r.reapplied.length > 0) {
        console.log(
          `hermes-usb-reverse-watchdog: ${r.serial} — re-applied adb reverse for port(s) ${r.reapplied.join(', ')} (were missing: ${r.missing.join(', ')})`,
        );
      }
      if (r.failed.length > 0) {
        console.error(`hermes-usb-reverse-watchdog: ${r.serial} — FAILED to re-apply port(s) ${r.failed.join(', ')}`);
      }
    }
    for (const attempt of summary.appear.pairAttempts) {
      if (attempt.paired) {
        console.log(`hermes-usb-reverse-watchdog: ${attempt.serial} — appear auto-pair OK`);
      } else if (attempt.reason && attempt.reason !== 'skip_pair') {
        console.log(`hermes-usb-reverse-watchdog: ${attempt.serial} — appear auto-pair skipped (${attempt.reason})`);
      }
    }
    if (ntfy.sent) {
      console.error('hermes-usb-reverse-watchdog: ntfy alert sent');
    }
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  listAuthorizedSerials,
  isPhysicalSerial,
  healSerial,
  runOnce,
  notifyUsbFailure,
  maybePairOnAppear,
  runAppearPair,
  loadAppearState,
  saveAppearState,
};
