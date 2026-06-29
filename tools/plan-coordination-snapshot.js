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

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');

function parseArgs(argv) {
  const args = { json: false, planPath: DEFAULT_PLAN };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
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

function parseActiveTasks(text) {
  const tasks = [];
  for (const line of text.split('\n')) {
    if (!/^\| T-\d+/.test(line)) continue;
    const cols = line.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cols.length < 4) continue;
    const [id, task, status, owner] = cols;
    if (status !== 'in_progress' && status !== 'blocked') continue;
    tasks.push({
      id,
      task,
      status,
      owner,
      files: cols[4] || '',
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
    lines.push('Active tasks:');
    for (const task of snapshot.activeTasks) {
      lines.push(`  ${task.id} [${task.status}] ${task.owner}: ${task.task}`);
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
    console.log('Usage: node tools/plan-coordination-snapshot.js [--json] [--plan path]');
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

module.exports = { snapshotPlan, parseActiveTasks, parseFileLocks, parseMeta, formatHuman };

if (require.main === module) {
  main();
}
