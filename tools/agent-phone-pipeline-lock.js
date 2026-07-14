#!/usr/bin/env node
'use strict';

/**
 * Serialize agent phone pipeline: session-start pair/install + hermes-mobile-pair + install-phone-release.
 *
 * CRITICAL (2026-07-14): locks MUST be global across all git worktrees. Per-worktree locks under
 * hermes-mobile/.install-phone-release.lock let multiple agents install/pair the same USB phone
 * and produce Wrong-key / Not connected / stale profiles.
 *
 * Global dir: ~/Library/Application Support/mac-yolo-safeguards/phone-pipeline/
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HERMES_DIR = path.join(REPO, 'hermes-mobile');

/** Single source of truth for all worktrees + main checkout. */
const GLOBAL_PHONE_DIR =
  process.env.HERMES_GLOBAL_PHONE_LOCK_DIR ||
  path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards', 'phone-pipeline');

const LOCK_FILE = path.join(GLOBAL_PHONE_DIR, 'agent-phone-pipeline.lock');
const LOCK_META = path.join(GLOBAL_PHONE_DIR, 'agent-phone-pipeline.lock.meta');
const LOCK_DIR = path.join(GLOBAL_PHONE_DIR, 'agent-phone-pipeline.lockdir');
const INSTALL_LOCK = path.join(GLOBAL_PHONE_DIR, 'install-phone-release.lock');
const INSTALL_META = path.join(GLOBAL_PHONE_DIR, 'install-phone-release.lock.meta');

/**
 * Human hold (T-330 priority 2 — unified phone lease): a human physically using the phone
 * must never be fought for control by a background pairing/install/Maestro/screenshot
 * process. Any lane that funnels through `pipelineBusyReason()` sees the hold; automated
 * lanes (Maestro/E2E/screenshots/dogfooding) additionally SKIP outright instead of queueing
 * — see `tools/agent-phone-lease.js`.
 */
const HUMAN_HOLD_FILE = path.join(GLOBAL_PHONE_DIR, 'human-hold.json');
const DEFAULT_HUMAN_HOLD_TTL_MS = Number(process.env.HERMES_PHONE_HUMAN_HOLD_TTL_MS || 30 * 60 * 1000);

const DEFAULT_WAIT_MS = Number(process.env.HERMES_PHONE_PIPELINE_LOCK_WAIT_MS || 120_000);

function setHumanHold(reason, ttlMs = DEFAULT_HUMAN_HOLD_TTL_MS) {
  ensureGlobalDir();
  const payload = {
    reason: reason || 'human is using the phone',
    heldAt: new Date().toISOString(),
    expiresAt: Date.now() + ttlMs,
  };
  fs.writeFileSync(HUMAN_HOLD_FILE, JSON.stringify(payload, null, 2));
  return payload;
}

function clearHumanHold() {
  try {
    fs.unlinkSync(HUMAN_HOLD_FILE);
  } catch {
    /* not held */
  }
}

function getHumanHold() {
  try {
    const raw = JSON.parse(fs.readFileSync(HUMAN_HOLD_FILE, 'utf8'));
    if (!raw || typeof raw.expiresAt !== 'number') return null;
    if (Date.now() > raw.expiresAt) {
      clearHumanHold();
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function isHumanHoldActive() {
  return getHumanHold() !== null;
}

function ensureGlobalDir() {
  fs.mkdirSync(GLOBAL_PHONE_DIR, { recursive: true });
}

function sleep(ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    /* short queue spin */
  }
}

function isAlive(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid(lockPath) {
  try {
    return Number.parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
  } catch {
    return 0;
  }
}

function lockMetaSummary() {
  try {
    return fs.readFileSync(LOCK_META, 'utf8').trim().replace(/\s+/g, ' ');
  } catch {
    return '';
  }
}

function installPipelineBusy() {
  ensureGlobalDir();
  if (!fs.existsSync(INSTALL_LOCK)) return false;
  const held = spawnSync('bash', ['-c', `exec 9>>"${INSTALL_LOCK}"; flock -n 9`], {
    encoding: 'utf8',
  });
  if (held.status === 0) return false;
  let detail = '';
  try {
    detail = fs.readFileSync(INSTALL_META, 'utf8').trim().replace(/\s+/g, ' ');
  } catch {
    /* no meta */
  }
  return { busy: true, detail: detail || 'install-phone-release holds global flock' };
}

function phoneInstallLaunchJobRunning() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const label = `com.igor.hermes-phone-install-once.${uid}`;
  const probe = spawnSync('launchctl', ['print', `gui/${uid}/${label}`], { encoding: 'utf8' });
  // Presence is enough to block another submit. launchd can report a newly
  // submitted job as `spawn scheduled` before it reaches `running`.
  return probe.status === 0;
}

/**
 * Stale reclaim: only remove lockdir if pid file is missing or process is dead.
 * NEVER delete a lock held by a live PID (even if meta looks foreign).
 */
function reclaimStaleLockDir() {
  if (!fs.existsSync(LOCK_DIR)) return;
  const pidPath = path.join(LOCK_DIR, 'pid');
  const pid = readPid(pidPath);
  if (pid && isAlive(pid)) {
    return; // live holder — do not touch
  }
  // Dead or missing pid: safe to reclaim
  try {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

function pipelineBusyReason() {
  const hold = getHumanHold();
  if (hold) {
    return `human hold: ${hold.reason}`;
  }
  const install = installPipelineBusy();
  if (install && install.busy) {
    return install.detail;
  }
  if (phoneInstallLaunchJobRunning()) {
    return 'com.igor.hermes-phone-install-once launchctl job running';
  }
  reclaimStaleLockDir();
  if (fs.existsSync(LOCK_DIR)) {
    const pid = readPid(path.join(LOCK_DIR, 'pid'));
    if (isAlive(pid)) {
      let meta = '';
      try {
        meta = fs.readFileSync(path.join(LOCK_DIR, 'meta'), 'utf8').trim();
      } catch {
        /* ignore */
      }
      return meta || `phone pipeline lock pid=${pid}`;
    }
  }
  return '';
}

function tryAcquireLock(label) {
  ensureGlobalDir();
  reclaimStaleLockDir();
  try {
    fs.mkdirSync(LOCK_DIR);
    fs.writeFileSync(path.join(LOCK_DIR, 'pid'), `${process.pid}\n`);
    fs.writeFileSync(
      path.join(LOCK_DIR, 'meta'),
      `${label} pid=${process.pid} cwd=${process.cwd()}\n`,
    );
    fs.writeFileSync(LOCK_META, `${label} pid=${process.pid} cwd=${process.cwd()}\n`);
    return true;
  } catch (err) {
    if (err && err.code !== 'EEXIST') throw err;
    const pid = readPid(path.join(LOCK_DIR, 'pid'));
    if (pid && isAlive(pid)) {
      return false;
    }
    // Only reclaim if dead — never steal live lock
    if (!pid || !isAlive(pid)) {
      try {
        fs.rmSync(LOCK_DIR, { recursive: true, force: true });
      } catch {
        return false;
      }
      return tryAcquireLock(label);
    }
    return false;
  }
}

function releaseLock() {
  try {
    const pid = readPid(path.join(LOCK_DIR, 'pid'));
    // Only the owning PID may release
    if (pid === process.pid) {
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
  try {
    const meta = fs.readFileSync(LOCK_META, 'utf8');
    if (meta.includes(`pid=${process.pid}`)) {
      fs.unlinkSync(LOCK_META);
    }
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} label
 * @param {(release: () => void) => void} fn
 * @param {{ waitMs?: number, skipIfBusy?: boolean }} [options]
 * @returns {{ ran: boolean, skipped?: boolean, reason?: string }}
 */
function withPhonePipelineLock(label, fn, options = {}) {
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const skipIfBusy = options.skipIfBusy ?? false;
  const externalBusyReason = options.pipelineBusyReasonImpl || pipelineBusyReason;
  const deadline = Date.now() + waitMs;

  // T-330 fix: an external busy reason (install flock, scheduled phone-install-once
  // launchctl job, or a human hold) must gate acquisition even when `skipIfBusy` is
  // false — previously it was only consulted for messaging inside the mkdir-lock retry
  // loop, so a caller with `skipIfBusy:false` could acquire the (separate) mkdir lock and
  // run concurrently with an active install/human-hold lane it should have waited on.
  for (;;) {
    const external = externalBusyReason();
    if (external) {
      if (skipIfBusy || Date.now() >= deadline) {
        return { ran: false, skipped: true, reason: external };
      }
      sleep(400 + Math.floor(Math.random() * 400));
      continue;
    }
    if (tryAcquireLock(label)) {
      break;
    }
    if (skipIfBusy) {
      const reason = externalBusyReason() || lockMetaSummary() || 'phone pipeline busy';
      return { ran: false, skipped: true, reason };
    }
    if (Date.now() >= deadline) {
      const reason = externalBusyReason() || lockMetaSummary() || 'phone pipeline lock timeout';
      return { ran: false, skipped: true, reason };
    }
    sleep(400 + Math.floor(Math.random() * 400));
  }

  try {
    fn(releaseLock);
    return { ran: true };
  } finally {
    releaseLock();
  }
}

function physicalPhoneUserActivity(options = {}) {
  const run = options.spawnSyncImpl || spawnSync;
  const adbCommand = options.adbCommand || 'adb';
  const devices = run(adbCommand, ['devices', '-l'], { encoding: 'utf8' });
  if (devices.status !== 0) {
    return { active: false, serial: '', reason: 'adb unavailable' };
  }

  const serial = String(devices.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        !line.startsWith('List of devices') &&
        !line.startsWith('emulator-') &&
        /\sdevice(?:\s|$)/.test(line),
    )
    ?.split(/\s+/)[0] || '';
  if (!serial) {
    return { active: false, serial: '', reason: 'no physical phone' };
  }

  const power = run(adbCommand, ['-s', serial, 'shell', 'dumpsys', 'power'], {
    encoding: 'utf8',
  });
  const awake = power.status === 0 && /mWakefulness=Awake\b/.test(String(power.stdout || ''));
  if (!awake) {
    return { active: false, serial, reason: 'physical phone is not awake' };
  }

  const window = run(adbCommand, ['-s', serial, 'shell', 'dumpsys', 'window'], {
    encoding: 'utf8',
  });
  const focusText = String(window.stdout || '');
  const focus = focusText.match(/mCurrentFocus=.*?\s([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+/)?.[1]
    || focusText.match(/mFocusedApp=.*?\s([A-Za-z0-9._]+)\/[A-Za-z0-9.$_]+/)?.[1]
    || '';
  return {
    active: true,
    serial,
    foregroundPackage: focus,
    reason: focus
      ? `physical phone is awake with ${focus} foreground`
      : 'physical phone is awake',
  };
}

function runCommandWithPhonePipelineLock(label, command, args = [], options = {}) {
  let commandStatus = 70;
  const run = options.spawnSyncImpl || spawnSync;
  const result = withPhonePipelineLock(
    label,
    () => {
      const child = run(command, args, {
        stdio: options.stdio || 'inherit',
        env: options.env || process.env,
      });
      commandStatus = Number.isInteger(child.status) ? child.status : 70;
    },
    {
      waitMs: options.waitMs ?? 0,
      skipIfBusy: true,
      pipelineBusyReasonImpl: options.pipelineBusyReasonImpl,
    },
  );
  if (!result.ran) {
    return { ...result, status: 75 };
  }
  return { ran: true, status: commandStatus };
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'phone-user-active') {
    const activity = physicalPhoneUserActivity();
    process.stdout.write(`${JSON.stringify(activity)}\n`);
    process.exitCode = activity.active ? 75 : 0;
    return;
  }
  if (command === 'run') {
    const separator = rest.indexOf('--');
    const label = separator > 0 ? rest.slice(0, separator).join(' ') : '';
    const childCommand = separator >= 0 ? rest[separator + 1] : '';
    const childArgs = separator >= 0 ? rest.slice(separator + 2) : [];
    if (!label || !childCommand) {
      process.stderr.write('Usage: agent-phone-pipeline-lock.js run <label> -- <command> [args...]\n');
      process.exitCode = 2;
      return;
    }
    const result = runCommandWithPhonePipelineLock(label, childCommand, childArgs);
    if (!result.ran && result.reason) {
      process.stderr.write(`phone pipeline busy: ${result.reason}\n`);
    }
    process.exitCode = result.status;
    return;
  }
  process.stderr.write('Usage: agent-phone-pipeline-lock.js <phone-user-active|run>\n');
  process.exitCode = 2;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  REPO,
  HERMES_DIR,
  GLOBAL_PHONE_DIR,
  LOCK_FILE,
  LOCK_META,
  LOCK_DIR,
  INSTALL_LOCK,
  INSTALL_META,
  HUMAN_HOLD_FILE,
  DEFAULT_HUMAN_HOLD_TTL_MS,
  DEFAULT_WAIT_MS,
  installPipelineBusy,
  phoneInstallLaunchJobRunning,
  pipelineBusyReason,
  withPhonePipelineLock,
  physicalPhoneUserActivity,
  runCommandWithPhonePipelineLock,
  reclaimStaleLockDir,
  isAlive,
  setHumanHold,
  clearHumanHold,
  getHumanHold,
  isHumanHoldActive,
};
