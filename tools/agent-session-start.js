#!/usr/bin/env node
'use strict';

/**
 * agent-session-start.js — Single entry for AI agents at session start.
 *
 * Usage:
 *   node tools/agent-session-start.js [--json] [--full]
 *
 * Runs LaunchAgent health check then CEO operating brief (DS / ML / RAG stack).
 */

const { spawnSync } = require('child_process');
const path = require('path');

const fs = require('fs');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_VAULT = path.join(os.homedir(), 'Documents', 'AI-Agent-Sync');
const LATEST_E2E_JSON = path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json');
const HERMES_MOBILE_DIR = path.join(REPO, 'hermes-mobile');
const PHONE_INSTALL_MARKER = path.join(HERMES_MOBILE_DIR, '.install-phone-release.last');
const PHONE_DEVICE_ID = 'R3CY90QPM7E';
const { formatHuman, snapshotPlan } = require('./plan-coordination-snapshot');
const {
  phoneInstallLaunchJobRunning,
  pipelineBusyReason,
  withPhonePipelineLock,
} = require('./agent-phone-pipeline-lock');
const {
  CONTINUOUS_E2E_LABEL,
  maybeKickstartContinuousE2e,
} = require('./continuous-e2e-kickstart');
const E2E_STALE_MS = 30 * 60 * 1000;
const args = process.argv.slice(2);
const json = args.includes('--json');
const full = args.includes('--full');

function runNode(script, scriptArgs, timeoutMs) {
  return spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function runBash(script, timeoutMs) {
  return spawnSync('bash', [script], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function isTailscaleIpv4(value) {
  const ip = String(value || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  const octets = ip.split('.').map(Number);
  return (
    octets.every((part) => part >= 0 && part <= 255) &&
    octets[0] === 100 &&
    octets[1] >= 64 &&
    octets[1] <= 127
  );
}

function normalizeTailnetProbeHostList(value) {
  const hosts = new Set();
  for (const raw of String(value || '').split(',')) {
    const host = raw.trim().replace(/\.$/, '').toLowerCase();
    if (!host) continue;
    if (isTailscaleIpv4(host) || (/^[a-z0-9.-]+$/.test(host) && host.endsWith('.ts.net'))) {
      hosts.add(host);
    }
  }
  return Array.from(hosts);
}

const TAILSCALE_API_CREDENTIAL_ENV_KEYS = [
  'TAILSCALE_API_ACCESS_TOKEN',
  'TAILSCALE_OAUTH_CLIENT_ID',
  'TAILSCALE_OAUTH_CLIENT_SECRET',
];

function clearTailscaleApiCredentialsFromProcess() {
  for (const key of TAILSCALE_API_CREDENTIAL_ENV_KEYS) {
    delete process.env[key];
  }
}

/**
 * Optional server-side discovery. Credentials stay in this computer's process;
 * only sanitized MagicDNS/100.x hosts are passed to the existing pair flow.
 */
function bootstrapTailnetProbeHostsFromApi() {
  const configured = Boolean(
    process.env.TAILSCALE_API_ACCESS_TOKEN?.trim() ||
      process.env.TAILSCALE_OAUTH_CLIENT_ID?.trim() ||
      process.env.TAILSCALE_OAUTH_CLIENT_SECRET?.trim(),
  );
  if (!configured) return { configured: false, hosts: [] };

  let result;
  try {
    result = runNode('tools/hermes-tailscale-api-discover.js', ['--hosts-only'], 20_000);
  } finally {
    // The inventory subprocess is the only child allowed to inherit these.
    // Erase them before queued installs, pairing, E2E, or smart-ops execute.
    clearTailscaleApiCredentialsFromProcess();
  }
  if (result.status !== 0) {
    return {
      configured: true,
      hosts: [],
      error: result.stderr?.trim().slice(0, 240) || `exit ${result.status}`,
    };
  }

  const hosts = normalizeTailnetProbeHostList(result.stdout);
  const existing = normalizeTailnetProbeHostList(process.env.HERMES_TAILNET_PROBE_HOSTS);
  const merged = Array.from(new Set([...existing, ...hosts]));
  if (merged.length > 0) {
    process.env.HERMES_TAILNET_PROBE_HOSTS = merged.join(',');
  }
  return { configured: true, hosts };
}

function adbSeesPhoneDevice() {
  const adb = spawnSync('adb', ['devices'], { encoding: 'utf8', timeout: 5000 });
  if (adb.status !== 0 || !adb.stdout) return false;
  return adb.stdout.split('\n').some((line) => {
    const parts = line.trim().split(/\s+/);
    return parts[0] === PHONE_DEVICE_ID && parts[1] === 'device';
  });
}

function phoneInstallMarkerSha() {
  try {
    const marker = fs.readFileSync(PHONE_INSTALL_MARKER, 'utf8').trim().split(/\s+/);
    if (marker[1] === PHONE_DEVICE_ID) return marker[0];
  } catch {
    /* no marker yet */
  }
  return '';
}

function repoHeadSha() {
  const head = spawnSync('git', ['-C', HERMES_MOBILE_DIR, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return head.status === 0 ? head.stdout.trim() : '';
}

/** One-shot async install when Igor's phone is stale vs consolidated HEAD. */
function maybeQueuePhoneInstall() {
  if (!adbSeesPhoneDevice()) return { queued: false, reason: 'no-device' };

  const targetSha = repoHeadSha();
  if (!targetSha) return { queued: false, reason: 'no-head' };

  const lastSha = phoneInstallMarkerSha();
  if (lastSha === targetSha) {
    return { queued: false, reason: 'current', sha: targetSha };
  }

  const busy = pipelineBusyReason();
  if (busy || phoneInstallLaunchJobRunning()) {
    return {
      queued: false,
      reason: 'pipeline-busy',
      sha: targetSha,
      lastSha: lastSha || null,
      detail: busy || 'phone-install launchctl job already running',
    };
  }

  const logPath = path.join(HERMES_MOBILE_DIR, 'docs/proofs/phone-install-once.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const uid = process.getuid?.() ?? 0;
  const label = `com.igor.hermes-phone-install-once.${uid}`;
  const domain = `gui/${uid}/${label}`;
  const pairScript = path.join(REPO, 'tools/hermes-mobile-pair.js');
  const exportValues = [
    'SENTRY_DISABLE_AUTO_UPLOAD=true',
    'HERMES_AGENT_LABEL=session-start',
  ];
  const sanitizedTailnetHosts = normalizeTailnetProbeHostList(
    process.env.HERMES_TAILNET_PROBE_HOSTS,
  );
  if (sanitizedTailnetHosts.length > 0) {
    exportValues.push(`HERMES_TAILNET_PROBE_HOSTS=${sanitizedTailnetHosts.join(',')}`);
  }
  const cmd = [
    `export ${exportValues.join(' ')}`,
    `cd "${HERMES_MOBILE_DIR}" && bash scripts/install-phone-release.sh`,
    // Apply mini Tailscale primary to the freshly installed phone without LAN pair-server.
    // Bare `--mini-tailscale --no-serve` skips adb (USB guard / no-serve) and leaves Wrong key.
    `node "${pairScript}" --mini-tailscale --force-mini-usb-primary --no-serve`,
  ].join(' && ');
  const oneShotCmd = [
    cmd,
    'status=$?',
    // `launchctl submit` infers KeepAlive for submitted jobs. Remove this job
    // before the shell exits so a successful install/pair cannot restart-loop.
    `launchctl remove "${label}"`,
    'exit "$status"',
  ].join('; ');

  const lockResult = withPhonePipelineLock(
    'session-start:queue-phone-install',
    () => {
      // A completed `launchctl submit` one-shot can leave a persistent disabled
      // override even though the job is no longer present. Clear that override
      // before reusing the stable per-user label on the next session start.
      const enable = spawnSync('launchctl', ['enable', domain], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      if (enable.status !== 0) {
        throw new Error(
          enable.stderr?.trim() || enable.stdout?.trim() || 'launchctl enable failed',
        );
      }
      const submit = spawnSync(
        'launchctl',
        [
          'submit',
          '-l',
          label,
          '-o',
          logPath,
          '-e',
          logPath,
          '--',
          '/bin/bash',
          '-lc',
          oneShotCmd,
        ],
        { encoding: 'utf8', timeout: 10_000 },
      );
      if (submit.status !== 0) {
        throw new Error(submit.stderr?.trim() || submit.stdout?.trim() || 'launchctl submit failed');
      }
    },
    { waitMs: 15_000, skipIfBusy: true },
  );

  if (!lockResult.ran) {
    return {
      queued: false,
      reason: 'pipeline-busy',
      sha: targetSha,
      lastSha: lastSha || null,
      detail: lockResult.reason || 'phone pipeline busy',
    };
  }

  return { queued: true, sha: targetSha, lastSha: lastSha || null, logPath };
}

const planSnapshot = snapshotPlan();
if (!json) {
  process.stdout.write(`\n${formatHuman(planSnapshot)}\n`);
}

const verify = runBash('scripts/verify-agent-automations.sh', 20_000);
if (!json) {
  if (verify.stdout) process.stdout.write(verify.stdout);
  if (verify.stderr) process.stderr.write(verify.stderr);
  if (verify.status !== 0) {
    const install = runBash('scripts/install-agent-automations.sh', 60_000);
    if (install.stdout) process.stdout.write(install.stdout);
    if (install.stderr) process.stderr.write(install.stderr);
  }
}

runBash('hermes-mobile/scripts/agent-adb-refresh.sh', 15_000);

const tailscaleApiBootstrap = bootstrapTailnetProbeHostsFromApi();
if (!json && tailscaleApiBootstrap.configured) {
  process.stdout.write('\n=== Hermes Mobile Tailscale API discovery ===\n');
  if (tailscaleApiBootstrap.error) {
    process.stdout.write(
      `Optional control-plane discovery unavailable (${tailscaleApiBootstrap.error}); ` +
        'continuing with local Tailscale discovery.\n',
    );
  } else {
    process.stdout.write(
      `Seeded ${tailscaleApiBootstrap.hosts.length} sanitized computer endpoint candidate(s).\n`,
    );
  }
}

const phoneInstall = maybeQueuePhoneInstall();
const phonePipelineBusy =
  phoneInstall.reason === 'pipeline-busy' ||
  Boolean(pipelineBusyReason()) ||
  phoneInstallLaunchJobRunning();

let pair = { status: 0, stdout: '', stderr: '' };
if (phoneInstall.queued) {
  if (!json) {
    process.stdout.write('\n=== Hermes Mobile auto-pair: deferred (install+pair job queued) ===\n');
  }
} else if (phonePipelineBusy) {
  if (!json) {
    process.stdout.write(
      `\n=== Hermes Mobile auto-pair: skipped (${phoneInstall.detail || pipelineBusyReason() || 'pipeline busy'}) ===\n`,
    );
  }
} else if (phoneInstall.reason === 'no-device') {
  if (!json) {
    process.stdout.write(
      '\n=== Hermes Mobile auto-pair: skipped (no physical phone; emulator-only ADB is never paired) ===\n',
    );
  }
} else {
  const lockResult = withPhonePipelineLock(
    'session-start:auto-pair',
    () => {
      pair = runNode('tools/hermes-mobile-pair.js', ['--no-serve'], 90_000);
    },
    { waitMs: 30_000, skipIfBusy: true },
  );
  if (!lockResult.ran && !json) {
    process.stdout.write(
      `\n=== Hermes Mobile auto-pair: skipped (${lockResult.reason || 'pipeline busy'}) ===\n`,
    );
  } else if (lockResult.ran && pair.status !== 0) {
    if (!json) {
      process.stdout.write('\n=== Hermes Mobile auto-pair: FAILED ===\n');
      process.stdout.write(
        `pair exit=${pair.status} — phone present but host/key bind or auth probe failed. ` +
          `Refuse ready claim. Fix: node tools/hermes-mobile-pair.js --no-serve\n`,
      );
      if (pair.stderr) process.stderr.write(pair.stderr);
    }
    // Fresh-install contract: do not continue as if paired when adb device is present.
    process.exitCode = process.exitCode || 2;
  }
}
if (!json && pair.stdout) {
  const pairLines = pair.stdout
    .split('\n')
    .filter((line) => /Hermes Mobile pairing|Gateway:|adb:/.test(line));
  if (pairLines.length > 0) {
    process.stdout.write('\n=== Hermes Mobile auto-pair ===\n');
    pairLines.forEach((line) => process.stdout.write(`${line}\n`));
  }
}
if (!json && phoneInstall.queued) {
  process.stdout.write('\n=== Hermes Mobile phone install (stale marker) ===\n');
  process.stdout.write(
    `Queued release install for ${PHONE_DEVICE_ID} @ ${phoneInstall.sha.slice(0, 12)}` +
      (phoneInstall.lastSha ? ` (was ${phoneInstall.lastSha.slice(0, 12)})` : '') +
      `${phoneInstall.fallback ? ' [detached fallback]' : ''}\n`,
  );
  if (phoneInstall.logPath) {
    process.stdout.write(`Log: ${phoneInstall.logPath}\n`);
  }
} else if (!json && phoneInstall.reason === 'current') {
  process.stdout.write(
    `\n=== Hermes Mobile phone install: ${PHONE_DEVICE_ID} already at ${phoneInstall.sha.slice(0, 12)} ===\n`,
  );
} else if (!json && phoneInstall.reason === 'pipeline-busy') {
  process.stdout.write(
    `\n=== Hermes Mobile phone install: skipped — ${phoneInstall.detail || 'pipeline busy'} ===\n`,
  );
}

function readLatestE2e() {
  try {
    return JSON.parse(fs.readFileSync(LATEST_E2E_JSON, 'utf8'));
  } catch {
    return null;
  }
}

function e2eNeedsKickstart(latest) {
  if (!latest || !latest.updatedAt) return true;
  const ageMs = Date.now() - Date.parse(latest.updatedAt);
  if (Number.isNaN(ageMs) || ageMs > E2E_STALE_MS) return true;
  return latest.unit !== 'pass' || latest.e2e !== 'pass';
}

const e2eVerify = runBash('hermes-mobile/scripts/verify-continuous-e2e.sh', 20_000);
if (!json) {
  process.stdout.write('\n');
  if (e2eVerify.stdout) process.stdout.write(e2eVerify.stdout);
  if (e2eVerify.stderr) process.stderr.write(e2eVerify.stderr);
}

const latestE2e = readLatestE2e();
if (e2eNeedsKickstart(latestE2e)) {
  const uid = spawnSync('id', ['-u'], { encoding: 'utf8' }).stdout?.trim() || '';
  const kick = maybeKickstartContinuousE2e({
    spawnSync,
    uid,
    blockedReason: phonePipelineBusy ? 'phone-pipeline-busy' : '',
  });
  if (!json) {
    process.stdout.write('\n=== Hermes Mobile continuous E2E kickstart ===\n');
    if (kick.triggered) {
      process.stdout.write(`Triggered ${CONTINUOUS_E2E_LABEL} (async cycle).\n`);
    } else if (kick.reason === 'launchagent-running' || kick.reason === 'e2e-process-running') {
      process.stdout.write(`Preserved active continuous E2E cycle (${kick.reason}).\n`);
    } else if (kick.reason === 'phone-pipeline-busy') {
      process.stdout.write('Skipped continuous E2E kickstart (phone pipeline busy).\n');
    } else if (kick.stderr) {
      process.stderr.write(kick.stderr);
    }
  }
}

// Smart ops: efficient revenue + agent heal (skips fresh work). Zero CEO labor.
const smartOps = runNode('tools/smart-ops-controller.js', ['--json'], 90_000);
if (!json) {
  process.stdout.write('\n=== Smart ops (efficient) ===\n');
  if (smartOps.status === 0 && smartOps.stdout) {
    try {
      const s = JSON.parse(smartOps.stdout);
      const rev = s.revenue || {};
      process.stdout.write(
        [
          `duration_ms=${s.durationMs} agents=${(s.agents || []).filter((a) => a.loaded).length}/${(s.agents || []).length}`,
          rev.skipped
            ? `revenue=skipped_fresh_${(rev.ageMin || 0).toFixed?.(1) || rev.ageMin}m`
            : `revenue ok=${rev.ok} open=$${rev.funnel?.openGross ?? '?'} due=${rev.due?.length ?? 0} sent=${rev.sentCount || 0} noop=${rev.noop}`,
          ...(s.actions || []).slice(0, 8),
          '',
        ].join('\n'),
      );
    } catch {
      process.stdout.write(smartOps.stdout.slice(0, 800));
    }
  } else if (smartOps.stderr) {
    process.stderr.write(smartOps.stderr.slice(0, 500));
  }
}

const briefArgs = ['tools/ceo-operating-brief.js'];
if (json) briefArgs.push('--json');
if (full) briefArgs.push('--full');

const brief = runNode(briefArgs[0], briefArgs.slice(1), full ? 300_000 : 180_000);
if (brief.stdout) process.stdout.write(brief.stdout);
if (brief.stderr) process.stderr.write(brief.stderr);

if (fs.existsSync(DEFAULT_VAULT)) {
  const vaultPull = spawnSync('bash', [path.join(REPO, 'scripts/agent-vault-sync.sh'), '--pull-only'], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 256 * 1024,
    env: { ...process.env, VAULT_PATH: DEFAULT_VAULT },
  });
  if (!json && vaultPull.stdout?.trim()) {
    process.stdout.write('\n=== AI-Agent-Sync vault pull ===\n');
    vaultPull.stdout
      .trim()
      .split('\n')
      .forEach((line) => process.stdout.write(`${line}\n`));
  }

  const syncBrief = runNode('tools/agent-sync-brief.js', ['--vault', DEFAULT_VAULT], 60_000);
  if (!json && syncBrief.status === 0 && syncBrief.stdout) {
    const syncLines = syncBrief.stdout
      .split('\n')
      .filter((line) => /Wrote|Dirty entries|Active tasks/.test(line));
    if (syncLines.length > 0) {
      process.stdout.write('\n=== AI-Agent-Sync vault brief ===\n');
      syncLines.forEach((line) => process.stdout.write(`${line}\n`));
    }
  }
}

process.exit(brief.status ?? 1);
