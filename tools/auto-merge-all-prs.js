#!/usr/bin/env node
/**
 * Universal Auto-Merge & Branch Rebase Janitor
 * Automatically merges main into open PR branches via git commit-tree,
 * resolves bot review threads, and enables auto-merge.
 * 
 * Uses execFileSync to avoid shell injection risks (CodeQL compliance).
 */
const { execFileSync } = require('child_process');
const git = (args) => execFileSync('git', Array.isArray(args) ? args : args.split(' '), { encoding: 'utf8' }).trim();
const gh = (args) => execFileSync('gh', Array.isArray(args) ? args : args.split(' '), { encoding: 'utf8' }).trim();
const { resolvePrThreads } = require('./resolve-pr-conversations.js');

async function autoMergeAll() {
  console.log('Fetching all open non-draft PRs...');
  const raw = gh('pr list --limit 100 --json number,title,isDraft,mergeable,mergeStateStatus,headRefName');
  const prs = JSON.parse(raw);
  const openPrs = prs.filter((p) => !p.isDraft);
  console.log(`Found ${openPrs.length} open non-draft PRs.`);

  git('fetch origin main');
  const mainHead = git('rev-parse origin/main');

  let updatedCount = 0;
  for (const p of openPrs) {
    const name = p.headRefName.replace(/[^a-zA-Z0-9/_-]/g, '_'); // Sanitize branch name
    console.log(`\n--- PR #${p.number}: ${p.title} (state: ${p.mergeStateStatus}, mergeable: ${p.mergeable}) ---`);
    try {
      git('fetch origin', `refs/heads/${p.headRefName}:refs/remotes/origin/${p.headRefName}`);
      const prHead = git('rev-parse', `origin/${p.headRefName}`);

      const tree = git('merge-tree', '--write-tree', 'origin/main', `origin/${p.headRefName}`);
      const commit = git('commit-tree', tree, '-p', prHead, '-p', mainHead, '-m', `Merge branch 'main' into ${name}`);

      git('push', 'origin', `${commit}:refs/heads/${p.headRefName}`);
      console.log(`  ✓ Fast-merged main into ${name} (commit: ${commit.slice(0, 7)})`);
      updatedCount++;
    } catch (err) {
      console.log(`  ! Non-trivial conflict on PR #${p.number}: ${err.message.split('\n')[0]}`);
    }

    try {
      await resolvePrThreads(p.number);
    } catch {
      /* ignore */
    }

    try {
      gh('pr merge', p.number, '--squash', '--auto');
      console.log(`  ✅ Auto-merge enabled on PR #${p.number}`);
    } catch (err) {
      console.log(`  ! Auto-merge notice: ${err.message.split('\n')[0]}`);
    }
  }

  console.log(`\n=== AUTO-MERGE JANITOR SUMMARY ===`);
  console.log(`Successfully updated & enabled auto-merge for ${updatedCount} PRs.`);
}

if (require.main === module) {
  autoMergeAll().catch(console.error);
}