#!/usr/bin/env node
'use strict';

/**
 * Serialize agent phone pipeline: session-start pair/install queue + hermes-mobile-pair.
 * Complements install-phone-release.sh flock (build+install) — this lock covers pairing
 * and session-start orchestration so three concurrent agents cannot reinstall + re-pair.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HERMES_DIR = path.join(REPO, 'hermes-mobile');
const LOCK_FILE = path.join(HERMES_DIR, '.agent-phone-pipeline.lock');
const LOCK_META = path.join(HERMES_DIR, '.agent-phone-pipeline.lock.meta');
const LOCK_DIR = path.join(HERMES_DIR, '.agent-phone-pipeline.lockdir');
const INSTALL_LOCK = path.join(HERMES_DIR, '.install-phone-release.lock');
const INSTALL_META = path.join(HERMES_DIR, '.install-phone-release.lock.meta');

const DEFAULT_WAIT_MS = Number(process.env.HERMES_PHONE_PIPELINE_LOCK_WAIT_MS || 120_000);

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
  return { busy: true, detail: detail || 'install-phone-release.sh holds flock' };
}

function phoneInstallLaunchJobRunning() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const label = `com.igor.hermes-phone-install-once.${uid}`;
  const probe = spawnSync('launchctl', ['print', `gui/${uid}/${label}`], { encoding: 'utf8' });
  if (probe.status !== 0) return false;
  return /^\s*state\s*=\s*running/m.test(probe.stdout || '');
}

function pipelineBusyReason() {
  const install = installPipelineBusy();
  if (install && install.busy) {
    return install.detail;
  }
  if (phoneInstallLaunchJobRunning()) {
    return 'com.igor.hermes-phone-install-once launchctl job running';
  }
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
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }
  return '';
}

function tryAcquireLock(label) {
  fs.mkdirSync(HERMES_DIR, { recursive: true });
  try {
    fs.mkdirSync(LOCK_DIR);
    fs.writeFileSync(path.join(LOCK_DIR, 'pid'), `${process.pid}\n`);
    fs.writeFileSync(path.join(LOCK_DIR, 'meta'), `${label} pid=${process.pid}\n`);
    fs.writeFileSync(LOCK_META, `${label} pid=${process.pid}\n`);
    return true;
  } catch (err) {
    if (err && err.code !== 'EEXIST') throw err;
    const pid = readPid(path.join(LOCK_DIR, 'pid'));
    if (!isAlive(pid)) {
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
      return tryAcquireLock(label);
    }
    return false;
  }
}

function releaseLock() {
  try {
    const pid = readPid(path.join(LOCK_DIR, 'pid'));
    if (pid === process.pid) {
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(LOCK_META);
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
  HERMES_DIR,
  LOCK_FILE,
  LOCK_META,
  DEFAULT_WAIT_MS,
  installPipelineBusy,
  phoneInstallLaunchJobRunning,
  pipelineBusyReason,
  withPhonePipelineLock,
};
