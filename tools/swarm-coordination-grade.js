#!/usr/bin/env node
'use strict';

/**
 * Evidence grade for the multi-agent swarm.
 *
 * The overall score is the lowest measured surface. A self-reported 10
 * without a command result cannot become A+. The judge seat scores the
 * diff and does not edit the worker's files.
 *
 *   node tools/swarm-coordination-grade.js --probe
 *   node tools/swarm-coordination-grade.js --evidence evidence.json
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FRONTIER = /auth|session|secret|token|stripe|checkout|billing|payment|security-audit|path-normalizer/i;

function letter(score) {
  if (score === null || score === undefined) return 'unmeasured';
  if (score >= 10) return 'A+';
  if (score >= 9) return 'A';
  if (score >= 8) return 'A-';
  if (score >= 7) return 'B';
  if (score >= 6) return 'B-';
  if (score >= 5) return 'C';
  if (score >= 4) return 'C-';
  if (score >= 3) return 'D';
  if (score >= 2) return 'D-';
  return 'F';
}

function surface(id, score, findings) {
  const capped = score === null ? null : Math.max(0, Math.min(10, score));
  return { id, score: capped, letter: letter(capped), findings: findings || [] };
}

function finiteCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function gradeGithubIssues(github) {
  if (!github || github.openIssues == null) return surface('githubIssues', null, ['open issue count was not measured']);
  const total = finiteCount(github.openIssues);
  if (total == null) return surface('githubIssues', null, ['open issue count is not a number']);
  const held = github.securityHeld == null ? 0 : finiteCount(github.securityHeld);
  if (held == null) return surface('githubIssues', null, ['security hold count is not a number']);
  const other = total - held;
  if (other > 0) {
    return surface('githubIssues', 4, [`${other} public issues are outside the security hold`]);
  }
  if (held > 0) return surface('githubIssues', 8, [`${held} security-titled issue remains open`]);
  return surface('githubIssues', 10, ['no open public issues']);
}

function gradeGithubPrs(github) {
  if (!github || github.openPrs == null) return surface('githubPrs', null, ['open pull request count was not measured']);
  if (github.requiredRed == null) return surface('githubPrs', null, ['required check status was not measured']);
  let score = 10;
  const behind = Number(github.behindOrDirty || 0);
  if (behind > 0) score -= Math.min(5, behind);
  if (github.requiredRed) score = Math.min(score, 3);
  const findings = [];
  if (behind > 0) findings.push(`${behind} open pull requests are behind or conflicting`);
  if (github.requiredRed) findings.push('a required check is red');
  if (findings.length === 0) findings.push(`${github.openPrs} open pull requests, none behind`);
  return surface('githubPrs', score, findings);
}

function gradePlan(plan) {
  if (!plan || plan.inProgressRows == null) return surface('plan', null, ['plan.md in-progress rows were not counted']);
  let score = plan.inProgressRows > 20 ? 4 : (plan.inProgressRows <= 3 ? 10 : 7);
  const findings = [`${plan.inProgressRows} rows still say in_progress`];
  if (plan.sharedDirty) {
    score = Math.min(score, 5);
    findings.push('the shared checkout is dirty');
  }
  return surface('plan', score, findings);
}

function gradeWorktrees(worktrees) {
  if (!worktrees || worktrees.count == null) return surface('worktrees', null, ['worktree count was not measured']);
  let score = worktrees.count >= 2 ? 10 : 5;
  const findings = [`${worktrees.count} worktrees`];
  if (worktrees.sharedDirty) {
    score = Math.min(score, 7);
    findings.push('shared checkout is dirty while other agents share the prompt');
  }
  return surface('worktrees', score, findings);
}

function gradeVault(vault) {
  if (!vault || vault.exists == null) return surface('vault', null, ['vault was not measured']);
  if (!vault.exists) return surface('vault', 1, ['shared vault path is missing']);
  const age = finiteCount(vault.snapshotAgeDays);
  const ageKnown = age != null && age >= 0;
  let score = ageKnown && age <= 1 && vault.handoff ? 10 : 8;
  const findings = ['shared vault exists'];
  if (!ageKnown || age > 14) {
    score = 6;
    findings.push(`fleet snapshot is ${ageKnown ? `${age} days` : 'missing'} old`);
  }
  if (!vault.handoff) {
    score = Math.min(score, 6);
    findings.push('current-handoff.md is missing');
  }
  return surface('vault', score, findings);
}

function gradeLinear(linear) {
  if (!linear || linear.reachable == null) return surface('linear', null, ['Linear was not measured']);
  if (!linear.reachable) return surface('linear', 2, [linear.reason || 'Linear CLI did not answer']);
  const findings = ['Linear CLI answered'];
  let score = linear.fresh ? 10 : 6;
  if (linear.startedCount != null) findings.push(`${linear.startedCount} started issues sampled`);
  if (linear.limitHit) {
    score = 4;
    findings.push('the workspace issue limit was hit');
  }
  return surface('linear', score, findings);
}

function gradeGitButler(gitbutler) {
  if (!gitbutler) return surface('gitbutler', null, ['GitButler target was not measured']);
  if (gitbutler.installed === false) return surface('gitbutler', 2, ['but is not installed']);
  if (gitbutler.targetSet == null) return surface('gitbutler', null, ['GitButler target was not measured']);
  if (!gitbutler.targetSet) {
    return surface('gitbutler', 3, ['but status: no target branch is configured']);
  }
  if (gitbutler.forcePushRequired) return surface('gitbutler', 8, ['target branch is set and a force-push is still required']);
  return surface('gitbutler', 10, ['target branch is set']);
}

function gradeHerdr(herdr) {
  if (!herdr || herdr.serverRunning == null) return surface('herdr', null, ['Herdr was not measured']);
  if (!herdr.serverRunning) return surface('herdr', 2, ['Herdr server is not running']);
  if (herdr.lanesMatchRepo !== 'full') {
    const fit = herdr.lanesMatchRepo === 'partial' ? 'only some lane globs match this repository' : 'the lane globs do not match this repository';
    return surface('herdr', 5, [`Herdr is running, and ${fit}`]);
  }
  if (!herdr.sowFile) return surface('herdr', 6, ['lane globs match, and the swarm SOW file is missing']);
  if (!herdr.judgeClaimed) return surface('herdr', 8, ['the judge lane has no claimed seat']);
  return surface('herdr', 10, ['Herdr server, matching lanes, a SOW file, and a claimed judge are present']);
}

function gradeGemini(gemini) {
  if (!gemini || gemini.cli == null) return surface('gemini', null, ['Gemini was not measured']);
  if (!gemini.cli) return surface('gemini', 2, ['Gemini CLI is not installed']);
  if (gemini.notebookWired == null || gemini.judgeRun == null) {
    return surface('gemini', null, ['Gemini judge wiring was not measured']);
  }
  if (!gemini.notebookWired) {
    return surface('gemini', 4, ['Gemini CLI is installed and is not wired as the judge']);
  }
  if (!gemini.judgeRun) return surface('gemini', 8, ['Gemini is wired and has no recorded judge run']);
  return surface('gemini', 10, ['Gemini ran the judge seat']);
}

function gradeJudge(judge) {
  if (!judge || judge.hardcodedTen == null) return surface('judge', null, ['judge seat was not measured']);
  if (judge.hardcodedTen) {
    return surface('judge', 2, ['a tool still returns a constant 10/10']);
  }
  if (judge.seatDistinct == null || judge.commandResult == null) {
    return surface('judge', null, ['the judge seat was not measured']);
  }
  if (!judge.seatDistinct) {
    return surface('judge', 4, ['the judge seat is empty or is the same agent that wrote the diff']);
  }
  if (!judge.commandResult) {
    return surface('judge', 8, ['the judge is a different seat and has no command result']);
  }
  return surface('judge', 10, ['the judge is a different seat and scored a command result']);
}

function grade(evidence = {}) {
  const surfaces = [
    gradeGithubIssues(evidence.github),
    gradeGithubPrs(evidence.github),
    gradePlan(evidence.plan),
    gradeWorktrees(evidence.worktrees),
    gradeVault(evidence.vault),
    gradeLinear(evidence.linear),
    gradeGitButler(evidence.gitbutler),
    gradeHerdr(evidence.herdr),
    gradeGemini(evidence.gemini),
    gradeJudge(evidence.judge),
  ];
  const missing = surfaces.filter((item) => item.score === null).map((item) => item.id);
  const scores = surfaces.map((item) => item.score).filter((score) => score !== null);
  let overallScore = scores.length === 0 ? null : Math.min(...scores);
  if (missing.length > 0 && overallScore === 10) overallScore = 9;
  const aPlus = missing.length === 0 && surfaces.every((item) => item.score === 10);
  return {
    ok: true,
    aPlus,
    overall: {
      score: aPlus ? 10 : overallScore,
      letter: aPlus ? 'A+' : letter(overallScore),
      rule: missing.length > 0
        ? 'overall score is the lowest measured surface, and a missing surface cannot be A+'
        : 'overall score is the lowest measured surface',
    },
    missing,
    surfaces,
    sow: buildSow(evidence.prompt || ''),
  };
}

function expertTier(filePath) {
  const value = String(filePath || '').replace(/\\/g, '/');
  const base = value.split('/').pop() || '';
  if (FRONTIER.test(value)) return 'frontier';
  if (value.startsWith('.github/workflows/') || value.startsWith('tools/lib/')) return 'frontier';
  if (value === 'hermes-mobile/package.json' || value === 'hermes-mobile/package-lock.json') return 'frontier';
  if (value.startsWith('tools/') && base.startsWith('revenue-')) return 'frontier';
  if (value.endsWith('.md') && !value.startsWith('tools/') && !value.startsWith('.github/')) return 'cheap';
  return 'worker';
}

function claimFiles(board, agent, files) {
  const conflicts = [];
  for (const file of files) {
    const owner = board[file];
    if (owner && owner !== agent) conflicts.push({ file, owner });
  }
  if (conflicts.length > 0) return { ok: false, reason: 'file claimed', conflicts };
  const next = { ...board };
  for (const file of files) next[file] = agent;
  return { ok: true, board: next };
}

function judgeMayScore(workerFiles, judgeFiles) {
  const overlap = judgeFiles.filter((file) => workerFiles.includes(file));
  return { ok: overlap.length === 0, overlap };
}

function buildSow(prompt) {
  const promptHash = crypto.createHash('sha256').update(String(prompt)).digest('hex').slice(0, 12);
  return {
    id: `SOW-${promptHash}`,
    samePrompt: true,
    promptHash,
    rule: 'One prompt is broadcast. The first claim owns each file. The judge scores command output and does not edit those files.',
    lanes: [
      { seat: 'planner', tier: 'frontier', does: 'Split the prompt into one acceptance check and one file set' },
      { seat: 'worker', tier: 'cheap', does: 'Implement one unclaimed leaf' },
      { seat: 'judge', tier: 'separate', does: 'Score the diff against the acceptance check. Reject a 10 that has no command result.' },
    ],
    experts: [
      { when: 'workflows, tools/lib, auth, payments, revenue tools, package pins', tier: 'frontier' },
      { when: 'docs and plan appends', tier: 'cheap' },
      { when: 'a numeric grade or a ship claim', tier: 'judge' },
    ],
    aPlusRequires: [
      'GitButler has a target branch',
      'The vault fleet snapshot is under a day old',
      'Herdr lane globs name directories that exist in this repository, and the judge file exists',
      'Linear claims expire, and creating one does not hit the issue cap',
      'Public issues titled Security stay open, and no required check is red',
      'The judge is a different seat from the worker',
      'No tool returns a constant 10/10',
    ],
  };
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 20000,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? result.error.message : '',
  };
}

function ageDays(file) {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    return Math.floor(age / 86400000);
  } catch {
    return null;
  }
}

function laneFit(lanesPath, repoRoot) {
  if (!fs.existsSync(lanesPath)) return 'none';
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(lanesPath, 'utf8'));
  } catch {
    return 'none';
  }
  const tops = new Set();
  for (const lane of parsed.lanes || []) {
    for (const glob of lane.disjointFileGlobs || []) {
      const top = String(glob).split('/')[0];
      if (top) tops.add(top);
    }
  }
  if (tops.size === 0) return 'none';
  let hits = 0;
  for (const top of tops) {
    if (fs.existsSync(path.join(repoRoot, top))) hits += 1;
  }
  if (hits === 0) return 'none';
  if (hits === tops.size) return 'full';
  return 'partial';
}

const PAGE = 50;
const REQUIRED_CHECKS = [
  'Public funnel checks',
  'Socket Security: Project Report',
  'Hermes Mobile typecheck and tests',
  'macOS guard kit',
  'Maestro ship-guard (Android emulator)',
  'Maestro stranger cold-start (Android emulator)',
  'Hermes Mobile iPad simulator gate',
  'unit-and-coverage',
  'verify',
];

function requiredChecksRed(pulls) {
  if (!Array.isArray(pulls)) return null;
  if (pulls.length === 0) return false;
  let sawRollup = false;
  for (const pr of pulls) {
    const rollup = pr && pr.statusCheckRollup;
    if (!Array.isArray(rollup)) continue;
    sawRollup = true;
    for (const check of rollup) {
      if (!check || !REQUIRED_CHECKS.includes(check.name || check.context || '')) continue;
      const conclusion = String(check.conclusion || '').toUpperCase();
      if (conclusion === 'FAILURE' || conclusion === 'CANCELLED' || conclusion === 'TIMED_OUT') return true;
    }
  }
  return sawRollup ? false : null;
}

function pageCount(items) {
  return items.length >= PAGE ? null : items.length;
}

function gitbutlerEvidence(but) {
  if (/not found|ENOENT/.test(but.error || '')) return { installed: false, targetSet: null };
  const text = `${but.stdout || ''}\n${but.stderr || ''}`;
  if (/no target branch/i.test(text)) return { installed: true, targetSet: false };
  if (!but.ok) return { installed: true, targetSet: null };
  return { installed: true, targetSet: true };
}

function probe(repoRoot, home) {
  const root = repoRoot || process.cwd();
  const house = home || os.homedir();
  const vault = path.join(house, 'Documents', 'AI-Agent-Sync');
  const issues = run('gh', ['issue', 'list', '--state', 'open', '--limit', String(PAGE), '--json', 'number,title'], root);
  const prs = run('gh', ['pr', 'list', '--state', 'open', '--limit', String(PAGE), '--json', 'number,mergeStateStatus,statusCheckRollup'], root);
  let github = {};
  if (issues.ok && prs.ok) {
    const openIssues = JSON.parse(issues.stdout);
    const openPrs = JSON.parse(prs.stdout);
    const issueCount = pageCount(openIssues);
    const prCount = pageCount(openPrs);
    github = {
      openIssues: issueCount,
      securityHeld: openIssues.filter((item) => /^security/i.test(item.title || '')).length,
      openPrs: prCount,
      behindOrDirty: openPrs.filter((item) => /BEHIND|DIRTY|CONFLICTING/.test(item.mergeStateStatus || '')).length,
      requiredRed: prCount == null ? null : requiredChecksRed(openPrs),
    };
  }
  const planPath = path.join(root, 'plan.md');
  const planText = fs.existsSync(planPath) ? fs.readFileSync(planPath, 'utf8') : null;
  const worktreeList = run('git', ['worktree', 'list', '--porcelain'], root);
  const primary = (worktreeList.stdout.match(/^worktree (.+)$/m) || [])[1] || root;
  const shared = run('git', ['status', '--porcelain'], primary);
  const but = run('but', ['status'], root);
  const herdr = run('herdr', ['status'], root);
  const gemini = run('gemini', ['--version'], root);
  const linear = run('linear', ['issue', 'list', '--state', 'started', '--team', 'AGENT', '--limit', '50'], root);
  const engine = path.join(root, 'tools/herdr-high-roi-engine.js');
  const engineText = fs.existsSync(engine) ? fs.readFileSync(engine, 'utf8') : '';
  const lanesPath = path.join(vault, 'Agent-State', 'GitButler-Herdr-Lanes.json');
  return grade({
    prompt: 'same prompt broadcast to every agent',
    github,
    plan: {
      inProgressRows: planText == null ? null : (planText.match(/\| in_progress \|/g) || []).length,
      sharedDirty: shared.stdout.trim().length > 0,
    },
    worktrees: {
      count: worktreeList.ok ? (worktreeList.stdout.match(/^worktree /gm) || []).length : null,
      sharedDirty: shared.stdout.trim().length > 0,
    },
    vault: {
      exists: fs.existsSync(vault),
      snapshotAgeDays: ageDays(path.join(vault, 'Agent-State', 'fleet-snapshot.md')),
      handoff: fs.existsSync(path.join(vault, 'current-handoff.md')),
    },
    linear: {
      reachable: linear.ok,
      reason: linear.ok ? '' : (linear.stderr || linear.error).slice(0, 180),
      startedCount: linear.ok ? (linear.stdout.match(/AGENT-\d+/g) || []).length : null,
      limitHit: /limit/i.test(linear.stderr),
    },
    gitbutler: gitbutlerEvidence(but),
    herdr: {
      serverRunning: /status:\s*running/.test(herdr.stdout),
      lanesMatchRepo: laneFit(lanesPath, root),
      sowFile: fs.existsSync(path.join(house, '.thumbgate', 'swarm-sows.jsonl')),
    },
    gemini: {
      cli: gemini.ok,
      notebookWired: null,
      judgeRun: null,
    },
    judge: {
      hardcodedTen: engineText.includes('10/10 (HERDR_HIGH_ROI_A_PLUS)'),
      seatDistinct: null,
      commandResult: null,
    },
  });
}

function main(argv) {
  const evidenceFlag = argv.indexOf('--evidence');
  const result = evidenceFlag !== -1
    ? grade(JSON.parse(fs.readFileSync(argv[evidenceFlag + 1], 'utf8')))
    : probe(process.cwd(), os.homedir());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.aPlus ? 0 : 1;
}

if (require.main === module) main(process.argv.slice(2));

module.exports = {
  buildSow,
  claimFiles,
  expertTier,
  grade,
  judgeMayScore,
  letter,
  probe,
  requiredChecksRed,
};
