#!/usr/bin/env node
'use strict';

/**
 * Read-only status for agent-facing LaunchAgents + Cursor automation drafts.
 * Session-start probe: node tools/agent-automation-status.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const AUTOMATIONS_DIR = path.join(REPO, '.cursor', 'automations');

const LAUNCH_AGENTS = [
  'com.igor.shutdown-simulators',
  'com.igor.smart-ops',
  'com.igor.revenue-autonomous-loop',
  'com.igor.ralph-gsd-loop',
  'com.igor.hermes-mobile-continuous-e2e',
  'com.igor.repo-root-hygiene',
  'com.igor.github-reply-monitor',
  'com.igor.ceo-operating-brief',
  'com.igor.react-native-newsletter-ingest',
  'com.igor.hermes-contribution-opportunities',
];

function launchctlState(label) {
  const uid = process.getuid?.() ?? 0;
  const target = `gui/${uid}/${label}`;
  try {
    const out = execSync(`launchctl print ${target}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const state = out.match(/state = ([^\n]+)/)?.[1]?.trim() ?? 'unknown';
    const interval = out.match(/run interval = (\d+) sec/)?.[1];
    return interval ? `${state}, interval=${interval}s` : state;
  } catch {
    return 'not loaded';
  }
}

function listCursorAutomations() {
  if (!fs.existsSync(AUTOMATIONS_DIR)) return [];
  return fs
    .readdirSync(AUTOMATIONS_DIR)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort();
}

function main() {
  const args = process.argv.slice(2);
  const runBrief = args.includes('--brief');

  console.log('Agent automations status @', new Date().toISOString());
  console.log('Repo:', REPO);
  console.log('');

  console.log('LaunchAgents:');
  for (const label of LAUNCH_AGENTS) {
    console.log(`  ${label}: ${launchctlState(label)}`);
  }

  const drafts = listCursorAutomations();
  console.log('');
  console.log(`Cursor Automation drafts (${drafts.length}):`);
  if (drafts.length === 0) {
    console.log('  (none — see docs/CURSOR-AUTOMATIONS.md)');
  } else {
    for (const file of drafts) {
      console.log(`  .cursor/automations/${file}`);
    }
  }

  console.log('');
  console.log('Control plane / observability (Agent Conf ROI):');
  try {
    const cp = execSync('node tools/agent-control-plane.js status --json', {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    const status = JSON.parse(cp);
    console.log(
      `  health.score=${status.health?.score}/100 e2e=${status.continuousE2e?.e2e} shipClaimOk=${status.continuousE2e?.shipClaimOk}`,
    );
  } catch {
    console.log('  agent-control-plane: unavailable');
  }
  try {
    execSync('node tools/hermes-observability-gate.js --mode status --json', {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    console.log('  observability-gate(status): pass');
  } catch (error) {
    const out = String(error?.stdout || error?.stderr || '');
    try {
      const body = JSON.parse(out);
      console.log(
        `  observability-gate(status): FAIL ${
          (body.violations || []).map((v) => v.code).join(',') || 'unknown'
        }`,
      );
    } catch {
      console.log('  observability-gate(status): FAIL');
    }
  }
  console.log('  alert loop: node tools/alert-investigation-loop.js scan --json');
  console.log('  incident RAG: node tools/agent-incident-capture.js --help');

  if (!runBrief) {
    console.log('');
    console.log('Session brief: node tools/agent-session-start.js (or --brief here)');
    return;
  }

  console.log('');
  console.log('CEO brief:');
  try {
    execSync('node tools/ceo-operating-brief.js', { cwd: REPO, stdio: 'inherit' });
  } catch {
    console.log('  ceo-operating-brief: FAIL (see output above)');
    process.exit(1);
  }
}

main();
