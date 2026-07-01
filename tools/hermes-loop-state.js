#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(DEFAULT_REPO, 'artifacts', 'hermes-loop-state');
const CODERABBIT_LOOP_URL = 'https://www.coderabbit.ai/blog/loop-engineering';

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bphx_[A-Za-z0-9_]{20,}\b/g,
  /\bphc_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b([A-Z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*=)([^\s"'`]+)/gi,
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repo: DEFAULT_REPO,
    outDir: DEFAULT_OUT_DIR,
    json: false,
    noWrite: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--out-dir') args.outDir = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--no-write') args.noWrite = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (match, prefix) => {
      if (typeof prefix === 'string' && prefix.endsWith('=')) return `${prefix}[REDACTED]`;
      return '[REDACTED]';
    });
  }
  return text;
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, path: filePath };
  try {
    return {
      exists: true,
      path: filePath,
      value: JSON.parse(fs.readFileSync(filePath, 'utf8')),
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      parseError: error.message,
    };
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
    shell: false,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: redact((result.stdout || '').trim()),
    stderr: redact((result.stderr || '').trim()),
  };
}

function parsePlanTasks(planText) {
  const tasks = [];
  for (const line of planText.split('\n')) {
    if (!/^\| T-\d+/.test(line)) continue;
    const columns = line.split('|').map((part) => part.trim()).filter(Boolean);
    if (columns.length < 6) continue;
    tasks.push({
      id: columns[0],
      title: columns[1],
      status: columns[2],
      owner: columns[3],
      files: columns[4],
      acceptanceCheck: columns[5],
    });
  }
  return tasks;
}

function parseLatestProof(repo) {
  const proofPath = path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json');
  const proof = readJson(proofPath);
  if (!proof.exists || proof.parseError) return proof;
  const value = proof.value || {};
  return {
    exists: true,
    path: proofPath,
    updatedAt: value.updatedAt || value.checkedAt || value.timestamp || null,
    unit: value.unit || null,
    e2e: value.e2e || value.status || null,
    detail: value.detail || null,
    flows: Array.isArray(value.flows) ? value.flows : [],
    logDir: value.logDir || null,
  };
}

function collectGit(repo, injectedStatusLines = null) {
  const branch = run('git', ['branch', '--show-current'], repo);
  const head = run('git', ['rev-parse', '--short', 'HEAD'], repo);
  const statusLines = injectedStatusLines || (run('git', ['status', '--porcelain'], repo).stdout.split('\n').filter(Boolean));
  return {
    branch: branch.ok ? branch.stdout : null,
    head: head.ok ? head.stdout : null,
    dirtyCount: statusLines.length,
    dirtyFiles: statusLines.slice(0, 50),
    dirtyFilesTruncated: statusLines.length > 50,
  };
}

function qualityGates(plan, git, proof) {
  const activeTasks = plan.tasks.filter((task) => task.status === 'in_progress' || task.status === 'blocked');
  const gates = [
    {
      key: 'unit',
      status: proof.unit === 'pass' ? 'pass' : 'fail',
      evidence: proof.exists ? `unit=${proof.unit || 'missing'}` : 'latest.json missing',
    },
    {
      key: 'continuous_e2e',
      status: proof.e2e === 'pass' ? 'pass' : 'fail',
      evidence: proof.exists ? `e2e=${proof.e2e || 'missing'} ${proof.detail || ''}`.trim() : 'latest.json missing',
    },
    {
      key: 'worktree',
      status: git.dirtyCount === 0 ? 'pass' : 'warn',
      evidence: `${git.dirtyCount} dirty entries`,
    },
    {
      key: 'active_plan_tasks',
      status: activeTasks.length === 0 ? 'pass' : 'warn',
      evidence: activeTasks.map((task) => `${task.id}:${task.status}:${task.owner}`).join(', ') || 'none',
    },
  ];
  return gates;
}

function nextActions(plan, git, proof, gates) {
  const actions = [];
  if (proof.e2e && proof.e2e !== 'pass') {
    actions.push({
      key: 'resolve_continuous_e2e_failure',
      owner: 'verifier',
      reason: `continuous E2E is ${proof.e2e}`,
      command: 'cat hermes-mobile/docs/proofs/continuous/latest.json',
      evidence: proof.flows.length ? proof.flows.join(', ') : proof.detail || 'latest proof is not passing',
    });
  }
  const blocked = plan.tasks.filter((task) => task.status === 'blocked');
  for (const task of blocked) {
    actions.push({
      key: 'unblock_plan_task',
      owner: task.owner,
      reason: `${task.id} is blocked`,
      command: `rg -n "${task.id}" plan.md`,
      evidence: task.acceptanceCheck,
    });
  }
  const active = plan.tasks.filter((task) => task.status === 'in_progress');
  if (active.length > 0) {
    actions.push({
      key: 'finish_or_block_active_tasks',
      owner: 'current-agent',
      reason: `${active.length} task(s) are still in progress`,
      command: 'node tools/hermes-loop-state.js --json',
      evidence: active.map((task) => `${task.id}:${task.title}`).join('; '),
    });
  }
  if (git.dirtyCount > 0) {
    actions.push({
      key: 'verify_current_diff',
      owner: 'current-agent',
      reason: 'worktree has uncommitted changes',
      command: 'git status --short',
      evidence: `${git.dirtyCount} dirty entries`,
    });
  }
  if (actions.length === 0 && gates.every((gate) => gate.status === 'pass')) {
    actions.push({
      key: 'open_next_small_task',
      owner: 'loop-orchestrator',
      reason: 'all gates are green',
      command: 'node tools/hermes-loop-engine.js next --json',
      evidence: 'ready for one bounded loop action',
    });
  }
  return actions.slice(0, 5);
}

function buildLoopState(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const planPath = path.join(repo, 'plan.md');
  const planText = readText(planPath);
  const plan = {
    path: planPath,
    tasks: parsePlanTasks(planText),
  };
  const git = collectGit(repo, options.gitStatusLines || null);
  const proof = parseLatestProof(repo);
  const gates = qualityGates(plan, git, proof);
  const actions = nextActions(plan, git, proof, gates);
  const hardBlocked = gates.some((gate) => gate.status === 'fail');
  const state = {
    schema: 'hermes-loop-state/v1',
    generatedAt: options.now || new Date().toISOString(),
    inspiration: {
      source: CODERABBIT_LOOP_URL,
      adoptedPrinciples: [
        'scheduled loops need a durable state file',
        'worktrees and plan ownership prevent agents from overwriting each other',
        'quality gates must be external to the code-writing agent',
        'each loop run should produce a resumable record of what failed and what is next',
      ],
    },
    repo: {
      path: repo,
      branch: git.branch,
      head: git.head,
    },
    gates,
    readyToMergeOrPublish: !hardBlocked && git.dirtyCount === 0 && plan.tasks.every((task) => task.status !== 'in_progress' && task.status !== 'blocked'),
    plan: {
      activeTasks: plan.tasks.filter((task) => task.status === 'in_progress' || task.status === 'blocked'),
      taskCount: plan.tasks.length,
    },
    git,
    latestProof: proof,
    nextActions: actions,
  };
  return JSON.parse(redact(state));
}

function renderMarkdown(state) {
  const lines = [
    '# Hermes Loop State',
    '',
    `Generated: ${state.generatedAt}`,
    `Repo: ${state.repo.path}`,
    `Branch: ${state.repo.branch || 'unknown'} @ ${state.repo.head || 'unknown'}`,
    `Ready to merge/publish: ${state.readyToMergeOrPublish ? 'yes' : 'no'}`,
    '',
    '## Gates',
    '',
    '| Gate | Status | Evidence |',
    '| --- | --- | --- |',
  ];
  for (const gate of state.gates) {
    lines.push(`| ${gate.key} | ${gate.status} | ${String(gate.evidence || '').replace(/\|/g, '/')} |`);
  }
  lines.push('', '## Next Actions', '');
  for (const action of state.nextActions) {
    lines.push(`- ${action.key}: ${action.reason}`);
    lines.push(`  - Command: \`${action.command}\``);
    lines.push(`  - Evidence: ${action.evidence}`);
  }
  if (state.nextActions.length === 0) lines.push('- none');
  lines.push('', '## Active Plan Tasks', '');
  for (const task of state.plan.activeTasks) {
    lines.push(`- ${task.id} ${task.status} ${task.owner}: ${task.title}`);
  }
  if (state.plan.activeTasks.length === 0) lines.push('- none');
  lines.push('', '## Dirty Files', '');
  for (const file of state.git.dirtyFiles) lines.push(`- \`${file}\``);
  if (state.git.dirtyFiles.length === 0) lines.push('- none');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeArtifacts(state, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'latest.json');
  const mdPath = path.join(outDir, 'latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(state));
  return { jsonPath, mdPath };
}

function usage() {
  return `Usage:
  node tools/hermes-loop-state.js [--json] [--repo PATH] [--out-dir PATH] [--no-write]

Builds a CodeRabbit-style durable loop-state packet from plan.md, git status,
and hermes-mobile/docs/proofs/continuous/latest.json.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return { help: true };
  }
  const state = buildLoopState({ repo: args.repo });
  const artifacts = args.noWrite ? null : writeArtifacts(state, args.outDir);
  const result = { ...state, artifacts };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderMarkdown(state));
  return result;
}

module.exports = {
  CODERABBIT_LOOP_URL,
  buildLoopState,
  parseArgs,
  parsePlanTasks,
  qualityGates,
  renderMarkdown,
  writeArtifacts,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
