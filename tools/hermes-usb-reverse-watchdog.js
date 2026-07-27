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
const {
  USB_ADB_REVERSE_PORTS,
  assertUsbAdbReverses,
  setupUsbAdbReverses,
  adbReverseHasPort,
  removeUsbAdbReverse,
  readUsbReversePrimaryIntent,
} = require('./hermes-mobile-pair-lib');
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
 * A mini-primary/non-default-loopback session (`--force-mini-usb-primary` or an
 * explicit SSH-tunnel `--gateway-url`) records its intent via
 * `writeUsbReversePrimaryIntent` (see `hermes-mobile-pair.js`). Without honoring it
 * here, this always-on 15s watchdog would silently restore `tcp:8642` and hijack the
 * phone back to this Mac within one poll cycle — the exact regression #967 fixed on
 * the pairing/install path but could not fix on this independent LaunchAgent
 * (T-USB-WATCHDOG-MINI-PRIMARY-20260724, follow-up to 8642-autopair-hijack-fix).
 *
 * @returns {{ skip8642: boolean, source: object|null }}
 */
function currentReverseIntent(options = {}) {
  if (options.intent !== undefined) {
    return { skip8642: !!(options.intent && options.intent.skip8642), source: options.intent };
  }
  const intent = readUsbReversePrimaryIntent(options.intentStatePath);
  return { skip8642: !!(intent && intent.skip8642), source: intent };
}

/**
 * @returns {{ serial: string, missing: number[], reapplied: number[], failed: number[], skip8642: boolean, removed8642: boolean }}
 */
function healSerial(serial, options = {}) {
  const basePorts = options.ports ?? USB_ADB_REVERSE_PORTS;
  const { skip8642 } = currentReverseIntent(options);
  const ports = skip8642 ? basePorts.filter((port) => port !== 8642) : basePorts;

  // Mini-primary intent is active: actively remove a stale tcp:8642 the moment it
  // reappears (e.g. re-added by a different pairing invocation) instead of only
  // reacting to a "missing" required port, since 8642 is no longer required here.
  let removed8642 = false;
  if (skip8642 && basePorts.includes(8642) && adbReverseHasPort(serial, 8642, options)) {
    removed8642 = removeUsbAdbReverse(serial, 8642, options);
  }

  const before = assertUsbAdbReverses(serial, { ...options, requiredPorts: ports });
  if (before.ok) {
    return { serial, missing: [], reapplied: [], failed: [], skip8642, removed8642 };
  }
  const setup = setupUsbAdbReverses(serial, { ...options, ports: before.missing });
  const after = assertUsbAdbReverses(serial, { ...options, requiredPorts: before.missing });
  return {
    serial,
    missing: before.missing,
    reapplied: before.missing.filter((port) => !after.missing.includes(port)),
    failed: after.missing,
    setupFailures: setup.failures,
    skip8642,
    removed8642,
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
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state)}\n`);
    return true;
  } catch (err) {
    // Best-effort: LaunchAgent must never crash on a home-dir write failure.
    console.error(
      `hermes-usb-reverse-watchdog: appear-state write failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

function defaultPairArgs() {
  // A cable appearance is not an instruction to show the QR fallback. The pairing
  // script still applies the USB loopback profile and opens Hermes via adb, but does
  // not create a browser tab. QR is available only from an explicit pairing action.
  return ['--no-serve'];
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
  let appear = { appeared: [], pairAttempts: [], knownPresent: [] };
  try {
    appear = maybePairOnAppear(serials, options);
  } catch (err) {
    appear = {
      appeared: [],
      pairAttempts: [
        {
          serial: '*',
          paired: false,
          reason: `appear_error:${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      knownPresent: [],
    };
  }
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
      if (r.skip8642) {
        console.log(
          `hermes-usb-reverse-watchdog: ${r.serial} — mini-primary intent active, tcp:8642 excluded from healing${
            r.removed8642 ? ' (removed stale tcp:8642)' : ''
          }`,
        );
      }
      if (r.missing.length === 0) {
        console.log(`hermes-usb-reverse-watchdog: ${r.serial} — ports ${(r.skip8642 ? USB_ADB_REVERSE_PORTS.filter((p) => p !== 8642) : USB_ADB_REVERSE_PORTS).join(', ')} already live`);
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
  currentReverseIntent,
  healSerial,
  runOnce,
  notifyUsbFailure,
  maybePairOnAppear,
  runAppearPair,
  loadAppearState,
  saveAppearState,
};
