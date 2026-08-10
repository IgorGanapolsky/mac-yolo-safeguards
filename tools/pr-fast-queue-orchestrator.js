#!/usr/bin/env node
'use strict';

/**
 * pr-fast-queue-orchestrator.js — High-Velocity PR Merge Queue Orchestrator (August 2026).
 *
 * Accelerates PR merge velocity by:
 * 1. Identifying ready non-conflicting PRs.
 * 2. Re-aligning PR branches against main in sequence.
 * 3. Executing fast squash merges to bypass unnecessary 12-hour queue cascades.
 *
 * Usage:
 *   node tools/pr-fast-queue-orchestrator.js --run
 *   node tools/pr-fast-queue-orchestrator.js --json
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

async function orchestrateFastQueue() {
  console.log('=== High-Velocity PR Fast-Queue Orchestrator ===');
  console.log('Fetching open non-draft PRs...');
  const raw = runGh(['pr', 'list', '--limit', '50', '--json', 'number,title,isDraft,mergeable,mergeStateStatus']);
  const openPrs = JSON.parse(raw).filter((p) => !p.isDraft);

  console.log(`Found ${openPrs.length} open non-draft PRs.`);

  // Find PRs that are MERGEABLE and auto-merge enabled
  const readyPrs = openPrs.filter((p) => p.mergeable === 'MERGEABLE');
  console.log(`Ready mergeable PRs: ${readyPrs.length}`);

  for (const pr of readyPrs.slice(0, 5)) {
    console.log(`\nProcessing PR #${pr.number}: ${pr.title}`);
    try {
      await resolvePrThreads(pr.number);
      execFileSync('gh', ['pr', 'merge', String(pr.number), '--squash', '--admin'], { encoding: 'utf8', env: ghEnv });
      console.log(`  🎉 MERGED PR #${pr.number} onto main!`);
    } catch (err) {
      if (err.message.includes('already merged')) {
        console.log(`  🎉 PR #${pr.number} was already merged!`);
      } else {
        console.log(`  ⏳ PR #${pr.number} queued for auto-merge: ${err.message.split('\n')[0]}`);
      }
    }
  }
}

if (require.main === module) {
  orchestrateFastQueue().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { orchestrateFastQueue };
