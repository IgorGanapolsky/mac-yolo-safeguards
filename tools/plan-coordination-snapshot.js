#!/usr/bin/env node
'use strict';

/**
 * plan-coordination-snapshot.js — Parse plan.md for multi-agent sync at session start.
 *
 * Used by Cursor, Claude Code, Obsidian AI Agent (via OBSIDIAN.md), Hermes, etc.
 *
 * Usage:
 *   node tools/plan-coordination-snapshot.js [--json] [--plan /path/to/plan.md]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');

function parseArgs(argv) {
  const args = { json: false, planPath: DEFAULT_PLAN, command: 'snapshot', owner: null, stdin: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'check-staged-ownership' || arg === 'check-ownership') args.command = arg;
    else if (arg === '--json') args.json = true;
    else if (arg === '--owner') {
      args.owner = argv[i + 1]?.trim() || null;
      i += 1;
    } else if (arg === '--stdin') args.stdin = true;
    else if (arg === '--plan') {
      args.planPath = path.resolve(argv[i + 1] || '');
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseMeta(text) {
  const updated = text.match(/^- Updated:\s*(.+)$/m)?.[1]?.trim() || null;
  const activeAgents = text.match(/^- Active agents[^:]*:\s*(.+)$/m)?.[1]?.trim() || null;
  const activeBranch = text.match(/^- Active branch of record:\s*(.+)$/m)?.[1]?.trim() || null;
  return { updated, activeAgents, activeBranch };
}

/** Match numeric (T-1) and named (T-LEASH-LAZY-SPINNER, T-TINKER-…-20260721) task ids. */
const TASK_ROW_RE = /^\| T-[A-Za-z0-9][-A-Za-z0-9]*/;

function parseClaimedFiles(filesCell) {
  if (!filesCell) return [];
  return [...String(filesCell).matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

function parseActiveTasks(text) {
  const tasks = [];
  for (const line of text.split('\n')) {
    if (!TASK_ROW_RE.test(line)) continue;
    const cols = line.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    const [id, task, status, owner] = cols;
    if (status !== 'in_progress' && status !== 'blocked') continue;
    const files = cols[4] || '';
    tasks.push({
      id,
      task,
      status,
      owner,
      files,
      claimedFiles: parseClaimedFiles(files),
    });
  }
  return tasks;
}

function parseFileLocks(text) {
  const locks = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('- `')) continue;
    if (line.includes('(free)') || /released/i.test(line)) continue;
    if (!line.includes('→')) continue;
    locks.push(line.replace(/^-\s*/, '').trim());
  }
  return locks;
}

function parseOwnershipLocks(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('- `') && line.includes('→') && !line.includes('(free)') && !/released/i.test(line))
    .map((line) => ({
      owner: line.match(/→\s*\*\*([^*]+)\*\*/)?.[1]?.trim() || null,
      files: [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean),
    }))
    .filter((lock) => lock.owner && lock.files.length > 0);
}

function isClaimedPath(file, claim) {
  return file === claim || file.startsWith(`${claim.replace(/\/+$/, '')}/`);
}

function validateOwnership({ planText, files, owner, requireOwner }) {
  const locks = parseOwnershipLocks(planText);
  const violations = [];
  for (const file of files.filter((candidate) => candidate.startsWith('hermes-mobile/'))) {
    const matches = locks.filter((lock) => lock.files.some((claim) => isClaimedPath(file, claim)));
    if (matches.length === 0) {
      violations.push(`${file}: no active plan.md §2 claim`);
      continue;
    }
    if (requireOwner && !owner) {
      violations.push(`${file}: PLAN_AGENT_ID (or --owner) is required`);
      continue;
    }
    if (requireOwner && !matches.some((lock) => lock.owner === owner)) {
      violations.push(`${file}: claimed by ${matches.map((lock) => lock.owner).join(', ')}, not ${owner}`);
    }
  }
  return violations;
}

function stagedFiles() {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    cwd: REPO,
    encoding: 'utf8',
  })
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean);
}

function snapshotPlan(planPath = DEFAULT_PLAN) {
  if (!fs.existsSync(planPath)) {
    return { ok: false, error: `plan not found: ${planPath}`, planPath };
  }

  const text = fs.readFileSync(planPath, 'utf8');
  const meta = parseMeta(text);
  const activeTasks = parseActiveTasks(text);
  const fileLocks = parseFileLocks(text);

  return {
    ok: true,
    planPath,
    checkedAt: new Date().toISOString(),
    meta,
    activeTasks,
    fileLocks,
    obsidianIndex: path.join(REPO, 'OBSIDIAN.md'),
    coordinationDocs: ['plan.md', 'AGENTS.md', 'OBSIDIAN.md'],
  };
}

function formatHuman(snapshot) {
  const lines = ['=== Multi-agent coordination (plan.md) ==='];
  if (!snapshot.ok) {
    lines.push(`ERROR: ${snapshot.error}`);
    return lines.join('\n');
  }
  if (snapshot.meta.updated) lines.push(`Last plan update: ${snapshot.meta.updated}`);
  if (snapshot.meta.activeBranch) lines.push(`Branch of record: ${snapshot.meta.activeBranch}`);
  if (snapshot.meta.activeAgents) lines.push(`Registered agents: ${snapshot.meta.activeAgents}`);

  if (snapshot.activeTasks.length === 0) {
    lines.push('Active tasks: none (in_progress/blocked)');
  } else {
    const maxShow = 12;
    lines.push(`Active tasks (${snapshot.activeTasks.length}):`);
    for (const task of snapshot.activeTasks.slice(0, maxShow)) {
      lines.push(`  ${task.id} [${task.status}] ${task.owner}: ${task.task}`);
    }
    if (snapshot.activeTasks.length > maxShow) {
      lines.push(
        `  … +${snapshot.activeTasks.length - maxShow} more (run node tools/agent-swarm-harness.js --json)`,
      );
    }
  }

  if (snapshot.fileLocks.length === 0) {
    lines.push('File locks: none');
  } else {
    lines.push(`File locks (${snapshot.fileLocks.length}):`);
    for (const lock of snapshot.fileLocks.slice(0, 8)) {
      lines.push(`  ${lock}`);
    }
    if (snapshot.fileLocks.length > 8) {
      lines.push(`  … +${snapshot.fileLocks.length - 8} more (read plan.md §2)`);
    }
  }

  lines.push('Obsidian agents: read OBSIDIAN.md then claim in plan.md before editing.');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/plan-coordination-snapshot.js [--json] [--plan path] | check-staged-ownership [--owner id] | check-ownership --stdin [--owner id]');
    process.exit(0);
  }
  if (args.command === 'check-staged-ownership' || args.command === 'check-ownership') {
    const planText = fs.readFileSync(args.planPath, 'utf8');
    const files = args.command === 'check-staged-ownership'
      ? stagedFiles()
      : (args.stdin ? fs.readFileSync(0, 'utf8').split('\n').map((file) => file.trim()).filter(Boolean) : []);
    const owner = args.owner || process.env.PLAN_AGENT_ID || process.env.AGENT_ID || null;
    const violations = validateOwnership({
      planText,
      files,
      owner,
      requireOwner: args.command === 'check-staged-ownership',
    });
    if (violations.length > 0) {
      console.error('✗ plan.md staged ownership gate failed:');
      violations.forEach((violation) => console.error(`  - ${violation}`));
      process.exit(1);
    }
    console.log(`✓ plan.md ownership gate passed (${files.filter((file) => file.startsWith('hermes-mobile/')).length} Hermes Mobile file(s))`);
    process.exit(0);
  }

  const snapshot = snapshotPlan(args.planPath);
  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    process.exit(snapshot.ok ? 0 : 1);
  }

  console.log(formatHuman(snapshot));
  process.exit(snapshot.ok ? 0 : 1);
}

module.exports = {
  snapshotPlan,
  parseActiveTasks,
  parseClaimedFiles,
  parseFileLocks,
  parseOwnershipLocks,
  validateOwnership,
  parseMeta,
  formatHuman,
  TASK_ROW_RE,
  isClaimedPath,
};

if (require.main === module) {
  main();
}
