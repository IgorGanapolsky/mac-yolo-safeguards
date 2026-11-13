#!/usr/bin/env node
'use strict';

/**
 * tools/split-moa-hypergraph-engine.js
 *
 * Production implementation of the "Dual-Model Mixture-of-Agents & Agentic GraphRAG Playbook"
 * + ontogr/agentic-graphrag decision-source invalidation & citation-verification invariants:
 *
 * 1. Pillar 1 — Dual-Model "Split Workflow" Strategic Allocation & Closed-Loop Sync:
 *    - Strategist / Global Ingester (Gemini 4 Argon / 3.1 Pro, 1M shared context):
 *      ingests massive repos, multimodal/Dayglass logs, and schema graphs -> emits
 *      structured Split-Workflow Handoff Artifacts.
 *    - Tactical Executor (Claude Opus 4.7 / Sonnet 4.6, 200k high-density precision,
 *      with $0 local zai-org/glm-5.3-coder sovereign floor):
 *      performs localized CLI/Git edits, rigid deterministic schema compliance, and unit tests.
 *    - Asynchronous Split Sync: compiles Executor raw terminal/test traces back into a
 *      compact Long-Context Sync Packet for Gemini's 1M-token buffer.
 *    - Interaction-Tax Bypass: skips Strategist on localized single-file tactical tasks.
 *
 * 2. Pillar 2 — Schema-Constrained Agentic Hypergraph RAG & Decision Freshness:
 *    - Pattern B (Schema-Constrained Ontology): predefined entity classes & allowed
 *      (sourceType, relationType, targetType) triples; out-of-schema or low-confidence
 *      items quarantined into reviewable `candidates[]` with passage provenance.
 *    - Cheapest-First Entity Resolution: same-label -> exact -> numeric-token gate
 *      (prevents merging PR 4919 with PR 4920 or port 3333 with 8766) -> token-set link.
 *    - Pattern C (Graph-R1 Hypergraphs & Iterative Rethink Traversal): n-ary hyperedges
 *      connecting {Decision, CodebaseArtifacts[], TestGates[]} + multi-hop traversal
 *      with explicit step-by-step `rethinkSteps[]` and fail-closed document scope enforcement.
 *    - Citation Read-Check & Source-SHA Decision Invalidation: flags unread/out-of-scope/
 *      superseded citations, and automatically transitions Decisions (plus transitive
 *      dependents) to `needs_review` when any cited file slice changes on disk.
 *
 * 3. Pillar 3 — Dual-LLM Gateway Failover, Rigid Schema Guardrail & Max-Hop Billing Cap:
 *    - Cross-Provider Parity Routing: always fails over to a comparable-intelligence
 *      model on a COMPETING provider (never same-provider regional failover), ending
 *      at the $0 local sovereign floor.
 *    - Rigid Structural Schema Validation: unparseable JSON or schema violations are
 *      treated as logical timeouts that immediately trigger competing-provider failover.
 *    - Token-Throttling Max-Hop Cap: hard-caps downstream fallback chains at <= 2 hops
 *      (<= 3 total attempts) + mid-failover budget re-check + cycle prevention.
 *
 * Zero external npm dependencies (Node.js built-ins only).
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA_VERSION = 'split-moa-hypergraph/v1';
const HARD_MAX_FALLBACK_HOPS = 2; // <= 3 total model invocations per request
const DEFAULT_MIN_CONFIDENCE = 0.75;
const DEFAULT_LEDGER_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'decision-ledger');
const DEFAULT_HARNESS_ROUTER_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const DEFAULT_MONTHLY_CAP_USD = 10;

// ─── PILLAR 1: DUAL-MODEL OPERATIONAL MATRIX & SPLIT WORKFLOW ───────────────

const SPLIT_MODEL_MATRIX = Object.freeze({
  'google/gemini-4-argon': {
    modelId: 'google/gemini-4-argon',
    provider: 'google',
    architecturalRole: 'strategist',
    parityTier: 'tier_s',
    maxContext: 1000000,
    costPer1kTokens: { input: 1.25, output: 5.0 },
    latencyMs: 380,
    qualityScore: 0.96,
    privacy: 'third_party',
    multimodal: true,
    strengths: ['global_repo_ingestion', 'multimodal_logs', 'macro_architecture', 'ui_ux_synthesis'],
  },
  'google/gemini-4-carbon': {
    modelId: 'google/gemini-4-carbon',
    provider: 'google',
    architecturalRole: 'strategist',
    parityTier: 'tier_s',
    maxContext: 1048576,
    costPer1kTokens: { input: 2.0, output: 10.0 },
    latencyMs: 410,
    qualityScore: 0.985,
    privacy: 'third_party',
    multimodal: true,
    strengths: ['global_repo_ingestion', 'macro_architecture', 'long_horizon_reasoning', 'multimodal_logs'],
  },
  'google/gemini-4-hydrogen': {
    modelId: 'google/gemini-4-hydrogen',
    provider: 'google',
    architecturalRole: 'executor',
    parityTier: 'tier_s',
    maxContext: 1048576,
    costPer1kTokens: { input: 1.5, output: 7.5 },
    latencyMs: 195,
    qualityScore: 0.965,
    privacy: 'third_party',
    multimodal: true,
    strengths: ['cli_execution', 'unit_test_loops', 'tactical_git_edits', 'deterministic_schema'],
  },
  'google/gemini-3.1-pro': {
    modelId: 'google/gemini-3.1-pro',
    provider: 'google',
    architecturalRole: 'strategist',
    parityTier: 'tier_a',
    maxContext: 1000000,
    costPer1kTokens: { input: 0.8, output: 3.2 },
    latencyMs: 310,
    qualityScore: 0.91,
    privacy: 'third_party',
    multimodal: true,
    strengths: ['schema_graph_translation', 'multimodal_tables', 'cross_session_state'],
  },
  'anthropic/claude-opus-4.7': {
    modelId: 'anthropic/claude-opus-4.7',
    provider: 'anthropic',
    architecturalRole: 'executor',
    parityTier: 'tier_s',
    maxContext: 200000,
    costPer1kTokens: { input: 3.0, output: 15.0 },
    latencyMs: 520,
    qualityScore: 0.97,
    privacy: 'third_party',
    multimodal: true,
    strengths: ['deterministic_schema', 'tactical_git_edits', 'complex_backend_logic', 'multi_hop_precision'],
  },
  'anthropic/claude-sonnet-4.6': {
    modelId: 'anthropic/claude-sonnet-4.6',
    provider: 'anthropic',
    architecturalRole: 'executor',
    parityTier: 'tier_a',
    maxContext: 200000,
    costPer1kTokens: { input: 0.8, output: 4.0 },
    latencyMs: 290,
    qualityScore: 0.92,
    privacy: 'third_party',
    multimodal: true,
    strengths: ['cli_execution', 'unit_test_loops', 'atomic_refactoring', 'deterministic_json'],
  },
  'zai-org/glm-5.3-coder': {
    modelId: 'zai-org/glm-5.3-coder',
    provider: 'zai',
    architecturalRole: 'sovereign_executor',
    parityTier: 'tier_local',
    maxContext: 200000,
    costPer1kTokens: { input: 0.0, output: 0.0 },
    latencyMs: 220,
    qualityScore: 0.88,
    privacy: 'local',
    multimodal: false,
    strengths: ['zero_cost_sovereign', 'airgapped_privacy', 'local_tactical_edits'],
  },
});

function finiteIntOrDefault(val, fallback) {
  const num = Number(val);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/**
 * Unified fail-closed budget check across explicit options, injected BudgetGuard,
 * default harness-router ledger, and openrouter-budget-guard when requested.
 */
function isBudgetExhaustedUnified(options = {}) {
  if (options.budgetExhausted === true) return true;
  if (options.budgetExhausted === false) return false;
  if (options.budgetGuard && typeof options.budgetGuard.isExhausted === 'function') {
    return Boolean(options.budgetGuard.isExhausted());
  }
  if (!options.checkSystemLedgers) return false;

  try {
    const ledgerPath = path.join(DEFAULT_HARNESS_ROUTER_DIR, 'spend-ledger.jsonl');
    if (fs.existsSync(ledgerPath)) {
      const now = new Date();
      const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      let spent = 0;
      for (const line of fs.readFileSync(ledgerPath, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (entry && entry.billingPeriod === period && Number.isFinite(Number(entry.costUsd))) {
            spent += Number(entry.costUsd);
          }
        } catch {
          // ignore malformed line
        }
      }
      if (spent >= DEFAULT_MONTHLY_CAP_USD) return true;
    }
  } catch {
    // proceed to secondary budget check
  }

  try {
    const { getBudgetPacingStatus } = require('./openrouter-budget-guard');
    const pacing = getBudgetPacingStatus();
    if (pacing && pacing.allowPaid === false) return true;
  } catch {
    // optional module
  }
  return false;
}

/**
 * Allocate a workload across the Gemini Strategist + Claude Tactical Executor
 * Split Workflow, bypassing dual-agent overhead when a single tactical pass suffices.
 */
function allocateSplitWorkflow(taskSpec = {}, options = {}) {
  const safeSpec = taskSpec && typeof taskSpec === 'object' ? taskSpec : {};
  const prompt = String(safeSpec.prompt || safeSpec.task || '').trim();
  const lower = prompt.toLowerCase();
  const estimatedTokens = Math.max(0, finiteIntOrDefault(safeSpec.estimatedTokens, 0));
  const fileCount = Math.max(0, finiteIntOrDefault(safeSpec.fileCount, 0));
  const privacyRequired = safeSpec.privacyRequired || options.privacyRequired || 'standard';
  const budgetExhausted = isBudgetExhaustedUnified(options);

  const hasMultimodal = Boolean(
    safeSpec.hasMultimodal ||
      /\b(screenshot|video|audio|wireframe|diagram|dayglass|ocr|recording|image)\b/.test(lower),
  );
  const requiresGlobalScan = Boolean(
    safeSpec.requiresGlobalScan ||
      estimatedTokens > 120000 ||
      fileCount >= 6 ||
      /\b(monorepo|cross-repo|whole repo|architecture|epic|migration|hypergraph|all services|codebase-wide)\b/.test(lower),
  );
  const highStakesLogic = Boolean(
    safeSpec.highStakes ||
      /\b(race condition|security|auth|payment|checkout|concurrency|schema migration|entitlement|lock)\b/.test(lower),
  );

  // Fail-closed local/fenced/budget gate -> $0 sovereign local executor
  if (privacyRequired === 'local' || privacyRequired === 'fenced' || budgetExhausted) {
    const reason = privacyRequired === 'local' || privacyRequired === 'fenced'
      ? `privacyRequired=${privacyRequired} blocks third-party cloud operators; routing to zero-egress local model`
      : 'monthly metered budget cap exhausted; failing closed to $0 local sovereign coder';
    return {
      schema: SCHEMA_VERSION,
      mode: 'sovereign_local_only',
      strategist: null,
      executor: SPLIT_MODEL_MATRIX['zai-org/glm-5.3-coder'],
      handoffRequired: false,
      signals: { estimatedTokens, fileCount, hasMultimodal, requiresGlobalScan, highStakesLogic, budgetExhausted },
      rationale: reason,
    };
  }

  const executorModelId = highStakesLogic ? 'anthropic/claude-opus-4.7' : 'anthropic/claude-sonnet-4.6';
  const executor = SPLIT_MODEL_MATRIX[executorModelId];

  // Interaction-Tax Guard: skip macro-strategist for localized tactical edits
  if (!hasMultimodal && !requiresGlobalScan) {
    return {
      schema: SCHEMA_VERSION,
      mode: 'tactical_single_model',
      strategist: null,
      executor,
      handoffRequired: false,
      signals: { estimatedTokens, fileCount, hasMultimodal, requiresGlobalScan, highStakesLogic, budgetExhausted },
      rationale: 'Localized tactical scope (<120k tokens, non-multimodal); skipping Strategist hop to avoid multi-agent interaction tax.',
    };
  }

  const strategistModelId = highStakesLogic || estimatedTokens > 400000
    ? 'google/gemini-4-argon'
    : 'google/gemini-3.1-pro';
  const strategist = SPLIT_MODEL_MATRIX[strategistModelId];

  return {
    schema: SCHEMA_VERSION,
    mode: 'split_dual_model',
    strategist,
    executor,
    handoffRequired: true,
    signals: { estimatedTokens, fileCount, hasMultimodal, requiresGlobalScan, highStakesLogic, budgetExhausted },
    rationale: `Split Workflow active: ${strategist.modelId} ingests global/multimodal context (${strategist.maxContext} ctx) -> emits Handoff -> ${executor.modelId} executes deterministic edits & tests.`,
  };
}

/**
 * Build a deterministic Split-Workflow Handoff Document from Strategist -> Executor.
 */
function buildStrategistHandoff(allocation, planSpec = {}) {
  const handoffId = planSpec.handoffId || `handoff_${crypto.randomBytes(6).toString('hex')}`;
  const targetFiles = Array.isArray(planSpec.targetFiles) ? planSpec.targetFiles : [];
  const invariants = Array.isArray(planSpec.invariants) ? planSpec.invariants : [];
  const acceptanceCommands = Array.isArray(planSpec.acceptanceCommands) ? planSpec.acceptanceCommands : [];
  const summary = String(planSpec.macroSummary || 'Macro architectural plan synthesized from global context.').trim();

  const markdown = [
    `# Split-Workflow Handoff (\`${handoffId}\`)`,
    `- **Strategist**: \`${allocation?.strategist?.modelId || 'none'}\``,
    `- **Tactical Executor**: \`${allocation?.executor?.modelId || 'zai-org/glm-5.3-coder'}\``,
    '',
    '## Macro Summary',
    summary,
    '',
    '## Scoped Target Files',
    ...(targetFiles.length ? targetFiles.map((f) => `- \`${f}\``) : ['- *(none specified)*']),
    '',
    '## Hard Invariants',
    ...(invariants.length ? invariants.map((inv) => `- ${inv}`) : ['- Preserve existing public exports and deterministic schemas']),
    '',
    '## Acceptance Verification Commands',
    ...(acceptanceCommands.length ? acceptanceCommands.map((c) => `- \`${c}\``) : ['- `bash scripts/verify.sh`']),
  ].join('\n');

  return {
    schema: 'split-workflow-handoff/v1',
    handoffId,
    createdAt: new Date().toISOString(),
    strategistModel: allocation?.strategist?.modelId || null,
    executorModel: allocation?.executor?.modelId || 'zai-org/glm-5.3-coder',
    macroSummary: summary,
    targetFiles,
    invariants,
    acceptanceCommands,
    markdown,
  };
}

/**
 * Compile Claude/Executor terminal traces & unit test outcomes back into a
 * structured sync packet for Gemini Strategist's 1M-token long-context buffer.
 */
function compileExecutorSyncPacket(handoff, executionResult = {}) {
  const hasExplicitZeroExit = executionResult.exitCode === 0 && !executionResult.signal;
  const exitCode = Number.isInteger(executionResult.exitCode) ? executionResult.exitCode : null;
  const signal = executionResult.signal ? String(executionResult.signal) : null;
  const rawTrace = String(executionResult.terminalOutput || '');
  const touchedFiles = Array.isArray(executionResult.touchedFiles) ? executionResult.touchedFiles : [];
  const lines = rawTrace.split(/\r?\n/).filter(Boolean);

  const failurePattern = /(?:\bFAIL\b|[A-Za-z]*Error:|AssertionError|\bERR_[A-Z0-9_]+\b|\bnot ok\b)/;
  const failingAssertions = lines
    .filter((l) => failurePattern.test(l))
    .slice(0, 15);
  const compactDigest = lines.slice(-25).join('\n').slice(0, 2400);

  const outOfScopeEdits = Array.isArray(handoff?.targetFiles) && handoff.targetFiles.length > 0
    ? touchedFiles.filter((f) => !handoff.targetFiles.includes(f))
    : [];

  const coherenceStatus = !hasExplicitZeroExit
    ? 'needs_replan_test_failure'
    : outOfScopeEdits.length > 0
      ? 'scope_drift_detected'
      : 'verified_coherent';

  return {
    schema: 'split-workflow-sync-packet/v1',
    syncId: `sync_${crypto.randomBytes(6).toString('hex')}`,
    handoffId: handoff?.handoffId || null,
    syncedAt: new Date().toISOString(),
    coherenceStatus,
    exitCode,
    signal,
    touchedFiles,
    outOfScopeEdits,
    failingAssertions,
    compactTerminalDigest: compactDigest,
    strategistBufferPrompt: [
      `[SPLIT-SYNC handoff=${handoff?.handoffId || 'ad-hoc'} status=${coherenceStatus} exit=${exitCode ?? `signal:${signal || 'null'}`}]`,
      `Touched: ${touchedFiles.join(', ') || 'none'}`,
      outOfScopeEdits.length ? `Out-of-scope edits: ${outOfScopeEdits.join(', ')}` : '',
      failingAssertions.length ? `Failures:\n${failingAssertions.join('\n')}` : (hasExplicitZeroExit ? 'All executed assertions passed.' : 'Process exited abnormally without clean exit code 0.'),
    ].filter(Boolean).join('\n'),
  };
}

// ─── PILLAR 2: SCHEMA-CONSTRAINED HYPERGRAPH RAG & DECISION INVALIDATION ────

const ONTOLOGY_SCHEMA = Object.freeze({
  version: '1.0.0',
  entityTypes: Object.freeze({
    Company: { description: 'Organization, customer, or provider operator' },
    Person: { description: 'Human stakeholder, author, or decider' },
    Product: { description: 'Commercial or open-source software product' },
    CodebaseArtifact: { description: 'Repository file, module, symbol, or config artifact' },
    Service: { description: 'Runtime daemon, LaunchAgent, worker, or API endpoint' },
    Decision: { description: 'Recorded architectural or business decision with source supports' },
    TaskEvent: { description: 'Agent tool execution, PR, or CI run event' },
    TestGate: { description: 'Deterministic unit, integration, or E2E verification check' },
  }),
  allowedRelations: Object.freeze([
    { source: 'Person', relation: 'WORKS_FOR', target: 'Company' },
    { source: 'Product', relation: 'OWNED_BY', target: 'Company' },
    { source: 'Service', relation: 'IMPLEMENTS', target: 'Product' },
    { source: 'Service', relation: 'DEPENDS_ON', target: 'CodebaseArtifact' },
    { source: 'CodebaseArtifact', relation: 'DEPENDS_ON', target: 'CodebaseArtifact' },
    { source: 'Decision', relation: 'SUPPORTED_BY', target: 'CodebaseArtifact' },
    { source: 'Decision', relation: 'DEPENDS_ON', target: 'Decision' },
    { source: 'Decision', relation: 'VERIFIED_BY', target: 'TestGate' },
    { source: 'TaskEvent', relation: 'PRODUCES', target: 'Decision' },
    { source: 'TestGate', relation: 'DEPENDS_ON', target: 'CodebaseArtifact' },
  ]),
});

function isAllowedRelationTriple(sourceType, relation, targetType, schema = ONTOLOGY_SCHEMA) {
  return schema.allowedRelations.some(
    (r) => r.source === sourceType && r.relation === relation && r.target === targetType,
  );
}

function extractNumbers(text) {
  return (String(text || '').match(/\d+(?:\.\d+)?/g) || []).join('|');
}

function canonicalTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9/._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Cheapest-first Entity Resolution Ladder (ontogr/agentic-graphrag):
 * 1. Same label required
 * 2. Exact case-insensitive text collapse
 * 3. Numeric-token gate: distinct numbers NEVER merge (e.g. PR 4919 != PR 4920, port 3333 != 8766)
 * 4. Canonical token-order match links near-duplicates under one resolved entity
 */
function resolveEntitiesCheapestFirst(entities = []) {
  const canonicalNodes = [];
  const entityIdMap = new Map();
  const resolutionLinks = [];

  for (const raw of entities) {
    if (!raw || typeof raw !== 'object') continue;
    const exactLower = String(raw.name || '').trim().toLowerCase();
    const nums = extractNumbers(raw.name);
    const tokKey = canonicalTokens(raw.name);

    let matched = null;
    let matchReason = null;

    for (const existing of canonicalNodes) {
      if (existing.type !== raw.type) continue; // Step 1: Same label only
      if (existing.exactLower === exactLower) {
        matched = existing;
        matchReason = 'exact_collapse';
        break; // Step 2: Exact collapse
      }
      // Step 3: Name numeric gate — block if numbers differ or name excessively long
      if (nums !== existing.nums || String(raw.name || '').length > 140) {
        continue;
      }
      // Step 4: Word-order / punctuation fuzzy match
      if (tokKey && tokKey === existing.tokKey) {
        matched = existing;
        matchReason = 'fuzzy_token_link';
        break;
      }
    }

    if (matched) {
      entityIdMap.set(raw.id, matched.id);
      if (!matched.mergedIds.includes(raw.id)) matched.mergedIds.push(raw.id);
      for (const pid of raw.passageIds || []) {
        if (!matched.passageIds.includes(pid)) matched.passageIds.push(pid);
      }
      if (matchReason === 'fuzzy_token_link') {
        resolutionLinks.push({ fromId: raw.id, resolvedToId: matched.id, reason: matchReason });
      }
    } else {
      const canonical = {
        id: raw.id,
        mergedIds: [raw.id],
        type: raw.type,
        name: String(raw.name || '').trim(),
        properties: { ...(raw.properties || {}) },
        passageIds: [...new Set(raw.passageIds || [])],
        exactLower,
        nums,
        tokKey,
      };
      canonicalNodes.push(canonical);
      entityIdMap.set(raw.id, canonical.id);
    }
  }

  return {
    entities: canonicalNodes.map(({ exactLower, nums, tokKey, ...clean }) => clean),
    entityIdMap,
    resolutionLinks,
  };
}

/**
 * Pattern B + Pattern C Schema-Constrained Hypergraph Builder.
 * Undeclared entity/relation types or low-confidence extractions are quarantined
 * into `candidates[]` with passage provenance instead of entering search.
 */
function buildSchemaConstrainedHypergraph(input = {}, options = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const schema = options.schema || ONTOLOGY_SCHEMA;
  const rawMinConf = Number(options.minConfidence ?? DEFAULT_MIN_CONFIDENCE);
  const minConfidence = Number.isFinite(rawMinConf) ? rawMinConf : DEFAULT_MIN_CONFIDENCE;
  const passages = Array.isArray(safeInput.passages) ? safeInput.passages : [];
  const passageMap = new Map();
  for (const p of passages) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) continue;
    passageMap.set(p.id, {
      id: p.id,
      docId: String(p.docId || p.path || 'unknown-doc'),
      text: String(p.text || ''),
      headingPath: String(p.headingPath || ''),
      version: finiteIntOrDefault(p.version, 1),
      superseded: Boolean(p.superseded),
    });
  }

  const validRawEntities = [];
  const candidates = [];

  for (const ent of Array.isArray(safeInput.entities) ? safeInput.entities : []) {
    if (!ent || typeof ent !== 'object') continue;
    const entType = typeof ent.type === 'string' ? ent.type : '';
    const conf = Number(ent.confidence ?? 1.0);
    const rawPids = Array.isArray(ent.passageIds)
      ? ent.passageIds
      : ent.passageId
        ? [ent.passageId]
        : [];
    const passageIds = rawPids.filter((id) => typeof id === 'string' && passageMap.has(id));

    if (!entType || !Object.hasOwn(schema.entityTypes, entType)) {
      candidates.push({
        kind: 'undeclared_entity_type',
        proposedType: entType || 'UNKNOWN',
        name: String(ent.name || ''),
        confidence: Number.isFinite(conf) ? conf : null,
        sourcePassageIds: passageIds,
        proposedSchemaPatch: { op: 'add_entity_type', type: entType || 'UNKNOWN' },
      });
      continue;
    }
    if (!Number.isFinite(conf) || conf < minConfidence || passageIds.length === 0) {
      candidates.push({
        kind: !Number.isFinite(conf) || conf < minConfidence ? 'low_confidence_entity' : 'ungrounded_entity',
        proposedType: entType,
        name: String(ent.name || ''),
        confidence: Number.isFinite(conf) ? conf : null,
        sourcePassageIds: passageIds,
      });
      continue;
    }
    validRawEntities.push({
      id: typeof ent.id === 'string' && ent.id
        ? ent.id
        : `ent_${crypto.createHash('sha1').update(`${entType}:${ent.name}`).digest('hex').slice(0, 10)}`,
      type: entType,
      name: String(ent.name || ''),
      properties: ent.properties && typeof ent.properties === 'object' && !Array.isArray(ent.properties)
        ? ent.properties
        : {},
      passageIds,
    });
  }

  const resolved = resolveEntitiesCheapestFirst(validRawEntities);
  const nodeById = new Map(resolved.entities.map((e) => [e.id, e]));

  const relations = [];
  for (const rel of Array.isArray(safeInput.relations) ? safeInput.relations : []) {
    if (!rel || typeof rel !== 'object') continue;
    const srcId = resolved.entityIdMap.get(rel.sourceId) || rel.sourceId;
    const dstId = resolved.entityIdMap.get(rel.targetId) || rel.targetId;
    const src = nodeById.get(srcId);
    const dst = nodeById.get(dstId);
    const conf = Number(rel.confidence ?? 1.0);
    const rawPids = Array.isArray(rel.passageIds)
      ? rel.passageIds
      : rel.passageId
        ? [rel.passageId]
        : [];
    const passageIds = rawPids.filter((id) => typeof id === 'string' && passageMap.has(id));

    if (!src || !dst) {
      candidates.push({
        kind: 'dangling_relation_endpoint',
        relation: String(rel.relation || ''),
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        sourcePassageIds: passageIds,
      });
      continue;
    }
    if (typeof rel.relation !== 'string' || !isAllowedRelationTriple(src.type, rel.relation, dst.type, schema)) {
      candidates.push({
        kind: 'disallowed_relation_triple',
        sourceType: src.type,
        relation: String(rel.relation || ''),
        targetType: dst.type,
        sourcePassageIds: passageIds,
        proposedSchemaPatch: {
          op: 'allow_relation_triple',
          source: src.type,
          relation: String(rel.relation || ''),
          target: dst.type,
        },
      });
      continue;
    }
    if (!Number.isFinite(conf) || conf < minConfidence || passageIds.length === 0) {
      candidates.push({
        kind: !Number.isFinite(conf) || conf < minConfidence ? 'low_confidence_relation' : 'ungrounded_relation',
        sourceType: src.type,
        relation: rel.relation,
        targetType: dst.type,
        confidence: Number.isFinite(conf) ? conf : null,
        sourcePassageIds: passageIds,
      });
      continue;
    }
    relations.push({
      id: typeof rel.id === 'string' && rel.id ? rel.id : `rel_${relations.length + 1}`,
      sourceId: src.id,
      relation: rel.relation,
      targetId: dst.id,
      weight: passageIds.length,
      passageIds,
    });
  }

  // Pattern C: Graph-R1 n-ary Hyperedges with format + F1 grounding reward metrics
  const hyperedges = [];
  for (const he of Array.isArray(safeInput.hyperedges) ? safeInput.hyperedges : []) {
    if (!he || typeof he !== 'object') continue;
    const rawMembers = Array.isArray(he.members) ? he.members.filter((m) => m && typeof m === 'object') : [];
    const resolvedMembers = rawMembers
      .map((m) => ({
        entityId: resolved.entityIdMap.get(m.entityId) || m.entityId,
        role: String(m.role || 'participant'),
      }))
      .filter((m) => nodeById.has(m.entityId));
    const passageIds = (Array.isArray(he.passageIds) ? he.passageIds : []).filter(
      (id) => typeof id === 'string' && passageMap.has(id),
    );
    const formatReward = resolvedMembers.length >= 2 && typeof he.relation === 'string' && he.relation.length > 0
      ? 1.0
      : 0.0;
    const f1GroundReward = rawMembers.length > 0
      ? Number(((2 * resolvedMembers.length) / (rawMembers.length + resolvedMembers.length)).toFixed(3))
      : 0;

    if (formatReward < 1.0 || passageIds.length === 0) {
      candidates.push({
        kind: 'invalid_or_ungrounded_hyperedge',
        relation: String(he.relation || 'UNKNOWN'),
        sourcePassageIds: passageIds,
      });
      continue;
    }
    hyperedges.push({
      id: typeof he.id === 'string' && he.id ? he.id : `he_${hyperedges.length + 1}`,
      relation: he.relation,
      members: resolvedMembers,
      passageIds,
      formatReward,
      f1GroundReward,
    });
  }

  return {
    schema: 'schema-constrained-hypergraph/v1',
    ontologyVersion: schema.version,
    passages: [...passageMap.values()],
    entities: resolved.entities,
    relations,
    hyperedges,
    resolutionLinks: resolved.resolutionLinks,
    candidates,
  };
}

/**
 * Produce a scope-safe, non-superseded view of a hypergraph for untrusted/MCP callers.
 * An explicit empty array `allowedDocIds: []` fails closed (returns 0 passages/entities).
 */
function filterHypergraphByScope(graph, allowedDocIds = null) {
  const scopeSet = Array.isArray(allowedDocIds) ? new Set(allowedDocIds) : null;
  const allowedPassageIds = new Set();
  const passages = (graph.passages || []).filter((p) => {
    if (!p || p.superseded) return false;
    if (scopeSet !== null && !scopeSet.has(p.docId)) return false;
    allowedPassageIds.add(p.id);
    return true;
  });

  const allowedEntityIds = new Set();
  const entities = (graph.entities || [])
    .map((e) => ({
      ...e,
      passageIds: (e.passageIds || []).filter((pid) => allowedPassageIds.has(pid)),
    }))
    .filter((e) => {
      if (e.passageIds.length === 0) return false;
      allowedEntityIds.add(e.id);
      return true;
    });

  const relations = (graph.relations || [])
    .map((r) => ({
      ...r,
      passageIds: (r.passageIds || []).filter((pid) => allowedPassageIds.has(pid)),
    }))
    .filter(
      (r) =>
        r.passageIds.length > 0 &&
        allowedEntityIds.has(r.sourceId) &&
        allowedEntityIds.has(r.targetId),
    );

  const hyperedges = (graph.hyperedges || [])
    .map((he) => ({
      ...he,
      passageIds: (he.passageIds || []).filter((pid) => allowedPassageIds.has(pid)),
      members: (he.members || []).filter((m) => allowedEntityIds.has(m.entityId)),
    }))
    .filter((he) => he.passageIds.length > 0 && he.members.length >= 2);

  return {
    schema: graph.schema,
    ontologyVersion: graph.ontologyVersion,
    passages,
    entities,
    relations,
    hyperedges,
    candidatesCount: Array.isArray(graph.candidates) ? graph.candidates.length : 0,
  };
}

function tokenizeQuery(query) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'what', 'how', 'why', 'into', 'are', 'was']);
  return [...new Set(
    String(query || '')
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !stop.has(t)),
  )];
}

function stemToken(token) {
  const w = String(token || '').toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}i`;
  if (w.endsWith('y') && !/[aeiou]y$/.test(w)) return `${w.slice(0, -1)}i`;
  if (/(?:sh|ch|x|z|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

function textMatchesTerm(lowerText, term) {
  if (lowerText.includes(term)) return true;
  const targetStem = stemToken(term);
  if (targetStem.length < 3) return false;
  const words = lowerText.replace(/[^a-z0-9_.-]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.some((w) => stemToken(w) === targetStem);
}

/**
 * Verify every cited passage ID against fetched/read IDs, allowed scope, and version status.
 * Note: `allowedDocScope` as `[]` fails closed (0 documents allowed).
 */
function verifyCitations(citedPassageIds = [], readPassageIds = [], allowedDocScope = null, passageMap = new Map()) {
  const readSet = new Set(readPassageIds);
  const scopeSet = Array.isArray(allowedDocScope) ? new Set(allowedDocScope) : null;
  const issues = [];

  for (const cid of citedPassageIds) {
    if (typeof cid !== 'string' || !/^[a-zA-Z0-9_:./-]+$/.test(cid)) {
      issues.push({ id: cid, reason: 'malformed_citation_id' });
      continue;
    }
    const passage = passageMap.get(cid);
    if (!passage) {
      issues.push({ id: cid, reason: 'unknown_passage_id' });
      continue;
    }
    if (scopeSet !== null && !scopeSet.has(passage.docId)) {
      issues.push({ id: cid, reason: 'out_of_scope_document' });
      continue;
    }
    if (!readSet.has(cid)) {
      issues.push({ id: cid, reason: 'unread_passage_cited' });
      continue;
    }
    if (passage.superseded) {
      issues.push({ id: cid, reason: 'superseded_passage_cited' });
    }
  }

  return {
    ok: issues.length === 0,
    checkedCount: citedPassageIds.length,
    issues,
  };
}

/**
 * Agentic Multi-Hop Hypergraph Traversal with Graph-R1 Rethink States & Fail-Closed Scope.
 */
function agenticHypergraphTraverse(graph, query, options = {}) {
  const maxHops = Math.min(4, Math.max(1, finiteIntOrDefault(options.maxHops, 3)));
  const rawCov = Number(options.targetCoverage ?? 0.8);
  const targetCoverage = Number.isFinite(rawCov) ? rawCov : 0.8;
  // Fail-closed: if caller passed `allowedDocIds` as an array (even `[]`), enforce it strictly!
  const allowedDocScope = Array.isArray(options.allowedDocIds)
    ? new Set(options.allowedDocIds)
    : null;

  const passageMap = new Map();
  for (const p of graph.passages || []) {
    if (p && typeof p.id === 'string') passageMap.set(p.id, p);
  }
  const entityById = new Map();
  for (const ent of graph.entities || []) {
    if (ent && typeof ent.id === 'string') entityById.set(ent.id, ent);
  }

  const passageInScope = (pid) => {
    const p = passageMap.get(pid);
    if (!p || p.superseded) return false;
    if (allowedDocScope !== null && !allowedDocScope.has(p.docId)) return false;
    return true;
  };

  const entityInScope = (entId) => {
    const ent = entityById.get(entId);
    if (!ent) return false;
    return (ent.passageIds || []).some(passageInScope);
  };

  const queryTerms = tokenizeQuery(query);
  const visitedEntityIds = new Set();
  const readPassageIds = new Set();
  const traversedRelations = [];
  const traversedHyperedges = [];
  const rethinkSteps = [];

  // Hop 0a: Seed entities matching query terms within scope
  for (const ent of graph.entities || []) {
    const inScopePids = (ent.passageIds || []).filter(passageInScope);
    if (inScopePids.length === 0) continue;
    const hay = `${ent.name} ${ent.type} ${JSON.stringify(ent.properties || {})}`.toLowerCase();
    if (queryTerms.some((t) => textMatchesTerm(hay, t))) {
      visitedEntityIds.add(ent.id);
      inScopePids.forEach((pid) => readPassageIds.add(pid));
    }
  }

  // Hop 0b: Seed passages matching query terms within scope, plus in-scope entities grounded in those passages
  for (const p of graph.passages || []) {
    if (!passageInScope(p.id)) continue;
    const hay = `${p.headingPath || ''} ${p.text}`.toLowerCase();
    if (queryTerms.some((t) => textMatchesTerm(hay, t))) {
      readPassageIds.add(p.id);
    }
  }
  if (readPassageIds.size > 0) {
    for (const ent of graph.entities || []) {
      if (!entityInScope(ent.id)) continue;
      if ((ent.passageIds || []).some((pid) => readPassageIds.has(pid))) {
        visitedEntityIds.add(ent.id);
      }
    }
  }

  const computeCoverage = () => {
    if (queryTerms.length === 0) return { coverage: 1, covered: [], missing: [] };
    const corpus = [...readPassageIds]
      .map((id) => passageMap.get(id)?.text || '')
      .join(' ')
      .toLowerCase();
    const covered = queryTerms.filter((t) => textMatchesTerm(corpus, t));
    const missing = queryTerms.filter((t) => !textMatchesTerm(corpus, t));
    return {
      coverage: Number((covered.length / queryTerms.length).toFixed(3)),
      covered,
      missing,
    };
  };

  for (let hop = 1; hop <= maxHops; hop += 1) {
    const cov = computeCoverage();
    if (cov.coverage >= targetCoverage && visitedEntityIds.size > 0 && hop > 1) {
      rethinkSteps.push({
        hop,
        action: 'stop_sufficient_grounding',
        coverage: cov.coverage,
        missingTerms: cov.missing,
      });
      break;
    }

    let addedNodes = 0;
    // Expand across binary schema-validated relations where both endpoints are in scope
    for (const rel of graph.relations || []) {
      const relPids = (rel.passageIds || []).filter(passageInScope);
      if (relPids.length === 0) continue;
      if (!entityInScope(rel.sourceId) || !entityInScope(rel.targetId)) continue;
      const srcVisited = visitedEntityIds.has(rel.sourceId);
      const dstVisited = visitedEntityIds.has(rel.targetId);
      if (srcVisited || dstVisited) {
        if (!srcVisited) {
          visitedEntityIds.add(rel.sourceId);
          addedNodes += 1;
        }
        if (!dstVisited) {
          visitedEntityIds.add(rel.targetId);
          addedNodes += 1;
        }
        relPids.forEach((pid) => readPassageIds.add(pid));
        if (!traversedRelations.some((r) => r.id === rel.id)) traversedRelations.push(rel);
      }
    }

    // Expand across Graph-R1 n-ary Hyperedges (only admitting in-scope members)
    for (const he of graph.hyperedges || []) {
      const hePids = (he.passageIds || []).filter(passageInScope);
      if (hePids.length === 0) continue;
      const touchesSeed = he.members.some((m) => visitedEntityIds.has(m.entityId));
      if (touchesSeed) {
        for (const m of he.members) {
          if (!entityInScope(m.entityId)) continue;
          if (!visitedEntityIds.has(m.entityId)) {
            visitedEntityIds.add(m.entityId);
            addedNodes += 1;
          }
        }
        hePids.forEach((pid) => readPassageIds.add(pid));
        if (!traversedHyperedges.some((x) => x.id === he.id)) traversedHyperedges.push(he);
      }
    }

    // Pull in supporting in-scope passages of newly reached entities
    for (const ent of graph.entities || []) {
      if (visitedEntityIds.has(ent.id)) {
        (ent.passageIds || []).filter(passageInScope).forEach((pid) => readPassageIds.add(pid));
      }
    }

    const postCov = computeCoverage();
    rethinkSteps.push({
      hop,
      action: addedNodes > 0 ? 'rethink_expand_hypergraph' : 'frontier_exhausted',
      addedEntities: addedNodes,
      coverageBefore: cov.coverage,
      coverageAfter: postCov.coverage,
      missingTerms: postCov.missing,
    });

    if (addedNodes === 0) break;
  }

  const citedPassageIds = [...readPassageIds];
  const citationVerification = verifyCitations(
    citedPassageIds,
    [...readPassageIds],
    Array.isArray(options.allowedDocIds) ? options.allowedDocIds : null,
    passageMap,
  );

  return {
    query,
    visitedEntityIds: [...visitedEntityIds],
    traversedRelations,
    traversedHyperedges,
    rethinkSteps,
    citedPassages: citedPassageIds.map((id) => passageMap.get(id)),
    citationVerification,
  };
}

/**
 * Resolve a relative support path safely inside repoRoot using both lexical
 * containment and `fs.realpathSync` containment (blocks `../` AND symlinks).
 */
function resolveSafeRepoFile(repoRoot, relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    throw new Error('Support path must be a non-empty relative string');
  }
  const rootLexical = path.resolve(repoRoot);
  const realRoot = fs.existsSync(rootLexical) ? fs.realpathSync(rootLexical) : rootLexical;
  const candidateLexical = path.resolve(realRoot, relPath);
  if (candidateLexical === realRoot || !candidateLexical.startsWith(realRoot + path.sep)) {
    throw new Error(`Support path escapes repoRoot: ${relPath}`);
  }
  if (!fs.existsSync(candidateLexical)) {
    return null;
  }
  const realTarget = fs.realpathSync(candidateLexical);
  if (realTarget === realRoot || !realTarget.startsWith(realRoot + path.sep)) {
    throw new Error(`Support symlink target escapes repoRoot: ${relPath}`);
  }
  const st = fs.statSync(realTarget);
  if (!st.isFile()) {
    return null;
  }
  return realTarget;
}

function hashFileSlice(repoRoot, relPath, startLine = null, endLine = null) {
  const abs = resolveSafeRepoFile(repoRoot, relPath);
  if (!abs) return null;
  const raw = fs.readFileSync(abs, 'utf8');
  const hasStart = startLine !== null && startLine !== undefined;
  const hasEnd = endLine !== null && endLine !== undefined;

  if (hasStart || hasEnd) {
    if (!hasStart || !hasEnd) return null;
    const s = Number(startLine);
    const e = Number(endLine);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 1 || e < s) {
      return null;
    }
    const lines = raw.split(/\r?\n/);
    if (raw.length === 0 || e > lines.length) {
      return null;
    }
    const slice = lines.slice(s - 1, e).join('\n');
    return crypto.createHash('sha256').update(slice).digest('hex');
  }

  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * DecisionTraceLedger (ontogr/agentic-graphrag):
 * Links decisions to file passages (with verified SHA-256) and parent decisions.
 * Automatically flags decisions (and transitive dependents) `needs_review`
 * when cited source passages mutate on disk, hiding them from active search.
 */
class DecisionTraceLedger {
  constructor(storageDir = DEFAULT_LEDGER_DIR, repoRoot = process.cwd()) {
    this.storageDir = storageDir;
    this.repoRoot = path.resolve(repoRoot);
    this.filePath = path.join(this.storageDir, 'decisions.json');
  }

  _load() {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  _save(decisions) {
    fs.mkdirSync(this.storageDir, { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(decisions, null, 2)}\n`, 'utf8');
  }

  recordDecision(entry = {}) {
    const safeEntry = entry && typeof entry === 'object' ? entry : {};
    const decisions = this._load();
    const decisionId = typeof safeEntry.decisionId === 'string' && safeEntry.decisionId.trim()
      ? safeEntry.decisionId.trim()
      : `dec_${crypto.randomBytes(6).toString('hex')}`;

    const rawSupports = Array.isArray(safeEntry.supports) ? safeEntry.supports : [];
    const supports = rawSupports.map((s) => {
      if (!s || typeof s !== 'object') {
        throw new Error('Invalid decision support entry');
      }
      // Always compute live hash inside repoRoot containment; never trust caller sha256 blindly
      const computedSha = hashFileSlice(this.repoRoot, s.path, s.startLine, s.endLine);
      if (!computedSha) {
        throw new Error(`Cannot record decision support for missing or out-of-bounds file slice: ${s.path}`);
      }
      if (s.sha256 !== undefined && s.sha256 !== computedSha) {
        throw new Error(`Supplied support sha256 does not match live file content for: ${s.path}`);
      }
      return {
        path: String(s.path),
        startLine: s.startLine ?? null,
        endLine: s.endLine ?? null,
        sha256: computedSha,
      };
    });

    const record = {
      schema: 'agentic-decision-trace/v1',
      decisionId,
      createdAt: new Date().toISOString(),
      conclusion: String(safeEntry.conclusion || '').trim(),
      rationale: String(safeEntry.rationale || '').trim(),
      assumptions: Array.isArray(safeEntry.assumptions) ? safeEntry.assumptions : [],
      supports,
      dependsOnDecisionIds: Array.isArray(safeEntry.dependsOnDecisionIds) ? safeEntry.dependsOnDecisionIds : [],
      status: 'active',
      reviewReason: null,
    };

    const idx = decisions.findIndex((d) => d.decisionId === decisionId);
    if (idx >= 0) decisions[idx] = record;
    else decisions.push(record);
    this._save(decisions);
    return record;
  }

  auditFreshness() {
    const decisions = this._load();
    // Seed invalidatedIds with any decision already in needs_review so counts & transitive propagation stay consistent
    const invalidatedIds = new Set(
      decisions.filter((d) => d.status === 'needs_review').map((d) => d.decisionId),
    );
    let mutated = false;

    for (const d of decisions) {
      if (d.status === 'rejected' || d.status === 'replaced') continue;
      for (const sup of d.supports || []) {
        let currentHash = null;
        try {
          currentHash = hashFileSlice(this.repoRoot, sup.path, sup.startLine, sup.endLine);
        } catch {
          currentHash = null;
        }
        if (!currentHash || currentHash !== sup.sha256) {
          if (d.status !== 'needs_review') {
            d.status = 'needs_review';
            d.reviewReason = !currentHash
              ? `cited_file_missing_or_out_of_bounds:${sup.path}`
              : `cited_source_modified:${sup.path}`;
            mutated = true;
          }
          invalidatedIds.add(d.decisionId);
          break;
        }
      }
    }

    // Transitive propagation across DEPENDS_ON edges (including rejected/replaced/needs_review parents)
    const byId = new Map(decisions.map((d) => [d.decisionId, d]));
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of decisions) {
        if (d.status === 'rejected' || d.status === 'replaced' || invalidatedIds.has(d.decisionId)) continue;
        const invalidParent = (d.dependsOnDecisionIds || []).find((pid) => {
          if (invalidatedIds.has(pid)) return true;
          const p = byId.get(pid);
          return p && (p.status === 'rejected' || p.status === 'replaced');
        });
        if (invalidParent) {
          d.status = 'needs_review';
          d.reviewReason = `upstream_decision_invalidated:${invalidParent}`;
          invalidatedIds.add(d.decisionId);
          mutated = true;
          changed = true;
        }
      }
    }

    if (mutated) this._save(decisions);
    return {
      totalDecisions: decisions.length,
      activeCount: decisions.filter((d) => d.status === 'active' || d.status === 'reaffirmed').length,
      needsReviewCount: invalidatedIds.size,
      needsReviewIds: [...invalidatedIds],
      decisions,
    };
  }

  reviewDecision(decisionId, action, replacement = null) {
    const decisions = this._load();
    const byId = new Map(decisions.map((d) => [d.decisionId, d]));
    const target = byId.get(decisionId);
    if (!target) throw new Error(`Unknown decisionId: ${decisionId}`);

    if (action === 'reaffirm') {
      for (const pid of target.dependsOnDecisionIds || []) {
        const parent = byId.get(pid);
        if (parent && parent.status !== 'active' && parent.status !== 'reaffirmed') {
          throw new Error(`Cannot reaffirm ${decisionId} while upstream dependency ${pid} has status=${parent.status}`);
        }
      }
      target.supports = (target.supports || []).map((s) => {
        const freshSha = hashFileSlice(this.repoRoot, s.path, s.startLine, s.endLine);
        if (!freshSha) {
          throw new Error(`Cannot reaffirm decision ${decisionId}: cited file missing or slice out of bounds (${s.path})`);
        }
        return { ...s, sha256: freshSha };
      });
      target.status = 'reaffirmed';
      target.reviewReason = null;
      this._save(decisions);
      return target;
    }
    if (action === 'reject') {
      target.status = 'rejected';
      this._save(decisions);
      return target;
    }
    if (action === 'replace') {
      target.status = 'replaced';
      this._save(decisions);
      return this.recordDecision({
        ...(replacement || {}),
        dependsOnDecisionIds: (replacement && replacement.dependsOnDecisionIds) || [],
      });
    }
    throw new Error(`Unsupported review action: ${action}`);
  }

  searchActiveDecisions(query = '') {
    const audit = this.auditFreshness();
    const terms = tokenizeQuery(query);
    return audit.decisions.filter((d) => {
      if (d.status !== 'active' && d.status !== 'reaffirmed') return false;
      if (terms.length === 0) return true;
      const hay = `${d.conclusion} ${d.rationale} ${(d.assumptions || []).join(' ')}`.toLowerCase();
      return terms.some((t) => textMatchesTerm(hay, t));
    });
  }
}

// ─── PILLAR 3: DUAL-LLM GATEWAY FAILOVER, SCHEMA GUARD & MAX-HOP CAP ────────

const CROSS_PROVIDER_PARITY_CHAINS = Object.freeze({
  'anthropic/claude-opus-4.7': ['google/gemini-4-argon', 'zai-org/glm-5.3-coder'],
  'google/gemini-4-argon': ['anthropic/claude-opus-4.7', 'zai-org/glm-5.3-coder'],
  'google/gemini-4-carbon': ['anthropic/claude-opus-4.7', 'zai-org/glm-5.3-coder'],
  'google/gemini-4-hydrogen': ['anthropic/claude-sonnet-4.6', 'zai-org/glm-5.3-coder'],
  'anthropic/claude-sonnet-4.6': ['google/gemini-3.1-pro', 'zai-org/glm-5.3-coder'],
  'google/gemini-3.1-pro': ['anthropic/claude-sonnet-4.6', 'zai-org/glm-5.3-coder'],
  'anthropic/claude-3-5-sonnet': ['google/gemini-2.5-pro', 'zai-org/glm-5.3'],
  'google/gemini-2.5-pro': ['anthropic/claude-3-5-sonnet', 'zai-org/glm-5.3'],
  'openai/gpt-5.6-sol': ['anthropic/claude-opus-4.7', 'zai-org/glm-5.3-coder'],
  'openai/gpt-4.1': ['anthropic/claude-sonnet-4.6', 'zai-org/glm-5.3-coder'],
  'zai-org/glm-5.3-coder': ['zai-org/glm-5.3'],
  'zai-org/glm-5.3': ['zai-org/glm-5.3-coder'],
});

function providerOfModel(modelId) {
  if (typeof modelId !== 'string' || !modelId.includes('/')) return 'unknown';
  if (Object.hasOwn(SPLIT_MODEL_MATRIX, modelId)) {
    return SPLIT_MODEL_MATRIX[modelId].provider;
  }
  return modelId.split('/')[0] || 'unknown';
}

function isLocalModelId(modelId) {
  if (typeof modelId !== 'string') return false;
  if (Object.hasOwn(SPLIT_MODEL_MATRIX, modelId)) {
    return SPLIT_MODEL_MATRIX[modelId].privacy === 'local';
  }
  return modelId.startsWith('zai-org/') || modelId.startsWith('ollama/') || modelId.startsWith('local/');
}

/**
 * Build a cycle-free, cross-provider-diverse fallback chain capped at <= 2 hops
 * (<= 3 total endpoints) to prevent cascading same-provider outages & billing loops.
 */
function buildCrossProviderFallbackChain(primaryModelId, options = {}) {
  const safePrimary = typeof primaryModelId === 'string' && primaryModelId.includes('/')
    ? primaryModelId
    : 'anthropic/claude-sonnet-4.6';
  const rawRequested = options.maxFallbackHops ?? HARD_MAX_FALLBACK_HOPS;
  const parsedRequested = finiteIntOrDefault(rawRequested, HARD_MAX_FALLBACK_HOPS);
  const maxHops = Math.min(HARD_MAX_FALLBACK_HOPS, Math.max(0, parsedRequested));
  const privacyRequired = options.privacyRequired || 'standard';
  const budgetExhausted = isBudgetExhaustedUnified(options);

  if (budgetExhausted || privacyRequired === 'local' || privacyRequired === 'fenced') {
    const localStart = isLocalModelId(safePrimary) ? safePrimary : 'zai-org/glm-5.3-coder';
    return {
      primaryModelId: localStart,
      chain: [localStart],
      maxFallbackHops: 0,
      throttledHopCapApplied: parsedRequested > HARD_MAX_FALLBACK_HOPS,
      budgetClampedToLocal: true,
    };
  }

  const candidates = Object.hasOwn(CROSS_PROVIDER_PARITY_CHAINS, safePrimary)
    ? CROSS_PROVIDER_PARITY_CHAINS[safePrimary]
    : isLocalModelId(safePrimary)
      ? ['zai-org/glm-5.3-coder']
      : ['google/gemini-3.1-pro', 'zai-org/glm-5.3-coder'];

  const chain = [safePrimary];
  const visited = new Set([safePrimary]);

  for (const nextId of candidates) {
    if (chain.length - 1 >= maxHops) break;
    if (visited.has(nextId)) continue;
    const prevProvider = providerOfModel(chain[chain.length - 1]);
    const nextProvider = providerOfModel(nextId);
    // Enforce cross-provider parity diversity (except zai local sovereign floor)
    if (nextProvider === prevProvider && nextProvider !== 'zai') continue;
    chain.push(nextId);
    visited.add(nextId);
  }

  return {
    primaryModelId: safePrimary,
    chain,
    maxFallbackHops: maxHops,
    throttledHopCapApplied: parsedRequested > HARD_MAX_FALLBACK_HOPS,
    budgetClampedToLocal: false,
  };
}

/**
 * Rigid Structural Schema Validator for Gateway Responses.
 * Unparseable JSON or missing/mistyped required properties return
 * `logicalTimeout: true` so the gateway immediately routes to secondary parity provider.
 */
function validateStructuredGatewayOutput(rawOutput, schemaSpec = null) {
  let parsed = rawOutput;
  if (typeof rawOutput === 'string') {
    const trimmed = rawOutput.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return {
        valid: false,
        logicalTimeout: true,
        reason: 'unparseable_json_block',
        errors: [err.message],
        parsed: null,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      logicalTimeout: true,
      reason: 'non_object_payload',
      errors: ['Expected JSON object payload'],
      parsed: null,
    };
  }

  if (!schemaSpec) {
    return { valid: true, logicalTimeout: false, errors: [], parsed };
  }

  const errors = [];
  for (const reqKey of schemaSpec.required || []) {
    if (!Object.hasOwn(parsed, reqKey) || parsed[reqKey] === undefined || parsed[reqKey] === null) {
      errors.push(`Missing required field: ${reqKey}`);
    }
  }
  if (schemaSpec.properties) {
    for (const [key, propSpec] of Object.entries(schemaSpec.properties)) {
      if (!Object.hasOwn(parsed, key) || parsed[key] === undefined) continue;
      const val = parsed[key];
      if (propSpec.type === 'array') {
        if (!Array.isArray(val)) errors.push(`Field "${key}" must be array`);
      } else if (propSpec.type === 'object') {
        if (val === null || typeof val !== 'object' || Array.isArray(val)) {
          errors.push(`Field "${key}" must be plain object`);
        }
      } else if (propSpec.type === 'number') {
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          errors.push(`Field "${key}" must be finite number`);
        }
      } else if (propSpec.type && typeof val !== propSpec.type) {
        errors.push(`Field "${key}" must be ${propSpec.type}, got ${typeof val}`);
      }
      if (Array.isArray(propSpec.enum) && !propSpec.enum.includes(val)) {
        errors.push(`Field "${key}" must be one of [${propSpec.enum.join(', ')}]`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    logicalTimeout: errors.length > 0,
    reason: errors.length > 0 ? 'schema_guardrail_violation' : null,
    errors,
    parsed: errors.length === 0 ? parsed : null,
  };
}

/**
 * Execute a request through the Dual-LLM Gateway with:
 * - Cross-provider parity failover
 * - Mid-failover BudgetGuard re-check before every hop (diverting to $0 local floor if exhausted)
 * - Schema-violation -> logical-timeout failover
 * - Hard <= 2 fallback hop cap (<= 3 total invocations) to prevent billing loops
 */
async function executeDualGatewayWithFailover(request = {}, invokerFn, options = {}) {
  const plan = buildCrossProviderFallbackChain(request.modelId || 'anthropic/claude-sonnet-4.6', options);
  const attempts = [];
  const runtimeChain = [...plan.chain];
  const maxTotalCalls = plan.maxFallbackHops + 1;

  for (let idx = 0; idx < runtimeChain.length && attempts.length < maxTotalCalls; idx += 1) {
    let modelId = runtimeChain[idx];
    // Re-evaluate budget before EVERY hop (in case an earlier failed hop exhausted the monthly cap)
    if (!isLocalModelId(modelId) && isBudgetExhaustedUnified(options)) {
      modelId = 'zai-org/glm-5.3-coder';
      // Ensure we do not invoke the local fallback twice if it also appears later in the chain
      for (let j = runtimeChain.length - 1; j > idx; j -= 1) {
        if (runtimeChain[j] === modelId || !isLocalModelId(runtimeChain[j])) {
          runtimeChain.splice(j, 1);
        }
      }
    }

    const provider = providerOfModel(modelId);
    try {
      const raw = await invokerFn({ modelId, provider, hop: idx, prompt: request.prompt });
      if (request.responseSchema) {
        const check = validateStructuredGatewayOutput(raw, request.responseSchema);
        if (!check.valid) {
          attempts.push({
            hop: idx,
            modelId,
            provider,
            outcome: 'logical_timeout_schema_failure',
            reason: check.reason,
            errors: check.errors,
          });
          continue;
        }
        attempts.push({ hop: idx, modelId, provider, outcome: 'success' });
        return {
          ok: true,
          winningModelId: modelId,
          winningProvider: provider,
          hopsUsed: attempts.length - 1,
          data: check.parsed,
          attempts,
          plan,
        };
      }
      attempts.push({ hop: idx, modelId, provider, outcome: 'success' });
      return {
        ok: true,
        winningModelId: modelId,
        winningProvider: provider,
        hopsUsed: attempts.length - 1,
        data: raw,
        attempts,
        plan,
      };
    } catch (err) {
      attempts.push({
        hop: idx,
        modelId,
        provider,
        outcome: 'provider_error',
        reason: err.message || String(err),
      });
    }
  }

  return {
    ok: false,
    winningModelId: null,
    winningProvider: null,
    hopsUsed: Math.max(0, attempts.length - 1),
    error: 'All cross-provider parity hops exhausted within hard billing cap',
    attempts,
    plan,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const cmd = argv[0] || 'demo';
  if (cmd === 'allocate') {
    const task = argv.slice(1).filter((a) => !a.startsWith('--')).join(' ') || 'Audit monorepo architecture and refactor checkout gate';
    console.log(JSON.stringify(allocateSplitWorkflow({ task }, { checkSystemLedgers: true }), null, 2));
  } else if (cmd === 'failover') {
    const modelId = argv[1] || 'anthropic/claude-opus-4.7';
    console.log(JSON.stringify(buildCrossProviderFallbackChain(modelId, { checkSystemLedgers: true }), null, 2));
  } else if (cmd === 'audit-decisions') {
    const ledger = new DecisionTraceLedger();
    console.log(JSON.stringify(ledger.auditFreshness(), null, 2));
  } else {
    const alloc = allocateSplitWorkflow({
      task: 'Ingest Dayglass meeting OCR + monorepo schema graph and execute atomic Stripe checkout fix',
      estimatedTokens: 240000,
      hasMultimodal: true,
      highStakes: true,
    });
    const failover = buildCrossProviderFallbackChain(alloc.executor.modelId);
    console.log(JSON.stringify({ ok: true, schema: SCHEMA_VERSION, allocation: alloc, executorFailover: failover }, null, 2));
  }
}

module.exports = {
  SCHEMA_VERSION,
  HARD_MAX_FALLBACK_HOPS,
  DEFAULT_MIN_CONFIDENCE,
  SPLIT_MODEL_MATRIX,
  ONTOLOGY_SCHEMA,
  CROSS_PROVIDER_PARITY_CHAINS,
  isBudgetExhaustedUnified,
  allocateSplitWorkflow,
  buildStrategistHandoff,
  compileExecutorSyncPacket,
  isAllowedRelationTriple,
  resolveEntitiesCheapestFirst,
  buildSchemaConstrainedHypergraph,
  filterHypergraphByScope,
  verifyCitations,
  agenticHypergraphTraverse,
  DecisionTraceLedger,
  buildCrossProviderFallbackChain,
  validateStructuredGatewayOutput,
  executeDualGatewayWithFailover,
};
