#!/usr/bin/env node
'use strict';

/**
 * One-shot multi-agent coordination setup for Linear + AI-Agent-Sync vault.
 *
 *   node tools/coord-setup.js              # ensure dirs + templates + doctor
 *   node tools/coord-setup.js --json
 *   node tools/coord-setup.js --install-launchagent
 *   node tools/coord-setup.js --scrub-dry
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const VAULT =
  process.env.AI_AGENT_SYNC_VAULT ||
  path.join(os.homedir(), 'Documents', 'AI-Agent-Sync');

const AGENTS = [
  'grok',
  'claude-code',
  'codex',
  'cursor',
  'Hermes',
  'antigravity',
  'gemini',
  'herdr',
];

const REQUIRED_DIRS = [
  'Agent-State',
  'Handoffs',
  'Handoffs/linear-claims',
  'Agent-Jobs',
  'Projects/mac-yolo-safeguards',
  'Projects/mac-yolo-safeguards/Issues',
];

function agentStateTemplate(agent) {
  const day = new Date().toISOString().slice(0, 10);
  return `---
type: agent-state
tags:
  - state
  - ${agent}
agent: ${agent}
status: idle
last_verified: ${day}
external_action_allowed: true
---

# ${agent}

Live agent state for multi-agent coordination (Linear + vault).

## In flight
(none — free)

## Protocol
1. \`node tools/linear-agent-bridge.js --coord-status\`
2. Claim before multi-file work: \`--claim ID --agent ${agent} --files …\`
3. Mirror files here under **In flight**
4. Megafiles still need \`plan.md\` ownership
5. Finish: \`--done ID --agent ${agent} --comment "<sha/proof>"\` (strips agent-lock labels)

## Do not
- Treat Obsidian Linear plugin as a lock
- Edit files another agent listed under In flight without a handoff
`;
}

function ensureVault() {
  const created = [];
  for (const rel of REQUIRED_DIRS) {
    const p = path.join(VAULT, rel);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created.push(rel);
    }
  }
  const stateCreated = [];
  const stateDir = path.join(VAULT, 'Agent-State');
  for (const agent of AGENTS) {
    const f = path.join(stateDir, `${agent}.md`);
    if (!fs.existsSync(f)) {
      fs.writeFileSync(f, agentStateTemplate(agent), 'utf8');
      stateCreated.push(agent);
    } else {
      // Ensure ## In flight exists
      let text = fs.readFileSync(f, 'utf8');
      if (!/## In flight/i.test(text)) {
        text = text.trimEnd() + '\n\n## In flight\n(none — free)\n';
        fs.writeFileSync(f, text, 'utf8');
        stateCreated.push(`${agent}:+inflight`);
      }
    }
  }

  // Protocol pointer in vault
  const protocolPath = path.join(VAULT, 'Agent-State', 'COORD-PROTOCOL.md');
  const protocol = `# Multi-agent coordination protocol (Aug 2026)

**SSOT layers**

| Layer | System | Job |
|-------|--------|-----|
| Task bus | Linear (\`linear.app/igorganapolsky/agent\`) | Who owns which **issue** |
| File/WIP bus | This vault (\`Agent-State/\`, \`Handoffs/linear-claims/\`) | Who is mid-flight on which **files** |
| Megafiles | repo \`plan.md\` | Serialize hot files |
| Code | git worktrees + PRs | Product truth |

**Session start (every agent)**

\`\`\`bash
node tools/linear-agent-bridge.js --coord-status
node tools/coord-setup.js   # optional: ensure templates
\`\`\`

**Claim → work → done**

\`\`\`bash
node tools/linear-agent-bridge.js --claim AGENT-N --agent <you> --files path/a,path/b
# … work in isolated worktree …
node tools/linear-agent-bridge.js --done AGENT-N --agent <you> --comment "merged <sha>"
\`\`\`

**Hygiene**

\`\`\`bash
node tools/linear-agent-bridge.js --scrub-stale          # dry-run
node tools/linear-agent-bridge.js --scrub-stale --apply  # strip stale locks
node tools/obsidian-linear-sync.js                       # human dashboard only
\`\`\`

**Anti-patterns**

- Obsidian Linear community plugin as a lock
- Leaving \`agent-lock\` labels after Done
- Shared working tree for two agents (use git worktrees)
- plan.md skipped for megafiles

Repo doc: \`docs/agents/linear-obsidian-coordination.md\`
Research: \`docs/RESEARCH-LINEAR-OBSIDIAN-MULTIAGENT-AUG-2026.md\`
`;
  fs.writeFileSync(protocolPath, protocol, 'utf8');

  return { created, stateCreated, protocolPath, vault: VAULT };
}

function runNode(script, args = [], timeout = 60000) {
  return spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout,
    env: process.env,
  });
}

function installLaunchAgent() {
  const label = 'com.igor.agent-fleet-orchestrator';
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const nodeBin =
    fs.existsSync('/opt/homebrew/bin/node')
      ? '/opt/homebrew/bin/node'
      : fs.existsSync('/usr/local/bin/node')
        ? '/usr/local/bin/node'
        : process.execPath;
  const loop = path.join(REPO, 'tools', 'fleet-autonomous-loop.js');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${loop}</string>
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
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, body, 'utf8');
  spawnSync('launchctl', ['unload', plistPath], { encoding: 'utf8' });
  const load = spawnSync('launchctl', ['load', plistPath], { encoding: 'utf8' });
  return {
    plistPath,
    loadOk: load.status === 0,
    stderr: (load.stderr || '').trim(),
  };
}

function launchAgentHealth() {
  const label = 'com.igor.agent-fleet-orchestrator';
  const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const list = spawnSync('launchctl', ['list'], { encoding: 'utf8' });
  const loaded = (list.stdout || '').includes(label);
  return { label, plistExists: fs.existsSync(plist), loaded };
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = args.includes('--json');
  const report = {
    ok: true,
    vault: ensureVault(),
    launchAgent: launchAgentHealth(),
    doctor: null,
    coordStatus: null,
    scrub: null,
  };

  const doctor = runNode('tools/linear-agent-bridge.js', ['--doctor', '--json']);
  try {
    report.doctor = JSON.parse(doctor.stdout || '{}');
  } catch {
    report.doctor = { raw: (doctor.stdout || doctor.stderr || '').slice(0, 500) };
  }

  const coord = runNode('tools/linear-agent-bridge.js', ['--coord-status', '--json']);
  try {
    report.coordStatus = JSON.parse(coord.stdout || '{}');
  } catch {
    report.coordStatus = { raw: (coord.stdout || '').slice(0, 500) };
  }

  if (args.includes('--scrub-dry') || args.includes('--scrub')) {
    const scrubArgs = ['--scrub-stale', '--json'];
    if (args.includes('--apply')) scrubArgs.push('--apply');
    const scrub = runNode('tools/linear-agent-bridge.js', scrubArgs, 120000);
    try {
      report.scrub = JSON.parse(scrub.stdout || '{}');
    } catch {
      report.scrub = { raw: (scrub.stdout || scrub.stderr || '').slice(0, 800) };
    }
  }

  if (args.includes('--install-launchagent')) {
    report.install = installLaunchAgent();
    report.launchAgent = launchAgentHealth();
  }

  if (args.includes('--sync-obsidian')) {
    const sync = runNode('tools/obsidian-linear-sync.js', [], 120000);
    report.obsidianSync = {
      status: sync.status,
      out: ((sync.stdout || '') + (sync.stderr || '')).slice(0, 800),
    };
  }

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n=== Multi-agent coord setup (Aug 2026) ===');
  console.log(`vault: ${report.vault.vault}`);
  console.log(`dirs created: ${report.vault.created.length ? report.vault.created.join(', ') : '(none)'}`);
  console.log(
    `agent-state ensured: ${report.vault.stateCreated.length ? report.vault.stateCreated.join(', ') : '(ok)'}`,
  );
  console.log(`protocol: ${report.vault.protocolPath}`);
  console.log(
    `LaunchAgent ${report.launchAgent.label}: plist=${report.launchAgent.plistExists} loaded=${report.launchAgent.loaded}`,
  );
  if (report.doctor) {
    console.log(
      `Linear doctor: ok=${report.doctor.ok} teams=${(report.doctor.teamKeys || []).join(',') || 'n/a'} open=${report.doctor.openIssueCount ?? 'n/a'}`,
    );
  }
  if (report.coordStatus?.agentLockedCount != null) {
    console.log(
      `Locks: agent-locked=${report.coordStatus.agentLockedCount} in-progress=${report.coordStatus.inProgressCount} ghosts=${(report.coordStatus.ghosts || []).length}`,
    );
  }
  if (report.scrub) {
    console.log(`Scrub candidates: ${report.scrub.candidateCount ?? '?'}`);
  }
  if (report.install) {
    console.log(`Install LaunchAgent: ok=${report.install.loadOk} ${report.install.plistPath}`);
  }
  console.log('\nNext:');
  console.log('  node tools/linear-agent-bridge.js --coord-status');
  console.log('  node tools/linear-agent-bridge.js --scrub-stale');
  console.log('  node tools/workflow-preflight.js');
  console.log('  node tools/coord-setup.js --sync-obsidian');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
