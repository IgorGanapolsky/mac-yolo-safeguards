#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(DEFAULT_REPO, 'artifacts', 'agent-sync');
const DEFAULT_OBSIDIAN_NOTE = path.join('AI Agents', 'Hermes Agent Sync.md');

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\b(xox[baprs]-[A-Za-z0-9-]{20,})\b/g,
  /\b([A-Z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*=)([^\s"'`]+)/gi,
];

function usage() {
  return `Usage:
  node tools/agent-sync-brief.js [--json] [--repo PATH] [--out-dir PATH]
  node tools/agent-sync-brief.js --vault /path/to/ObsidianVault

Writes a source-backed Markdown+JSON packet for Codex, Claude, Cursor, Gemini,
Hermes, Obsidian AI Agent, and other local agents. Generated artifacts default
to artifacts/agent-sync/, which is gitignored.`;
}

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    outDir: DEFAULT_OUT_DIR,
    vault: null,
    notePath: DEFAULT_OBSIDIAN_NOTE,
    json: false,
    stdout: false,
    noWrite: false,
    skipLaunchctl: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--out-dir') args.outDir = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--vault') args.vault = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--note-path') args.notePath = requireValue(argv, ++i, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--stdout') args.stdout = true;
    else if (arg === '--no-write') args.noWrite = true;
    else if (arg === '--skip-launchctl') args.skipLaunchctl = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix) => {
      if (typeof prefix === 'string' && prefix.endsWith('=')) return `${prefix}[REDACTED]`;
      return '[REDACTED]';
    });
  }
  return text;
}

function readFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function statSource(filePath, label) {
  if (!fs.existsSync(filePath)) return { label, path: filePath, exists: false };
  const stat = fs.statSync(filePath);
  return {
    label,
    path: filePath,
    exists: true,
    sizeBytes: stat.size,
    mtime: stat.mtime.toISOString(),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || DEFAULT_REPO,
    encoding: 'utf8',
    timeout: options.timeout || 5000,
    shell: false,
  });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    signal: result.signal || null,
    stdout: redact((result.stdout || '').trim()),
    stderr: redact((result.stderr || '').trim()),
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
  };
}

function parsePlanTasks(planText) {
  const tasks = [];
  for (const line of planText.split('\n')) {
    if (!/^\| T-\d+/.test(line)) continue;
    const columns = line.split('|').map((part) => part.trim()).filter(Boolean);
    if (columns.length < 6) continue;
    tasks.push({
      id: columns[0],
      task: columns[1],
      status: columns[2],
      owner: columns[3],
      files: columns[4],
      acceptanceCheck: columns[5],
    });
  }
  return tasks;
}

function parseFileLocks(planText) {
  const locks = [];
  for (const line of planText.split('\n')) {
    if (!line.startsWith('- `') || !line.includes('→')) continue;
    const released = /\breleased\b/i.test(line);
    const free = /\(free\)/i.test(line);
    locks.push({
      raw: redact(line.replace(/^-\s*/, '').trim()),
      active: !released && !free,
    });
  }
  return locks;
}

function parseRecentDecisions(planText, limit = 8) {
  const decisions = planText
    .split('\n')
    .filter((line) => /^- 20\d\d-\d\d-\d\d /.test(line))
    .map((line) => redact(line.replace(/^-\s*/, '').trim()));
  return decisions.slice(Math.max(0, decisions.length - limit));
}

function readPlan(repo) {
  const planPath = path.join(repo, 'plan.md');
  const planText = readFileIfExists(planPath) || '';
  return {
    path: planPath,
    exists: Boolean(planText),
    tasks: planText ? parsePlanTasks(planText) : [],
    activeTasks: planText ? parsePlanTasks(planText).filter((task) => task.status === 'in_progress' || task.status === 'blocked') : [],
    fileLocks: planText ? parseFileLocks(planText) : [],
    activeLocks: planText ? parseFileLocks(planText).filter((lock) => lock.active) : [],
    recentDecisions: planText ? parseRecentDecisions(planText) : [],
  };
}

function collectGit(repo) {
  const branch = run('git', ['branch', '--show-current'], { cwd: repo, timeout: 3000 });
  const head = run('git', ['rev-parse', '--short', 'HEAD'], { cwd: repo, timeout: 3000 });
  const status = run('git', ['status', '--porcelain'], { cwd: repo, timeout: 5000 });
  const aheadBehind = run('git', ['status', '--short', '--branch'], { cwd: repo, timeout: 5000 });
  const dirtyLines = status.stdout ? status.stdout.split('\n').filter(Boolean) : [];
  return {
    branch: branch.ok ? branch.stdout : null,
    head: head.ok ? head.stdout : null,
    dirtyCount: dirtyLines.length,
    dirtyFiles: dirtyLines.slice(0, 40),
    dirtyFilesTruncated: dirtyLines.length > 40,
    branchStatus: aheadBehind.stdout || aheadBehind.stderr,
  };
}

function readLatestE2e(repo) {
  const latestPath = path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
  if (!fs.existsSync(latestPath)) return { exists: false, path: latestPath };
  try {
    const parsed = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    return {
      exists: true,
      path: latestPath,
      e2e: parsed.e2e || parsed.status || null,
      unit: parsed.unit || null,
      checkedAt: parsed.checkedAt || parsed.timestamp || null,
      rawKeys: Object.keys(parsed).sort(),
    };
  } catch (error) {
    return { exists: true, path: latestPath, parseError: error.message };
  }
}

function collectLaunchAgents(skipLaunchctl) {
  if (skipLaunchctl) return { skipped: true, reason: 'skip-launchctl' };
  if (typeof process.getuid !== 'function') return { skipped: true, reason: 'no-getuid' };
  const uid = String(process.getuid());
  const labels = ['com.igor.shutdown-simulators', 'com.igor.hermes-mobile-continuous-e2e'];
  const agents = {};
  for (const label of labels) {
    const result = run('launchctl', ['print', `gui/${uid}/${label}`], { cwd: DEFAULT_REPO, timeout: 3000 });
    const output = `${result.stdout}\n${result.stderr}`;
    agents[label] = {
      ok: result.ok,
      state: output.match(/\bstate = ([^\n]+)/)?.[1]?.trim() || null,
      lastExitStatus: output.match(/\blast exit code = ([^\n]+)/)?.[1]?.trim() || null,
      command: result.command,
    };
  }
  return agents;
}

function buildBrief(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const now = new Date().toISOString();
  const plan = readPlan(repo);
  const git = collectGit(repo);
  const latestE2e = readLatestE2e(repo);
  const launchAgents = collectLaunchAgents(Boolean(options.skipLaunchctl));
  const sources = [
    statSource(path.join(repo, 'AGENTS.md'), 'agent directives'),
    statSource(path.join(repo, 'plan.md'), 'coordination board'),
    statSource(path.join(repo, 'OBSIDIAN.md'), 'obsidian index'),
    statSource(latestE2e.path, 'continuous e2e latest'),
  ];

  const blockers = [];
  for (const task of plan.activeTasks.filter((task) => task.status === 'blocked')) {
    blockers.push(`${task.id}: ${task.task}`);
  }
  if (git.dirtyCount > 0) blockers.push(`dirty worktree has ${git.dirtyCount} entries; do not overwrite unowned work`);
  if (latestE2e.exists && latestE2e.e2e && latestE2e.e2e !== 'pass') blockers.push(`continuous E2E is ${latestE2e.e2e}`);

  return JSON.parse(redact({
    schema: 'hermes-agent-sync-brief/v1',
    generatedAt: now,
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cwd: repo,
    },
    git,
    plan,
    protectedState: {
      latestE2e,
      launchAgents,
    },
    syncContract: {
      writeBoundary: 'Agents must claim files in plan.md before editing and must not overwrite unowned dirty files.',
      obsidianBoundary: 'Obsidian AI Agent should read this note and AGENTS.md before proposing or editing repo work.',
      evidenceBoundary: 'Claims require source paths, command output, or latest proof artifacts in the same report.',
      stopGates: [
        'blocked plan task',
        'active file lock owned by another agent',
        'dirty unowned file in target path',
        'missing verification for fixed/shipped language',
      ],
    },
    blockers,
    sources,
  }));
}

function markdownList(items, emptyText) {
  if (!items || items.length === 0) return `- ${emptyText}`;
  return items.map((item) => `- ${item}`).join('\n');
}

function renderMarkdown(brief) {
  const activeTasks = brief.plan.activeTasks.map((task) => `${task.id} [${task.status}] ${task.owner}: ${task.task} (${task.files})`);
  const activeLocks = brief.plan.activeLocks.map((lock) => lock.raw);
  const dirtyFiles = brief.git.dirtyFiles.map((line) => `\`${line}\``);
  const decisions = brief.plan.recentDecisions.map((line) => line);
  const sources = brief.sources.map((source) => {
    if (!source.exists) return `${source.label}: missing (${source.path})`;
    return `${source.label}: ${source.path} (${source.sizeBytes} bytes, mtime ${source.mtime})`;
  });

  return redact(`# Hermes Agent Sync

Generated: ${brief.generatedAt}
Machine: ${brief.machine.hostname} (${brief.machine.platform}/${brief.machine.arch})
Repo: ${brief.machine.cwd}
Git: ${brief.git.branch || 'unknown'} @ ${brief.git.head || 'unknown'}

## Read First

- Read AGENTS.md and plan.md before editing.
- Claim target files in plan.md before touching code.
- Do not overwrite another agent's active lock or uncommitted work.
- Treat this note as a sync packet, not as proof of external sends, payments, CI pass, or revenue.

## Current Blockers

${markdownList(brief.blockers, 'No blockers detected by this bounded packet.')}

## Active Tasks

${markdownList(activeTasks, 'No in_progress or blocked tasks in plan.md.')}

## Active File Locks

${markdownList(activeLocks, 'No active file locks parsed from plan.md.')}

## Dirty Worktree

Dirty entries: ${brief.git.dirtyCount}

${markdownList(dirtyFiles, 'No dirty files reported by git status --porcelain.')}

${brief.git.dirtyFilesTruncated ? '\nAdditional dirty entries were truncated; run git status --short before editing.\n' : ''}

## Protected State

- Continuous E2E latest: ${brief.protectedState.latestE2e.exists ? `${brief.protectedState.latestE2e.e2e || 'unknown'} (${brief.protectedState.latestE2e.path})` : `missing (${brief.protectedState.latestE2e.path})`}
- Simulator guard LaunchAgent: ${brief.protectedState.launchAgents['com.igor.shutdown-simulators'] ? brief.protectedState.launchAgents['com.igor.shutdown-simulators'].state || 'unknown' : 'not checked'}
- Hermes continuous E2E LaunchAgent: ${brief.protectedState.launchAgents['com.igor.hermes-mobile-continuous-e2e'] ? brief.protectedState.launchAgents['com.igor.hermes-mobile-continuous-e2e'].state || 'unknown' : 'not checked'}

## Recent Decisions

${markdownList(decisions, 'No recent decisions parsed from plan.md.')}

## Sync Contract

- ${brief.syncContract.writeBoundary}
- ${brief.syncContract.obsidianBoundary}
- ${brief.syncContract.evidenceBoundary}

Stop gates:
${markdownList(brief.syncContract.stopGates, 'No stop gates configured.')}

## Sources

${markdownList(sources, 'No sources recorded.')}
`);
}

function writeOutputs(brief, args) {
  const markdown = renderMarkdown(brief);
  const jsonText = `${JSON.stringify(brief, null, 2)}\n`;
  const writes = [];

  if (!args.noWrite) {
    fs.mkdirSync(args.outDir, { recursive: true });
    const mdPath = path.join(args.outDir, 'Hermes-Agent-Sync.md');
    const jsonPath = path.join(args.outDir, 'Hermes-Agent-Sync.json');
    fs.writeFileSync(mdPath, markdown);
    fs.writeFileSync(jsonPath, jsonText);
    writes.push(mdPath, jsonPath);

    if (args.vault) {
      const vaultMdPath = path.join(args.vault, args.notePath);
      const vaultJsonPath = vaultMdPath.replace(/\.md$/i, '.json');
      fs.mkdirSync(path.dirname(vaultMdPath), { recursive: true });
      fs.writeFileSync(vaultMdPath, markdown);
      fs.writeFileSync(vaultJsonPath, jsonText);
      writes.push(vaultMdPath, vaultJsonPath);
    }
  }

  return { markdown, jsonText, writes };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const brief = buildBrief(args);
  const outputs = writeOutputs(brief, args);

  if (args.json) {
    console.log(outputs.jsonText.trim());
  } else if (args.stdout || args.noWrite) {
    console.log(outputs.markdown);
  } else {
    console.log(`Wrote ${outputs.writes.length} sync artifacts:`);
    for (const filePath of outputs.writes) console.log(`- ${filePath}`);
    console.log(`Dirty entries observed: ${brief.git.dirtyCount}`);
    console.log(`Active tasks observed: ${brief.plan.activeTasks.length}`);
  }
}

module.exports = {
  buildBrief,
  collectGit,
  parseArgs,
  parseFileLocks,
  parsePlanTasks,
  redact,
  renderMarkdown,
  writeOutputs,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
