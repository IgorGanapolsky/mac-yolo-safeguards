#!/usr/bin/env node
'use strict';

/**
 * Background multi-agent coord hygiene (LaunchAgent every 15m).
 *
 * Delegates to coord-automate --daemon:
 * - Obsidian display sync
 * - safe-only scrub apply (done/unstarted/vault-released locks only)
 * - workflow-preflight (catalog + unit self-tests)
 *
 * Does NOT auto-create Linear issues from GitHub.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const CWD = path.resolve(__dirname, '..');

function runLoop() {
  const r = spawnSync(
    process.execPath,
    [path.join(CWD, 'tools/coord-automate.js'), '--daemon', '--json'],
    {
      cwd: CWD,
      encoding: 'utf8',
      timeout: 300000,
      env: process.env,
    },
  );
  const out = (r.stdout || '').trim();
  const err = (r.stderr || '').trim();
  if (out) console.log(out);
  if (err) console.error(err);
  if (r.status !== 0) process.exitCode = r.status || 1;
}

if (require.main === module) {
  runLoop();
}

module.exports = { runLoop };
