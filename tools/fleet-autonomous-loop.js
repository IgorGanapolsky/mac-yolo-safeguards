#!/usr/bin/env node
'use strict';

/**
 * Background multi-agent coord hygiene (LaunchAgent every 15m).
 *
 * Safe defaults:
 * - Obsidian display sync (mirror, not lock)
 * - scrub-stale dry-run log (apply is explicit)
 * - Optional vault self-heal if script present
 *
 * Does NOT auto-create Linear issues from GitHub (no dedup — would spam).
 * Run tools/github-linear-sync.js manually only after adding identity checks.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CWD = path.resolve(__dirname, '..');

function log(msg) {
  console.log(`[Autonomous Fleet Loop ${new Date().toISOString()}] ${msg}`);
}

function run(cmd, timeout = 120000) {
  return execSync(cmd, { cwd: CWD, encoding: 'utf8', timeout });
}

function runLoop() {
  log('Starting background coord hygiene pass...');

  // 1. Obsidian display board
  try {
    log('Running Obsidian display sync...');
    const out = run('node tools/obsidian-linear-sync.js');
    log((out || '').trim().split('\n').slice(-2).join(' | '));
  } catch (err) {
    log(`Obsidian sync error: ${err.message}`);
  }

  // 2. scrub-stale dry-run (never --apply in daemon)
  try {
    log('Running stale agent-lock dry-run...');
    const out = run('node tools/linear-agent-bridge.js --scrub-stale --json');
    try {
      const j = JSON.parse(out);
      log(`scrub-stale candidates: ${j.candidateCount ?? '?'}`);
      if (j.candidateCount > 0) {
        for (const c of (j.candidates || []).slice(0, 8)) {
          log(`  candidate ${c.id} reason=${c.reason}`);
        }
        log('To clean: node tools/linear-agent-bridge.js --scrub-stale --apply');
      }
    } catch {
      log('scrub-stale ran (non-JSON)');
    }
  } catch (err) {
    log(`scrub-stale error: ${err.message}`);
  }

  // 3. Optional self-heal if present
  const heal = path.join(CWD, 'tools/obsidian-self-healing-orchestration.js');
  if (fs.existsSync(heal)) {
    try {
      log('Running vault self-healing...');
      run('node tools/obsidian-self-healing-orchestration.js', 60000);
    } catch (err) {
      log(`Vault self-healing error: ${err.message}`);
    }
  }

  log('Autonomous background loop completed.');
}

if (require.main === module) {
  runLoop();
}

module.exports = { runLoop };
