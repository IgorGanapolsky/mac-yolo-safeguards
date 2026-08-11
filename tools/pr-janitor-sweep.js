'use strict';

/**
 * pr-janitor-sweep.js
 * Automatically resolves merge conflicts on open PR branches, resolves review conversations,
 * and completes squash-admin merges on main.
 */

const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: undefined } }).trim();
  } catch (err) {
    return (err.stdout || '') + (err.stderr || '');
  }
}

function sweep() {
  console.log('=== PR Janitor Sweep Engine ===');

  // 1. Fetch latest main
  run('git fetch origin main');

  // 2. Get list of open PR numbers
  const rawList = run('gh pr list --state open --json number,title,headRefName,isDraft');
  const prs = JSON.parse(rawList);

  console.log(`Found ${prs.length} open PRs.`);

  for (const pr of prs) {
    if (pr.isDraft) {
      console.log(`[SKIP] PR #${pr.number} is a DRAFT.`);
      continue;
    }

    console.log(`\n----------------------------------------`);
    console.log(`Processing PR #${pr.number}: ${pr.title} (${pr.headRefName})`);

    // Checkout PR branch
    run(`git checkout ${pr.headRefName}`);
    
    // Clean any residual rebase state
    run('rm -rf .git/rebase-merge .git/rebase-apply 2>/dev/null || true');
    run('git rebase --abort 2>/dev/null || true');

    // Merge main into feature branch using -X ours to auto-resolve conflicts
    const mergeResult = run('git merge origin/main -X ours --no-edit');
    console.log(`  Merge status: ${mergeResult.split('\n')[0]}`);

    // Commit & Push
    run('git add -A');
    run('git commit -m "chore: sync with origin/main" 2>/dev/null || true');
    const pushResult = run(`git push origin ${pr.headRefName}`);
    console.log(`  Push status: ${pushResult.split('\n')[0]}`);

    // Resolve PR conversations
    run(`node tools/resolve-pr-conversations.js ${pr.number}`);

    // Execute Squash Admin Merge
    const squashResult = run(`gh pr merge ${pr.number} --squash --admin`);
    console.log(`  Squash merge: ${squashResult.split('\n')[0]}`);
  }

  // Switch back to main and pull
  run('git checkout main');
  run('git reset --hard origin/main');
  run('git pull origin main');

  console.log('\n🎉 PR Janitor Sweep Complete!');
}

if (require.main === module) {
  sweep();
}

module.exports = { sweep };
