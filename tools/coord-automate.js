#!/usr/bin/env node
'use strict';

/**
 * coord-automate.js — Smart, unattended multi-agent coordination automation.
 *
 * One entrypoint for session-start, LaunchAgent, and CI:
 *
 *   node tools/coord-automate.js              # full: preflight + doctor + safe scrub apply + LaunchAgent heal
 *   node tools/coord-automate.js --quick      # session-start: preflight offline + coord-status (no apply)
 *   node tools/coord-automate.js --daemon     # LaunchAgent: display sync + safe scrub apply + preflight offline
 *   node tools/coord-automate.js --ci         # CI: offline preflight only (no Linear network)
 *   node tools/coord-automate.js --json
 *
 * Writes: coordination/coord-health.json (gitignored if coordination/ is partial — we write under coordination/)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const HEALTH_PATH = path.join(REPO, 'coordination', 'coord-health.json');
const PLIST_LABEL = 'com.igor.agent-fleet-orchestrator';
const PLIST_PATH = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents',
  `${PLIST_LABEL}.plist`,
);

function parseArgs(argv) {
  return {
    quick: argv.includes('--quick'),
    daemon: argv.includes('--daemon'),
    ci: argv.includes('--ci'),
    json: argv.includes('--json'),
    noApply: argv.includes('--no-apply'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function runNode(script, args = [], timeoutMs = 120000) {
  const r = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: process.env,
  });
  return {
    script,
    args,
    status: r.status,
    ok: r.status === 0,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    signal: r.signal || null,
  };
}

function parseJsonOut(r) {
  try {
    return JSON.parse((r.stdout || '').trim() || '{}');
  } catch {
    return null;
  }
}

function ensureLaunchAgent() {
  const nodeBin = fs.existsSync('/opt/homebrew/bin/node')
    ? '/opt/homebrew/bin/node'
    : fs.existsSync('/usr/local/bin/node')
      ? '/usr/local/bin/node'
      : process.execPath;
  const loop = path.join(REPO, 'tools', 'coord-automate.js');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${loop}</string>
    <string>--daemon</string>
    <string>--json</string>
  </array>
  <key>StartInterval</key>
  <integer>900</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/agent-fleet-orchestrator.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/agent-fleet-orchestrator.err</string>
  <key>WorkingDirectory</key>
  <string>${REPO}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
`;
  const result = {
    label: PLIST_LABEL,
    plistPath: PLIST_PATH,
    wrote: false,
    loaded: false,
    loadError: null,
  };
  try {
    fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
    const prev = fs.existsSync(PLIST_PATH) ? fs.readFileSync(PLIST_PATH, 'utf8') : '';
    if (prev !== body) {
      fs.writeFileSync(PLIST_PATH, body, 'utf8');
      result.wrote = true;
    }
    try {
      execFileSync('launchctl', ['unload', PLIST_PATH], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      /* not loaded */
    }
    execFileSync('launchctl', ['load', PLIST_PATH], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const list = execFileSync('launchctl', ['list'], { encoding: 'utf8' });
    result.loaded = list.includes(PLIST_LABEL);
  } catch (e) {
    result.loadError = e.message;
  }
  return result;
}

function launchAgentStatus() {
  let loaded = false;
  try {
    const list = execFileSync('launchctl', ['list'], { encoding: 'utf8' });
    loaded = list.includes(PLIST_LABEL);
  } catch {
    /* ignore */
  }
  return {
    label: PLIST_LABEL,
    plistExists: fs.existsSync(PLIST_PATH),
    loaded,
  };
}

function offlinePreflight() {
  const steps = [
    ['tools/ship-claim-gate.js', ['--self-test']],
    ['tools/ship-claim-batch.js', ['--self-test']],
    ['tests/test-linear-agent-bridge.js', []],
    ['tests/test-megafile-risk-scan.js', []],
    ['tests/test-workflows-catalog.js', []],
    ['tools/workflow-preflight.js', []],
  ];
  const results = [];
  for (const [script, args] of steps) {
    if (!fs.existsSync(path.join(REPO, script))) {
      results.push({ script, ok: false, status: 127, note: 'missing' });
      continue;
    }
    results.push(runNode(script, args, 90000));
  }
  return {
    ok: results.every((r) => r.ok),
    results: results.map((r) => ({
      script: r.script,
      ok: r.ok,
      status: r.status,
      signal: r.signal,
      note: r.note,
      tail: ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join(' | '),
    })),
  };
}

function linearDoctor() {
  return runNode('tools/linear-agent-bridge.js', ['--doctor', '--json'], 60000);
}

function linearCoord() {
  return runNode('tools/linear-agent-bridge.js', ['--coord-status', '--json'], 90000);
}

function scrubSafe({ apply }) {
  const args = ['--scrub-stale', '--safe-only', '--json'];
  if (apply) args.push('--apply');
  return runNode('tools/linear-agent-bridge.js', args, 180000);
}

function obsidianSync() {
  const script = 'tools/obsidian-linear-sync.js';
  if (!fs.existsSync(path.join(REPO, script))) {
    return { ok: true, skipped: true };
  }
  return runNode(script, [], 120000);
}

function writeHealth(report) {
  try {
    fs.mkdirSync(path.dirname(HEALTH_PATH), { recursive: true });
    fs.writeFileSync(HEALTH_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
    return HEALTH_PATH;
  } catch (e) {
    return null;
  }
}

function buildReport(mode, parts) {
  const report = {
    ok: true,
    mode,
    ts: new Date().toISOString(),
    repo: REPO,
    ...parts,
  };
  // Aggregate ok
  const flags = [
    parts.preflight?.ok,
    parts.doctor?.ok !== false ? parts.doctor?.parsed?.ok !== false : true,
    parts.scrub?.ok !== false,
  ].filter((x) => x !== undefined);
  if (parts.preflight && !parts.preflight.ok) report.ok = false;
  if (parts.doctor?.parsed && parts.doctor.parsed.ok === false) report.ok = false;
  if (parts.scrub?.applyFailed) report.ok = false;
  report.healthPath = writeHealth(report);
  return report;
}

function printHuman(report) {
  console.log(`\n=== coord-automate (${report.mode}) ok=${report.ok} ===`);
  console.log(`ts: ${report.ts}`);
  if (report.preflight) {
    console.log(`preflight: ${report.preflight.ok ? 'PASS' : 'FAIL'}`);
    for (const r of report.preflight.results || []) {
      if (!r.ok) console.log(`  FAIL ${r.script} exit=${r.status} ${r.tail || ''}`);
    }
  }
  if (report.doctor?.parsed) {
    const d = report.doctor.parsed;
    console.log(
      `linear doctor: ok=${d.ok} teams=${(d.teamKeys || []).join(',') || 'n/a'} open=${d.openIssueCount ?? 'n/a'}`,
    );
  } else if (report.doctor && !report.doctor.ok) {
    console.log(`linear doctor: offline/fail exit=${report.doctor.status}`);
  }
  if (report.coord?.parsed) {
    const c = report.coord.parsed;
    console.log(
      `locks: agent-locked=${c.agentLockedCount} in-progress=${c.inProgressCount} ghosts=${(c.ghosts || []).length}`,
    );
  }
  if (report.scrub?.parsed) {
    const s = report.scrub.parsed;
    console.log(
      `scrub-safe: candidates=${s.candidateCount} apply=${s.apply} results=${(s.results || []).length}`,
    );
    for (const r of s.results || []) {
      console.log(`  scrub ${r.error ? 'FAIL' : 'OK'} ${r.id} stripped=${r.stripped} (${r.reason})`);
    }
  }
  if (report.obsidian) {
    console.log(`obsidian sync: ${report.obsidian.ok || report.obsidian.skipped ? 'ok' : 'fail'}`);
  }
  if (report.launchAgent) {
    console.log(
      `LaunchAgent ${report.launchAgent.label}: loaded=${report.launchAgent.loaded} wrote=${report.launchAgent.wrote || false}`,
    );
  }
  if (report.healthPath) console.log(`health: ${report.healthPath}`);
  console.log('\nCommands: node tools/coord-automate.js [--quick|--daemon|--ci]');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`coord-automate — smart multi-agent coord automation

Usage:
  node tools/coord-automate.js           full heal + preflight + safe scrub apply
  node tools/coord-automate.js --quick   session-start (no apply, no LaunchAgent rewrite)
  node tools/coord-automate.js --daemon  LaunchAgent (obsidian + safe scrub apply + light preflight)
  node tools/coord-automate.js --ci      offline preflight only
  node tools/coord-automate.js --no-apply
  node tools/coord-automate.js --json
`);
    return;
  }

  const mode = args.ci ? 'ci' : args.daemon ? 'daemon' : args.quick ? 'quick' : 'full';
  const parts = {};

  // --- CI: offline only ---
  if (mode === 'ci') {
    parts.preflight = offlinePreflight();
    const report = buildReport(mode, parts);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  // --- Quick / full / daemon share pieces ---
  if (mode === 'daemon') {
    parts.obsidian = obsidianSync();
    // Daemon: offline preflight is heavy every 15m — run workflow-preflight only
    const light = runNode('tools/workflow-preflight.js', [], 90000);
    parts.preflight = {
      ok: light.ok,
      results: [{ script: 'tools/workflow-preflight.js', ok: light.ok, status: light.status }],
    };
  } else {
    parts.preflight = offlinePreflight();
  }

  // Linear (optional if no key)
  const doctorR = linearDoctor();
  parts.doctor = {
    ok: doctorR.ok,
    status: doctorR.status,
    parsed: parseJsonOut(doctorR),
  };

  if (parts.doctor.parsed?.ok) {
    const coordR = linearCoord();
    parts.coord = {
      ok: coordR.ok,
      status: coordR.status,
      parsed: parseJsonOut(coordR),
    };

    const doApply =
      !args.noApply && (mode === 'full' || mode === 'daemon');
    // quick = dry-run only; full/daemon = safe apply
    const scrubR = scrubSafe({ apply: doApply });
    const scrubParsed = parseJsonOut(scrubR);
    parts.scrub = {
      ok: scrubR.ok,
      status: scrubR.status,
      parsed: scrubParsed,
      applyFailed: doApply && scrubParsed?.results?.some((r) => r.error),
    };

    if (mode === 'daemon' || mode === 'full') {
      parts.obsidian = parts.obsidian || obsidianSync();
    }
  }

  if (mode === 'full') {
    parts.launchAgent = ensureLaunchAgent();
  } else {
    parts.launchAgent = launchAgentStatus();
  }

  const report = buildReport(mode, parts);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = {
  offlinePreflight,
  ensureLaunchAgent,
  launchAgentStatus,
  SAFE_HEALTH_PATH: HEALTH_PATH,
};
