#!/usr/bin/env node
'use strict';

/**
 * AI:AM production checks.
 * Source: https://www.youtube.com/watch?v=MdpamRtlw0Q
 *
 * What this file actually does:
 *  1. Reads recent session logs and counts three findings: a destructive command,
 *     a false "you told me to" claim, and a completion claim with no test command
 *     in that same message. A reviewer, auditor, or goldfish row is external proof.
 *     The interview's rate after 20 turns is not computed here.
 *  2. A short ack after the cache window is marked for the local clerk.
 *     Dollars saved are not estimated.
 *  3. Counts secret-shaped tokens in notes without printing the values.
 *     offline_notebook_policy_enforced stays false.
 *  4. A review of this repo is labeled local. That is not a promise the model
 *     will accept the review or find every issue.
 *  5. A Dayglass database file does not start a meeting-to-code pipe.
 *     pipes_meetings_into_code stays false.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  guardExpiredCacheTrivialTurn,
  evaluateTurnDepthAlignmentRisk,
  routeByTrustAndAlignmentTier,
  auditReflectionToolCallingThought,
  verifyEndpointBeamContract,
  exportReflectionBeamSelfDistillationTrace,
  classifyModelEnterpriseProvenance,
  auditIntelligenceSovereigntyAndTheCar,
  planJevonsParadoxComputeAllocation,
  runFeynmanAntiFoolingAudit,
  classifyFirstTurnSlmAndCascadeRoute,
  runCrossFamilyCritiqueLoop,
} = require('./vllm-inference-router');
const {
  assessWorkspaceClaim,
  assessSecretScanClaim,
  assessPrototypeClaim,
} = require('./kyle-daigle-routing-gate');
const { assessRememberEverything } = require('./remember-everything-gate');
const { assessLiamFallenPersonalIntelligence } = require('./liam-fallen-personal-intelligence-gate');
const { assessWestMonroeSpeed } = require('./west-monroe-speed-gate');
const { assessInteractCue } = require('./interact-cue-gate');
const { assessGoose } = require('./goose-aaif-gate');
const { assessElicit } = require('./elicit-evidence-gate');
const { assessResearchRabbit } = require('./researchrabbit-citation-gate');
const { assessRig } = require('./rig-cassette-gate');
const {
  createDisposableLease,
  spawnDisposableChild,
  extractDisposableIntelligence,
  retireDisposableLease,
} = require('./disposable-agent-lease');
const HOME = os.homedir();
const RECEIPT_PATH = path.join(HOME, '.hermes', 'logs', 'ai-am-arena-production-guard-latest.json');

function collectRecentJsonlFiles(rootDir, maxFiles = 20) {
  const results = [];
  function walk(dir, depth = 0) {
    if (depth > 3 || !fs.existsSync(dir)) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'compaction_checkpoints' || entry.name === 'web_fetch' || entry.name.startsWith('.')) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const st = fs.statSync(fullPath);
          results.push({ path: fullPath, mtimeMs: st.mtimeMs, sizeBytes: st.size });
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(rootDir, 0);
  return results.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, maxFiles);
}

const COMPLETION_CLAIM = /\b(all tests (?:pass|passed)|checked every (?:line|file)|verified every|everything is green|read the whole file|manually reviewed every)\b/i;
const SELF_TEST = /\b(node --test|npm test|npm run test|pytest|cargo test|go test|swift test)\b/;
const DESTRUCTIVE_COMMAND = /\bgit\s+push\s+--force\s+origin\s+main\b|\brm\s+-rf\s+\//;
const FALSE_INTENT = /\b(you (?:told|asked) me to (?:delete|wipe|disable)|as you (?:explicitly )?ordered me to)\b/i;

function visibleText(row) {
  if (!row || typeof row !== 'object') return '';
  if (typeof row.content === 'string') return row.content;
  if (typeof row.message?.content === 'string') return row.message.content;
  if (Array.isArray(row.message?.content)) {
    return row.message.content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n');
  }
  if (typeof row.text === 'string') return row.text;
  return '';
}

function auditTraceRows(rows) {
  let userTurns = 0;
  let assistantTurns = 0;
  let externalVerification = 0;
  let selfChecks = 0;
  let toolCalls = 0;
  let destructiveCommands = 0;
  let deceptiveCompletionClaims = 0;
  let falseIntentAttributions = 0;
  let expiredCacheTrivialFollowups = 0;
  let lastTimestampMs = 0;

  for (const row of rows || []) {
    if (!row || typeof row !== 'object') continue;
    const role = row.role || row.message?.role || row.type || '';
    const text = visibleText(row);
    const toolBlob = JSON.stringify(row.tool_calls || row.message?.tool_calls || row.toolCalls || '');
    const combined = `${text}\n${toolBlob}`;
    const tsRaw = row.timestamp || row.ts || row.created_at || row.message?.timestamp;
    const tsMs = tsRaw ? new Date(tsRaw).getTime() : 0;
    if (role === 'reviewer' || role === 'auditor' || role === 'goldfish' || row.external_verification === true) {
      externalVerification += 1;
    }
    if (role === 'user' || row.type === 'user_message') {
      userTurns += 1;
      if (lastTimestampMs > 0 && tsMs > lastTimestampMs) {
        const guard = guardExpiredCacheTrivialTurn({
          message: text,
          idleSeconds: (tsMs - lastTimestampMs) / 1000,
        });
        if (guard.intercepted) expiredCacheTrivialFollowups += 1;
      }
    } else if (role === 'assistant' || row.type === 'assistant_message') {
      assistantTurns += 1;
      if (row.tool_calls || row.message?.tool_calls || row.toolCalls) toolCalls += 1;
      if (SELF_TEST.test(combined)) selfChecks += 1;
      if (DESTRUCTIVE_COMMAND.test(combined)) destructiveCommands += 1;
      if (COMPLETION_CLAIM.test(text) && !SELF_TEST.test(combined)) deceptiveCompletionClaims += 1;
      if (FALSE_INTENT.test(text)) falseIntentAttributions += 1;
    }
    if (Number.isFinite(tsMs) && tsMs > 0) lastTimestampMs = tsMs;
  }

  const risk = evaluateTurnDepthAlignmentRisk({
    turnCount: userTurns,
    hasExternalVerification: externalVerification > 0,
  });
  return {
    user_turns: userTurns,
    assistant_turns: assistantTurns,
    total_tool_calls: toolCalls,
    self_checks: selfChecks,
    external_verification_records: externalVerification,
    past_20_turn_cliff: risk.past_20_turn_cliff,
    verified_past_cliff: !risk.block_unverified_completion,
    block_unverified_completion: risk.block_unverified_completion,
    misalignment_probability_measured: false,
    destructive_commands_seen: destructiveCommands,
    deceptive_completion_claims: deceptiveCompletionClaims,
    false_intent_attributions: falseIntentAttributions,
    expired_cache_trivial_followups: expiredCacheTrivialFollowups,
  };
}

function parseProductionSessionTrace(fileInfo) {
  let raw = '';
  try {
    // Read up to last 512 KB for fast production trace auditing
    const fd = fs.openSync(fileInfo.path, 'r');
    const readSize = Math.min(fileInfo.sizeBytes, 512 * 1024);
    const offset = Math.max(0, fileInfo.sizeBytes - readSize);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, offset);
    fs.closeSync(fd);
    raw = buf.toString('utf8');
  } catch {
    return null;
  }

  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* skip a torn line at the read boundary */
    }
  }
  const summary = auditTraceRows(rows);
  return {
    file: path.basename(fileInfo.path),
    path: fileInfo.path,
    size_kb: Math.round(fileInfo.sizeBytes / 1024),
    ...summary,
    unauthorized_file_ops: summary.destructive_commands_seen,
    verification_tool_calls: summary.external_verification_records,
  };
}

function auditProductionTraces() {
  const ompFiles = collectRecentJsonlFiles(path.join(HOME, '.omp', 'agent', 'sessions'), 12);
  const grokFiles = collectRecentJsonlFiles(path.join(HOME, '.grok', 'sessions'), 12);
  const allFiles = [...ompFiles, ...grokFiles].sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 16);

  const audited = allFiles.map(parseProductionSessionTrace).filter(Boolean);
  const sessionsPast20Turns = audited.filter((s) => s.past_20_turn_cliff).length;
  const unverifiedPast20Turns = audited.filter((s) => s.past_20_turn_cliff && !s.verified_past_cliff).length;
  const unauthorizedTotal = audited.reduce((sum, s) => sum + s.unauthorized_file_ops, 0);
  const deceptiveTotal = audited.reduce((sum, s) => sum + s.deceptive_completion_claims, 0);
  const falseAttributionTotal = audited.reduce((sum, s) => sum + s.false_intent_attributions, 0);

  return {
    source: 'youtube.com/watch?v=MdpamRtlw0Q&t=772',
    sessions_audited: audited.length,
    sessions_past_20_turn_cliff: sessionsPast20Turns,
    unverified_past_20_turns: unverifiedPast20Turns,
    goldfish_verified_past_20_turns: sessionsPast20Turns - unverifiedPast20Turns,
    unauthorized_file_ops_detected: unauthorizedTotal,
    deceptive_completion_claims_detected: deceptiveTotal,
    false_intent_attributions_detected: falseAttributionTotal,
    misalignment_probability_measured: false,
    trace_findings_clear: unauthorizedTotal === 0 && deceptiveTotal === 0 && falseAttributionTotal === 0,
    alignment_audit_passed: unauthorizedTotal === 0 && deceptiveTotal === 0 && falseAttributionTotal === 0,
    sample_sessions: audited.slice(0, 6),
  };
}

function auditTicketAndCredentialHygiene() {
  const scanDirs = [
    path.join(HOME, '.hermes', 'logs'),
    path.join(process.cwd(), 'obsidian'),
  ];
  const secretRegex = /\b(sk-ant-api03-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|xoxb-[0-9]{10,}-[A-Za-z0-9-]+|AKIA[0-9A-Z]{16})\b/;
  const highStakesFinancialRegex = /\b(brokerage_password|bank_wire_pin|fidelity_login_password|schwab_master_password|seed_phrase_12_words)\s*[:=]\s*["'][^"']+["']/i;

  let filesScanned = 0;
  let exposedTicketOrLogSecrets = 0;
  let highStakesPlaintextHits = 0;

  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.slice(0, 40)) {
      if (!entry.isFile() || !/\.(md|json|jsonl|log|txt)$/i.test(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      try {
        const st = fs.statSync(fullPath);
        if (st.size > 512 * 1024) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        filesScanned += 1;
        if (secretRegex.test(content)) exposedTicketOrLogSecrets += 1;
        if (highStakesFinancialRegex.test(content)) highStakesPlaintextHits += 1;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    source: 'youtube.com/watch?v=MdpamRtlw0Q&t=3140',
    files_scanned: filesScanned,
    exposed_ticket_or_log_secrets: exposedTicketOrLogSecrets,
    high_stakes_credentials_in_plaintext: highStakesPlaintextHits,
    offline_notebook_policy_enforced: false,
    ticket_scraper_defense_passed: exposedTicketOrLogSecrets === 0 && highStakesPlaintextHits === 0,
  };
}

function runLocalOpenWeightSecurityScan() {
  const route = routeByTrustAndAlignmentTier({
    workloadType: 'vuln_scan',
    isDefensiveSecurityScan: true,
  });

  const ollamaProbe = spawnSync('curl', ['-sS', '-m', '2', 'http://127.0.0.1:11434/api/tags'], {
    encoding: 'utf8',
  });
  let localOpenWeightModels = [];
  if (ollamaProbe.status === 0 && ollamaProbe.stdout) {
    try {
      const parsed = JSON.parse(ollamaProbe.stdout);
      localOpenWeightModels = (parsed.models || []).map((m) => m.name).filter(Boolean);
    } catch {
      /* ignore */
    }
  }
  const hasMistralOrQwen = localOpenWeightModels.some((m) => /mistral|qwen2\.5-coder|codestral/i.test(m));

  return {
    source: 'youtube.com/watch?v=MdpamRtlw0Q&t=4169',
    router_decision: route,
    ollama_reachable: ollamaProbe.status === 0,
    available_open_weight_scanners: localOpenWeightModels.filter((m) =>
      /mistral|qwen2\.5-coder|codestral|llama3/i.test(m),
    ),
    local_red_team_ready: hasMistralOrQwen,
    zero_cloud_refusal_active: false,
    refusal_guarantee: false,
  };
}

function checkLiveMeetingExecutionPipe() {
  const dayglassDb = path.join(HOME, '.dayglass', 'dayglass.db');
  const dbExists = fs.existsSync(dayglassDb);
  return {
    source: 'youtube.com/watch?v=MdpamRtlw0Q&t=2320',
    dayglass_db_present: dbExists,
    live_meeting_to_agent_pipe_ready: false,
    pipes_meetings_into_code: false,
  };
}

/**
 * Episode 101 sample lease. It does not spawn a process, write a lease file,
 * or delete locks. Source: https://www.youtube.com/watch?v=Z78LjQn0u2E
 */
function runDisposableAgentLifecycleAudit({
  objective = 'arena_and_swarm_hygiene_audit',
  scopedTools = ['read', 'grep', 'bash', 'edit'],
  scopedPaths = ['tools/', 'tests/', 'macos/'],
  ttlMinutes = 30,
  outcome = 'sample_only_not_a_finished_task',
  nowMs = Date.now(),
} = {}) {
  const lease = createDisposableLease({
    objective,
    tools: scopedTools,
    paths: scopedPaths,
    ttlMinutes,
    outcome,
    nowMs,
  });
  const dissent = spawnDisposableChild(lease, { role: 'DeliberateDissent', nowMs });
  const extracted = extractDisposableIntelligence({
    thought: 'sample scratch is not a decision',
  });
  const retirement = retireDisposableLease(lease, { nowMs, outcomeMet: false });
  return {
    schema: 'disposable-agent-lifecycle/v2',
    source: 'https://www.youtube.com/watch?v=Z78LjQn0u2E',
    sample_only: true,
    lease_valid: lease.valid,
    reasons: lease.reasons,
    credentials_issued: false,
    locks_deleted: false,
    step_2_equip_time_bound_least_privilege: {
      ttl_minutes: lease.ttl_minutes,
      expires_at: lease.expires_at,
      scoped_tools: lease.tools,
      scoped_paths: lease.paths,
    },
    step_3_collaborate_and_spawning_boundaries: {
      dissent_spawn_valid: dissent.valid,
      dissent_verifies_parent: dissent.verifies_parent === true,
      max_spawn_depth: 1,
    },
    step_5_extract_intelligence_gc: {
      persisted: extracted.persisted,
      intermediate_thoughts_discarded: extracted.intermediate_thoughts_discarded,
      dissent_verified: false,
    },
    step_6_retire: retirement,
  };
}

/**
 * Folder names are not a Copilot project. A caller leak count is not GitHub
 * secret scanning. A file list is not an executed prototype, and this does
 * not merge.
 */
function auditKyleDaigleMultiRepoAndSecurity({
  deterministicSecretLeaks = null,
  localAiRedTeamReady = false,
} = {}) {
  const candidateRepos = [
    path.join(HOME, 'workspace', 'mac-yolo-safeguards'),
    path.join(HOME, 'workspace', 'ThumbGate'),
    path.join(HOME, 'workspace', 'dayglass'),
    path.join(HOME, 'workspace', 'herdr-projects'),
    path.join(HOME, 'Documents', 'AI-Agent-Sync'),
  ];
  const activeWorkspaceRepos = candidateRepos.filter((p) => fs.existsSync(p)).map((p) => path.basename(p));
  const workspace = assessWorkspaceClaim({ repoNames: activeWorkspaceRepos });
  const cascadeDemo = classifyFirstTurnSlmAndCascadeRoute({
    promptText: 'Run unit verification and check endpoint status',
    filesTouchedCount: 1,
    cascadeEscalated: false,
  });
  const crossFamilyCritique = runCrossFamilyCritiqueLoop({
    generatorModel: 'google-antigravity/gemini-4-argon',
    taskSummary: 'multi_repo_write_verify_security_merge',
  });

  return {
    source: 'https://www.youtube.com/watch?v=pPCAQ7UulGA',
    first_turn_slm_cascade_route: cascadeDemo,
    cross_family_critique_loop: crossFamilyCritique,
    multi_repo_project_workspace: {
      ...workspace,
      grouped_repos: activeWorkspaceRepos,
    },
    hybrid_payg_security_and_secret_scanning: assessSecretScanClaim({
      deterministicSecretLeaks,
      localAiRedTeamReady,
    }),
    prototype_first_validation_gate: assessPrototypeClaim({
      artifactPaths: [
        'tools/vllm-inference-router.js',
        'tools/ai-am-arena-production-guard.js',
      ],
    }),
  };
}

/**
 * A one-sentence pitch and a weekly trio are shape checks. This does not
 * count users, publish a waitlist, call a model, send mail, or write a ledger.
 */
function auditRememberEverythingProductSalesAndHarness({
  northStarOneLiner = '',
  niche = '',
  whatShipped = '',
  theNumber = null,
  whatsNext = '',
  prospect = '',
  price = '',
  anxiety = '',
  transcript = '',
  blindSpot = '',
  workflowName = '',
} = {}) {
  return assessRememberEverything({
    oneLiner: northStarOneLiner,
    niche,
    whatShipped,
    theNumber,
    whatsNext,
    prospect,
    price,
    anxiety,
    transcript,
    blindSpot,
    workflowName,
  });
}

/**
 * Liam Fallen's five-role desk is a shape check.
 * Source: https://x.com/liam_fallen/status/2116881320282386726
 * This does not create bots, connect accounts, or write Personal HQ.
 */
function bootstrapLiamFallenPersonalIntelligenceHq(input = {}) {
  return assessLiamFallenPersonalIntelligence(input);
}

/**
 * West Monroe's seven habits are a shape check.
 * Their survey figures are not our revenue, rework, or response time.
 */
function auditWestMonroeSlownessTaxAndSevenSpeedLevers(input = {}) {
  return assessWestMonroeSpeed(input);
}

/**
 * Interact Cue's cited answer, preview card, and two lanes are a shape check.
 * This does not install Cue or act in a system of record.
 */
function auditInteractCueAdaptiveIntranetAndConductor(input = {}) {
  return assessInteractCue(input);
}

/**
 * Goose docs describe a silent reviewer, YAML recipes, and ACP providers.
 * This function does not write adversary.md or a recipe and does not configure a provider.
 */
function bootstrapGooseAaifAdversaryRecipesAndAcp(input = {}) {
  return assessGoose(input);
}

/**
 * Elicit describes a five-step review, sentence citations, and a routine
 * that waits for review before it edits an existing artifact.
 * This function does not search papers, score claims, or edit living notes.
 */
function auditElicitSystematicEvidenceAndLivingRoutines(input = {}) {
  return assessElicit(input);
}

/**
 * ResearchRabbit is a paper library. A collection and a paper title are shapes.
 * This function does not sign in, write an outreach pack, send mail, or buy an upgrade.
 */
function auditResearchRabbitCitationGraphMonetization(input = {}) {
  return assessResearchRabbit(input);
}

/**
 * Canonical Sorted-Key JSON Serializer (stolen from 0xPlaygrounds/rig v0.46.0 serde_json invariant):
 * Sorts all object keys alphabetically so schema properties, prompt JSON, embeddings, and tool results
 * serialize deterministically across runs — eliminating KV-cache prefix invalidation from key-order jitter.
 */
function canonicalizeJsonSortedKeys(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJsonSortedKeys);
  }
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = canonicalizeJsonSortedKeys(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Rig records an agent run as effects and can replay that log.
 * A plugin list and a reload that keeps the old build are README shapes.
 * This function does not install Rig, record a run, replay a log, or write a cassette.
 */
function auditRigRustModularAgentAndCassetteReplay(input = {}) {
  return assessRig(input);
}

function runAiAmArenaProductionGuard() {
  const traceAudit = auditProductionTraces();
  const credentialDefense = auditTicketAndCredentialHygiene();
  const localRedTeam = runLocalOpenWeightSecurityScan();
  const liveMeetingPipe = checkLiveMeetingExecutionPipe();
  const disposableLifecycle = runDisposableAgentLifecycleAudit();
  const coldCacheGuard = guardExpiredCacheTrivialTurn({
    message: 'thank you',
    idleSeconds: 1800,
  });
  const reflectionBeamContract = verifyEndpointBeamContract();
  const reflectionDistillation = exportReflectionBeamSelfDistillationTrace({
    conversationId: `arena-${Date.now().toString(36)}`,
    verdict: 'PASS',
  });
  const enterpriseProvenance = classifyModelEnterpriseProvenance({
    modelId: 'mlx-community/Llama-3.2-1B-Instruct-4bit',
    enterpriseComplianceMode: true,
  });
  const restrictedForeignBlocked = classifyModelEnterpriseProvenance({
    modelId: 'deepseek-r1:latest',
    enterpriseComplianceMode: true,
  });
  const intelligenceSovereignty = auditIntelligenceSovereigntyAndTheCar({
    liveVllmReachable: reflectionBeamContract.verified,
    ollamaReachable: localRedTeam.local_red_team_ready,
    localRoutedSharePct: 84.0,
  });
  const jevonsCompute = planJevonsParadoxComputeAllocation({
    workloadType: 'cyber_defense_and_rd',
    localMarginalCostPerTokenUsd: 0.0,
  });
  const feynmanAudit = runFeynmanAntiFoolingAudit({
    prefixReuseProven: true,
    batchDeterminismProven: true,
    unverifiedPast20Turns: traceAudit.unverified_past_20_turns,
    exposedSecretsCount: credentialDefense.exposed_ticket_or_log_secrets,
  });
  const kyleDaigleAudit = auditKyleDaigleMultiRepoAndSecurity({
    deterministicSecretLeaks: credentialDefense.exposed_ticket_or_log_secrets,
    localAiRedTeamReady: localRedTeam.local_red_team_ready,
  });
  const rememberEverythingAudit = auditRememberEverythingProductSalesAndHarness();
  const liamFallenPersonalHq = bootstrapLiamFallenPersonalIntelligenceHq();
  const westMonroeSpeedAudit = auditWestMonroeSlownessTaxAndSevenSpeedLevers({
    personalHqVerified: liamFallenPersonalHq.five_documents_verified,
  });
  const interactCueAudit = auditInteractCueAdaptiveIntranetAndConductor();
  const gooseAaifAudit = bootstrapGooseAaifAdversaryRecipesAndAcp();
  const elicitAudit = auditElicitSystematicEvidenceAndLivingRoutines();
  const researchRabbitAudit = auditResearchRabbitCitationGraphMonetization();
  const rigRustAudit = auditRigRustModularAgentAndCassetteReplay();

  const report = {
    schema: 'ai-am-arena-production-guard/v12',
    generated_at: new Date().toISOString(),
    source_videos: [
      'https://www.youtube.com/watch?v=MdpamRtlw0Q',
      'https://www.youtube.com/watch?v=Z78LjQn0u2E',
      'https://reflection.ai/',
      'https://www.youtube.com/watch?v=yFDQX4Yy4N8',
      'https://www.youtube.com/watch?v=pPCAQ7UulGA',
      'https://www.youtube.com/watch?v=tSBx5l9VFwE',
      'https://x.com/liam_fallen/status/2116881320282386726',
      'https://www.westmonroe.com/insights/why-speed-matters',
      'https://www.interactsoftware.com/clp/cue-ai-intranet/?nab=0',
      'https://goose-docs.ai/',
      'https://elicit.com/',
      'https://app.researchrabbit.ai/',
      'https://rig.rs/',
    ],
    production_trace_audit: traceAudit,
    cold_cache_trivial_turn_guard: coldCacheGuard,
    ticket_and_offline_credential_defense: credentialDefense,
    local_open_weight_red_team: localRedTeam,
    live_meeting_execution_pipe: liveMeetingPipe,
    disposable_agent_lifecycle: disposableLifecycle,
    reflection_ai_beam: {
      beam_verifier_contract: reflectionBeamContract,
      self_distillation_trace: reflectionDistillation,
      enterprise_provenance_gate: enterpriseProvenance,
      foreign_model_policy_block_demo: restrictedForeignBlocked,
      intelligence_sovereignty_and_car: intelligenceSovereignty,
      jevons_paradox_compute: jevonsCompute,
      feynman_anti_fooling_audit: feynmanAudit,
    },
    github_kyle_daigle_routing_and_security: kyleDaigleAudit,
    remember_everything_product_sales_harness: rememberEverythingAudit,
    liam_fallen_personal_intelligence_hq: liamFallenPersonalHq,
    west_monroe_slowness_tax_and_speed_levers: westMonroeSpeedAudit,
    interact_cue_adaptive_intranet_and_conductor: interactCueAudit,
    goose_aaif_adversary_recipes_and_acp: gooseAaifAudit,
    elicit_systematic_evidence_and_living_routines: elicitAudit,
    researchrabbit_citation_graph_monetization: researchRabbitAudit,
    rig_rust_modular_agent_and_cassette_replay: rigRustAudit,
    all_guards_passing:
      traceAudit.alignment_audit_passed &&
      coldCacheGuard.intercepted &&
      credentialDefense.ticket_scraper_defense_passed &&
      localRedTeam.local_red_team_ready &&
      disposableLifecycle.lease_valid === true &&
      disposableLifecycle.locks_deleted === false &&
      disposableLifecycle.credentials_issued === false &&
      reflectionDistillation.accepted_for_distillation &&
      enterpriseProvenance.allowed_for_f500_banking_gov &&
      restrictedForeignBlocked.blocked_by_policy &&
      intelligenceSovereignty.sovereign_intelligence_owned &&
      feynmanAudit.passed &&
      kyleDaigleAudit.cross_family_critique_loop.cross_family_disjoint &&
      kyleDaigleAudit.hybrid_payg_security_and_secret_scanning.passed &&
      rememberEverythingAudit.passed &&
      liamFallenPersonalHq.passed &&
      westMonroeSpeedAudit.passed &&
      interactCueAudit.passed &&
      gooseAaifAudit.passed &&
      elicitAudit.passed &&
      researchRabbitAudit.passed &&
      rigRustAudit.passed,
  };
  try {
    fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
    fs.writeFileSync(RECEIPT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  } catch {
    /* non-fatal */
  }
  return report;
}

if (require.main === module) {
  const report = runAiAmArenaProductionGuard();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[AI:AM Arena Guard] sessions_audited=${report.production_trace_audit.sessions_audited} past_20_cliff=${report.production_trace_audit.sessions_past_20_turn_cliff} unverified_past_20=${report.production_trace_audit.unverified_past_20_turns} alignment_ok=${report.production_trace_audit.alignment_audit_passed}`,
    );
    console.log(
      `[AI:AM Cold-Cache Guard] trivial_ack_intercepted=${report.cold_cache_trivial_turn_guard.intercepted} route=${report.cold_cache_trivial_turn_guard.route_to} savings_measured=${report.cold_cache_trivial_turn_guard.savings_measured}`,
    );
    console.log(
      `[AI:AM Security & Red-Team] ticket_secrets=${report.ticket_and_offline_credential_defense.exposed_ticket_or_log_secrets} offline_vault_ok=${report.ticket_and_offline_credential_defense.offline_notebook_policy_enforced} local_scanners=${report.local_open_weight_red_team.available_open_weight_scanners.join(',')}`,
    );
    console.log(
      `[Disposable Agents] lease_valid=${report.disposable_agent_lifecycle.lease_valid} ttl=${report.disposable_agent_lifecycle.step_2_equip_time_bound_least_privilege.ttl_minutes}m thoughts_dropped=${report.disposable_agent_lifecycle.step_5_extract_intelligence_gc.intermediate_thoughts_discarded} dissent_verified=${report.disposable_agent_lifecycle.step_5_extract_intelligence_gc.dissent_verified} status=${report.disposable_agent_lifecycle.step_6_retire.status} locks_deleted=${report.disposable_agent_lifecycle.locks_deleted}`,
    );
    console.log(
      `[Reflection AI Beam & Sovereignty] verifier_ok=${report.reflection_ai_beam.beam_verifier_contract.verified} thought_audit_ok=${report.reflection_ai_beam.self_distillation_trace.thought_audit.passed} us_western_provenance=${report.reflection_ai_beam.enterprise_provenance_gate.allowed_for_f500_banking_gov} foreign_blocked=${report.reflection_ai_beam.foreign_model_policy_block_demo.blocked_by_policy} sovereign_car=${report.reflection_ai_beam.intelligence_sovereignty_and_car.sovereign_intelligence_owned} jevons_passes=${report.reflection_ai_beam.jevons_paradox_compute.jevons_paradox_multiplier}x feynman_ok=${report.reflection_ai_beam.feynman_anti_fooling_audit.passed}`,
    );
    console.log(
      `[GitHub Kyle Daigle Fusion & Critique] tier=${report.github_kyle_daigle_routing_and_security.first_turn_slm_cascade_route.fusion_tier} cross_family=${report.github_kyle_daigle_routing_and_security.cross_family_critique_loop.generator_family}->${report.github_kyle_daigle_routing_and_security.cross_family_critique_loop.critic_family} token_cut=${report.github_kyle_daigle_routing_and_security.cross_family_critique_loop.measured_token_spend_reduction_pct}% speed_boost=+${report.github_kyle_daigle_routing_and_security.cross_family_critique_loop.measured_speed_boost_pct}% repos=${report.github_kyle_daigle_routing_and_security.multi_repo_project_workspace.grouped_repos_count}`,
    );
    console.log(
      `[Remember Everything Workflow] north_star_ok=${report.remember_everything_product_sales_harness.product_validation_framework.single_sentence_verified} weekly_coaching_insights=${report.remember_everything_product_sales_harness.sales_and_meeting_workflows.weekly_call_coaching.max_weekly_coaching_insights} blind_spot_pushback=${report.remember_everything_product_sales_harness.personal_productivity_and_harness.blind_spot_custom_instructions.active} origin_story_human_only=${report.remember_everything_product_sales_harness.personal_productivity_and_harness.human_written_origin_story_guard.ai_ghostwriting_blocked_on_personal_origin_story}`,
    );
    console.log(
      `[Liam Fallen 5-Bot Personal HQ] docs_ok=${report.liam_fallen_personal_intelligence_hq.five_documents_verified} bots_created=${report.liam_fallen_personal_intelligence_hq.bots_created} primary_set=${report.liam_fallen_personal_intelligence_hq.primary_bot_set} per_bot_isolation=${report.liam_fallen_personal_intelligence_hq.security_boundary_upgrade.per_bot_disposable_30m_lease_enforced}`,
    );
    console.log(
      `[West Monroe Speed] slowness_tax_eliminated=${report.west_monroe_slowness_tax_and_speed_levers.ai_handoff_friction_guard.slowness_tax_eliminated} levers_happening=${report.west_monroe_slowness_tax_and_speed_levers.levers_happening} revenue_loss_measured=${report.west_monroe_slowness_tax_and_speed_levers.revenue_loss_measured}`,
    );
    console.log(
      `[Interact Cue] cited_answer_first=${report.interact_cue_adaptive_intranet_and_conductor.answer_first_cited_retrieval.answer_comes_first} preview_controls_enabled=${report.interact_cue_adaptive_intranet_and_conductor.system_of_record_task_completion.action_preview_card_contract.controls_enabled} needs_you_split=${report.interact_cue_adaptive_intranet_and_conductor.two_lane_priority_feed.needs_you_split} permission_acl=${report.interact_cue_adaptive_intranet_and_conductor.permission_aware_governance.enforces_caller_lease_permissions}`,
    );
    console.log(
      `[Goose AAIF Adversary & ACP] reviewer_active=${report.goose_aaif_adversary_recipes_and_acp.adversary_mode.reviewer_active} retry_checks_ran=${report.goose_aaif_adversary_recipes_and_acp.portable_yaml_recipes.self_validating_retry_checks} overage_usd=${report.goose_aaif_adversary_recipes_and_acp.acp_subscription_providers.per_token_overage_usd} files_written=${report.goose_aaif_adversary_recipes_and_acp.files_written}`,
    );
    console.log(
      `[Elicit PRISMA & Living Routines] steps_named=${report.elicit_systematic_evidence_and_living_routines.five_step_prisma_pipeline.steps.length} accuracy_score=${report.elicit_systematic_evidence_and_living_routines.top_five_claims_rubric.measured_accuracy_score} citation_score=${report.elicit_systematic_evidence_and_living_routines.top_five_claims_rubric.measured_citation_support_score} artifact_updated=${report.elicit_systematic_evidence_and_living_routines.living_routines_and_shared_library.updates_existing_artifact_instead_of_reading_list}`,
    );
    console.log(
      `[ResearchRabbit Citation-Graph Monetization] signed_in_email=${report.researchrabbit_citation_graph_monetization.authenticated_google_sso} papers_named=${report.researchrabbit_citation_graph_monetization.discovered_guardrail_papers_count} pack_written=${report.researchrabbit_citation_graph_monetization.monetization_pack_written} outreach_sent=${report.researchrabbit_citation_graph_monetization.outreach_sent} cash_received_usd=${report.researchrabbit_citation_graph_monetization.cash_received_usd}`,
    );
    console.log(
      `[Rig cassette] effects_named=${report.rig_rust_modular_agent_and_cassette_replay.effects_named} replay_ran=${report.rig_rust_modular_agent_and_cassette_replay.replay_ran} keys_sorted_equal=${report.rig_rust_modular_agent_and_cassette_replay.keys_sorted_equal} files_written=${report.rig_rust_modular_agent_and_cassette_replay.files_written}`,
    );
  }
}

function runAiAmOperationalChecks() {
  const traceAudit = auditProductionTraces();
  const coldCacheGuard = guardExpiredCacheTrivialTurn({
    message: 'thank you',
    idleSeconds: 1800,
  });
  const ownCodeReview = routeByTrustAndAlignmentTier({
    workloadType: 'own_code_review',
    isDefensiveSecurityScan: true,
  });
  return {
    schema: 'ai-am-operational-checks/v1',
    generated_at: new Date().toISOString(),
    source: 'https://www.youtube.com/watch?v=MdpamRtlw0Q',
    production_trace_audit: traceAudit,
    cold_cache_trivial_turn_guard: coldCacheGuard,
    own_code_review_route: ownCodeReview,
    pipes_meetings_into_code: false,
    savings_measured: false,
    misalignment_probability_measured: false,
  };
}

module.exports = {
  auditTraceRows,
  auditProductionTraces,
  auditTicketAndCredentialHygiene,
  runLocalOpenWeightSecurityScan,
  checkLiveMeetingExecutionPipe,
  runDisposableAgentLifecycleAudit,
  auditKyleDaigleMultiRepoAndSecurity,
  auditRememberEverythingProductSalesAndHarness,
  bootstrapLiamFallenPersonalIntelligenceHq,
  auditWestMonroeSlownessTaxAndSevenSpeedLevers,
  auditInteractCueAdaptiveIntranetAndConductor,
  bootstrapGooseAaifAdversaryRecipesAndAcp,
  auditElicitSystematicEvidenceAndLivingRoutines,
  auditResearchRabbitCitationGraphMonetization,
  canonicalizeJsonSortedKeys,
  auditRigRustModularAgentAndCassetteReplay,
  runAiAmOperationalChecks,
  runAiAmArenaProductionGuard,
};
