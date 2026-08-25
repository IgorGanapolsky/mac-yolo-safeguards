#!/usr/bin/env node
'use strict';

/**
 * Anthropic AI-native SDLC playbook adapter for this repo.
 *
 * Source: https://claude.com/blog/the-ai-native-sdlc-playbook
 *         Louis Claxton, 2026-08-21
 *
 * Steal: committed artifact chain (intent → spec → plan → tests/diff →
 * PR/REVIEW.md → incident draft). Do not clone Claude Code, evals YAML,
 * MDM managed settings, Western Electric auto-quarantine, or Continuity.
 *
 * AGENT-407 owns `.intent/contract.yaml` + `scripts/intent-check.js`.
 * This tool must not write those files.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = 'https://claude.com/blog/the-ai-native-sdlc-playbook';
const INTENT_CONTRACT = '.intent/contract.yaml';
const INTENT_CHECK = 'scripts/intent-check.js';
const REPO_ROOT = path.resolve(__dirname, '..');

const PLAYS = Object.freeze([
  {
    id: 'intent-md',
    stage: 'plan',
    verdict: 'ADAPTER',
    analog: 'intent/TEMPLATE.md',
    dualEditForbidden: INTENT_CONTRACT,
    reason: 'Playbook intent.md home; Tieline contract stays AGENT-407',
  },
  {
    id: 'spec-md',
    stage: 'design',
    verdict: 'ADAPTER',
    analog: 'spec/TEMPLATE.md',
    reason: 'Requirements + design in one committed spec',
  },
  {
    id: 'plan-md',
    stage: 'build',
    verdict: 'HAVE',
    analog: 'plan.md',
    reason: 'Repo coordination board is already the committed plan artifact',
  },
  {
    id: 'agents-md',
    stage: 'build',
    verdict: 'HAVE',
    analog: 'AGENTS.md',
    reason: 'CLAUDE.md analog; CLAUDE.md is a pointer',
  },
  {
    id: 'skills',
    stage: 'build',
    verdict: 'HAVE',
    analog: 'SKILLS.md + .agents/skills',
    reason: 'Institutional knowledge already versioned as skills',
  },
  {
    id: 'hooks',
    stage: 'build',
    verdict: 'HAVE',
    analog: 'PreToolUse + .githooks',
    reason: 'Deterministic layer behind advisory skills already exists',
  },
  {
    id: 'worktrees',
    stage: 'build',
    verdict: 'HAVE',
    analog: 'git worktrees (.worktrees/)',
    reason: 'One agent per isolated worktree is already the fleet rule',
  },
  {
    id: 'feedback-loop',
    stage: 'test',
    verdict: 'HAVE',
    analog: 'node tests/*.js in CI + AGENTS.md change protocol',
    reason: 'Session verifies before a human sees the diff',
  },
  {
    id: 'fix-code-not-test',
    stage: 'test',
    verdict: 'ADAPTER',
    analog: 'testEditPolicy()',
    reason: 'Bugfix must not weaken tests',
  },
  {
    id: 'claude-evals-yaml',
    stage: 'test',
    verdict: 'SKIP',
    analog: null,
    reason: 'Claude Code evals spend Anthropic API; existing node tests are the suite',
  },
  {
    id: 'review-md',
    stage: 'deploy',
    verdict: 'ADAPTER',
    analog: 'REVIEW.md',
    reason: 'Three passes + nit cap; findings do not approve the PR',
  },
  {
    id: 'pr-review-loop',
    stage: 'deploy',
    verdict: 'HAVE',
    analog: 'GitHub 7 required checks + Greptile',
    reason: 'Stay on GitHub Actions; do not migrate CI',
  },
  {
    id: 'production-gate',
    stage: 'deploy',
    verdict: 'ADAPTER',
    analog: 'productionGate()',
    reason: 'Humans-only past production; not a Claude Code settings.json hook',
  },
  {
    id: 'mdm-managed-settings',
    stage: 'deploy',
    verdict: 'SKIP',
    analog: null,
    reason: 'Claude Code MDM / admin console; we are not that product',
  },
  {
    id: 'maintain-writeback',
    stage: 'maintain',
    verdict: 'ADAPTER',
    analog: 'incidentToIntent() draft',
    reason: 'Incident becomes intent.md draft; no auto-PR, no auto-merge',
  },
  {
    id: 'western-electric-auto-quarantine',
    stage: 'maintain',
    verdict: 'SKIP',
    analog: null,
    reason: 'Auto-quarantine / auto-loop SKU; detection is not an execute license',
  },
  {
    id: 'claude-tag-on-call',
    stage: 'maintain',
    verdict: 'SKIP',
    analog: null,
    reason: 'Claude Tag Slack product',
  },
  {
    id: 'continuity-close-loop',
    stage: 'maintain',
    verdict: 'SKIP',
    analog: null,
    reason: 'Hosted VPS product lock; no Mac-pair / RUN ON / Continuity hero',
  },
  {
    id: 'claude-code-auto-mode',
    stage: 'build',
    verdict: 'SKIP',
    analog: null,
    reason: 'Do not clone Claude Code auto-accept',
  },
]);

const ARTIFACT_CHAIN = Object.freeze([
  { stage: 'plan', artifact: 'intent.md', analog: 'intent/', next: 'spec.md' },
  { stage: 'design', artifact: 'spec.md', analog: 'spec/', next: 'plan.md' },
  { stage: 'build', artifact: 'plan.md', analog: 'plan.md', next: 'tests/diff' },
  { stage: 'test', artifact: 'tests/diff', analog: 'tests/', next: 'PR/REVIEW.md' },
  { stage: 'deploy', artifact: 'PR/REVIEW.md', analog: 'REVIEW.md', next: 'incident' },
  { stage: 'maintain', artifact: 'incident', analog: 'incidentToIntent draft', next: 'intent.md' },
]);

function catalog(filterVerdict = null) {
  const rows = PLAYS.map((p) => ({
    ...p,
    documentation_url: SOURCE,
    liveClaim: p.verdict === 'HAVE',
  }));
  return filterVerdict ? rows.filter((r) => r.verdict === filterVerdict) : rows;
}

function artifactChain() {
  return ARTIFACT_CHAIN.map((row) => ({ ...row, source: SOURCE }));
}

function nextArtifact(from) {
  const key = String(from || '').toLowerCase();
  const row = ARTIFACT_CHAIN.find(
    (r) => r.artifact.toLowerCase() === key || r.stage === key,
  );
  return row ? row.next : null;
}

function isProductionDeploy(command, env) {
  const cmd = String(command || '');
  const e = String(env || '').toLowerCase();
  if (/--dry-run\b/i.test(cmd)) return false;
  if (e === 'production' || e === 'prod') return true;
  const hay = `${cmd} ${e}`;
  if (!/\b(deploy|wrangler\s+deploy|eas\s+(submit|update)|ota:gate)\b/i.test(hay)) {
    return false;
  }
  return /\b(production|prod)\b/i.test(hay);
}

function productionGate({ command, env, releaseApproval } = {}) {
  const approval =
    releaseApproval
    || process.env.RELEASE_APPROVAL
    || process.env.HERMES_RELEASE_AUTHORIZED
    || '';
  if (isProductionDeploy(command, env) && !String(approval).trim()) {
    return {
      decision: 'BLOCK',
      reason: 'Production deploys need a named human release authorization (RELEASE_APPROVAL).',
      liveClaim: false,
      wiredAsClaudeHook: false,
      documentation_url: SOURCE,
    };
  }
  return {
    decision: 'ALLOW',
    reason: isProductionDeploy(command, env)
      ? 'Named human authorization present'
      : 'Not a production deploy',
    liveClaim: false,
    wiredAsClaudeHook: false,
    documentation_url: SOURCE,
  };
}

function isTestPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  return /(^|\/)tests?\//.test(p)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(p);
}

function testEditPolicy({ taskKind, path: filePath } = {}) {
  const kind = String(taskKind || '').toLowerCase();
  if ((kind === 'bugfix' || kind === 'fix') && isTestPath(filePath)) {
    return {
      decision: 'BLOCK',
      reason: 'Fix the code, not the test.',
      liveClaim: false,
      documentation_url: SOURCE,
    };
  }
  return {
    decision: 'ALLOW',
    reason: isTestPath(filePath) ? 'New or feature tests are allowed' : 'Not a test file',
    liveClaim: false,
    documentation_url: SOURCE,
  };
}

function slugify(text) {
  return String(text || 'untitled')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 80) || 'untitled';
}

function fillTemplate(template, vars) {
  return String(template).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => (
    vars[key] != null ? String(vars[key]) : `{{${key}}}`
  ));
}

function defaultIntentTemplate() {
  return [
    '# Intent: {{TITLE}}',
    '',
    'Author: {{AUTHOR}}. Status: {{STATUS}}.',
    'Date: {{DATE}}',
    '',
    '## Problem',
    '{{PROBLEM}}',
    '',
    '## Proposed outcome',
    '{{PROPOSED_OUTCOME}}',
    '',
    '## Affected users and systems',
    '- Users: {{AFFECTED_USERS}}',
    '- Systems: {{AFFECTED_SYSTEMS}}',
    '',
    '## Constraints',
    '- {{CONSTRAINTS}}',
    '',
    '## Open questions',
    '- {{OPEN_QUESTIONS}}',
    '',
  ].join('\n');
}

function loadIntentTemplate(repoRoot) {
  const p = path.join(repoRoot, 'intent', 'TEMPLATE.md');
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return defaultIntentTemplate();
}

function assertNotIntentContract(targetPath) {
  const resolved = path.resolve(targetPath);
  const forbidden = [
    path.join(REPO_ROOT, INTENT_CONTRACT),
    path.join(REPO_ROOT, INTENT_CHECK),
  ].map((p) => path.resolve(p));
  if (forbidden.includes(resolved)) {
    throw new Error(`dual-edit forbidden: ${path.relative(REPO_ROOT, resolved)} is AGENT-407`);
  }
}

function renderIntent(fields = {}, opts = {}) {
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const title = fields.title || 'Untitled';
  const vars = {
    TITLE: title,
    AUTHOR: fields.author || process.env.USER || 'agent',
    DATE: fields.date || new Date().toISOString(),
    STATUS: fields.status || 'draft',
    PROBLEM: fields.problem || 'No problem statement.',
    PROPOSED_OUTCOME: fields.outcome || fields.proposedOutcome || 'No proposed outcome.',
    AFFECTED_USERS: fields.users || 'End users',
    AFFECTED_SYSTEMS: fields.systems || 'mac-yolo-safeguards hosted Hermes',
    CONSTRAINTS: fields.constraints || '$10/mo hosted VPS lock; no Continuity/Mac-pair; no new PII',
    OPEN_QUESTIONS: fields.openQuestions || 'None identified.',
  };
  const content = fillTemplate(loadIntentTemplate(repoRoot), vars);
  let written = null;
  if (opts.write) {
    const dir = opts.dir;
    if (!dir) {
      throw new Error('renderIntent write requires opts.dir (never defaults to .intent/)');
    }
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${slugify(title)}.md`);
    assertNotIntentContract(target);
    fs.writeFileSync(target, content, 'utf8');
    written = target;
  }
  return {
    content,
    written,
    liveClaim: false,
    dualEditForbidden: [INTENT_CONTRACT, INTENT_CHECK],
    documentation_url: SOURCE,
  };
}

function incidentToIntent(fields = {}, opts = {}) {
  const metric = fields.metric || 'unspecified';
  const evidence = fields.evidence || 'no evidence attached';
  return renderIntent({
    title: `Incident: ${metric}`,
    author: fields.author || process.env.USER || 'agent',
    problem: `Production or process signal for ${metric}. Evidence: ${evidence}`,
    outcome: 'Human triages. Optional PR through review gates. No auto-merge. No Continuity close-the-loop.',
    users: 'On-call / product owner',
    systems: fields.systems || 'hosted Hermes / GitHub Actions',
    constraints: 'Draft only. Do not auto-quarantine. Do not restore Mac-pair.',
    openQuestions: fields.openQuestions || 'Fix now, schedule, or dismiss?',
    status: 'draft',
  }, opts);
}

function fileExists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function auditRepo(repoRoot = REPO_ROOT) {
  const checks = [
    { id: 'agents-md', rel: 'AGENTS.md', required: true },
    { id: 'claude-md-pointer', rel: 'CLAUDE.md', required: true },
    { id: 'plan-md', rel: 'plan.md', required: true },
    { id: 'skills-md', rel: 'SKILLS.md', required: true },
    { id: 'skills-dir', rel: '.agents/skills', required: true },
    { id: 'intent-template', rel: 'intent/TEMPLATE.md', required: true },
    { id: 'spec-template', rel: 'spec/TEMPLATE.md', required: true },
    { id: 'review-md', rel: 'REVIEW.md', required: true },
    { id: 'intent-contract-present', rel: INTENT_CONTRACT, required: true },
  ];
  const results = checks.map((c) => {
    const ok = fileExists(repoRoot, c.rel);
    const out = {
      id: c.id,
      path: c.rel,
      ok,
      required: c.required,
      documentation_url: SOURCE,
    };
    if (c.id === 'claude-md-pointer' && ok) {
      const text = fs.readFileSync(path.join(repoRoot, c.rel), 'utf8');
      out.ok = /AGENTS\.md/.test(text);
      out.note = out.ok ? 'pointer to AGENTS.md' : 'CLAUDE.md does not point at AGENTS.md';
    }
    if (c.id === 'intent-contract-present') {
      out.dualEditForbidden = true;
      out.owner = 'AGENT-407';
    }
    return out;
  });
  const requiredFailed = results.filter((r) => r.required && !r.ok);
  return {
    ok: requiredFailed.length === 0,
    liveClaim: false,
    productionGateWired: false,
    dualEditForbidden: [INTENT_CONTRACT, INTENT_CHECK],
    skipAutoQuarantine: true,
    skipClaudeEvals: true,
    skipContinuity: true,
    checks: results,
    missing: requiredFailed.map((r) => r.path),
    documentation_url: SOURCE,
  };
}

function getHealthStatus(repoRoot = REPO_ROOT) {
  const skip = catalog('SKIP');
  const have = catalog('HAVE');
  const adapter = catalog('ADAPTER');
  const audit = auditRepo(repoRoot);
  return {
    protocol: 'ai-native-sdlc',
    source: SOURCE,
    analogClaudeMd: 'AGENTS.md',
    liveClaim: false,
    productionGateWired: false,
    skipCount: skip.length,
    haveCount: have.length,
    adapterCount: adapter.length,
    skip: skip.map((p) => p.id),
    auditOk: audit.ok,
    dualEditForbidden: audit.dualEditForbidden,
    note: 'Mechanics not product. Do not clone Claude Code, MDM, evals YAML, auto-quarantine, or Continuity.',
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    health: false,
    catalog: false,
    audit: false,
    chain: false,
    gate: false,
    fixCodeNotTest: false,
    renderIntent: false,
    incident: false,
    write: false,
    command: '',
    env: 'development',
    approval: '',
    taskKind: 'bugfix',
    path: '',
    title: 'Untitled',
    problem: '',
    outcome: '',
    metric: '',
    evidence: '',
    dir: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--health') out.health = true;
    else if (a === '--catalog') out.catalog = true;
    else if (a === '--audit') out.audit = true;
    else if (a === '--chain') out.chain = true;
    else if (a === '--gate') out.gate = true;
    else if (a === '--fix-code-not-test') out.fixCodeNotTest = true;
    else if (a === '--render-intent') out.renderIntent = true;
    else if (a === '--incident-intent') out.incident = true;
    else if (a === '--write') out.write = true;
    else if (a === '--command' && argv[i + 1]) out.command = argv[++i];
    else if (a === '--env' && argv[i + 1]) out.env = argv[++i];
    else if (a === '--approval' && argv[i + 1]) out.approval = argv[++i];
    else if (a === '--task' && argv[i + 1]) out.taskKind = argv[++i];
    else if (a === '--path' && argv[i + 1]) out.path = argv[++i];
    else if (a === '--title' && argv[i + 1]) out.title = argv[++i];
    else if (a === '--problem' && argv[i + 1]) out.problem = argv[++i];
    else if (a === '--outcome' && argv[i + 1]) out.outcome = argv[++i];
    else if (a === '--metric' && argv[i + 1]) out.metric = argv[++i];
    else if (a === '--evidence' && argv[i + 1]) out.evidence = argv[++i];
    else if (a === '--dir' && argv[i + 1]) out.dir = argv[++i];
  }
  return out;
}

function main(argv = process.argv.slice(2), opts = {}) {
  const args = parseArgs(argv);
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const print = (obj) => {
    if (args.json) console.log(JSON.stringify(obj, null, 2));
    else console.log(typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2));
  };
  if (args.health) {
    print(getHealthStatus(repoRoot));
    return 0;
  }
  if (args.catalog) {
    print({ liveClaim: false, source: SOURCE, plays: catalog() });
    return 0;
  }
  if (args.audit) {
    print(auditRepo(repoRoot));
    return 0;
  }
  if (args.chain) {
    print({ liveClaim: false, chain: artifactChain() });
    return 0;
  }
  if (args.gate) {
    print(productionGate({
      command: args.command,
      env: args.env,
      releaseApproval: args.approval,
    }));
    return 0;
  }
  if (args.fixCodeNotTest) {
    print(testEditPolicy({ taskKind: args.taskKind, path: args.path }));
    return 0;
  }
  if (args.renderIntent) {
    print(renderIntent({
      title: args.title,
      problem: args.problem,
      outcome: args.outcome,
    }, { repoRoot, write: args.write, dir: args.dir }));
    return 0;
  }
  if (args.incident) {
    print(incidentToIntent({
      metric: args.metric,
      evidence: args.evidence,
    }, { repoRoot, write: args.write, dir: args.dir }));
    return 0;
  }
  print(getHealthStatus(repoRoot));
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  SOURCE,
  PLAYS,
  ARTIFACT_CHAIN,
  INTENT_CONTRACT,
  catalog,
  artifactChain,
  nextArtifact,
  isProductionDeploy,
  productionGate,
  testEditPolicy,
  renderIntent,
  incidentToIntent,
  auditRepo,
  getHealthStatus,
  main,
};
