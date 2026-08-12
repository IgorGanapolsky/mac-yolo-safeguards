#!/usr/bin/env node
'use strict';

/**
 * git-branch-cleaner.js — Clean stale local branches and prune worktrees.
 */

const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return null;
  }
}

function cleanBranches() {
  console.log('=== Step 2 & 4: Cleaning Stale Branches & Worktrees ===');
  
  // Prune worktrees
  run('git worktree prune');

  const branchesRaw = run('git branch --list');
  if (!branchesRaw) return;

  const branches = branchesRaw.split('\n').map((b) => b.replace('*', '').trim()).filter((b) => b && b !== 'main' && b !== 'master');
  console.log(`Auditing ${branches.length} local branches for cleanup...`);

  let deletedCount = 0;
  for (const branch of branches) {
    // Delete temp branches, merged branches, or old feature branches
    if (
      branch.startsWith('tmp-') ||
      branch.startsWith('fix-pr') ||
      branch.endsWith('-rebase') ||
      branch.endsWith('-resolve') ||
      branch.startsWith('codex/agent-') ||
      branch.includes('20260805') ||
      branch.includes('20260806')
    ) {
      const res = run(`git branch -D "${branch}"`);
      if (res) {
        deletedCount++;
        console.log(`  🗑️ Deleted stale branch: ${branch}`);
      }
    }
  }

  console.log(`Successfully cleaned ${deletedCount} local branches.`);
}

if (require.main === module) {
  cleanBranches();
}
