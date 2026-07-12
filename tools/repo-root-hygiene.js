#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REVENUE_PREFIXES = [
  'close-execution-packet',
  'close-follow-up-batch-plan',
  'close-target-plan',
  'github-issue-template-check',
  'partner-pilot-qualification-plan',
  'partner-pilot-stripe-unlock-packet',
  'partner-pilot-unlock-simulation',
  'payment-readiness',
  'payment-request-execution-packet',
  'payment-waiting-audit',
  'pipeline-data-science',
  'pipeline-integrity',
  'pipeline-priority',
  'proposal-batch-plan',
  'proposal-plan',
  'proposal-plan-stale-audit',
  'public-command-reference-check',
  'public-funnel-safety-scan',
  'public-local-link-check',
  'public-revenue-publish-plan',
  'publication-readiness',
  'revenue-action-board',
  'revenue-diagnosis',
  'revenue-goal-audit',
  'revenue-price-sensitivity',
  'revenue-unblock-plan',
  'send-confirmation-audit',
  'stripe-live-updates',
  'stripe-readonly-candidates',
  'stripe-readonly-discovery',
  'stripe-setup-plan',
  'test-setup-plan',
];

const usage = `Usage:
  node tools/repo-root-hygiene.js [--repo PATH] [--repair] [--json]

Checks the repository root for known, ignored generator outputs. With --repair,
moves revenue reports into business_os/revenue and Hermes decision receipts into
artifacts/hermes-decision-loop. It never moves tracked files, symlinks, folders,
unknown files, or files that are no longer gitignored. Existing destinations are
preserved and collisions are moved to an ignored quarantine.`;

function parseArgs(argv) {
  const args = {
    repo: process.cwd(),
    repair: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = argv[++i];
    else if (arg === '--repair') args.repair = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.repo) throw new Error('--repo requires a path');
  return args;
}

function runGit(repo, gitArgs, options = {}) {
  return spawnSync('git', ['-C', repo].concat(gitArgs), {
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function resolveRepo(candidate) {
  const requested = path.resolve(candidate);
  const result = runGit(requested, ['rev-parse', '--show-toplevel']);
  if (result.status !== 0) {
    throw new Error(`Not a git repository: ${requested}`);
  }
  return fs.realpathSync(result.stdout.trim());
}

function trackedRootNames(repo) {
  const result = runGit(repo, ['ls-files', '-z', '--', '.']);
  if (result.status !== 0) {
    throw new Error((result.stderr || 'git ls-files failed').toString().trim());
  }
  return new Set(result.stdout.split('\0').filter((name) => name && !name.includes('/')));
}

function ignoredRootNames(repo, names) {
  if (names.length === 0) return new Set();
  const input = `${names.join('\0')}\0`;
  const result = runGit(repo, ['check-ignore', '-z', '--stdin'], { input });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error((result.stderr || 'git check-ignore failed').toString().trim());
  }
  return new Set(result.stdout.split('\0').filter(Boolean));
}

function destinationFor(name) {
  if (/^hermes-decision-\d{4}-\d{2}-\d{2}\.md$/.test(name)
      || /^hermes-decisions-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)) {
    return { lane: 'hermes-decision-loop', relativeDir: 'artifacts/hermes-decision-loop' };
  }
  if (!/\.(?:md|tsv)$/.test(name)) return null;
  const dated = /\d{4}-\d{2}-\d{2}/.test(name);
  const prefix = REVENUE_PREFIXES.find((candidate) => name === `${candidate}.md`
    || name === `${candidate}.tsv`
    || (dated && name.startsWith(`${candidate}-`)));
  return prefix ? { lane: 'revenue', relativeDir: 'business_os/revenue' } : null;
}

function filesEqual(first, second) {
  const firstStat = fs.statSync(first);
  const secondStat = fs.statSync(second);
  if (firstStat.size !== secondStat.size) return false;
  return fs.readFileSync(first).equals(fs.readFileSync(second));
}

function uniquePath(dir, name) {
  let candidate = path.join(dir, name);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${name}.${suffix}`);
    suffix += 1;
  }
  return candidate;
}

function movePreservingCollisions(repo, source, name, classification, runId) {
  const canonicalDir = path.join(repo, classification.relativeDir);
  const canonical = path.join(canonicalDir, name);
  let destination = canonical;
  let reason = 'canonical';

  if (fs.existsSync(canonical)) {
    const collisionKind = filesEqual(source, canonical) ? 'duplicates' : 'conflicts';
    const quarantineDir = path.join(repo, 'artifacts', 'root-hygiene', collisionKind, runId);
    fs.mkdirSync(quarantineDir, { recursive: true });
    destination = uniquePath(quarantineDir, name);
    reason = collisionKind === 'duplicates' ? 'duplicate_preserved' : 'conflict_preserved';
  } else {
    fs.mkdirSync(canonicalDir, { recursive: true });
  }

  fs.renameSync(source, destination);
  return {
    name,
    lane: classification.lane,
    reason,
    from: path.relative(repo, source),
    to: path.relative(repo, destination),
  };
}

function inspect(repo) {
  const tracked = trackedRootNames(repo);
  const rootNames = fs.readdirSync(repo).sort();
  const ignored = ignoredRootNames(repo, rootNames);
  const eligible = [];
  const protectedFiles = [];

  for (const name of rootNames) {
    const classification = destinationFor(name);
    if (!classification) continue;
    const absolute = path.join(repo, name);
    const stat = fs.lstatSync(absolute);
    if (tracked.has(name)) {
      protectedFiles.push({ name, reason: 'tracked' });
    } else if (stat.isSymbolicLink()) {
      protectedFiles.push({ name, reason: 'symlink' });
    } else if (!stat.isFile()) {
      protectedFiles.push({ name, reason: 'not_regular_file' });
    } else if (!ignored.has(name)) {
      protectedFiles.push({ name, reason: 'not_gitignored' });
    } else {
      eligible.push({ name, absolute, classification });
    }
  }

  return { rootEntryCount: rootNames.length, eligible, protectedFiles };
}

function writeReceipt(repo, report) {
  const receiptDir = path.join(repo, 'artifacts', 'root-hygiene');
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(
    path.join(receiptDir, 'latest.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function execute(args) {
  const repo = resolveRepo(args.repo);
  const checkedAt = new Date().toISOString();
  const runId = checkedAt.replace(/[:.]/g, '-');
  const inspection = inspect(repo);
  const moves = [];

  if (args.repair) {
    for (const candidate of inspection.eligible) {
      moves.push(movePreservingCollisions(
        repo,
        candidate.absolute,
        candidate.name,
        candidate.classification,
        runId,
      ));
    }
  }

  const after = args.repair ? inspect(repo) : inspection;
  const report = {
    checkedAt,
    repo,
    mode: args.repair ? 'repair' : 'check',
    rootEntryCount: inspection.rootEntryCount,
    eligibleBefore: inspection.eligible.length,
    moved: moves.length,
    eligibleAfter: after.eligible.length,
    protected: inspection.protectedFiles,
    moves,
    healthy: after.eligible.length === 0,
  };
  if (args.repair) writeReceipt(repo, report);
  return report;
}

function render(report) {
  return [
    `Repository root hygiene: ${report.healthy ? 'HEALTHY' : 'DRIFT'}`,
    `Mode: ${report.mode}`,
    `Known generated files before: ${report.eligibleBefore}`,
    `Moved without overwrite: ${report.moved}`,
    `Known generated files after: ${report.eligibleAfter}`,
    `Protected matching files left untouched: ${report.protected.length}`,
  ].join('\n');
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
  } else {
    const report = execute(args);
    console.log(args.json ? JSON.stringify(report, null, 2) : render(report));
    if (!args.repair && !report.healthy) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exitCode = 2;
}
