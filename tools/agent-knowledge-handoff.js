#!/usr/bin/env node
'use strict';

/**
 * agent-knowledge-handoff.js — capture agent decisions for recall by the next agent.
 *
 * After an agent completes a coding task, it captures:
 * - The task that was done
 * - Which model was used (from agent-harness-router)
 * - Key decisions made and why
 * - Bugs found and how they were fixed
 * - Files touched
 *
 * This is stored in the harness-router storage dir as a JSONL file,
 * and can be recalled by the next agent to avoid re-solving the same
 * problems or repeating the same expensive exploration.
 *
 * Addresses TheNewStack "AI code review: cognitive debt" — knowledge
 * sharing between AI agents so the next agent doesn't start from zero.
 *
 * Usage:
 *   node tools/agent-knowledge-handoff.js capture '{"task":"...","decisions":[...]}'
 *   node tools/agent-knowledge-handoff.js capture --task "..." --model "..." --decisions "..."
 *   node tools/agent-knowledge-handoff.js recall --task-type "coding"
 *   node tools/agent-knowledge-handoff.js recall --search "threadDetails race condition"
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const HANDOFF_FILE = path.join(STORAGE_DIR, 'agent-handoffs.jsonl');

const VALID_TASK_TYPES = ['coding', 'infra', 'bugfix', 'review', 'deploy', 'research'];

function readHandoffs() {
  if (!fs.existsSync(HANDOFF_FILE)) return [];
  const lines = fs.readFileSync(HANDOFF_FILE, 'utf8').trim().split('\n');
  return lines.filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function writeHandoff(entry) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
  const line = JSON.stringify(entry, null, 0);
  fs.appendFileSync(HANDOFF_FILE, line + '\n');
}

function capture(args) {
  const entry = {
    id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    task: args.task || 'unknown',
    taskType: args.taskType || 'coding',
    model: args.model || null,
    decisions: args.decisions || [],
    bugsFound: args.bugsFound || [],
    filesTouched: args.filesTouched || [],
    costUsd: args.costUsd || null,
    durationMs: args.durationMs || null,
    searchTags: args.searchTags || [],
  };

  if (entry.decisions && typeof entry.decisions === 'string') {
    entry.decisions = entry.decisions.split(';').map((s) => s.trim()).filter(Boolean);
  }
  if (entry.bugsFound && typeof entry.bugsFound === 'string') {
    entry.bugsFound = entry.bugsFound.split(';').map((s) => s.trim()).filter(Boolean);
  }
  if (entry.filesTouched && typeof entry.filesTouched === 'string') {
    entry.filesTouched = entry.filesTouched.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (entry.searchTags && typeof entry.searchTags === 'string') {
    entry.searchTags = entry.searchTags.split(',').map((s) => s.trim()).filter(Boolean);
  }

  writeHandoff(entry);

  if (args.json) {
    console.log(JSON.stringify(entry, null, 2));
  } else {
    console.log(`Captured handoff: ${entry.id}`);
    console.log(`  Task: ${entry.task}`);
    console.log(`  Type: ${entry.taskType}`);
    console.log(`  Model: ${entry.model || 'unknown'}`);
    console.log(`  Decisions: ${entry.decisions.length}`);
    console.log(`  Bugs found: ${entry.bugsFound.length}`);
    console.log(`  Files: ${entry.filesTouched.length}`);
  }
  return entry;
}

function recall(args) {
  const handoffs = readHandoffs();
  const query = (args.search || '').toLowerCase();
  const taskType = args.taskType;

  let filtered = handoffs;
  if (query) {
    filtered = filtered.filter((h) => {
      const text = JSON.stringify(h).toLowerCase();
      return text.includes(query) ||
        (h.decisions || []).some((d) => d.toLowerCase().includes(query)) ||
        (h.bugsFound || []).some((b) => b.toLowerCase().includes(query)) ||
        (h.searchTags || []).some((t) => t.toLowerCase().includes(query));
    });
  }
  if (taskType) {
    filtered = filtered.filter((h) => h.taskType === taskType);
  }

  // Sort by most recent first
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Limit results
  const limit = args.limit || 10;
  const results = filtered.slice(0, limit);

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`Found ${filtered.length} handoffs matching your query (showing ${results.length}):\n`);
    for (const h of results) {
      console.log(`--- ${h.id} (${h.timestamp})`);
      console.log(`  Task: ${h.task}`);
      console.log(`  Type: ${h.taskType}`);
      console.log(`  Model: ${h.model || 'unknown'}`);
      console.log(`  Cost: $${h.costUsd || 'unknown'} | Duration: ${h.durationMs || 'unknown'}ms`);
      if (h.decisions && h.decisions.length) {
        console.log(`  Decisions:`);
        for (const d of h.decisions) console.log(`    - ${d}`);
      }
      if (h.bugsFound && h.bugsFound.length) {
        console.log(`  Bugs found/fixed:`);
        for (const b of h.bugsFound) console.log(`    - ${b}`);
      }
      if (h.searchTags && h.searchTags.length) {
        console.log(`  Tags: ${h.searchTags.join(', ')}`);
      }
      console.log();
    }
  }
  return results;
}

function parseJsonOrArgs(argv) {
  const idx = argv.indexOf('capture');
  if (idx === -1) return {};

  // Check for JSON argument
  const jsonArg = argv[idx + 2];
  if (jsonArg && jsonArg.startsWith('{')) {
    try {
      return JSON.parse(jsonArg);
    } catch {
      return {};
    }
  }

  // Parse --flag value pairs
  const result = {};
  const rest = argv.slice(idx + 2);
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = rest[i + 1];
      if (val && !val.startsWith('--')) {
        result[key] = val;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`agent-knowledge-handoff — capture/recall agent decisions

Usage:
  node tools/agent-knowledge-handoff.js capture '{"task":"...","decisions":["..."]}'
  node tools/agent-knowledge-handoff.js capture --task "..." --model "..." --decisions "...;..."
  node tools/agent-knowledge-handoff.js recall --search "race condition"
  node tools/agent-knowledge-handoff.js recall --task-type bugfix
  node tools/agent-knowledge-handoff.js recall --json
`);
    return;
  }

  const cmd = argv[0];
  if (cmd === 'capture') {
    const args = parseJsonOrArgs(process.argv);
    capture(args);
  } else if (cmd === 'recall') {
    const args = {};
    const rest = argv.slice(1);
    for (let i = 0; i < rest.length; i++) {
      const arg = rest[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const val = rest[i + 1];
        if (val && !val.startsWith('--')) {
          args[key] = val;
          i++;
        } else {
          args[key] = true;
        }
      }
    }
    recall(args);
  } else {
    console.error(`Unknown command: ${cmd}. Use 'capture' or 'recall'.`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { capture, recall, readHandoffs, STORAGE_DIR };
