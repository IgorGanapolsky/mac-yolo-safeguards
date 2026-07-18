'use strict';

const CONTINUOUS_E2E_LABEL = 'com.igor.hermes-mobile-continuous-e2e';

function serviceDomain(uid) {
  return `gui/${uid}/${CONTINUOUS_E2E_LABEL}`;
}

function activeE2eProcessLines(psOutput) {
  return String(psOutput || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        /hermes-mobile\/scripts\/run-(?:continuous-)?e2e\.sh(?:\s|$)/.test(line) ||
        /(?:^|[\s/])maestro(?:\s+\S+)*?\s+test(?:\s|$)/i.test(line),
    );
}

function inspectContinuousE2eActivity({ spawnSync, uid }) {
  const domain = serviceDomain(uid);
  const service = spawnSync('launchctl', ['print', domain], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (service.status === 0 && /^\s*state = running\s*$/m.test(service.stdout || '')) {
    return { active: true, reason: 'launchagent-running', domain };
  }

  const processes = spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  const matches = processes.status === 0 ? activeE2eProcessLines(processes.stdout) : [];
  if (matches.length > 0) {
    return {
      active: true,
      reason: 'e2e-process-running',
      domain,
      processes: matches.slice(0, 5),
    };
  }

  return { active: false, reason: 'idle', domain };
}

function maybeKickstartContinuousE2e({ spawnSync, uid, blockedReason = '' }) {
  const domain = serviceDomain(uid);
  if (blockedReason) {
    return { triggered: false, reason: blockedReason, domain };
  }

  const activity = inspectContinuousE2eActivity({ spawnSync, uid });
  if (activity.active) {
    return { triggered: false, ...activity };
  }

  // Intentionally omit `-k`: session startup may request an idle cycle, but it
  // must never terminate an in-flight unit/Maestro run owned by any worktree.
  const kick = spawnSync('launchctl', ['kickstart', domain], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  return {
    triggered: kick.status === 0,
    reason: kick.status === 0 ? 'started' : 'kickstart-failed',
    domain,
    status: kick.status,
    stdout: kick.stdout || '',
    stderr: kick.stderr || '',
  };
}

module.exports = {
  CONTINUOUS_E2E_LABEL,
  activeE2eProcessLines,
  inspectContinuousE2eActivity,
  maybeKickstartContinuousE2e,
  serviceDomain,
};
