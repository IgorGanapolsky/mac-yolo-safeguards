#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const EXPECTED_BUT_VERSION = '0.22.1';
const SHARED_PRIMARY_ROOTS = new Set([
  '/Users/igorganapolsky/workspace/git/igor/ThumbGate',
  '/Users/igorganapolsky/workspace/git/igor/RealEstate',
  '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards',
]);
const ACTIVE_PLAN_STATES = new Set(['in_progress', 'blocked']);

function runFile(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 15_000,
  }).trim();
}

function safeJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveGitPath(repoRoot, value) {
  return path.resolve(repoRoot, value);
}

function inspectRepository(repoPath) {
  const requestedPath = path.resolve(repoPath || process.cwd());
  let repoRoot;
  try {
    repoRoot = runFile('git', ['-C', requestedPath, 'rev-parse', '--show-toplevel']);
  } catch {
    return {
      isGitRepo: false,
      requestedPath,
      repoRoot: null,
      currentBranch: null,
      isLinkedWorktree: false,
      worktreeCount: 0,
      dirtyEntryCount: null,
    };
  }

  const gitDir = resolveGitPath(
    repoRoot,
    runFile('git', ['-C', repoRoot, 'rev-parse', '--git-dir']),
  );
  const commonDir = resolveGitPath(
    repoRoot,
    runFile('git', ['-C', repoRoot, 'rev-parse', '--git-common-dir']),
  );
  const worktreeOutput = runFile('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain']);
  const currentBranch = runFile('git', ['-C', repoRoot, 'branch', '--show-current']) || null;
  const dirtyOutput = runFile('git', ['-C', repoRoot, 'status', '--porcelain']);

  return {
    isGitRepo: true,
    requestedPath,
    repoRoot: path.resolve(repoRoot),
    gitDir,
    commonDir,
    currentBranch,
    isLinkedWorktree: gitDir !== commonDir,
    worktreeCount: worktreeOutput
      .split('\n')
      .filter((line) => line.startsWith('worktree ')).length,
    dirtyEntryCount: dirtyOutput ? dirtyOutput.split('\n').length : 0,
  };
}

function selectWriteRail(input) {
  const forbiddenButCommands = ['setup', 'teardown', 'land'];
  if (!input.isGitRepo) {
    return {
      rail: 'blocked-not-git',
      butSetupAllowed: false,
      forbiddenButCommands,
      reason: 'Target is not a Git repository.',
    };
  }

  if (input.isLinkedWorktree) {
    return {
      rail: 'git-linked-worktree',
      butSetupAllowed: false,
      forbiddenButCommands,
      reason: 'GitButler does not support linked worktrees; use worktree-local Git writes.',
    };
  }

  if (Number(input.worktreeCount) > 1) {
    return {
      rail: 'git-isolated-worktree-required',
      butSetupAllowed: false,
      forbiddenButCommands,
      reason: `${Number(input.worktreeCount)} worktrees share this repository; keep the primary checkout unchanged and write only in an owned linked worktree.`,
    };
  }

  if (SHARED_PRIMARY_ROOTS.has(path.resolve(input.repoRoot || '.'))) {
    return {
      rail: 'git-isolated-worktree-required',
      butSetupAllowed: false,
      forbiddenButCommands,
      reason: 'Known fleet primary checkout; use an owned isolated lane instead of GitButler setup.',
    };
  }

  if (!input.singleOwnerClone) {
    return {
      rail: 'blocked-owner-unproven',
      butSetupAllowed: false,
      forbiddenButCommands,
      reason: 'One worktree is not proof of sole ownership; pass --single-owner-clone only for a clone no sibling agent uses.',
    };
  }

  return {
    rail: 'gitbutler-workspace',
    butSetupAllowed: true,
    forbiddenButCommands: ['land'],
    reason: 'Single-owner isolated clone with one worktree; GitButler workspace setup is the selected rail.',
  };
}

function packageScripts(repoRoot) {
  const pkg = safeJsonFile(path.join(repoRoot, 'package.json'));
  return pkg && pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
}

function detectTrunk(repoRoot) {
  const workflows = path.join(repoRoot, '.github', 'workflows');
  try {
    return fs.readdirSync(workflows).some((name) => {
      if (!/\.ya?ml$/i.test(name)) return false;
      const body = fs.readFileSync(path.join(workflows, name), 'utf8');
      return /\/trunk merge|trunk merge queue/i.test(body);
    });
  } catch {
    return false;
  }
}

function selectMergeRail(input) {
  if (typeof input.packageScripts?.['pr:manage'] === 'string') {
    return {
      rail: 'npm-pr-manage-trunk',
      command: 'npm run pr:manage',
      ready: true,
      butLandAllowed: false,
      reason: 'Repository pr:manage script owns protected Trunk submission.',
    };
  }

  if (input.trunkDetected) {
    return {
      rail: 'trunk-detected-manager-missing',
      command: null,
      ready: false,
      butLandAllowed: false,
      reason: 'Trunk is present but no repository pr:manage script was found; stop instead of posting or landing directly.',
    };
  }

  return {
    rail: 'repository-policy-required',
    command: null,
    ready: false,
    butLandAllowed: false,
    reason: 'No repository-native protected merge manager was detected; inspect repository policy and do not use but land.',
  };
}

function normalizeClaimedPath(value) {
  return String(value || '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

function parseActivePlanClaims(planText) {
  const claims = [];
  for (const line of String(planText || '').split('\n')) {
    if (!line.startsWith('|')) continue;
    const columns = line.split('|').map((part) => part.trim());
    if (columns.length < 7) continue;
    const taskId = columns[1];
    const status = String(columns[3] || '').toLowerCase();
    const owner = columns[4];
    if (!/^T-/i.test(taskId) || !ACTIVE_PLAN_STATES.has(status) || !owner) continue;
    const files = Array.from(String(columns[5] || '').matchAll(/`([^`]+)`/g))
      .map((match) => normalizeClaimedPath(match[1]))
      .filter(Boolean);
    claims.push({ taskId, status, owner, files });
  }
  return claims;
}

function claimMatchesFile(claimed, file) {
  const normalized = normalizeClaimedPath(claimed);
  if (normalized === file) return true;
  if (normalized.endsWith('/**')) return file.startsWith(normalized.slice(0, -2));
  if (normalized.endsWith('/')) return file.startsWith(normalized);
  return false;
}

function evaluateOwnership(input) {
  const files = Array.from(new Set((input.files || []).map(normalizeClaimedPath).filter(Boolean)));
  const branchMatch = Boolean(
    input.requestedBranch &&
      input.currentBranch &&
      input.requestedBranch === input.currentBranch &&
      !['main', 'master'].includes(input.currentBranch),
  );
  const missing = [];
  const collisions = [];

  for (const file of files) {
    const matching = (input.claims || []).filter((claim) =>
      (claim.files || []).some((claimed) => claimMatchesFile(claimed, file)),
    );
    const own = matching.some((claim) => claim.owner === input.agent);
    const foreignOwners = Array.from(
      new Set(matching.filter((claim) => claim.owner !== input.agent).map((claim) => claim.owner)),
    ).sort();
    if (!own) missing.push(file);
    if (foreignOwners.length) collisions.push({ file, owners: foreignOwners });
  }

  return {
    ok: Boolean(input.agent) && branchMatch && files.length > 0 && missing.length === 0 && collisions.length === 0,
    agent: input.agent || null,
    requestedBranch: input.requestedBranch || null,
    currentBranch: input.currentBranch || null,
    branchMatch,
    files,
    missing,
    collisions,
  };
}

function officialSkillPath() {
  const candidates = [
    path.join(os.homedir(), '.agents', 'skills', 'gitbutler', 'SKILL.md'),
    path.join(os.homedir(), '.codex', 'skills', 'gitbutler', 'SKILL.md'),
    path.join(os.homedir(), '.grok', 'skills', 'gitbutler', 'SKILL.md'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function readFrontmatterVersion(filePath) {
  if (!filePath) return null;
  try {
    const match = fs.readFileSync(filePath, 'utf8').match(/^version:\s*['"]?([^'"\s]+)['"]?\s*$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function inspectGitButlerHealth() {
  let cliVersion = null;
  let cliInstalled = false;
  try {
    const versionOutput = runFile('but', ['--version']);
    cliVersion = (versionOutput.match(/\b(\d+\.\d+\.\d+)\b/) || [])[1] || null;
    cliInstalled = Boolean(cliVersion);
  } catch {
    cliInstalled = false;
  }

  let skillCheckHealthy = false;
  let installedSkillCount = null;
  if (cliInstalled) {
    try {
      const skillOutput = runFile('but', ['skill', 'check']);
      skillCheckHealthy = /all skills are up to date/i.test(skillOutput);
      installedSkillCount = Number((skillOutput.match(/Found\s+(\d+)\s+skill installation/i) || [])[1]) || null;
    } catch {
      skillCheckHealthy = false;
    }
  }

  const skillPath = officialSkillPath();
  const officialSkillVersion = readFrontmatterVersion(skillPath);
  return {
    ok:
      cliInstalled &&
      cliVersion === EXPECTED_BUT_VERSION &&
      skillCheckHealthy &&
      officialSkillVersion === EXPECTED_BUT_VERSION,
    cliInstalled,
    cliVersion,
    expectedVersion: EXPECTED_BUT_VERSION,
    officialSkillPath: skillPath,
    officialSkillVersion,
    skillCheckHealthy,
    installedSkillCount,
  };
}

function inspectLegacySetupGuard(repoRoot) {
  const candidates = [
    path.join(
      os.homedir(),
      '.agents',
      'skills',
      'gitbutler-fleet-safe',
      'scripts',
      'assert_but_setup_safe.sh',
    ),
    path.join(
      os.homedir(),
      '.grok',
      'skills',
      'gitbutler-fleet-safe',
      'scripts',
      'assert_but_setup_safe.sh',
    ),
  ];
  const guardPath = candidates.find((candidate) => fs.existsSync(candidate)) || null;
  if (!guardPath || !repoRoot) {
    return {
      available: false,
      executable: false,
      path: guardPath,
      exitCode: null,
      disposition: 'unavailable',
      message: null,
    };
  }

  const executable = Boolean(fs.statSync(guardPath).mode & 0o111);
  const probe = spawnSync('bash', [guardPath, repoRoot], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
  });
  const message = `${probe.stderr || ''}\n${probe.stdout || ''}`
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return {
    available: true,
    executable,
    path: guardPath,
    exitCode: probe.status,
    disposition: probe.status === 0 ? 'allowed' : 'refused',
    message: message || null,
  };
}

function sanitizeAuthState(input) {
  const knownAccounts = input.forgeSettings?.github?.knownAccounts;
  const githubAccounts = Array.isArray(knownAccounts) ? knownAccounts : [];
  const usernames = Array.from(
    new Set(githubAccounts.map((account) => account?.username).filter(Boolean)),
  );
  const cloudAccount = input.cloudUser?.login || input.cloudUser?.email || null;

  return {
    gitButlerCloud: { configured: Boolean(cloudAccount), account: cloudAccount },
    forge: {
      configured: usernames.length > 0,
      provider: usernames.length ? 'github' : null,
      accounts: usernames,
      credentialReferencePresent: githubAccounts.some((account) => Boolean(account?.access_token_key)),
    },
    githubCli: { authenticated: Boolean(input.ghAuthenticated) },
  };
}

function inspectAuthState() {
  const appRoot = path.join(os.homedir(), 'Library', 'Application Support', 'com.gitbutler.app');
  let ghAuthenticated = false;
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 10_000 });
    ghAuthenticated = true;
  } catch {
    ghAuthenticated = false;
  }
  return sanitizeAuthState({
    forgeSettings: safeJsonFile(path.join(appRoot, 'forge_settings.json')),
    cloudUser: safeJsonFile(path.join(appRoot, 'user.json')),
    ghAuthenticated,
  });
}

function argValues(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) values.push(argv[index + 1]);
  }
  return values;
}

function argValue(argv, name, fallback = null) {
  const values = argValues(argv, name);
  return values.length ? values[values.length - 1] : fallback;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function usage() {
  return `gitbutler-route (read-only)

Usage:
  bin/gitbutler-route --repo PATH --agent NAME --branch BRANCH --file PATH [--file PATH] --json
  bin/gitbutler-route ... --single-owner-clone --operation work|merge --require-ready

Safety:
  This command is always a dry run. It never runs but setup, but teardown, but land,
  git commit, git push, a PR manager, or a merge command.`;
}

function buildReport(options) {
  const repo = inspectRepository(options.repoPath);
  const planPath = repo.repoRoot ? path.join(repo.repoRoot, 'plan.md') : null;
  const planText = planPath && fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : '';
  const ownership = evaluateOwnership({
    agent: options.agent,
    requestedBranch: options.branch,
    currentBranch: repo.currentBranch,
    files: options.files,
    claims: parseActivePlanClaims(planText),
  });
  const writeRail = selectWriteRail({
    ...repo,
    singleOwnerClone: options.singleOwnerClone,
  });
  const mergeRail = repo.repoRoot
    ? selectMergeRail({
        packageScripts: packageScripts(repo.repoRoot),
        trunkDetected: detectTrunk(repo.repoRoot),
      })
    : selectMergeRail({ packageScripts: {}, trunkDetected: false });
  const gitButler = inspectGitButlerHealth();
  gitButler.legacySetupGuard = inspectLegacySetupGuard(repo.repoRoot);
  const auth = inspectAuthState();
  const writeRailReady = !writeRail.rail.startsWith('blocked-');
  const mergeReady = options.operation !== 'merge' || (mergeRail.ready && auth.githubCli.authenticated);
  const ready = ownership.ok && writeRailReady && gitButler.ok && mergeReady;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    mutationsExecuted: false,
    operation: options.operation,
    ready,
    repository: repo,
    request: {
      agent: options.agent || null,
      branch: options.branch || null,
      files: options.files,
      singleOwnerClone: options.singleOwnerClone,
    },
    ownership,
    gitButler,
    auth,
    writeRail,
    mergeRail,
    safety: {
      setupExecuted: false,
      teardownExecuted: false,
      landExecuted: false,
      mergeExecuted: false,
    },
  };
}

function main(argv = process.argv.slice(2)) {
  if (hasFlag(argv, '--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const files = [
    ...argValues(argv, '--file'),
    ...argValues(argv, '--files').flatMap((value) => value.split(',')),
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  const operation = argValue(argv, '--operation', 'work');
  if (!['work', 'merge'].includes(operation)) {
    process.stderr.write(`Unsupported operation: ${operation}\n`);
    process.exitCode = 2;
    return;
  }

  const report = buildReport({
    repoPath: argValue(argv, '--repo', process.cwd()),
    agent: argValue(argv, '--agent'),
    branch: argValue(argv, '--branch'),
    files,
    singleOwnerClone: hasFlag(argv, '--single-owner-clone'),
    operation,
  });

  if (hasFlag(argv, '--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `GitButler route: ${report.writeRail.rail}`,
        `Ready: ${report.ready}`,
        `Worktrees: ${report.repository.worktreeCount}`,
        `Ownership: ${report.ownership.ok}`,
        `but: ${report.gitButler.cliVersion || 'unavailable'} (skills=${report.gitButler.skillCheckHealthy})`,
        `Merge rail: ${report.mergeRail.rail}`,
        report.writeRail.reason,
      ].join('\n') + '\n',
    );
  }

  if (hasFlag(argv, '--require-ready') && !report.ready) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = {
  EXPECTED_BUT_VERSION,
  SHARED_PRIMARY_ROOTS,
  buildReport,
  evaluateOwnership,
  inspectAuthState,
  inspectGitButlerHealth,
  inspectLegacySetupGuard,
  inspectRepository,
  parseActivePlanClaims,
  sanitizeAuthState,
  selectMergeRail,
  selectWriteRail,
};
