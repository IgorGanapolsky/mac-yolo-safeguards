#!/usr/bin/env node
'use strict';

/**
 * Cross-PR plan.md claim conflicts.
 *
 * `tools/plan-coordination-snapshot.js check-ownership` reads the plan.md in the
 * CURRENT checkout. That is exactly the hole the 2026-07-23 collision documented:
 * a claim committed only inside another agent's feature branch never reaches main,
 * so no agent reading main's plan.md can see it, and the CI gate can't either.
 *
 * The repo already solved this shape once — the Cloudflare deploy lock was rebuilt
 * on GitHub's Deployments API because "creating a deployment record is an atomic
 * server-side operation - no git-push race". This applies the same idea to the
 * claim table: ask GitHub for the claims that exist in OPEN PRs right now, instead
 * of trusting a file that each branch holds a private copy of.
 *
 * Reads added plan.md lines from open PRs (the patch, not the whole 2000-line file)
 * and reports anyone else who has already claimed a file you are about to touch.
 */

const { execFileSync } = require('child_process');
const { parseOwnershipLocks } = require('./plan-coordination-snapshot');

const DEFAULT_REPO = 'IgorGanapolsky/mac-yolo-safeguards';

function isClaimedPath(file, claim) {
  const normalized = claim.replace(/\/+$/, '');
  if (file === claim || file === normalized) return true;
  if (file.startsWith(`${normalized}/`)) return true;
  // Claims are frequently written as globs: `drizzle/meta/*`, `.worktrees/**`.
  if (normalized.includes('*')) {
    const rx = new RegExp(`^${normalized.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return rx.test(file);
  }
  return false;
}

/**
 * Pure core so this is testable without a network or a gh binary.
 *
 * @param {object} input
 * @param {string[]} input.files        files you intend to touch
 * @param {Array}   input.prClaims      [{number, author, branch, addedLines[]}]
 * @param {string}  [input.selfOwner]   your agent id — your own claims never conflict
 * @param {number}  [input.selfPr]      your own PR number — skipped entirely
 * @returns {Array} conflicts, one per (file, pr, owner)
 */
function findCrossPrConflicts({ files, prClaims, selfOwner = null, selfPr = null }) {
  const conflicts = [];
  for (const pr of prClaims || []) {
    if (selfPr != null && Number(pr.number) === Number(selfPr)) continue;
    // parseOwnershipLocks already drops `released`/`(free)` lines and needs the
    // "- `path` → **owner**" shape, so feeding it raw added lines is correct.
    const locks = parseOwnershipLocks((pr.addedLines || []).join('\n'));
    for (const lock of locks) {
      if (selfOwner && lock.owner === selfOwner) continue;
      for (const file of files || []) {
        if (!lock.files.some((claim) => isClaimedPath(file, claim))) continue;
        conflicts.push({
          file,
          owner: lock.owner,
          pr: Number(pr.number),
          branch: pr.branch || '',
          author: pr.author || '',
        });
      }
    }
  }
  return conflicts;
}

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Added plan.md lines for every open PR, via the API — never a full-file fetch. */
function fetchOpenPrClaims(repo) {
  const list = JSON.parse(gh(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '100',
    '--json', 'number,headRefName,author']));
  const out = [];
  for (const pr of list) {
    let files;
    try {
      files = JSON.parse(gh(['api', `repos/${repo}/pulls/${pr.number}/files`, '--paginate']));
    } catch {
      continue; // a PR we cannot read must not take down the whole check
    }
    const planFile = files.find((f) => f.filename === 'plan.md');
    if (!planFile || !planFile.patch) continue;
    const addedLines = planFile.patch
      .split('\n')
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1));
    if (addedLines.length === 0) continue;
    out.push({
      number: pr.number,
      branch: pr.headRefName,
      author: pr.author && pr.author.login ? pr.author.login : '',
      addedLines,
    });
  }
  return out;
}

function parseArgs(argv) {
  const args = { files: [], owner: null, selfPr: null, json: false, repo: DEFAULT_REPO, stdin: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--files') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) { args.files.push(argv[i + 1]); i += 1; }
    } else if (arg === '--owner') { args.owner = argv[i + 1] || null; i += 1; }
    else if (arg === '--self-pr') { args.selfPr = Number(argv[i + 1]); i += 1; }
    else if (arg === '--repo') { args.repo = argv[i + 1] || DEFAULT_REPO; i += 1; }
    else if (arg === '--stdin') { args.stdin = true; }
    else if (arg === '--json') { args.json = true; }
    else if (arg === '--help' || arg === '-h') { args.help = true; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node tools/plan-claim-conflicts.js --files <paths...> [--stdin] [--owner id] [--self-pr N] [--repo owner/name] [--json]');
    return 0;
  }
  const files = args.stdin
    ? require('fs').readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    : args.files;
  if (files.length === 0) {
    console.error('✗ no files given (use --files or --stdin)');
    return 2;
  }
  const owner = args.owner || process.env.PLAN_AGENT_ID || process.env.AGENT_ID || null;
  const conflicts = findCrossPrConflicts({
    files,
    prClaims: fetchOpenPrClaims(args.repo),
    selfOwner: owner,
    selfPr: args.selfPr,
  });
  if (args.json) {
    console.log(JSON.stringify({ files, owner, conflicts }, null, 2));
    return conflicts.length > 0 ? 1 : 0;
  }
  if (conflicts.length === 0) {
    console.log(`✓ no open-PR claim conflicts for ${files.length} file(s)`);
    return 0;
  }
  console.error('✗ these files are already claimed in an OPEN PR (not yet on main):');
  for (const c of conflicts) {
    console.error(`  - ${c.file} → ${c.owner} (PR #${c.pr}${c.branch ? `, ${c.branch}` : ''})`);
  }
  console.error('Mark your task blocked and STOP, or coordinate with that owner.');
  return 1;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`✗ ${error.message}`);
    process.exit(2);
  }
}

module.exports = { findCrossPrConflicts, isClaimedPath, parseArgs, fetchOpenPrClaims };
