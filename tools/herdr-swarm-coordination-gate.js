#!/usr/bin/env node
'use strict';

/**
 * Coordination review for a Herdr swarm.
 * A grade is the lowest plane. An A+ is awarded only when every plane has proof.
 * This command does not call a model and does not write a second record.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const SOURCE = 'https://www.anthropic.com/research/agents-judgment-calls';
const REPO_PR = /^https:\/\/github\.com\/IgorGanapolsky\/mac-yolo-safeguards\/pull\/\d+$/;

const VENDOR_METRIC = [
  /78(?:\.5)?\s*%/i,
  /86\s*%/i,
  /93\.4\s*%/i,
  /\$0\.13/,
];

const CLAIMED_TOP = [
  /10\s*\/\s*10/,
  /\bA\+/i,
];

function filled(value) {
  return String(value == null ? '' : value).trim();
}

function sameText(left, right) {
  const a = filled(left).toLowerCase().replace(/\s+/g, ' ');
  const b = filled(right).toLowerCase().replace(/\s+/g, ' ');
  if (!a || !b) return false;
  return a === b || (b.length >= 24 && a.includes(b)) || (a.length >= 24 && b.includes(a));
}

function finding(id) {
  return { id, severity: 'block' };
}

function herdrOk(input) {
  return /^[a-f0-9]{16}$/.test(filled(input.promptHash))
    && /^[a-z0-9]+@[a-z0-9-]+$/.test(filled(input.seat))
    && /^agent\//.test(filled(input.branch))
    && input.writerCount === 1;
}

function linearOk(input) {
  if (/^[A-Z][A-Z0-9]+-\d+$/.test(filled(input.linearKey))) return true;
  const skip = filled(input.linearSkipReason);
  return skip.length >= 12 && !/\blater\b/i.test(skip);
}

function obsidianOk(input) {
  const note = filled(input.notePath);
  if (/^(?:\/Users\/[^/\s]+\/)?Documents\/(?:AI-Agent-Sync|Igor)\//.test(note) && !note.includes('business_os')) {
    return true;
  }
  const skip = filled(input.obsidianSkipReason);
  return skip.length >= 12 && !/\blater\b/i.test(skip);
}

function isolationOk(input) {
  const branch = filled(input.branch);
  const mode = filled(input.isolation).toLowerCase();
  if (!branch.startsWith('agent/')) return false;
  return mode === 'worktree' || mode === 'gitbutler';
}

function geminiOk(input) {
  if (/^https:\/\/notebooklm\.google\.com\/\S+$/.test(filled(input.notebookUrl))) return true;
  const doc = filled(input.notebookDoc);
  return doc.startsWith('docs/') && doc.endsWith('.md');
}

function coordinationTask(task) {
  return /\b(swarm|sow|herdr|lease|coordination)\b/i.test(task);
}

function githubResult(input, task) {
  const prOk = REPO_PR.test(filled(input.pullRequestUrl));
  const issue = filled(input.issueNumber);
  if (issue && coordinationTask(task) && input.publicSafe !== true) {
    return { ok: false, id: 'github_issue_is_private_board' };
  }
  if (prOk) return { ok: true };
  if (issue && input.publicSafe === true && !coordinationTask(task)) return { ok: true };
  return { ok: false, id: 'github_missing' };
}

function judgeResult(input) {
  const judge = filled(input.judgeModel).toLowerCase();
  const worker = filled(input.workerModel).toLowerCase();
  const verdict = filled(input.verdict).toLowerCase();
  const evidence = filled(input.verdictEvidence);
  if (!judge || !worker || (verdict !== 'accept' && verdict !== 'reject') || !evidence) {
    return { ok: false, id: 'judge_missing' };
  }
  if (judge === worker) return { ok: false, id: 'judge_same_model' };
  if (sameText(evidence, input.workerClaim)) return { ok: false, id: 'judge_copied_worker' };
  return { ok: true };
}

function expertsOk(input) {
  const names = Array.isArray(input.experts) ? input.experts.map(filled).filter(Boolean) : [];
  const unique = new Set(names.map((name) => name.toLowerCase()));
  const chosen = filled(input.chosenExpert).toLowerCase();
  return unique.size >= 2 && unique.has(chosen);
}

function reviewCoordination(input = {}) {
  const task = filled(input.task);
  const blob = [
    task,
    input.workerClaim,
    input.verdictEvidence,
    input.linearSkipReason,
    input.obsidianSkipReason,
  ].join('\n');
  const findings = [];
  if (VENDOR_METRIC.some((pattern) => pattern.test(blob))) findings.push(finding('vendor_metric'));

  const planes = [
    ['herdr', herdrOk(input), 'herdr_lease_missing'],
    ['linear', linearOk(input), 'linear_missing'],
    ['obsidian', obsidianOk(input), 'obsidian_missing'],
    ['gitbutler', isolationOk(input), 'isolation_missing'],
    ['gemini_notebook', geminiOk(input), 'gemini_notebook_missing'],
  ];
  const scored = planes.map(([id, ok, missing]) => {
    if (!ok) findings.push(finding(missing));
    return { id, score: ok ? 10 : 0 };
  });

  const github = githubResult(input, task);
  if (!github.ok) findings.push(finding(github.id));
  scored.push({ id: 'github', score: github.ok ? 10 : 0 });

  const judge = judgeResult(input);
  if (!judge.ok) findings.push(finding(judge.id));
  scored.push({ id: 'judge', score: judge.ok ? 10 : 0 });

  const experts = expertsOk(input);
  if (!experts) findings.push(finding('experts_missing'));
  scored.push({ id: 'experts', score: experts ? 10 : 0 });

  if (findings.some((item) => item.id === 'vendor_metric')) {
    for (const plane of scored) plane.score = 0;
  }

  const overall = scored.reduce((lowest, plane) => Math.min(lowest, plane.score), 10);
  const awardedGrade = overall === 10 && findings.length === 0 ? 'A+' : null;
  if (awardedGrade !== 'A+' && CLAIMED_TOP.some((pattern) => pattern.test(blob))) {
    findings.push(finding('grade_claimed_without_proof'));
  }

  return {
    ok: awardedGrade === 'A+',
    status: awardedGrade === 'A+' ? 'clear' : 'blocked',
    overall,
    awardedGrade,
    planes: scored,
    findings,
    measuredSavings: null,
    calledModel: false,
    source: SOURCE,
  };
}

function observeHost() {
  const home = os.homedir();
  return {
    herdrBinary: fs.existsSync(path.join(home, '.local/bin/herdr')),
    gitButlerBinary: fs.existsSync(path.join(home, '.local/bin/but')),
    vaultSowDir: fs.existsSync(path.join(home, 'Documents/AI-Agent-Sync/Swarm-SOWs')),
    awardedGrade: null,
    measuredSavings: null,
    calledModel: false,
  };
}

function formatStatus(host) {
  return [
    'Swarm coordination review is ready. This command does not award a grade.',
    'Herdr binary on disk: ' + (host.herdrBinary ? 'yes' : 'no'),
    'GitButler binary on disk: ' + (host.gitButlerBinary ? 'yes' : 'no'),
    'Vault swarm folder on disk: ' + (host.vaultSowDir ? 'yes' : 'no'),
    'awardedGrade: null',
  ].join('\n');
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--review')) {
    const report = reviewCoordination({
      task: argValue(argv, '--task'),
      promptHash: argValue(argv, '--prompt-hash'),
      seat: argValue(argv, '--seat'),
      branch: argValue(argv, '--branch'),
      writerCount: Number(argValue(argv, '--writers')),
      isolation: argValue(argv, '--isolation'),
      linearKey: argValue(argv, '--linear'),
      linearSkipReason: argValue(argv, '--linear-skip'),
      notePath: argValue(argv, '--note'),
      obsidianSkipReason: argValue(argv, '--note-skip'),
      notebookUrl: argValue(argv, '--notebook'),
      notebookDoc: argValue(argv, '--notebook-doc'),
      pullRequestUrl: argValue(argv, '--pr'),
      issueNumber: argValue(argv, '--issue'),
      publicSafe: argv.includes('--public-safe'),
      judgeModel: argValue(argv, '--judge'),
      workerModel: argValue(argv, '--worker'),
      verdict: argValue(argv, '--verdict'),
      verdictEvidence: argValue(argv, '--verdict-evidence'),
      workerClaim: argValue(argv, '--worker-claim'),
      experts: filled(argValue(argv, '--experts')).split(',').filter(Boolean),
      chosenExpert: argValue(argv, '--chosen'),
    });
    if (argv.includes('--json')) console.log(JSON.stringify(report));
    else {
      console.log(formatStatus(observeHost()));
      console.log(report.awardedGrade === 'A+' ? 'Review: A+' : 'Review: blocked');
      console.log('overall: ' + report.overall);
      for (const item of report.findings) console.log('blocked: ' + item.id);
    }
    process.exit(report.ok ? 0 : 2);
  }

  const host = observeHost();
  if (argv.includes('--json')) console.log(JSON.stringify(host));
  else console.log(formatStatus(host));
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  reviewCoordination,
  observeHost,
};
