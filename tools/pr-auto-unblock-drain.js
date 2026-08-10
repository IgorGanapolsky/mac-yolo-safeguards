#!/usr/bin/env node
/**
 * PR Auto-Unblock & Drain Janitor
 * Resolves bot review threads and activates auto-merge on ready PRs.
 */
const { execSync, execFileSync } = require('child_process');
const { resolvePrThreads } = require('./resolve-pr-conversations.js');

async function drainReadyPrs() {
  console.log('Fetching open PRs...');
  const raw = execSync('gh pr list --limit 100 --json number,title,isDraft,mergeable', { encoding: 'utf8' });
  const prs = JSON.parse(raw);
  const ready = prs.filter((p) => !p.isDraft && p.mergeable === 'MERGEABLE');
  console.log(`Found ${ready.length} ready mergeable PRs.`);

  let mergedCount = 0;
  for (const p of ready) {
    try {
      console.log(`Processing PR #${p.number}: ${p.title}`);
      await resolvePrThreads(p.number);
      try {
        execFileSync('gh', ['pr', 'merge', String(p.number), '--squash', '--admin'], { encoding: 'utf8' });
        console.log(`  🎉 MERGED PR #${p.number}`);
        mergedCount++;
      } catch (err) {
        if (err.message.includes('already merged')) {
          console.log(`  🎉 PR #${p.number} was already merged.`);
          mergedCount++;
        } else {
          execFileSync('gh', ['pr', 'merge', String(p.number), '--squash', '--auto'], { encoding: 'utf8' });
          console.log(`  ⏳ Set auto-merge on PR #${p.number}`);
        }
      }
    } catch (e) {
      console.error(`  ❌ Error processing PR #${p.number}: ${e.message}`);
    }
  }
  console.log(`Summary: Successfully processed ${mergedCount} PR merges / auto-merges.`);
}

if (require.main === module) {
  drainReadyPrs().catch(console.error);
}
