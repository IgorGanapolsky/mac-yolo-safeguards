#!/usr/bin/env node
'use strict';

/**
 * USB adb-reverse keepalive watchdog (T-332 P0 2026-07-14, revived after RELAY
 * resource_exhausted incident — USB/Tailscale must self-heal without depending on
 * the cloud relay at all).
 *
 * Root cause: adbd silently drops `adb reverse` tcp:8642/tcp:8765 tunnels on its own
 * (observed after an unrelated `adb shell uiautomator dump` hiccup) with no OS-level
 * notification. The phone app cannot re-establish a host-side adb reverse tunnel —
 * that is exclusively the Mac's job — so once the tunnel drops, USB shows a red
 * "Reconnecting…" indefinitely until a human happens to notice and re-runs pairing
 * by hand.
 *
 * This watchdog is a cheap, read-mostly poll: for every authorized ("device" state)
 * USB phone, check `adb reverse --list` for the ports Hermes Mobile needs
 * (tools/hermes-mobile-pair-lib.js USB_ADB_REVERSE_PORTS) and re-apply any missing
 * one. It reuses the exact adb-reverse helpers `tools/hermes-mobile-pair.js` uses so
 * the "what ports, what command" contract lives in one place. It never touches the
 * phone UI/input, so it is safe to run on a short interval without the phone
 * pipeline lease (tools/agent-phone-lease.js) used by Maestro/install/pairing.
 *
 * CLI:
 *   node tools/hermes-usb-reverse-watchdog.js [--json] [--once]
 *
 * Exit codes: 0 always (best-effort self-heal must never fail the caller); use
 * --json to inspect.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { USB_ADB_REVERSE_PORTS, assertUsbAdbReverses, setupUsbAdbReverses } = require('./hermes-mobile-pair-lib');

const NTFY = process.env.HERMES_NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const NTFY_STATE_PATH =
  process.env.HERMES_USB_WATCHDOG_NTFY_STATE ||
  path.join(os.homedir(), '.hermes', 'usb-reverse-watchdog-ntfy.json');
const NTFY_COOLDOWN_MS = Number(process.env.HERMES_USB_WATCHDOG_NTFY_COOLDOWN_MS || 15 * 60 * 1000);

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

function runOnce(options = {}) {
  const serials = listAuthorizedSerials(options).filter(isPhysicalSerial);
  const results = serials.map((serial) => healSerial(serial, options));
  return {
    checkedAt: new Date().toISOString(),
    ports: USB_ADB_REVERSE_PORTS,
    devicesChecked: serials.length,
    results,
    healed: results.some((r) => r.reapplied.length > 0),
    anyFailed: results.some((r) => r.failed.length > 0),
  };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const summary = runOnce();
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
};
