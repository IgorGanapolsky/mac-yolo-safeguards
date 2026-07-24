#!/usr/bin/env node
'use strict';

/**
 * ZCode-inspired Hermes harness adapter.
 *
 * The Z.ai PDF is an announcement, not an integration contract. This tool keeps
 * the adoption bounded: convert the announced harness ideas into deterministic
 * Hermes receipts without making provider calls, changing keys, or spending
 * Coding Plan quota.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildLoopState, parsePlanTasks } = require('./hermes-loop-state');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_PDF = '/Users/igorganapolsky/Downloads/zai.pdf';
const DEFAULT_OUT_DIR = path.join(DEFAULT_REPO, 'artifacts', 'hermes-zcode-harness');

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{24,}\b/g,
  /\b([A-Z0-9_]*(?:API|TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*=)([^\s"'`]+)/gi,
];

const FEATURE_CATALOG = [
  {
    id: 'official_glm52_harness',
    label: 'ZCode positions itself as the official GLM-5.2 coding harness',
    regex: /official harness|GLM-5\.2|ZCode/i,
  },
  {
    id: 'goal_mode_independent_verification',
    label: 'Goal Mode uses independent verification before declaring completion',
    regex: /Goal Mode|independent verification|separate verifier|confirm when/i,
  },
  {
    id: 'custom_subagents',
    label: 'Custom subagents can have separate model and permission profiles',
    regex: /Custom subagents|subagent.*model|permissions/i,
  },
  {
    id: 'remote_qr_session_control',
    label: 'Remote session control can steer desktop sessions through a QR handoff',
    regex: /Remote session control|scan a QR|QR code|desktop/i,
  },
  {
    id: 'coding_plan_quota_boost',
    label: 'Coding Plan gets 1.5x quota in ZCode',
    regex: /1\.5x|Coding Plan|quota/i,
  },
];

const SUBAGENT_PROFILES = [
  {
    id: 'goal_planner',
    model: 'hermes/auto-local',
    escalationModel: 'custom:zai-coding-glm when paid reasoning is explicitly allowed',
    permissions: ['read_plan', 'read_repo_state', 'query_rag', 'write_goal_receipt'],
    deniedPermissions: ['edit_files', 'provider_spend', 'merge_pr', 'delete_branch'],
    verifier: 'independent_verifier',
  },
  {
    id: 'implementation_worker',
    model: 'local_fast by default',
    escalationModel: 'custom:zai-coding-glm only behind cost and approval gates',
    permissions: ['edit_claimed_files', 'run_focused_tests', 'write_diff_summary'],
    deniedPermissions: ['edit_unclaimed_files', 'force_push', 'publish', 'write_secrets'],
    verifier: 'independent_verifier',
  },
  {
    id: 'independent_verifier',
    model: 'local_verifier',
    escalationModel: 'glm52_reasoning only for high-risk proof disputes',
    permissions: ['run_tests', 'read_ci', 'read_latest_e2e', 'inspect_diff', 'mark_goal_verified'],
    deniedPermissions: ['edit_implementation', 'self_attest_completion', 'approve_paid_spend'],
    verifier: 'command_or_provider_result',
  },
  {
    id: 'remote_operator',
    model: 'none',
    escalationModel: 'none',
    permissions: ['status', 'pause', 'resume', 'request_approval', 'attach_evidence'],
    deniedPermissions: ['execute_destructive_action', 'merge_pr', 'delete_file', 'print_secret'],
    verifier: 'signed_or_logged_remote_receipt',
  },
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    repo: DEFAULT_REPO,
    pdf: DEFAULT_PDF,
    task: 'Improve Hermes infrastructure and harness from ZCode PDF',
    outDir: DEFAULT_OUT_DIR,
    json: false,
    markdown: false,
    write: false,
    noPdf: false,
    now: null,
    host: os.hostname(),
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--pdf') args.pdf = requireValue(argv, ++index, arg);
    else if (arg === '--task') args.task = requireValue(argv, ++index, arg);
    else if (arg === '--out-dir') args.outDir = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--no-pdf') args.noPdf = true;
    else if (arg === '--now') args.now = requireValue(argv, ++index, arg);
    else if (arg === '--host') args.host = requireValue(argv, ++index, arg);
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

// NOT a password hash: `sha()` produces short, deterministic content
// fingerprints (goal/session ids, nonces, source/serialized digests) for
// receipts and dedup — never a credential or secret. SHA256 is already the
// strong end of the spectrum here (not MD5/SHA1); truncation is for id
// readability, not security, since these values aren't used as auth secrets.
function sha(value, length = 16) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function extractPdfText(pdfPath) {
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    return {
      ok: false,
      text: '',
      error: pdfPath ? `pdf_not_found:${pdfPath}` : 'pdf_path_missing',
    };
  }
  const script = [
    'import sys',
    'from pypdf import PdfReader',
    'reader = PdfReader(sys.argv[1])',
    'parts = []',
    'for page in reader.pages:',
    '    parts.append(page.extract_text() or "")',
    'print("\\n".join(parts))',
  ].join('\n');
  const result = spawnSync('python3', ['-c', script, pdfPath], {
    encoding: 'utf8',
    timeout: 15000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return {
      ok: false,
      text: '',
      error: redact((result.stderr || result.stdout || 'pdf_extract_failed').trim()),
    };
  }
  return {
    ok: true,
    text: redact(result.stdout || ''),
    error: null,
  };
}

function detectSourceFeatures(text) {
  const cleanText = String(text || '');
  return FEATURE_CATALOG.map((feature) => ({
    id: feature.id,
    label: feature.label,
    present: feature.regex.test(cleanText),
  }));
}

function collectPlanTasks(repo) {
  const planPath = path.join(repo, 'plan.md');
  if (!fs.existsSync(planPath)) return [];
  return parsePlanTasks(fs.readFileSync(planPath, 'utf8'));
}

function adoptionRecommendations(features) {
  const present = new Set(features.filter((feature) => feature.present).map((feature) => feature.id));
  return [
    {
      id: 'goal_receipt_with_independent_verifier',
      sourceFeature: 'goal_mode_independent_verification',
      status: present.has('goal_mode_independent_verification') ? 'adopt_now' : 'not_source_backed',
      hermesSurface: 'tools/hermes-loop-state.js + plan.md acceptance checks',
      action: 'Require an independent verifier profile and command evidence before any goal can be marked verified.',
      proofGate: 'goal.verifier.id is independent_verifier and implementation_worker cannot mark its own goal complete',
    },
    {
      id: 'subagent_permission_profiles',
      sourceFeature: 'custom_subagents',
      status: present.has('custom_subagents') ? 'adopt_now' : 'not_source_backed',
      hermesSurface: 'multi-agent pipeline, economic router, yolo wrapper',
      action: 'Use explicit model, escalation, allowed permissions, denied permissions, and verifier for every subagent.',
      proofGate: 'all subagent profiles include model, permissions, deniedPermissions, and verifier fields',
    },
    {
      id: 'qr_safe_remote_control_receipts',
      sourceFeature: 'remote_qr_session_control',
      status: present.has('remote_qr_session_control') ? 'adopt_guarded' : 'not_source_backed',
      hermesSurface: 'Hermes Mobile, desktop gateway, Leash approval surface',
      action: 'Expose QR-safe status/pause/resume/request-approval receipts that carry no keys and no destructive commands.',
      proofGate: 'remote receipt contains no secret patterns and denies merge/delete/publish actions',
    },
    {
      id: 'coding_plan_quota_metadata_only',
      sourceFeature: 'coding_plan_quota_boost',
      status: present.has('coding_plan_quota_boost') ? 'observe_only' : 'not_source_backed',
      hermesSurface: 'Hermes economic router',
      action: 'Record the quota claim as routing metadata only; do not change default provider or spend behavior from an email.',
      proofGate: 'default route remains local unless paid/approval/cost gates explicitly allow GLM 5.2',
    },
  ];
}

function buildSurfaceMatrix() {
  return [
    {
      surface: 'desktop_cli',
      harness: 'hermes-yolo conversational and one-shot flows',
      zcodePort: 'goal receipt before long-running work; local default model; GLM escalation behind gates',
      verifier: 'exact marker smoke plus wrapper log provider/model readback',
    },
    {
      surface: 'gateway_8642',
      harness: 'Hermes gateway health, run state, and mobile API',
      zcodePort: 'separate health from completion proof and expose status-only remote receipts',
      verifier: '/health readback plus separate completion smoke when needed',
    },
    {
      surface: 'mobile',
      harness: 'Hermes Mobile Leash and machine picker',
      zcodePort: 'QR-safe remote control payloads that request approval instead of executing destructive actions',
      verifier: 'Leash receipt log or mobile E2E proof, not self-attestation',
    },
    {
      surface: 'multi_agent',
      harness: 'multi-agent pipeline and economic router',
      zcodePort: 'per-subagent model and permission profiles with independent critic/verifier context',
      verifier: 'focused pipeline/router tests and receipt inspection',
    },
    {
      surface: 'ci_and_plan',
      harness: 'plan.md ownership, loop-state gate, GitHub checks',
      zcodePort: 'goal mode cannot close until external gates pass or blockers are named',
      verifier: 'plan task status, latest continuous proof, and CI readback kept separate',
    },
    {
      surface: 'all_macs',
      harness: 'all-Macs setup verifier and Tailscale discovery',
      zcodePort: 'remote sessions are host-bound receipts, not assumed shared shell state',
      verifier: 'host, branch, gateway, and key-presence truth reported separately',
    },
  ];
}

function buildGoal({ task, source, now, loopState }) {
  const sourceFeatureCount = source.features.filter((feature) => feature.present).length;
  const planTasks = (loopState.plan && (loopState.plan.tasks || loopState.plan.activeTasks)) || [];
  const claimedTask = planTasks
    .filter((item) => {
      const title = item.title || '';
      const files = item.files || '';
      return item.id === 'T-133'
        || item.id === 'T-64'
        || /ZCode-inspired Hermes|SDD harness|harness gaps/i.test(title)
        || /hermes-zcode-harness|hermes-retrieval-harness/i.test(files);
    })
    .sort((a, b) => planTaskPriority(a) - planTaskPriority(b))[0];
  return {
    id: `goal-${sha(`${task}|${source.path}|${now}`, 12)}`,
    mode: 'goal_with_independent_verification',
    task,
    implementer: 'implementation_worker',
    verifier: 'independent_verifier',
    selfCompletionAllowed: false,
    gates: [
      {
        id: 'source_pdf_features',
        status: sourceFeatureCount >= 3 ? 'pass' : 'warn',
        evidence: `${sourceFeatureCount}/${FEATURE_CATALOG.length} expected ZCode feature signals detected`,
      },
      {
        id: 'plan_ownership',
        status: claimedTask ? 'pass' : 'warn',
        evidence: claimedTask ? `${claimedTask.id}:${claimedTask.status}:${claimedTask.owner}` : 'no harness plan claim found',
      },
      {
        id: 'focused_harness_tests',
        status: 'required',
        evidence: 'node tests/test-hermes-zcode-harness.js',
      },
      {
        id: 'remote_control_receipt_redaction',
        status: 'required',
        evidence: 'receipt must contain no API keys, PATs, or destructive command grants',
      },
      {
        id: 'continuous_e2e_truth',
        status: loopState.latestProof && loopState.latestProof.e2e === 'pass' ? 'pass' : 'informational',
        evidence: loopState.latestProof && loopState.latestProof.exists
          ? `e2e=${loopState.latestProof.e2e || 'missing'} ${loopState.latestProof.detail || ''}`.trim()
          : 'latest continuous proof unavailable',
      },
    ],
  };
}

function planTaskPriority(item) {
  const title = item.title || '';
  const files = item.files || '';
  if (item.id === 'T-133') return 0;
  if (item.status === 'in_progress' && /SDD harness|harness gaps|ZCode-inspired Hermes/i.test(title)) return 1;
  if (item.status === 'in_progress' && /hermes-zcode-harness|hermes-retrieval-harness/i.test(files)) return 2;
  if (/SDD harness|harness gaps/i.test(title)) return 3;
  if (/hermes-zcode-harness|hermes-retrieval-harness/i.test(files)) return 4;
  if (item.id === 'T-64') return 10;
  return 20;
}

function buildRemoteReceipt({ task, source, now, host }) {
  const sessionId = `zcode-${sha(`${task}|${source.path}|${host}|${now}`, 10)}`;
  const nonce = sha(`${sessionId}|${now}|remote-control`, 18);
  const receipt = {
    schema: 'hermes-remote-control-receipt/v1',
    sessionId,
    host,
    issuedAt: now,
    qrPayload: `hermes://remote-control/${sessionId}?nonce=${nonce}&mode=status-pause-resume-approval`,
    allowedActions: ['status', 'pause', 'resume', 'request_approval', 'attach_evidence'],
    deniedActions: ['merge_pr', 'delete_branch', 'delete_file', 'force_push', 'publish', 'print_secret'],
    secretPolicy: 'payload contains no API keys, PATs, bearer tokens, or env values',
    sourceDigest: sha(source.text || source.path || 'unknown', 20),
  };
  const serialized = JSON.stringify(receipt);
  return {
    ...receipt,
    redactionCheck: {
      ok: serialized === redact(serialized),
      digest: sha(serialized, 20),
    },
  };
}

function buildHarness(options = {}) {
  const now = options.now || new Date().toISOString();
  const task = options.task || 'Improve Hermes infrastructure and harness from ZCode PDF';
  const sourceText = options.sourceText || '';
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const loopState = options.loopState || buildLoopState({ repo });
  let planTasks = options.planTasks;
  if (!planTasks) {
    if (loopState.plan && loopState.plan.tasks) planTasks = loopState.plan.tasks;
    else if (options.loopState && loopState.plan && loopState.plan.activeTasks) planTasks = loopState.plan.activeTasks;
    else planTasks = collectPlanTasks(repo);
  }
  const loopStateWithTasks = {
    ...loopState,
    plan: {
      ...(loopState.plan || {}),
      tasks: planTasks.length ? planTasks : ((loopState.plan && loopState.plan.tasks) || []),
    },
  };
  const features = detectSourceFeatures(sourceText);
  const source = {
    path: options.pdf || null,
    extractionOk: options.extractionOk !== false,
    extractionError: options.extractionError || null,
    featureCount: features.filter((feature) => feature.present).length,
    features,
    text: sourceText,
  };
  const remoteControlReceipt = buildRemoteReceipt({
    task,
    source,
    now,
    host: options.host || os.hostname(),
  });
  const harness = {
    schema: 'hermes-zcode-harness/v1',
    generatedAt: now,
    task,
    source: {
      path: source.path,
      extractionOk: source.extractionOk,
      extractionError: source.extractionError,
      featureCount: source.featureCount,
      features: source.features,
      note: 'Source is a Z.ai/ZCode announcement; adoption is bounded to harness receipts and tests.',
    },
    goal: buildGoal({ task, source, now, loopState: loopStateWithTasks }),
    subagents: SUBAGENT_PROFILES,
    remoteControlReceipt,
    surfaceMatrix: buildSurfaceMatrix(),
    recommendations: adoptionRecommendations(features),
    policy: {
      providerCallsMade: false,
      providerDefaultChanged: false,
      spendAllowedByThisHarness: false,
      destructiveActionsAllowedRemotely: false,
      completionLanguage: 'do not say done until focused tests and verifier gates pass',
    },
    repoState: {
      branch: loopState.repo && loopState.repo.branch,
      head: loopState.repo && loopState.repo.head,
      dirtyCount: loopState.git && loopState.git.dirtyCount,
      activeTasks: loopState.plan && loopState.plan.activeTasks,
      taskCount: loopStateWithTasks.plan && loopStateWithTasks.plan.tasks && loopStateWithTasks.plan.tasks.length,
      latestProof: loopState.latestProof,
    },
  };
  return JSON.parse(redact(harness));
}

function renderMarkdown(harness) {
  const lines = [
    '# Hermes ZCode Harness',
    '',
    `Generated: ${harness.generatedAt}`,
    `Task: ${harness.task}`,
    `Source: ${harness.source.path || 'inline text'}`,
    `Feature signals: ${harness.source.featureCount}/${FEATURE_CATALOG.length}`,
    '',
    '## Adopted Signals',
    '',
  ];
  for (const feature of harness.source.features) {
    lines.push(`- ${feature.present ? 'PASS' : 'MISS'} ${feature.id}: ${feature.label}`);
  }
  lines.push('', '## Goal Gate', '');
  lines.push(`Goal: ${harness.goal.id}`);
  lines.push(`Implementer: ${harness.goal.implementer}`);
  lines.push(`Verifier: ${harness.goal.verifier}`);
  lines.push(`Self completion allowed: ${harness.goal.selfCompletionAllowed ? 'yes' : 'no'}`);
  for (const gate of harness.goal.gates) {
    lines.push(`- ${gate.id}: ${gate.status} - ${gate.evidence}`);
  }
  lines.push('', '## Subagents', '');
  for (const subagent of harness.subagents) {
    lines.push(`- ${subagent.id}: model=${subagent.model}; verifier=${subagent.verifier}`);
    lines.push(`  - permissions: ${subagent.permissions.join(', ')}`);
    lines.push(`  - denied: ${subagent.deniedPermissions.join(', ')}`);
  }
  lines.push('', '## Remote Receipt', '');
  lines.push(`Session: ${harness.remoteControlReceipt.sessionId}`);
  lines.push(`QR payload: \`${harness.remoteControlReceipt.qrPayload}\``);
  lines.push(`Redaction check: ${harness.remoteControlReceipt.redactionCheck.ok ? 'pass' : 'fail'}`);
  lines.push('', '## Recommendations', '');
  for (const recommendation of harness.recommendations) {
    lines.push(`- ${recommendation.id}: ${recommendation.status}`);
    lines.push(`  - action: ${recommendation.action}`);
    lines.push(`  - gate: ${recommendation.proofGate}`);
  }
  lines.push('', '## Policy', '');
  lines.push(`Provider calls made: ${harness.policy.providerCallsMade ? 'yes' : 'no'}`);
  lines.push(`Provider default changed: ${harness.policy.providerDefaultChanged ? 'yes' : 'no'}`);
  lines.push(`Remote destructive actions allowed: ${harness.policy.destructiveActionsAllowedRemotely ? 'yes' : 'no'}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function writeArtifacts(harness, outDir = DEFAULT_OUT_DIR) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'latest.json');
  const mdPath = path.join(outDir, 'latest.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(harness, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(mdPath, renderMarkdown(harness), { mode: 0o600 });
  return { jsonPath, mdPath };
}

function usage() {
  return `Usage:
  node tools/hermes-zcode-harness.js [--json|--markdown] [--write]
    [--pdf /Users/igorganapolsky/Downloads/zai.pdf] [--task "..."]

Builds a source-backed Hermes harness receipt from the Z.ai ZCode announcement.
No provider calls are made. No keys are printed.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return { help: true };
  }
  let extracted = { ok: false, text: '', error: 'pdf extraction disabled' };
  if (!args.noPdf) extracted = extractPdfText(args.pdf);
  const harness = buildHarness({
    repo: args.repo,
    pdf: args.noPdf ? null : args.pdf,
    task: args.task,
    sourceText: extracted.text,
    extractionOk: extracted.ok,
    extractionError: extracted.error,
    now: args.now,
    host: args.host,
  });
  const artifacts = args.write ? writeArtifacts(harness, args.outDir) : null;
  const result = { ...harness, artifacts };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderMarkdown(harness));
  return result;
}

module.exports = {
  FEATURE_CATALOG,
  SUBAGENT_PROFILES,
  adoptionRecommendations,
  buildGoal,
  buildHarness,
  buildRemoteReceipt,
  detectSourceFeatures,
  extractPdfText,
  parseArgs,
  redact,
  renderMarkdown,
  writeArtifacts,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}
