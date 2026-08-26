#!/usr/bin/env node
'use strict';

/**
 * coding-context-pack.js — Issue-first, evidence-backed coding context.
 *
 * Implements the Hugging Face Context Course pattern for this monorepo:
 *   smallest context that proves what "correct" is (GH issue AC + proof)
 *   + after work, smallest context that proves it landed (tests + three buses).
 *
 * Usage:
 *   node tools/coding-context-pack.js
 *   node tools/coding-context-pack.js --json
 *   node tools/coding-context-pack.js --issue 132
 *   node tools/coding-context-pack.js --minimal
 *   node tools/coding-context-pack.js --write
 *   node tools/coding-context-pack.js --sync
 *   node tools/coding-context-pack.js --ship-check --pr 1418 --agent AGENT-257
 *   node tools/coding-context-pack.js --help
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const GH_REPO = process.env.CODING_CONTEXT_GH_REPO || 'IgorGanapolsky/mac-yolo-safeguards';
/** Prefer this worktree, then primary checkout (worktrees often lack continuous proofs). */
const PRIMARY_REPO =
  process.env.CODING_CONTEXT_PRIMARY_REPO ||
  path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards');
const OUT_DIR = path.join(REPO, 'hermes-mobile/docs/proofs/coding-context');
const VAULT_ROOT =
  process.env.HERMES_AGENT_SYNC_VAULT || path.join(os.homedir(), 'Documents/AI-Agent-Sync');
const VAULT_BOARD = path.join(VAULT_ROOT, 'Projects/mac-yolo-safeguards/GITHUB-PRODUCT-BOARD.md');
const VAULT_LINEAR = path.join(VAULT_ROOT, 'Projects/mac-yolo-safeguards/LINEAR-SYNC.md');
const VAULT_LINEAR_CLAIMS = path.join(VAULT_ROOT, 'Handoffs/linear-claims');
const SHIP_CHECK = path.join(
  os.homedir(),
  '.grok/skills/three-bus-ship-cycle/scripts/ship_cycle_check.sh',
);
const CONTEXT_BLOCK_IDS = Object.freeze([
  'objective',
  'evidence',
  'examples',
  'procedure',
  'constraints',
  'rubric',
]);
const CONTEXT_MAX_ESTIMATED_TOKENS = 1800;
const VERIFICATION_RECEIPT_SCHEMA = 'agent-verification-receipt/v1';
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const VERIFICATION_ARTICLE_URL = 'https://thenewstack.io/cli-ide-ai-verification/';
const CONTEXT_EPISODE_URL = 'https://music.youtube.com/watch?v=QEC3fE4fqWc';

function resolveE2ePath() {
  const candidates = [
    path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json'),
    path.join(PRIMARY_REPO, 'hermes-mobile/docs/proofs/continuous/latest.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

/** Skill routing: label/title keywords → skill paths (load on demand). */
const SKILL_ROUTES = [
  {
    id: 'three-bus-ship-cycle',
    when: () => true,
    path: '~/.grok/skills/three-bus-ship-cycle/SKILL.md',
    reason: 'Every ship updates GitHub + Linear + vault',
  },
  {
    id: 'verify-hermes-mobile-ship',
    when: (iss) => hasArea(iss, 'hermes-mobile') || /mobile|connection|chat|pair/i.test(iss.title),
    path: 'hermes-mobile/.cursor/skills or .cursor/skills/verify-hermes-mobile-ship',
    reason: 'Device/E2E proof before fixed/shipped claims',
  },
  {
    id: 'troubleshoot-hermes-mobile-connectivity',
    when: (iss) => /connect|pair|tailscale|auth|identity|unreachable/i.test(iss.title + labelsStr(iss)),
    path: '.cursor/skills/troubleshoot-hermes-mobile-connectivity',
    reason: 'Connection identity / reachability work',
  },
  {
    id: 'multi-agent-coord',
    when: () => true,
    path: '~/.grok/skills/multi-agent-coord/SKILL.md',
    reason: 'plan.md claims + Linear locks before multi-file edit',
  },
  {
    id: 'zero-manual-handoff',
    when: () => true,
    path: '~/.grok/skills/zero-manual-handoff/SKILL.md',
    reason: 'Agent executes adb/pair/tests — never homework for CEO',
  },
];

function labelsStr(iss) {
  return (iss.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).join(' ');
}

function hasArea(iss, area) {
  return labelsStr(iss).includes(`area:${area}`) || labelsStr(iss).includes(area);
}

function parseArgs(argv) {
  const out = {
    json: false,
    minimal: false,
    write: false,
    sync: false,
    shipCheck: false,
    help: false,
    issue: null,
    pr: null,
    agent: null,
    verifyReceipt: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--minimal') out.minimal = true;
    else if (a === '--write') out.write = true;
    else if (a === '--sync') out.sync = true;
    else if (a === '--ship-check') out.shipCheck = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--issue') out.issue = Number(argv[++i]);
    else if (a.startsWith('--issue=')) out.issue = Number(a.slice('--issue='.length));
    else if (a === '--pr') out.pr = String(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = a.slice('--pr='.length);
    else if (a === '--agent') out.agent = String(argv[++i]);
    else if (a.startsWith('--agent=')) out.agent = a.slice('--agent='.length);
    else if (a === '--verify-receipt') out.verifyReceipt = String(argv[++i]);
    else if (a.startsWith('--verify-receipt=')) out.verifyReceipt = a.slice('--verify-receipt='.length);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: opts.cwd || REPO,
    encoding: 'utf8',
    timeout: opts.timeout || 45_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(opts.env || {}) },
  });
}

function ghJson(args) {
  const r = run('gh', args, { timeout: 60_000 });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim().slice(0, 400);
    throw new Error(`gh ${args.join(' ')} failed: ${err || r.status}`);
  }
  const text = (r.stdout || '').trim();
  if (!text) return null;
  return JSON.parse(text);
}

function readE2e() {
  const p = resolveE2ePath();
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    data._path = p;
    return data;
  } catch {
    return null;
  }
}

function labelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name || '')).filter(Boolean);
}

/**
 * Score an open issue for "do next" ranking.
 * Higher = more urgent / more actionable for coding agents.
 */
function scoreIssue(issue, openPrs, e2e) {
  const labels = labelNames(issue);
  let score = 50;
  const reasons = [];

  if (labels.includes('priority:p0') || /^P0\b/i.test(issue.title)) {
    score += 40;
    reasons.push('p0');
  } else if (labels.includes('priority:p1')) {
    score += 25;
    reasons.push('p1');
  } else if (labels.includes('priority:p2')) {
    score += 10;
    reasons.push('p2');
  }

  if (labels.includes('status:ready')) {
    score += 15;
    reasons.push('ready');
  }
  if (labels.includes('status:blocked')) {
    score -= 35;
    reasons.push('blocked');
  }
  if (labels.includes('bug')) {
    score += 8;
    reasons.push('bug');
  }

  const related = (openPrs || []).filter((pr) => prTouchesIssue(pr, issue.number));
  if (related.length) {
    score += 20;
    reasons.push(`open_pr:${related.map((p) => p.number).join(',')}`);
    const mergeable = related.some((p) => p.mergeable === 'MERGEABLE' || p.mergeStateStatus === 'CLEAN');
    if (mergeable) {
      score += 15;
      reasons.push('pr_mergeable');
    }
    const failing = related.some((p) =>
      (p.statusCheckRollup || []).some((c) => c.conclusion === 'FAILURE'),
    );
    if (failing) {
      score += 5;
      reasons.push('pr_ci_fail');
    }
  }

  // Mobile issues need honest e2e for ship claims — boost unfinished mobile p0/p1
  if (labels.includes('area:hermes-mobile') && e2e && e2e.e2e !== 'pass') {
    score += 5;
    reasons.push('e2e_not_pass');
  }

  return { score, reasons, relatedPrs: related.map((p) => p.number) };
}

function prTouchesIssue(pr, issueNumber) {
  const hay = `${pr.title || ''} ${pr.body || ''} ${(pr.headRefName || pr.head || '')}`;
  const n = String(issueNumber);
  return (
    new RegExp(`#${n}\\b`).test(hay) ||
    new RegExp(`GH-#?${n}\\b`, 'i').test(hay) ||
    new RegExp(`issue[s]?\\s*${n}\\b`, 'i').test(hay)
  );
}

function rankIssues(issues, openPrs, e2e) {
  return issues
    .map((iss) => {
      const { score, reasons, relatedPrs } = scoreIssue(iss, openPrs, e2e);
      return { ...iss, _score: score, _reasons: reasons, _relatedPrs: relatedPrs };
    })
    .sort((a, b) => b._score - a._score || a.number - b.number);
}

function routeSkills(issue) {
  if (!issue) return [];
  return SKILL_ROUTES.filter((r) => r.when(issue)).map((r) => ({
    id: r.id,
    path: r.path,
    reason: r.reason,
  }));
}

function shipClaimGate(e2e, options = {}) {
  const blockers = [];
  if (!e2e) {
    blockers.push('missing hermes-mobile/docs/proofs/continuous/latest.json');
  } else {
    if (e2e.unit !== 'pass' && options.requireUnit !== false) {
      blockers.push(`unit=${e2e.unit || 'unknown'} (need pass)`);
    }
    if (options.requireE2ePass && e2e.e2e !== 'pass') {
      blockers.push(`e2e=${e2e.e2e || 'unknown'} (need pass for device/OTA ship claim; skipped≠pass)`);
    }
  }
  return {
    ok: blockers.length === 0,
    blockers,
    rule: 'Never claim fixed/shipped on mobile without unit pass; device/OTA needs e2e=pass (not skipped)',
  };
}

function boundedText(value, max = 220) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function estimateTokens(value) {
  return Math.ceil(Buffer.byteLength(JSON.stringify(value), 'utf8') / 4);
}

/**
 * Compile the live issue-first inputs into the six reusable context blocks used
 * by every agent surface. The block order is stable so downstream clients do
 * not have to reinterpret prose from each harness.
 */
function buildContextContract({
  repo,
  generatedAt,
  focus,
  acceptanceHints = [],
  skills = [],
  e2e = null,
  shipGate = { ok: false, blockers: [] },
} = {}) {
  const observedAt = generatedAt || new Date().toISOString();
  const issueSource = boundedText(focus?.url || 'GitHub open-issue ranking', 300);
  const acceptance = acceptanceHints.slice(0, 4).map((item) => boundedText(item, 140));
  const skillItems = skills.slice(0, 4).map((skill) => ({
    id: boundedText(skill.id, 80),
    path: boundedText(skill.path, 140),
  }));
  const blocks = [
    {
      id: 'objective',
      purpose: 'Define the one bounded outcome before generation begins.',
      items: focus
        ? [
            `Resolve GH #${focus.number}: ${boundedText(focus.title, 160)}`,
            `Acceptance is measured by ${acceptance.length || 0} issue-derived checks.`,
          ]
        : ['No open issue is selected; do not start product code until one is focused.'],
      provenance: [{ source: issueSource, observed_at: observedAt }],
    },
    {
      id: 'evidence',
      purpose: 'Carry observed facts and their freshness, not remembered claims.',
      items: [
        ...(focus
          ? [{ kind: 'issue', number: focus.number, url: boundedText(focus.url, 300), acceptance }]
          : [{ kind: 'issue', status: 'missing' }]),
        focus?.linear_id
          ? {
              kind: 'coordination',
              linear_id: focus.linear_id,
              source: `https://linear.app/igorganapolsky/issue/${focus.linear_id}`,
            }
          : { kind: 'coordination', status: 'unmapped' },
        e2e
          ? {
              kind: 'e2e',
              unit: boundedText(e2e.unit || 'unknown', 40),
              e2e: boundedText(e2e.e2e || 'unknown', 40),
              observed_at: boundedText(e2e.updatedAt || '', 50) || null,
              source: boundedText(e2e.path || '', 260) || null,
            }
          : { kind: 'e2e', status: 'missing' },
      ],
      provenance: [
        { source: issueSource, observed_at: observedAt },
        ...(focus?.linear_id
          ? [{ source: `https://linear.app/igorganapolsky/issue/${focus.linear_id}`, observed_at: observedAt }]
          : []),
        ...(e2e?.path
          ? [{ source: boundedText(e2e.path, 260), observed_at: boundedText(e2e.updatedAt || '', 50) || null }]
          : []),
      ],
    },
    {
      id: 'examples',
      purpose: 'Show the evidence boundary with concrete positive and negative examples.',
      items: [
        {
          kind: 'good',
          example: 'PR #123 head abc… passed node tests/foo.js (exit 0); CI for the same head is still pending; not deployed.',
        },
        {
          kind: 'bad',
          example: 'Done and live because the diff looks correct and an older CI run was green.',
        },
      ],
      provenance: [
        { source: CONTEXT_EPISODE_URL, observed_at: observedAt },
        { source: VERIFICATION_ARTICLE_URL, observed_at: observedAt },
      ],
    },
    {
      id: 'procedure',
      purpose: 'Expose the sanctioned workflow and only the skills needed now.',
      items: [
        'Read plan.md claims, acquire Linear lock, and use an isolated origin/main worktree.',
        'Search with grepai, change only claimed files, run focused local checks, then open a bounded PR.',
        'Treat CI as an independent exact-head backstop and runtime/provider proof as a separate lane.',
        ...skillItems,
      ],
      provenance: [
        { source: 'AGENTS.md', observed_at: observedAt },
        { source: 'docs/agents/coordination.md', observed_at: observedAt },
      ],
    },
    {
      id: 'constraints',
      purpose: 'Prevent scope, ownership, evidence, and cost drift.',
      items: [
        'Never edit another active owner\'s files or bypass a test, review, or branch-protection gate.',
        'A PR, merge SHA, CI run, deployment, device result, provider action, and revenue event are distinct proof lanes.',
        `Current ship gate: ${shipGate.ok ? 'pass' : 'blocked'}${shipGate.blockers?.length ? ` — ${boundedText(shipGate.blockers.join('; '), 260)}` : ''}`,
        'Keep source content bounded; load full logs, social, revenue, and device context only on demand.',
      ],
      provenance: [
        { source: 'AGENTS.md', observed_at: observedAt },
        { source: 'plan.md', observed_at: observedAt },
      ],
    },
    {
      id: 'rubric',
      purpose: 'Grade the proposal against the acceptance criteria before any completion claim.',
      items: [
        'Did the change behave as intended against issue acceptance criteria?',
        'Did local and repository checks find a security or reliability regression?',
        'Does the diff conform to ownership, dependency, and project standards?',
        'Can a reviewer see what changed, why, what ran, and what remains uncertain?',
        'If live, deployed, external, device, or revenue is claimed, is fresh provider/runtime proof attached?',
      ],
      provenance: [
        { source: VERIFICATION_ARTICLE_URL, observed_at: observedAt },
        { source: issueSource, observed_at: observedAt },
      ],
    },
  ];

  const estimatedTokens = estimateTokens(blocks);
  return {
    schema: 'agent-context-contract/v1',
    repo: boundedText(repo || GH_REPO, 160),
    generated_at: observedAt,
    block_order: CONTEXT_BLOCK_IDS,
    blocks,
    budget: {
      estimator: 'ceil(utf8_json_bytes/4)',
      max_estimated_tokens: CONTEXT_MAX_ESTIMATED_TOKENS,
      estimated_tokens: estimatedTokens,
      within_budget: estimatedTokens <= CONTEXT_MAX_ESTIMATED_TOKENS,
    },
  };
}

function buildVerificationContract() {
  return {
    schema: 'agent-verification-contract/v1',
    receipt_schema: VERIFICATION_RECEIPT_SCHEMA,
    surfaces: ['cli', 'ide'],
    layers: [
      {
        id: 'local',
        required: ['changed_files', 'tests.command', 'tests.exit_code'],
        purpose: 'Fast lint, static analysis, secret detection, type checks, and focused tests.',
      },
      {
        id: 'repository_pr',
        required: ['issue_url', 'linear_id', 'plan_claim', 'head_sha', 'pull_request.url'],
        purpose: 'Bounded diff, ownership, review context, and repository policy.',
      },
      {
        id: 'ci',
        required: ['ci.head_sha', 'ci.required_checks', 'ci.run_url', 'ci.observed_at'],
        purpose: 'Independent backstop for the exact current head; never reuse an older green run.',
      },
      {
        id: 'runtime_provider',
        conditional: ['live', 'deployed', 'device', 'external_action', 'revenue'],
        required: ['runtime.status', 'runtime.observed_at', 'runtime.proof_url_or_receipt_id'],
        purpose: 'Prove user-visible or external behavior separately from code and CI.',
      },
    ],
    review_questions: [
      'Did the change behave as intended?',
      'Did it introduce a known security or reliability issue?',
      'Does it conform to project standards?',
      'Is the evidence sufficient for efficient review?',
    ],
    metrics: [
      'pre_review_findings_resolved',
      'first_attempt_ci_pass',
      'review_minutes',
      'escaped_defects',
    ],
  };
}

function isFreshTimestamp(value, now, maxAgeMs = MAX_EVIDENCE_AGE_MS) {
  const observed = Date.parse(value || '');
  const reference = Date.parse(now || '');
  return Number.isFinite(observed) && Number.isFinite(reference) && reference >= observed && reference - observed <= maxAgeMs;
}

function validateVerificationReceipt(receipt, options = {}) {
  const errors = [];
  const now = options.now || new Date().toISOString();
  const add = (code, message) => errors.push({ code, message });
  const validSha = (value) => /^[a-f0-9]{40}$/i.test(String(value || ''));
  const stages = ['proposal', 'pr', 'merge', 'runtime'];

  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    add('RECEIPT_INVALID', 'Receipt must be a JSON object.');
    return { ok: false, schema: VERIFICATION_RECEIPT_SCHEMA, evaluated_at: now, errors };
  }
  if (receipt.schema !== VERIFICATION_RECEIPT_SCHEMA) add('SCHEMA_INVALID', `Expected ${VERIFICATION_RECEIPT_SCHEMA}.`);
  if (!stages.includes(receipt.stage)) add('STAGE_INVALID', `Stage must be one of ${stages.join(', ')}.`);
  if (!receipt.issue_url) add('ISSUE_MISSING', 'issue_url is required.');
  if (!/^AGENT-\d+$/.test(String(receipt.linear_id || ''))) add('LINEAR_MISSING', 'linear_id must be AGENT-N.');
  if (!receipt.plan_claim) add('PLAN_CLAIM_MISSING', 'plan_claim is required.');
  if (!Array.isArray(receipt.changed_files) || receipt.changed_files.length === 0) {
    add('CHANGED_FILES_MISSING', 'At least one repo-relative changed file is required.');
  } else if (receipt.changed_files.some((file) => path.isAbsolute(file) || String(file).includes('..'))) {
    add('CHANGED_FILES_UNSAFE', 'Changed files must be repo-relative paths.');
  }
  if (!validSha(receipt.head_sha)) add('HEAD_SHA_INVALID', 'head_sha must be a full 40-character commit SHA.');

  if (!Array.isArray(receipt.tests) || receipt.tests.length === 0) {
    add('TEST_EVIDENCE_MISSING', 'At least one local verification command is required.');
  } else {
    for (const test of receipt.tests) {
      if (!test?.command || !Number.isInteger(test.exit_code)) add('TEST_EVIDENCE_INVALID', 'Each test needs command and integer exit_code.');
      else if (test.exit_code !== 0) add('TEST_FAILED', `${test.command} exited ${test.exit_code}.`);
    }
  }

  if (['pr', 'merge', 'runtime'].includes(receipt.stage)) {
    if (!receipt.pull_request?.url) add('PR_MISSING', 'pull_request.url is required from PR stage onward.');
    if (receipt.pull_request?.head_sha !== receipt.head_sha) add('PR_HEAD_MISMATCH', 'pull_request.head_sha must equal head_sha.');
  }

  if (['merge', 'runtime'].includes(receipt.stage)) {
    if (!receipt.ci) {
      add('CI_MISSING', 'CI evidence is required from merge stage onward.');
    } else {
      if (receipt.ci.status !== 'pass') add('CI_NOT_PASSING', 'ci.status must be pass.');
      if (receipt.ci.head_sha !== receipt.head_sha) add('CI_HEAD_MISMATCH', 'CI must cover the exact receipt head_sha.');
      if (!receipt.ci.run_url) add('CI_RUN_URL_MISSING', 'ci.run_url is required.');
      if (!isFreshTimestamp(receipt.ci.observed_at, now)) add('CI_STALE', 'CI observation is invalid, future-dated, or older than 24 hours.');
      if (!Array.isArray(receipt.ci.required_checks) || receipt.ci.required_checks.length === 0) {
        add('CI_REQUIRED_CHECKS_MISSING', 'At least one required check receipt is required.');
      } else if (receipt.ci.required_checks.some((check) => !['SUCCESS', 'PASS'].includes(String(check?.conclusion || '').toUpperCase()))) {
        add('CI_REQUIRED_CHECK_NOT_PASSING', 'Every required check must pass.');
      }
    }
  }

  const claims = Array.isArray(receipt.claims) ? receipt.claims : [];
  const runtimeClaims = ['live', 'deployed', 'device', 'external_action', 'revenue'];
  const needsRuntime = receipt.stage === 'runtime' || claims.some((claim) => runtimeClaims.includes(claim));
  if (needsRuntime) {
    const runtime = receipt.runtime;
    if (!runtime) {
      add('RUNTIME_PROOF_MISSING', 'Fresh runtime/provider proof is required for the requested claim.');
    } else {
      if (runtime.status !== 'pass') add('RUNTIME_NOT_PASSING', 'runtime.status must be pass.');
      if (!isFreshTimestamp(runtime.observed_at, now)) add('RUNTIME_STALE', 'Runtime proof is invalid, future-dated, or older than 24 hours.');
      if (!runtime.proof_url && !runtime.receipt_id) add('RUNTIME_RECEIPT_MISSING', 'runtime.proof_url or runtime.receipt_id is required.');
      if (claims.some((claim) => ['live', 'deployed'].includes(claim)) && !runtime.revision) {
        add('RUNTIME_REVISION_MISSING', 'Live/deployed proof must name the observed revision.');
      }
    }
  }
  if (!Array.isArray(receipt.uncertainties)) add('UNCERTAINTIES_MISSING', 'uncertainties must be an array, including [] when none are known.');

  return {
    ok: errors.length === 0,
    schema: VERIFICATION_RECEIPT_SCHEMA,
    evaluated_at: now,
    errors,
  };
}

function extractAcceptanceHints(body) {
  if (!body) return [];
  const lines = body.split(/\r?\n/);
  const hints = [];
  for (const line of lines) {
    if (/^\s*[-*]\s*\[[ xX]\]/.test(line) || /^\s*AC[:\s]/i.test(line) || /^\s*Acceptance/i.test(line)) {
      hints.push(line.trim().slice(0, 200));
    }
    if (hints.length >= 8) break;
  }
  if (hints.length === 0) {
    // first non-empty paragraphs as soft AC
    const para = body
      .split(/\n\n+/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 2);
    return para.map((p) => p.slice(0, 180));
  }
  return hints;
}

function fetchOpenIssues() {
  return (
    ghJson([
      'issue',
      'list',
      '--repo',
      GH_REPO,
      '--state',
      'open',
      '--limit',
      '30',
      '--json',
      'number,title,labels,url,updatedAt,body',
    ]) || []
  );
}

function fetchOpenPrs() {
  try {
    return (
      ghJson([
        'pr',
        'list',
        '--repo',
        GH_REPO,
        '--state',
        'open',
        '--limit',
        '40',
        '--json',
        'number,title,body,headRefName,url,mergeable,mergeStateStatus,statusCheckRollup',
      ]) || []
    );
  } catch {
    return [];
  }
}

function parseLinearMapText(text, map = {}) {
  // Markdown table cells: | #132 | ... | AGENT-257 |
  const re = /\|\s*#?(\d+)\s*\|[^|\n]*\|\s*(AGENT-\d+)/gi;
  let m;
  while ((m = re.exec(text))) map[Number(m[1])] = m[2].toUpperCase();
  // [GH-#132] ... AGENT-257
  const re2 = /\[?GH-#(\d+)\]?[^\n]{0,120}?(AGENT-\d+)/gi;
  while ((m = re2.exec(text))) map[Number(m[1])] = m[2].toUpperCase();
  // AGENT-257 ... #132 or issue 132
  const re3 = /(AGENT-\d+)[^\n]{0,80}?(?:#|issue\s*)(\d+)/gi;
  while ((m = re3.exec(text))) {
    const n = Number(m[2]);
    if (!map[n]) map[n] = m[1].toUpperCase();
  }
  // Linear claim mirrors use frontmatter plus a title such as "GH #2116: ...".
  const linearId = (text.match(/^linear_id:\s*(AGENT-\d+)\s*$/im) || [])[1];
  const githubIssue = (text.match(/\bGH\s*#(\d+)\b/i) || [])[1];
  if (linearId && githubIssue) map[Number(githubIssue)] = linearId.toUpperCase();
  return map;
}

function parseVaultLinearMap() {
  const map = {};
  const files = [VAULT_BOARD, VAULT_LINEAR];
  try {
    const claimFiles = fs.readdirSync(VAULT_LINEAR_CLAIMS)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .slice(-250)
      .map((file) => path.join(VAULT_LINEAR_CLAIMS, file));
    files.push(...claimFiles);
  } catch {
    /* claim mirrors optional */
  }
  for (const file of files) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      parseLinearMapText(text, map);
    } catch {
      /* vault optional */
    }
  }
  return map;
}

function runSync() {
  const gh = run(process.execPath, ['tools/github-linear-sync.js'], { timeout: 120_000 });
  const obs = run(process.execPath, ['tools/obsidian-linear-sync.js'], { timeout: 90_000 });
  return {
    github_linear: {
      ok: gh.status === 0,
      exit: gh.status,
      out: ((gh.stdout || '') + (gh.stderr || '')).trim().slice(0, 1500),
    },
    obsidian: {
      ok: obs.status === 0,
      exit: obs.status,
      out: ((obs.stdout || '') + (obs.stderr || '')).trim().slice(0, 1500),
    },
  };
}

function runShipCheck(pr, agent) {
  if (!fs.existsSync(SHIP_CHECK)) {
    return { ok: false, out: `missing ${SHIP_CHECK}` };
  }
  const args = [];
  if (pr) args.push(String(pr));
  if (agent) args.push(String(agent));
  const r = run('bash', [SHIP_CHECK, ...args], {
    timeout: 60_000,
    env: { THUMBGATE_REPO: GH_REPO },
  });
  return {
    ok: r.status === 0,
    exit: r.status,
    out: ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 2000),
  };
}

function buildPack(args) {
  const generatedAt = new Date().toISOString();
  const e2e = readE2e();
  const issues = fetchOpenIssues();
  const prs = fetchOpenPrs();
  const linearMap = parseVaultLinearMap();
  const ranked = rankIssues(issues, prs, e2e);

  let focus = null;
  if (args.issue) {
    focus = ranked.find((i) => i.number === args.issue) || issues.find((i) => i.number === args.issue);
    if (focus && focus._score == null) {
      const s = scoreIssue(focus, prs, e2e);
      focus = { ...focus, _score: s.score, _reasons: s.reasons, _relatedPrs: s.relatedPrs };
    }
  } else {
    focus = ranked[0] || null;
  }

  const matrix = ranked.map((iss) => ({
    number: iss.number,
    title: iss.title,
    url: iss.url,
    labels: labelNames(iss),
    score: iss._score,
    rank_reasons: iss._reasons,
    related_prs: iss._relatedPrs,
    linear_id: linearMap[iss.number] || null,
  }));

  const skills = routeSkills(focus);
  const acHints = focus ? extractAcceptanceHints(focus.body) : [];
  const shipGate = shipClaimGate(e2e, {
    requireE2ePass: focus ? hasArea(focus, 'hermes-mobile') || /mobile/i.test(focus?.title || '') : false,
  });

  const nextActions = [];
  if (focus) {
    nextActions.push({
      rank: 1,
      action: `Work GH #${focus.number}: ${focus.title}`,
      why: (focus._reasons || []).join(', ') || 'top ranked',
      linear: linearMap[focus.number] || 'run --sync if missing',
      skills: skills.map((s) => s.id),
    });
    if (focus._relatedPrs?.length) {
      nextActions.push({
        rank: 2,
        action: `Drive open PR(s) ${focus._relatedPrs.map((n) => `#${n}`).join(', ')} to green + three-bus`,
        why: 'PR already open — finish is higher leverage than new branch',
      });
    }
  }
  if (!shipGate.ok && focus && hasArea(focus, 'hermes-mobile')) {
    nextActions.push({
      rank: 3,
      action: 'Do not claim device/ship fixed until e2e=pass (or unit-only with honest UNVERIFIED device)',
      why: shipGate.blockers.join('; '),
    });
  }
  nextActions.push({
    rank: 99,
    action: 'On completion: three-bus (gh evidence + Linear comment + vault grok.md) then re-run this pack',
    why: 'Incomplete bus = incomplete ship',
  });

  const contextContract = buildContextContract({
    repo: GH_REPO,
    generatedAt,
    focus: focus
      ? { ...focus, linear_id: linearMap[focus.number] || null }
      : null,
    acceptanceHints: acHints,
    skills,
    e2e,
    shipGate,
  });
  const verificationContract = buildVerificationContract();

  const pack = {
    schema: 'coding-context-pack/v2',
    generated_at: generatedAt,
    repo: GH_REPO,
    principle:
      'Smallest context that proves correct (issue AC) + smallest that proves landed (tests + three buses). HF context-course applied.',
    e2e_proof: e2e
      ? {
          unit: e2e.unit,
          e2e: e2e.e2e,
          updatedAt: e2e.updatedAt,
          path: e2e._path || resolveE2ePath(),
        }
      : null,
    ship_claim_gate: shipGate,
    focus: focus
      ? {
          number: focus.number,
          title: focus.title,
          url: focus.url,
          labels: labelNames(focus),
          score: focus._score,
          rank_reasons: focus._reasons,
          related_prs: focus._relatedPrs,
          linear_id: linearMap[focus.number] || null,
          acceptance_hints: acHints,
          skills,
        }
      : null,
    issue_matrix: matrix,
    next_actions: nextActions,
    context_contract: contextContract,
    verification_contract: verificationContract,
    load_now: {
      always: ['AGENTS.md', 'plan.md §2 claims', 'this pack'],
      on_demand_skills: skills,
      code_search: 'grepai search "<intent>" --json --compact',
      never_load_until_needed: ['revenue/social skills', 'full Maestro logs', 'entire plan.md history'],
    },
    commands: {
      refresh: 'node tools/coding-context-pack.js',
      focus: 'node tools/coding-context-pack.js --issue <N>',
      sync_buses: 'node tools/coding-context-pack.js --sync',
      ship_check: 'node tools/coding-context-pack.js --ship-check --pr <N> --agent AGENT-XXX',
      verify_receipt: 'node tools/coding-context-pack.js --verify-receipt <receipt.json> --json',
      session: 'node tools/agent-session-start.js',
    },
  };

  return pack;
}

function formatHuman(pack) {
  const lines = [];
  lines.push('=== Coding context pack (issue-first) ===');
  lines.push(`repo=${pack.repo}  generated=${pack.generated_at}`);
  if (pack.e2e_proof) {
    lines.push(
      `e2e_proof: unit=${pack.e2e_proof.unit} e2e=${pack.e2e_proof.e2e} @ ${pack.e2e_proof.updatedAt || '?'}`,
    );
  } else {
    lines.push('e2e_proof: MISSING latest.json');
  }
  lines.push(
    `ship_claim_gate: ${pack.ship_claim_gate.ok ? 'OK' : 'BLOCK'} ${pack.ship_claim_gate.blockers.join('; ') || ''}`,
  );
  lines.push(
    `context_contract: ${pack.context_contract.blocks.length}/6 blocks · ${pack.context_contract.budget.estimated_tokens}/${pack.context_contract.budget.max_estimated_tokens} estimated tokens`,
  );
  lines.push(
    `verification_contract: ${pack.verification_contract.surfaces.join('+')} · ${pack.verification_contract.layers.map((layer) => layer.id).join(' → ')}`,
  );
  if (pack.focus) {
    const f = pack.focus;
    lines.push('');
    lines.push(`FOCUS #${f.number} (score=${f.score}) ${f.title}`);
    lines.push(`  ${f.url}`);
    lines.push(`  labels: ${(f.labels || []).join(', ')}`);
    lines.push(`  linear: ${f.linear_id || 'UNMAPPED — run --sync'}`);
    lines.push(`  prs: ${(f.related_prs || []).map((n) => `#${n}`).join(', ') || 'none open'}`);
    lines.push(`  rank: ${(f.rank_reasons || []).join(', ')}`);
    if (f.acceptance_hints?.length) {
      lines.push('  AC / hints:');
      for (const h of f.acceptance_hints.slice(0, 5)) lines.push(`    - ${h}`);
    }
    if (f.skills?.length) {
      lines.push(`  skills: ${f.skills.map((s) => s.id).join(', ')}`);
    }
  } else {
    lines.push('FOCUS: no open issues');
  }
  lines.push('');
  lines.push('Board (ranked):');
  for (const row of (pack.issue_matrix || []).slice(0, 8)) {
    lines.push(
      `  #${row.number} s=${row.score} ${row.linear_id || '—'}  ${row.title.slice(0, 70)}${(row.related_prs || []).length ? ` [PR ${row.related_prs.join(',')}]` : ''}`,
    );
  }
  lines.push('');
  lines.push('Next:');
  for (const a of pack.next_actions || []) {
    lines.push(`  ${a.rank}. ${a.action}`);
    if (a.why) lines.push(`     why: ${a.why}`);
  }
  lines.push('');
  lines.push('Refresh: node tools/coding-context-pack.js');
  return lines.join('\n');
}

function formatMinimal(pack) {
  const f = pack.focus;
  if (!f) {
    return [
      'coding-context: no open issues',
      `  context=${pack.context_contract.blocks.length}/6 blocks ${pack.context_contract.budget.estimated_tokens}/${pack.context_contract.budget.max_estimated_tokens}t verify=${pack.verification_contract.layers.length} layers`,
    ].join('\n');
  }
  const e = pack.e2e_proof;
  return [
    `coding-context FOCUS #${f.number} s=${f.score} ${f.title}`,
    `  linear=${f.linear_id || 'UNMAPPED'} prs=${(f.related_prs || []).join(',') || 'none'} e2e=${e ? `${e.unit}/${e.e2e}` : '?'}`,
    `  next: ${pack.next_actions?.[0]?.action || '—'}`,
    `  ship_gate=${pack.ship_claim_gate.ok ? 'ok' : 'block'} skills=${(f.skills || []).map((s) => s.id).join(',')}`,
    `  context=${pack.context_contract.blocks.length}/6 blocks ${pack.context_contract.budget.estimated_tokens}/${pack.context_contract.budget.max_estimated_tokens}t verify=${pack.verification_contract.layers.length} layers`,
  ].join('\n');
}

function writeArtifacts(pack) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, 'latest.json');
  const mdPath = path.join(OUT_DIR, 'latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`);
  fs.writeFileSync(mdPath, `${formatHuman(pack)}\n`);
  return { jsonPath, mdPath };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/coding-context-pack.js [options]

  --json          Machine-readable pack
  --minimal       One-screen focus line (session start)
  --issue N       Focus a specific open issue
  --write         Write hermes-mobile/docs/proofs/coding-context/latest.{json,md}
  --sync          Run github-linear-sync + obsidian-linear-sync then pack
  --ship-check    Run three-bus ship_cycle_check.sh [--pr N --agent AGENT-X]
  --verify-receipt PATH
                  Validate one layered receipt for CLI and IDE agents
  --pr / --agent  Args for --ship-check
  --help          This help

Principle: load the smallest context that proves correct (issue AC) and that
proves landed (tests + GitHub/Linear/vault). See ~/.grok/skills/coding-context-pack/
`);
    process.exit(0);
  }

  if (args.verifyReceipt) {
    let receipt;
    try {
      receipt = JSON.parse(fs.readFileSync(path.resolve(args.verifyReceipt), 'utf8'));
    } catch (error) {
      const result = {
        ok: false,
        schema: VERIFICATION_RECEIPT_SCHEMA,
        errors: [{ code: 'RECEIPT_READ_FAILED', message: error.message }],
      };
      console.log(args.json ? JSON.stringify(result, null, 2) : `Verification receipt: FAIL\n- ${result.errors[0].message}`);
      process.exitCode = 1;
      return;
    }
    const result = validateVerificationReceipt(receipt);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Verification receipt: ${result.ok ? 'PASS' : 'FAIL'}`);
      for (const error of result.errors) console.log(`- ${error.code}: ${error.message}`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }

  let syncResult = null;
  if (args.sync) {
    syncResult = runSync();
  }

  let shipResult = null;
  if (args.shipCheck) {
    shipResult = runShipCheck(args.pr, args.agent);
  }

  const pack = buildPack(args);
  if (syncResult) pack.sync = syncResult;
  if (shipResult) pack.ship_check = shipResult;

  let written = null;
  if (args.write) {
    written = writeArtifacts(pack);
    pack.written = written;
  }

  if (args.json) {
    console.log(JSON.stringify(pack, null, 2));
  } else if (args.minimal) {
    console.log(formatMinimal(pack));
    if (syncResult) {
      console.log(
        `sync: gh-linear=${syncResult.github_linear.ok ? 'ok' : 'fail'} vault=${syncResult.obsidian.ok ? 'ok' : 'fail'}`,
      );
    }
    if (shipResult) {
      console.log(`ship_check: ${shipResult.ok ? 'PASS' : 'FAIL'}`);
    }
  } else {
    console.log(formatHuman(pack));
    if (syncResult) {
      console.log('\n=== Sync ===');
      console.log(
        `github-linear: ${syncResult.github_linear.ok ? 'ok' : 'FAIL'} exit=${syncResult.github_linear.exit}`,
      );
      if (!syncResult.github_linear.ok) console.log(syncResult.github_linear.out.slice(0, 500));
      console.log(`obsidian: ${syncResult.obsidian.ok ? 'ok' : 'FAIL'} exit=${syncResult.obsidian.exit}`);
      if (!syncResult.obsidian.ok) console.log(syncResult.obsidian.out.slice(0, 500));
    }
    if (shipResult) {
      console.log('\n=== Ship check ===');
      console.log(shipResult.out);
    }
    if (written) {
      console.log(`\nwrote ${written.jsonPath}`);
      console.log(`wrote ${written.mdPath}`);
    }
  }

  // Exit non-zero only on hard tool failures, not on blocked ship gate
  if (syncResult && (!syncResult.github_linear.ok || !syncResult.obsidian.ok)) {
    process.exit(2);
  }
  if (shipResult && !shipResult.ok) {
    process.exit(1);
  }
}

// Exports for unit tests (no live network)
module.exports = {
  scoreIssue,
  rankIssues,
  prTouchesIssue,
  routeSkills,
  shipClaimGate,
  extractAcceptanceHints,
  labelNames,
  parseArgs,
  parseLinearMapText,
  buildContextContract,
  buildVerificationContract,
  validateVerificationReceipt,
  formatMinimal,
  formatHuman,
  SKILL_ROUTES,
  CONTEXT_BLOCK_IDS,
  VERIFICATION_RECEIPT_SCHEMA,
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(2);
  }
}
