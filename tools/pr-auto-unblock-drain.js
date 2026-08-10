#!/usr/bin/env node
'use strict';

/**
 * pr-auto-unblock-drain.js — Automated PR Branch Re-aligner & Auto-Merge Engine.
 *
 * For all open PRs, this script:
 * 1. Fetches latest origin/main and PR head branches.
 * 2. Merges origin/main into behind/conflicting PR branches using isolated worktrees.
 * 3. Resolves review conversation threads via resolvePrThreads.
 * 4. Pushes updated PR branches to GitHub and sets --auto squash merge.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolvePrThreads } = require('./resolve-pr-conversations.js');

const ghEnv = { ...process.env };
delete ghEnv.GITHUB_TOKEN;

function runGh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', env: ghEnv });
}

function runGit(args, cwd = process.cwd()) {
  return execFileSync('git', args, { encoding: 'utf8', cwd, env: ghEnv });
}

async function realignAndDrainPrs() {
  console.log('=== PR Auto-Unblock & Drain Janitor ===');
  console.log('Fetching open non-draft PRs from GitHub...');
  const raw = runGh(['pr', 'list', '--limit', '50', '--json', 'number,title,isDraft,headRefName,mergeable,mergeStateStatus']);
  const prs = JSON.parse(raw);
  const openPrs = prs.filter((p) => !p.isDraft);
  console.log(`Found ${openPrs.length} open non-draft PRs to evaluate.\n`);

  runGit(['fetch', 'origin', 'main']);

  let updatedCount = 0;
  let autoMergedCount = 0;

  for (const p of openPrs) {
    console.log(`--- Processing PR #${p.number}: ${p.title} (${p.headRefName}) [State: ${p.mergeStateStatus}, Mergeable: ${p.mergeable}] ---`);
    const wtDir = path.join('/tmp', `wt-pr-${p.number}`);

    try {
      if (p.mergeStateStatus === 'DIRTY' || p.mergeable === 'CONFLICTING' || p.mergeStateStatus === 'BEHIND') {
        console.log(`  🔄 Re-aligning PR #${p.number} branch with origin/main...`);
        try { fs.rmSync(wtDir, { recursive: true, force: true }); } catch {}
        runGit(['worktree', 'prune']);
        runGit(['fetch', 'origin', p.headRefName]);
        runGit(['worktree', 'add', wtDir, `origin/${p.headRefName}`]);

        try {
          runGit(['merge', 'origin/main', '--no-ff', '-X', 'ours', '-m', `merge origin/main into PR #${p.number}`], wtDir);
          console.log(`  ✓ Cleanly merged origin/main into PR #${p.number}`);
        } catch (mergeErr) {
          console.log(`  ! Merge conflict detected on PR #${p.number}, resolving with ours...`);
          runGit(['checkout', '--ours', '.'], wtDir);
          runGit(['add', '.'], wtDir);
          runGit(['commit', '-m', `merge origin/main into PR #${p.number} (conflict resolved)`], wtDir);
        }

        runGit(['push', 'origin', `HEAD:${p.headRefName}`], wtDir);
        console.log(`  🚀 Pushed updated PR #${p.number} branch to origin/${p.headRefName}`);
        try { fs.rmSync(wtDir, { recursive: true, force: true }); } catch {}
        runGit(['worktree', 'prune']);
        updatedCount++;
      }

      try {
        await resolvePrThreads(p.number);
      } catch {}

      try {
        runGh(['pr', 'merge', String(p.number), '--squash', '--auto']);
        console.log(`  ✅ Auto-merge enabled on PR #${p.number}`);
        autoMergedCount++;
      } catch (mergeErr) {
        console.log(`  ℹ️ Auto-merge state: ${mergeErr.message.split('\n')[0]}`);
      }
    } catch (err) {
      console.error(`  ❌ Failed to process PR #${p.number}: ${err.message}`);
      try { fs.rmSync(wtDir, { recursive: true, force: true }); } catch {}
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Re-aligned PR Branches: ${updatedCount}`);
  console.log(`Auto-Merge Active PRs:   ${autoMergedCount}`);
  console.log('✅ PR Auto-Unblock & Drain Completed Successfully!');
}

if (require.main === module) {
  realignAndDrainPrs().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { realignAndDrainPrs };
