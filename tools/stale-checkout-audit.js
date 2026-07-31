#!/usr/bin/env node
'use strict';

/**
 * stale-checkout-audit — find checkouts that silently serve old or unversioned code.
 *
 * This failure class has bitten us repeatedly and is invisible every time, because a
 * stale checkout looks completely normal:
 *
 *   - 2026-07-30: a repo audit ran against ~/workspace/git/igor/ThumbGate, which sat on
 *     a branch 93 commits behind main. Two of its findings were already fixed upstream.
 *   - 2026-07-31: com.igor.ralph-gsd-loop, com.igor.revenue-autonomous-loop and
 *     com.igor.smart-ops were found executing from a checkout 102 commits behind main
 *     with 188 lines of uncommitted, unversioned revenue logic in the files they run.
 *   - tinker-brain once selected its repo by FILE PRESENCE and ran a CI-failing branch
 *     29 commits behind main (since fixed to select on tree hash vs origin/main).
 *   - launchd jobs installed from pruned .worktrees/* paths exited 127.
 *
 * Two findings are reported, and they are different problems:
 *
 *   BEHIND      — the tree lags origin/main. Anything reading it gets old code.
 *   UNVERSIONED — tracked files modified but not committed. This work exists on one
 *                 disk only; a `git checkout .` destroys it with no way to recover.
 *
 * UNVERSIONED in a checkout that something else executes is the dangerous combination,
 * so it is reported as CRITICAL regardless of how far behind the tree is.
 *
 *   node tools/stale-checkout-audit.js              # human report
 *   node tools/stale-checkout-audit.js --json       # machine readable
 *   node tools/stale-checkout-audit.js --check      # exit 1 if any CRITICAL finding
 *   node tools/stale-checkout-audit.js --behind=50  # threshold for BEHIND (default 25)
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const WORKSPACE = path.join(os.homedir(), 'workspace', 'git', 'igor');
const LAUNCH_AGENTS = path.join(os.homedir(), 'Library', 'LaunchAgents');

function git(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20000,
    }).trim();
  } catch {
    return null;
  }
}

/** Repos an automated job actually runs from — staleness here has teeth. */
function executedPaths() {
  const referenced = new Map();
  let entries = [];
  try {
    entries = fs.readdirSync(LAUNCH_AGENTS).filter((f) => f.endsWith('.plist'));
  } catch {
    return referenced;
  }
  for (const entry of entries) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(LAUNCH_AGENTS, entry), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(new RegExp(`${WORKSPACE}/([A-Za-z0-9._-]+)`, 'g'))) {
      const repo = match[1];
      if (!referenced.has(repo)) referenced.set(repo, new Set());
      referenced.get(repo).add(entry.replace(/\.plist$/, ''));
    }
  }
  return referenced;
}

function auditCheckout(dir, name, executedBy) {
  if (!git(dir, ['rev-parse', '--git-dir'])) return null;
  git(dir, ['fetch', '--quiet', 'origin']);

  // A repo with no commits reports every staged file as added-but-uncommitted, which
  // is a different problem from unversioned edits to tracked files and must not be
  // reported as one. Observed: ~/workspace/git/igor/hermes-mobile had `git init` run
  // and 717 files staged (including .mcp-server-*.lock junk) with no commit and no
  // origin/main.
  const hasCommits = git(dir, ['rev-parse', '--verify', 'HEAD']) !== null;
  const hasUpstreamMain = git(dir, ['rev-parse', '--verify', 'origin/main']) !== null;
  if (!hasCommits || !hasUpstreamMain) {
    return {
      name,
      dir,
      branch: hasCommits ? (git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)') : '(no commits)',
      behind: null,
      unversioned: [],
      unusable: hasCommits ? 'no origin/main to compare against' : 'repository has no commits',
      executedBy: [...(executedBy || [])],
    };
  }

  const branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)';
  const behindRaw = git(dir, ['rev-list', '--count', 'HEAD..origin/main']);
  const behind = behindRaw === null ? null : Number(behindRaw);

  // Untracked files are noise; modified TRACKED files are unversioned work.
  // Ask git for the names directly rather than slicing porcelain status lines — the
  // XY-prefix width varies with staged/unstaged state, and a fixed slice(3) silently
  // truncated the first character of every filename ("loop.js" -> "oop.js").
  const changed = git(dir, ['diff', '--name-only', 'HEAD']) || '';
  const unversioned = changed.split('\n').map((l) => l.trim()).filter(Boolean);

  return { name, dir, branch, behind, unversioned, executedBy: [...(executedBy || [])] };
}

function classify(entry, behindThreshold) {
  const findings = [];
  const executed = entry.executedBy.length > 0;

  if (entry.unusable) {
    findings.push({
      severity: executed ? 'CRITICAL' : 'INFO',
      kind: 'UNCOMPARABLE',
      detail: `${entry.unusable} — staleness cannot be assessed`
        + (executed ? ` and ${entry.executedBy.join(', ')} run from here` : ''),
    });
    return findings;
  }

  if (entry.unversioned.length > 0) {
    findings.push({
      severity: executed ? 'CRITICAL' : 'WARN',
      kind: 'UNVERSIONED',
      detail: `${entry.unversioned.length} tracked file(s) modified but never committed`
        + (executed ? ` — and ${entry.executedBy.join(', ')} run from here` : ''),
    });
  }
  if (entry.behind !== null && entry.behind >= behindThreshold) {
    findings.push({
      severity: executed ? 'CRITICAL' : 'WARN',
      kind: 'BEHIND',
      detail: `${entry.behind} commits behind origin/main`
        + (entry.branch === 'main' ? ' while sitting ON main, so it looks current' : '')
        + (executed ? ` — ${entry.executedBy.join(', ')} run from here` : ''),
    });
  }
  return findings;
}

function main(argv) {
  const json = argv.includes('--json');
  const check = argv.includes('--check');
  const behindArg = argv.find((a) => a.startsWith('--behind='));
  const behindThreshold = behindArg ? Number(behindArg.split('=')[1]) : 25;

  const executed = executedPaths();
  let dirs = [];
  try {
    dirs = fs.readdirSync(WORKSPACE, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    process.stderr.write(`stale-checkout-audit: cannot read ${WORKSPACE}\n`);
    return 2;
  }

  const results = [];
  for (const name of dirs) {
    const entry = auditCheckout(path.join(WORKSPACE, name), name, executed.get(name));
    if (!entry) continue;
    entry.findings = classify(entry, behindThreshold);
    results.push(entry);
  }

  const flagged = results.filter((r) => r.findings.length > 0);
  const critical = flagged.filter((r) => r.findings.some((f) => f.severity === 'CRITICAL'));

  if (json) {
    process.stdout.write(`${JSON.stringify({ behindThreshold, results }, null, 2)}\n`);
  } else {
    process.stdout.write(`\nStale checkout audit — ${results.length} checkouts, threshold ${behindThreshold} commits\n\n`);
    if (flagged.length === 0) {
      process.stdout.write('  Nothing flagged.\n\n');
    }
    for (const entry of flagged) {
      const worst = entry.findings.some((f) => f.severity === 'CRITICAL') ? 'CRITICAL'
        : entry.findings.some((f) => f.severity === 'WARN') ? 'WARN' : 'INFO';
      process.stdout.write(`  [${worst}] ${entry.name}  (${entry.branch})\n`);
      for (const finding of entry.findings) {
        process.stdout.write(`      ${finding.kind}: ${finding.detail}\n`);
      }
      process.stdout.write('\n');
    }
    if (critical.length > 0) {
      process.stdout.write('  CRITICAL means something automated executes from that checkout.\n');
      process.stdout.write('  Unversioned work there exists on one disk only.\n\n');
    }
  }

  return check && critical.length > 0 ? 1 : 0;
}

module.exports = { auditCheckout, classify, executedPaths };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
