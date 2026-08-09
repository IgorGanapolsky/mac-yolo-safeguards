#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

function runGh(args) {
  try {
    const env = { ...process.env };
    delete env.GITHUB_TOKEN;
    const out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env });
    return JSON.parse(out);
  } catch (err) {
    console.error(`GH error: ${err.message}`);
    return [];
  }
}

function execGh(args) {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  return execFileSync('gh', args, { stdio: 'ignore', env });
}

function main() {
  const prs = runGh(['pr', 'list', '--state', 'open', '--limit', '300', '--json', 'number,title,mergeable,isDraft,createdAt,headRefName']);
  console.log(`Initial open PRs count: ${prs.length}`);

  let autoMergeEnabled = 0;
  let closedCount = 0;
  const now = new Date();

  for (const pr of prs) {
    const ageDays = (now - new Date(pr.createdAt)) / (1000 * 60 * 60 * 24);
    const numStr = String(pr.number);
    
    if (pr.mergeable === 'MERGEABLE' && !pr.isDraft) {
      console.log(`[MERGEABLE] Enforcing auto-merge on PR #${pr.number}: ${pr.title}`);
      try {
        execGh(['pr', 'merge', numStr, '--squash', '--auto']);
        autoMergeEnabled++;
      } catch (e) {
        console.error(`Auto-merge failed for #${pr.number}: ${e.message}`);
      }
    } else if (pr.mergeable === 'CONFLICTING' && ageDays > 1.0) {
      console.log(`[STALE CONFLICT] Closing superseded PR #${pr.number} (Age: ${ageDays.toFixed(1)}d): ${pr.title}`);
      try {
        execGh(['pr', 'close', numStr, '--comment', 'Closing stale conflicting PR superseded by main.']);
        closedCount++;
      } catch (e) {
        console.error(`Failed to close #${pr.number}: ${e.message}`);
      }
    }
  }

  // Query TRUE live GitHub API state after sweep
  const livePrs = runGh(['pr', 'list', '--state', 'open', '--limit', '300', '--json', 'number']);
  console.log(`\n--- Live GitHub State Summary ---`);
  console.log(`- Auto-merge enabled on: ${autoMergeEnabled} PRs`);
  console.log(`- Stale conflicting closed: ${closedCount} PRs`);
  console.log(`- TRUE Live Open PR Count: ${livePrs.length} PRs`);
}

main();
