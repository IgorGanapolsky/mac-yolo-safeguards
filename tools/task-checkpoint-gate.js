#!/usr/bin/env node
'use strict';

/**
 * task-checkpoint-gate.js — checkpoint-gate for async agent decisions.
 *
 * Based on TheNewStack article "Codex can now keep coding while it waits for your answer":
 * The article notes a key risk: "Codex could begin implementing SQLite just before
 * the developer replies with PostgreSQL." There is "no checkpoint preventing the agent
 * from moving past the decision" and Codex "won't automatically undo work that
 * conflicts with whatever the developer eventually says."
 *
 * This tool provides that missing checkpoint layer for our agent harness:
 *
 * 1. CHECKPOINT — Before starting work that depends on a pending question,
 *    the agent snapshots file state (git diff hash + mtimes for scoped paths).
 *    The agent then continues working on the dependent branch, knowing it
 *    can detect and potentially roll back if the answer invalidates its assumptions.
 *
 * 2. STEER — When a developer reply arrives, the agent calls `steer` which
 *    compares current state against the checkpoint: files changed that are
 *    relevant to the decision are listed, with staleness assessment.
 *
 * 3. ROLLBACK — Lists files changed past the checkpoint that are relevant
 *    to the pending decision, so the agent knows what might need undoing.
 *
 * Usage:
 *   node tools/task-checkpoint-gate.js checkpoint --id msg_abc123 --paths "lib/,apps/api/"
 *   node tools/task-checkpoint-gate.js steer --id msg_abc123 --answer "use postgres"
 *   node tools/task-checkpoint-gate.js rollback --id msg_abc123
 *   node tools/task-checkpoint-gate.js checkpoints --json
 *
 * Integrates with async-agent-messaging.js: the --id should match the
 * message id from `async-agent-messaging.js ask`.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const CHECKPOINT_FILE = path.join(STORAGE_DIR, 'task-checkpoints.jsonl');
const REPO = getRepoRoot();

function getRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return process.cwd();
  }
}

function ensureDir() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function appendJsonl(file, entry) {
  ensureDir();
  const line = JSON.stringify(entry, null, 0);
  fs.appendFileSync(file, line + '\n');
}

function resolvePaths(patterns) {
  const files = [];
  for (const pattern of patterns) {
    const full = path.resolve(REPO, pattern);
    if (fs.existsSync(full)) {
      if (fs.statSync(full).isDirectory()) {
        walk(full, files);
      } else {
        files.push(full);
      }
    }
  }
  return files;
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    if (['node_modules', 'dist', 'build', 'coverage'].includes(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function gitHash() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: REPO, encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function fileState(files) {
  const state = {};
  for (const f of files) {
    try {
      const rel = path.relative(REPO, f);
      const stat = fs.statSync(f);
      const hash = execFileSync('git', ['hash-object', rel], {
        cwd: REPO, encoding: 'utf8',
      }).trim();
      state[rel] = { mtime: stat.mtimeMs, size: stat.size, hash };
    } catch {
      state[f] = { error: 'unreadable' };
    }
  }
  return state;
}

function checkpoint(args) {
  const id = args.id;
  if (!id) {
    console.error('checkpoint requires --id <message-id>');
    process.exit(1);
  }
  const patterns = (args.paths || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!patterns.length) {
    console.error('checkpoint requires --paths "file1,file2,dir/"');
    process.exit(1);
  }

  const files = resolvePaths(patterns);
  const entry = {
    id,
    timestamp: new Date().toISOString(),
    gitHead: gitHash(),
    scopes: patterns,
    fileCount: files.length,
    fileState: fileState(files),
    status: 'active',
  };

  appendJsonl(CHECKPOINT_FILE, entry);

  if (args.json) {
    const { fileState, ...rest } = entry;
    console.log(JSON.stringify(rest, null, 2));
  } else {
    console.log(`CHECKPOINT created: ${id}`);
    console.log(`  Timestamp: ${entry.timestamp}`);
    console.log(`  Git HEAD: ${entry.gitHead}`);
    console.log(`  Scopes: ${patterns.join(', ')}`);
    console.log(`  Files tracked: ${files.length}`);
    console.log(`  The agent can now continue working — if the answer invalidates assumptions,`);
    console.log(`  use 'steer' or 'rollback' to detect changes.`);
  }
  return entry;
}

function findCheckpoint(id) {
  const checkpoints = readJsonl(CHECKPOINT_FILE);
  return checkpoints.find((c) => c.id === id && c.status === 'active');
}

function detectChanges(cp) {
  const changed = [];
  const currentHash = gitHash();

  for (const [file, oldState] of Object.entries(cp.fileState)) {
    const fullPath = path.join(REPO, file);
    if (!fs.existsSync(fullPath)) {
      changed.push({ file, reason: 'deleted' });
      continue;
    }
    try {
      const currentHashValue = execFileSync('git', ['hash-object', file], {
        cwd: REPO, encoding: 'utf8',
      }).trim();
      if (currentHashValue !== oldState.hash) {
        changed.push({ file, reason: 'modified', oldHash: oldState.hash, newHash: currentHashValue });
      }
    } catch {
      changed.push({ file, reason: 'unreadable' });
    }
  }

  const gitChanged = gitDiffSince(cp.gitHead, currentHash);
  return { changed, gitChanged, gitHeadChanged: currentHash !== cp.gitHead };
}

function gitDiffSince(base, head) {
  if (!base || !head || base === head) return [];
  try {
    const out = execFileSync('git', ['diff', '--name-only', base, head], {
      cwd: REPO, encoding: 'utf8',
    });
    return out.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function steer(args) {
  const cp = findCheckpoint(args.id);
  if (!cp) {
    console.error(`No active checkpoint found for id: ${args.id}`);
    process.exit(1);
  }

  const { changed, gitChanged, gitHeadChanged } = detectChanges(cp);
  const ageSeconds = (Date.now() - new Date(cp.timestamp).getTime()) / 1000;

  const entry = {
    id: `steer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    checkpointId: cp.id,
    timestamp: new Date().toISOString(),
    answer: args.answer,
    filesChanged: changed,
    gitHeadChanged,
    gitDiffFiles: gitChanged,
    checkpointAgeSeconds: Math.round(ageSeconds),
    needsRollback: changed.length > 0,
  };

  appendJsonl(REPLIES_FILE_PATH, entry);

  if (args.json) {
    console.log(JSON.stringify(entry, null, 2));
  } else {
    console.log(`STEER: ${args.id}`);
    console.log(`  Answer received: ${args.answer || '(no answer provided)'}`);
    console.log(`  Checkpoint age: ${Math.round(ageSeconds)}s`);
    console.log(`  Files changed since checkpoint: ${changed.length}`);
    for (const c of changed) {
      console.log(`    ${c.reason}: ${c.file}`);
    }
    if (gitHeadChanged) {
      console.log(`  Git HEAD changed since checkpoint — ${gitChanged.length} files in git diff`);
    }
    if (changed.length > 0) {
      console.log(`  ⚠ Dependent work may conflict with the new answer.`);
      console.log(`    Run 'node tools/task-checkpoint-gate.js rollback --id ${args.id}' to list undo candidates.`);
    } else {
      console.log(`  ✓ No conflicting work detected.`);
    }
  }
  return entry;
}

const REPLIES_FILE_PATH = path.join(STORAGE_DIR, 'task-steer-responses.jsonl');

function rollback(args) {
  const cp = findCheckpoint(args.id);
  if (!cp) {
    console.error(`No active checkpoint found for id: ${args.id}`);
    process.exit(1);
  }

  const { changed, gitChanged, gitHeadChanged } = detectChanges(cp);

  if (args.json) {
    const result = {
      checkpointId: args.id,
      filesToUndo: changed.map((c) => c.file),
      gitDiffFiles: gitChanged,
      gitHeadChanged,
      count: changed.length,
    };
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`ROLLBACK candidates for: ${args.id}`);
    console.log(`  Files changed since checkpoint: ${changed.length}`);
    if (changed.length === 0) {
      console.log(`  ✓ No files to undo — agent waited or work is unaffected.`);
      return { checkpointId: args.id, filesToUndo: [], count: 0 };
    }
    for (const c of changed) {
      console.log(`  - ${c.file} (${c.reason})`);
    }
    if (gitHeadChanged) {
      console.log(`\n  Git diff files (HEAD moved from ${cp.gitHead}):`);
      for (const f of gitChanged) console.log(`  - ${f}`);
    }
    console.log(`\n  To restore specific files: git checkout <sha> -- <file>`);
    console.log(`  To restore all: git reset --hard <sha> (CAUTION: loses all uncommitted work)`);
  }

  // Deactivate checkpoint so it's not reused
  const checkpoints = readJsonl(CHECKPOINT_FILE);
  const updated = checkpoints.map((c) =>
    c.id === args.id ? { ...c, status: 'resolved' } : c
  );
  ensureDir();
  fs.writeFileSync(CHECKPOINT_FILE, updated.map((e) => JSON.stringify(e, null, 0)).join('\n') + '\n');

  return { checkpointId: args.id, filesToUndo: changed.map((c) => c.file), count: changed.length };
}

function checkpoints(args) {
  const all = readJsonl(CHECKPOINT_FILE);
  const active = all.filter((c) => c.status === 'active');
  if (args.json) {
    console.log(JSON.stringify({ active, total: all.length }, null, 2));
  } else {
    console.log(`Active checkpoints: ${active.length} / ${all.length} total`);
    for (const c of active) {
      console.log(`  ${c.id} | ${c.timestamp} | files: ${c.fileCount} | scopes: ${c.scopes.join(', ')}`);
    }
  }
  return active;
}

function parseArgs(argv) {
  const out = { command: null, json: false, id: null, paths: null, answer: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--id') out.id = argv[++i];
    else if (a === '--paths') out.paths = argv[++i];
    else if (a === '--answer') out.answer = argv[++i];
    else if (!a.startsWith('-') && !out.command) out.command = a;
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`task-checkpoint-gate — checkpoint-gate for async agent decisions

Based on TheNewStack article: "There is no checkpoint preventing the agent from
moving past the decision" when Codex continues working while waiting for an answer.

Usage:
  node tools/task-checkpoint-gate.js checkpoint --id msg_abc123 --paths "lib/,apps/api/"
  node tools/task-checkpoint-gate.js steer --id msg_abc123 --answer "use postgres"
  node tools/task-checkpoint-gate.js rollback --id msg_abc123
  node tools/task-checkpoint-gate.js checkpoints --json

Commands:
  checkpoint Set a file-state snapshot before starting dependent work.
  steer      When answer arrives, detect what changed since checkpoint.
  rollback   List files that changed — candidates for undo/restore.
  checkpoints List active checkpoints.
`);
    return;
  }

  const args = parseArgs(argv);
  switch (args.command) {
    case 'checkpoint':
      checkpoint(args);
      break;
    case 'steer':
      if (!args.id) { console.error('steer requires --id'); process.exit(1); }
      steer(args);
      break;
    case 'rollback':
      if (!args.id) { console.error('rollback requires --id'); process.exit(1); }
      rollback(args);
      break;
    case 'checkpoints':
      checkpoints(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { checkpoint, steer, rollback, checkpoints, findCheckpoint, detectChanges, STORAGE_DIR, CHECKPOINT_FILE };
