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
const { formatHuman, snapshotPlan } = require('./plan-coordination-snapshot');
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

const pair = runNode('tools/hermes-mobile-pair.js', [], 60_000);
if (!json && pair.stdout) {
  const pairLines = pair.stdout
    .split('\n')
    .filter((line) => /Hermes Mobile pairing|Gateway:|adb:/.test(line));
  if (pairLines.length > 0) {
    process.stdout.write('\n=== Hermes Mobile auto-pair ===\n');
    pairLines.forEach((line) => process.stdout.write(`${line}\n`));
  }
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
  const kick = spawnSync(
    'launchctl',
    ['kickstart', '-k', `gui/${uid}/com.igor.hermes-mobile-continuous-e2e`],
    { encoding: 'utf8', timeout: 10_000 },
  );
  if (!json) {
    process.stdout.write('\n=== Hermes Mobile continuous E2E kickstart ===\n');
    if (kick.status === 0) {
      process.stdout.write('Triggered com.igor.hermes-mobile-continuous-e2e (async cycle).\n');
    } else if (kick.stderr) {
      process.stderr.write(kick.stderr);
    }
  }
}

const briefArgs = ['tools/ceo-operating-brief.js'];
if (json) briefArgs.push('--json');
if (full) briefArgs.push('--full');

const brief = runNode(briefArgs[0], briefArgs.slice(1), full ? 300_000 : 180_000);
if (brief.stdout) process.stdout.write(brief.stdout);
if (brief.stderr) process.stderr.write(brief.stderr);

if (fs.existsSync(DEFAULT_VAULT)) {
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
