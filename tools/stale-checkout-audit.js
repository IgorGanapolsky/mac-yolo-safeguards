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
    // Plists routinely write $HOME/... or ${HOME}/... or ~/... — including this tool's
    // own plist. Matching only the expanded absolute path meant a checkout executed
    // solely by such an agent stayed WARN, so --check exited 0 and the alert never
    // fired. Normalise first.
    const expanded = text
      .replace(/\$\{HOME\}/g, os.homedir())
      .replace(/\$HOME/g, os.homedir())
      .replace(/(^|[\s"'>])~\//g, `$1${os.homedir()}/`);

    // Capture the FULL path, not just the first segment. A job running from
    // <repo>/.worktrees/<name> was attributed to <repo>; if the parent checkout was
    // clean the worktree produced no finding at all — and jobs installed from pruned
    // .worktrees/* paths are one of the cases this tool exists to catch.
    for (const match of expanded.matchAll(new RegExp(`${WORKSPACE}/([A-Za-z0-9._/-]+)`, 'g'))) {
      const rel = match[1].replace(/\/+$/, '');
      const parts = rel.split('/');
      // <repo> or <repo>/.worktrees/<name>; anything deeper is a file inside one.
      const key = (parts[1] === '.worktrees' && parts[2])
        ? `${parts[0]}/.worktrees/${parts[2]}`
        : parts[0];
      if (!referenced.has(key)) referenced.set(key, new Set());
      referenced.get(key).add(entry.replace(/\.plist$/, ''));
    }
  }
  return referenced;
}

function auditCheckout(dir, name, executedBy) {
  if (!git(dir, ['rev-parse', '--git-dir'])) return null;
  // A discarded fetch failure means comparing against whatever cached origin/main
  // happens to exist — the audit could report "Nothing flagged" while a checkout's
  // remote-tracking ref was arbitrarily old. Fail closed instead.
  const fetched = git(dir, ['fetch', '--quiet', 'origin']) !== null;
  if (!fetched) {
    return {
      name, dir,
      branch: git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']) || '(detached)',
      behind: null, unversioned: [],
      unusable: 'could not fetch origin — comparison would use a possibly stale ref',
      executedBy: [...(executedBy || [])],
    };
  }

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

// Generated output the jobs rewrite themselves. skool_top1percent went from 159
// unversioned files to 17 within ten minutes of committing, and all 17 were
// reports/gtm/* and data/* written by the loops — zero source files. Escalating that
// to CRITICAL every day is how a guard teaches you to ignore it.
const GENERATED_DIR = /^(data|reports|out|dist|build|coverage|graphify-out|node_modules)\//;
const GENERATED_FILE = /(\.(sqlite|db|log|jsonl|lock)$|cache[^/]*\.json$|_last_run\.txt$)/;
const SOURCE_EXT = /\.(py|js|mjs|cjs|ts|tsx|jsx|sh|bash|rb|go|rs|java|swift|kt|yaml|yml|toml)$/;

/** Source edits are unrecoverable work; generated churn is just the loops running. */
function isSourceFile(file) {
  if (GENERATED_DIR.test(file) || GENERATED_FILE.test(file)) return false;
  return SOURCE_EXT.test(file);
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
    const source = entry.unversioned.filter(isSourceFile);
    const generated = entry.unversioned.length - source.length;
    if (source.length > 0) {
      findings.push({
        severity: executed ? 'CRITICAL' : 'WARN',
        kind: 'UNVERSIONED',
        detail: `${source.length} SOURCE file(s) modified but never committed`
          + (generated ? ` (plus ${generated} generated)` : '')
          + ` — ${source.slice(0, 3).join(', ')}${source.length > 3 ? ', …' : ''}`
          + (executed ? ` — and ${entry.executedBy.join(', ')} run from here` : ''),
      });
    } else {
      // Never CRITICAL: the jobs rewrite these by design.
      findings.push({
        severity: 'INFO',
        kind: 'GENERATED-CHURN',
        detail: `${generated} generated file(s) differ from HEAD — expected while the loops run`,
      });
    }
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

  // Audit every referenced target too, not just top-level checkouts — a job installed
  // from <repo>/.worktrees/<name> lives at a path `dirs` never lists.
  const targets = new Set(dirs);
  for (const key of executed.keys()) targets.add(key);

  const results = [];
  for (const name of targets) {
    const dir = path.join(WORKSPACE, name);
    if (!fs.existsSync(dir)) {
      // A pruned worktree that a LaunchAgent still points at is exactly the exit-127
      // failure this tool exists to catch; it must be reported, not skipped.
      results.push({
        name, dir, branch: '(missing)', behind: null, unversioned: [],
        unusable: 'path does not exist but a job still references it — if that job selects by file presence it will silently use whichever tree happens to exist, which is how tinker-brain ended up running a branch 29 commits behind main',
        executedBy: [...(executed.get(name) || [])],
        findings: [],
      });
      continue;
    }
    const entry = auditCheckout(dir, name, executed.get(name));
    if (!entry) continue;
    results.push(entry);
  }
  for (const entry of results) entry.findings = classify(entry, behindThreshold);

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
