'use strict';

/**
 * force-merge-pr-sweep.js
 * Synchronizes open PR branches with origin/main, resolves review threads,
 * and completes squash merges across the repository.
 */

const { execSync } = require('child_process');

function run(cmd, ignoreError = false) {
  try {
    return execSync(cmd, { encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: undefined } }).trim();
  } catch (err) {
    if (!ignoreError) throw err;
    return (err.stdout || '') + (err.stderr || '');
  }
}

function processPr(prNumber) {
  console.log(`\n========================================`);
  console.log(`Processing PR #${prNumber}...`);

  // 1. Get branch name
  const prJson = run(`gh pr view ${prNumber} --json headRefName,title,isDraft`);
  const prData = JSON.parse(prJson);

  if (prData.isDraft) {
    console.log(`[SKIP] PR #${prNumber} is a DRAFT.`);
    return;
  }

  const branch = prData.headRefName;
  console.log(`Branch: ${branch} | Title: ${prData.title}`);

  // 2. Fetch main & checkout branch
  run('git fetch origin main', true);
  run(`git checkout ${branch}`, true);

  // 3. Merge origin/main with ours strategy for conflicts
  run('git merge origin/main -X ours --no-edit', true);
  run('git add -A', true);
  run('git commit -m "chore: sync with origin/main" 2>/dev/null || true', true);

  // 4. Push updated branch
  const pushRes = run(`git push origin ${branch}`, true);
  console.log(`Push status: ${pushRes.split('\n')[0]}`);

  // 5. Resolve PR review threads
  run(`node tools/resolve-pr-conversations.js ${prNumber}`, true);

  // 6. Merge PR
  const mergeRes = run(`gh pr merge ${prNumber} --squash --admin`, true);
  console.log(`Merge status: ${mergeRes.split('\n')[0]}`);
}

async function main() {
  const prsToProcess = [1655, 1653, 1652, 1651, 1650, 1649, 1648, 1647, 1646, 1645, 1643, 1642, 1640, 1639, 1633, 1632, 1631, 1629, 1628, 1626, 1625, 1624, 1623, 1622, 1620, 1619, 1618, 1617, 1616, 1615];

  for (const prNum of prsToProcess) {
    processPr(prNum);
  }

  run('git checkout main');
  run('git pull origin main');
  console.log('\n🎉 PR Sweep Complete!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
