#!/usr/bin/env node
/**
 * Batch update PR branches against main & resolve bot review comments
 */
const { execSync, execFileSync } = require('child_process');
const { resolvePrThreads } = require('./resolve-pr-conversations.js');

async function batchUpdate() {
  console.log('Fetching open non-draft PRs...');
  const raw = execSync('gh pr list --limit 50 --json number,title,isDraft,mergeable,mergeStateStatus', { encoding: 'utf8' });
  const prs = JSON.parse(raw);
  const ready = prs.filter((p) => !p.isDraft);
  console.log(`Processing ${ready.length} open non-draft PRs...`);

  for (const p of ready) {
    console.log(`\n--- PR #${p.number}: ${p.title} (state: ${p.mergeStateStatus}) ---`);
    if (p.mergeStateStatus === 'BEHIND' || p.mergeable === 'MERGEABLE') {
      try {
        execFileSync('gh', ['pr', 'update-branch', String(p.number)], { encoding: 'utf8' });
        console.log(`  ✓ Updated branch for PR #${p.number}`);
      } catch (e) {
        console.log(`  ! Could not update branch for PR #${p.number}: ${e.message.split('\n')[0]}`);
      }
    }
    try {
      await resolvePrThreads(p.number);
    } catch {
      /* ignore */
    }
    try {
      execFileSync('gh', ['pr', 'merge', String(p.number), '--squash', '--auto'], { encoding: 'utf8' });
      console.log(`  ✅ Auto-merge enabled on PR #${p.number}`);
    } catch (e) {
      console.log(`  ! Auto-merge info: ${e.message.split('\n')[0]}`);
    }
  }
}

if (require.main === module) {
  batchUpdate().catch(console.error);
}
