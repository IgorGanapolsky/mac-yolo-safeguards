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

const DEFAULT_WAIT_MS = Number(process.env.HERMES_PHONE_PIPELINE_LOCK_WAIT_MS || 120_000);

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
  const external = pipelineBusyReason();
  if (external) {
    if (skipIfBusy) {
      return { ran: false, skipped: true, reason: external };
    }
  }

  const deadline = Date.now() + waitMs;
  while (!tryAcquireLock(label)) {
    if (skipIfBusy) {
      const reason = pipelineBusyReason() || lockMetaSummary() || 'phone pipeline busy';
      return { ran: false, skipped: true, reason };
    }
    if (Date.now() >= deadline) {
      const reason = pipelineBusyReason() || lockMetaSummary() || 'phone pipeline lock timeout';
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

module.exports = {
  REPO,
  HERMES_DIR,
  GLOBAL_PHONE_DIR,
  LOCK_FILE,
  LOCK_META,
  LOCK_DIR,
  INSTALL_LOCK,
  INSTALL_META,
  DEFAULT_WAIT_MS,
  installPipelineBusy,
  phoneInstallLaunchJobRunning,
  pipelineBusyReason,
  withPhonePipelineLock,
  reclaimStaleLockDir,
  isAlive,
};
