#!/usr/bin/env node
'use strict';

/**
 * tools/dual-model-moa-router.js
 *
 * Dual-Model Mixture-of-Agents (MoA) Orchestration & Cross-Provider Gateway.
 * Implements the architecture from "Dual-Model Mixture-of-Agents & Agentic GraphRAG Playbook":
 *
 * 1. Operational Model Matrix & Workload Allocation:
 *    - Strategist / Global Ingester (Gemini Series: e.g. 4 Argon, 3.1 Pro, Flash):
 *      1M shared tokens, unified budget across inputs, thinking, long decode.
 *      Specialized in multimodal telemetry, massive codebase ingestion, visual wireframes/HUD,
 *      cross-session state synthesis, and macro-planning.
 *    - Tactical Executor (Claude Series: e.g. Opus 4.7, 3.5 Sonnet, Claude Code):
 *      200k+ high-density tokens, multi-hop logical integrity, terminal manipulation,
 *      atomic file diffs, test suite execution, strict deterministic compliance.
 *    - Local Fast Proposer (Laguna XS / MLX / Regex filter):
 *      Sub-millisecond complexity filtering, zero-cost pre-filtering.
 *
 * 2. "Split Workflow" Design Pattern:
 *    - Strategist ingests macro-telemetry / graphs and produces structured handoff specs.
 *    - Tactical Executor executes atomic diffs and test suites.
 *    - Cross-session coherence via feeding tactical terminal traces into the long-context buffer.
 *
 * 3. Cross-Provider Parity Routing & Governance:
 *    - Always fall back cross-provider (Claude ↔ Gemini), never intra-provider.
 *    - Rigid structural schema validation: invalid payload triggers secondary route.
 *    - Token-throttling & hop-capping (max 3 hops) to avoid recursive loops & 100% CPU lockups.
 */

const fs = require('fs');
const path = require('path');

// Core Operational Model Matrix
const MODEL_TIERS = {
  strategist_ingester: {
    id: 'gemini-4-argon',
    fallbackId: 'gemini-3.1-pro',
    provider: 'google',
    name: 'Gemini Series (The Strategist / Global Ingester)',
    contextWindow: 1000000,
    activeRole: 'The Strategist / Global Ingester',
    strengths: [
      'multimodal_feature_extraction',
      'long_context_telemetry_ingestion',
      'macro_architecture_review',
      'cross_session_state_synthesis',
      'ui_ux_wireframe_analysis',
    ],
    costPerMillionTokens: { input: 0.125, output: 0.50 },
    avgLatencyMs: 450,
  },
  tactical_executor: {
    id: 'claude-3-7-sonnet',
    fallbackId: 'claude-opus-4.7',
    provider: 'anthropic',
    name: 'Claude Series (The Tactical Executor)',
    contextWindow: 200000,
    activeRole: 'The Tactical Executor',
    strengths: [
      'terminal_manipulation',
      'local_git_modifications',
      'high_fidelity_refactoring',
      'deterministic_schema_compliance',
      'test_suite_execution_tracking',
    ],
    costPerMillionTokens: { input: 3.00, output: 15.00 },
    avgLatencyMs: 380,
  },
  local_fast_proposer: {
    id: 'laguna-xs-2.1',
    fallbackId: 'qwen3-8b-mlx',
    provider: 'local',
    name: 'Local Fast Proposer (Sub-millisecond Heuristic / MLX)',
    contextWindow: 64000,
    activeRole: 'Zero-Cost Pre-Filter',
    strengths: [
      'regex_filters',
      'status_telemetry',
      'syntax_checks',
      'single_file_proposals',
    ],
    costPerMillionTokens: { input: 0.0, output: 0.0 },
    avgLatencyMs: 15,
  },
};

/**
 * RouteMoA: Lightweight Zero-Pre-Inference Complexity Scorer
 * Categorizes whether a task needs:
 *  - LOCAL_ONLY: sub-second local resolution
 *  - TACTICAL_ONLY: atomic code edits / test runs
 *  - STRATEGIST_INGEST: massive telemetry / screen logs / full repo scan
 *  - SPLIT_WORKFLOW_DUAL_MOA: strategist macro-plan -> tactical execution -> trace feedback
 */
function scoreTaskComplexity(taskDescription, options = {}) {
  const desc = (taskDescription || '').toLowerCase();
  let complexity = 0.15;

  const strategistTriggers = [
    /\b(multimodal|screen|telemetry|meeting|audio|video|hud|wireframe|massive|cross-session|global architecture)\b/i,
    /\b(graphrag|hypergraph|ontology|knowledge graph|100% cpu|freeze|full-repo|system-wide)\b/i,
  ];

  const tacticalTriggers = [
    /\b(refactor|edit|patch|diff|terminal|git|pr|commit|test|fix|bug|lint|build|compile)\b/i,
    /\b(swift|typescript|javascript|python|bash|sql|json)\b/i,
  ];

  const localTriggers = [
    /\b(status|ping|health|version|list|check|uptime|quick|brief)\b/i,
  ];

  let matchesStrategist = false;
  let matchesTactical = false;
  let matchesLocal = false;

  for (const pat of strategistTriggers) {
    if (pat.test(desc)) {
      complexity += 0.30;
      matchesStrategist = true;
    }
  }

  for (const pat of tacticalTriggers) {
    if (pat.test(desc)) {
      complexity += 0.25;
      matchesTactical = true;
    }
  }

  for (const pat of localTriggers) {
    if (pat.test(desc)) {
      complexity -= 0.15;
      matchesLocal = true;
    }
  }

  // Count file mentions
  const filesMentioned = (desc.match(/[\w/-]+\.(js|ts|swift|py|sh|json|md|sqlite)/g) || []).length;
  if (filesMentioned > 3) complexity += 0.25;
  else if (filesMentioned > 1) complexity += 0.15;

  const finalScore = Math.max(0.05, Math.min(1.0, Number(complexity.toFixed(2))));

  let strategy = 'TACTICAL_ONLY';
  if (matchesStrategist && matchesTactical) {
    strategy = 'SPLIT_WORKFLOW_DUAL_MOA';
  } else if (matchesStrategist) {
    strategy = 'STRATEGIST_INGEST';
  } else if (finalScore < 0.25 && matchesLocal && !matchesTactical) {
    strategy = 'LOCAL_ONLY';
  } else {
    strategy = 'TACTICAL_ONLY';
  }

  return {
    score: finalScore,
    strategy,
    reasons: {
      matchesStrategist,
      matchesTactical,
      matchesLocal,
      filesMentioned,
    },
    allocation: {
      strategist: (strategy === 'SPLIT_WORKFLOW_DUAL_MOA' || strategy === 'STRATEGIST_INGEST')
        ? MODEL_TIERS.strategist_ingester.id
        : null,
      tacticalExecutor: (strategy === 'SPLIT_WORKFLOW_DUAL_MOA' || strategy === 'TACTICAL_ONLY')
        ? MODEL_TIERS.tactical_executor.id
        : null,
      localProposer: MODEL_TIERS.local_fast_proposer.id,
    },
    estimatedSavings: {
      costReductionPct: strategy === 'LOCAL_ONLY' ? 100 : (strategy === 'STRATEGIST_INGEST' ? 65 : 40),
      latencyReductionPct: strategy === 'LOCAL_ONLY' ? 95 : 35,
    },
  };
}

/**
 * The "Split Workflow" Design Pattern:
 * 1. Strategist Handoff: Builds high-level architectural markdown specs.
 */
function buildStrategistHandoff(task, telemetrySummary = {}) {
  return {
    role: 'StrategistHandoff',
    timestamp: new Date().toISOString(),
    task,
    telemetry: {
      cpuLoad: telemetrySummary.cpuLoad || 'nominal',
      screenActivity: telemetrySummary.screenActivity || 'none',
      activeRepo: telemetrySummary.repo || 'mac-yolo-safeguards',
      graphContextNodes: telemetrySummary.graphNodesCount || 0,
    },
    macroDirectives: [
      'Ingest relevant repository state and graph nodes.',
      'Decompose atomic edits without breaking existing invariant tests.',
      'Route terminal execution through tactical Claude agent.',
    ],
    handoffContract: {
      executor: MODEL_TIERS.tactical_executor.id,
      maxExecutionHops: 3,
      requireVerification: true,
    },
  };
}

/**
 * The "Split Workflow" Design Pattern:
 * 2. Cross-Session Coherence Sync: Feeds Claude's terminal traces and test outputs
 *    back into Gemini's long-context buffer.
 */
function buildCrossSessionSyncTrace(tacticalTrace = {}) {
  return {
    type: 'CrossSessionSyncTrace',
    timestamp: new Date().toISOString(),
    executedCommands: tacticalTrace.commands || [],
    filesModified: tacticalTrace.filesModified || [],
    testOutcomes: tacticalTrace.testOutcomes || { passed: true, total: 0 },
    verifiedClaims: tacticalTrace.claims || [],
    strategistBufferUpdate: {
      status: tacticalTrace.testOutcomes?.passed ? 'RESOLVED' : 'FAILED',
      summary: tacticalTrace.summary || 'Tactical execution complete.',
    },
  };
}

/**
 * Cross-Provider Parity Routing & Failover
 * Guarantees cross-provider fallback (Claude ↔ Gemini), never intra-provider dependency.
 */
function resolveProviderFallback(failedProvider, taskContext = {}) {
  const p = (failedProvider || '').toLowerCase();
  if (p.includes('anthropic') || p.includes('claude')) {
    return {
      fallbackProvider: 'google',
      modelId: MODEL_TIERS.strategist_ingester.id,
      reason: 'Cross-provider parity fallback from Anthropic/Claude to Google/Gemini',
      mode: 'CROSS_PROVIDER_RESILIENCE',
    };
  } else if (p.includes('google') || p.includes('gemini')) {
    return {
      fallbackProvider: 'anthropic',
      modelId: MODEL_TIERS.tactical_executor.id,
      reason: 'Cross-provider parity fallback from Google/Gemini to Anthropic/Claude',
      mode: 'CROSS_PROVIDER_RESILIENCE',
    };
  }

  // Local fallback
  return {
    fallbackProvider: 'local',
    modelId: MODEL_TIERS.local_fast_proposer.id,
    reason: 'Local zero-cost fallback',
    mode: 'LOCAL_SURVIVAL',
  };
}

/**
 * Rigid Structural Schema Validation
 * Validates payload against required schema properties; returns whether fallback is triggered.
 */
function validateStructuralSchema(payload, requiredKeys = []) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be a non-null object', triggerFallback: true };
  }
  const missing = requiredKeys.filter((key) => payload[key] === undefined || payload[key] === null);
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required schema keys: ${missing.join(', ')}`,
      missingKeys: missing,
      triggerFallback: true,
    };
  }
  return { valid: true, error: null, triggerFallback: false };
}

/**
 * Token-Throttling & Hop-Capping Guardrail
 * Prevents recursive billing loops & CPU runaway locks.
 */
function guardExecutionHopCount(currentHop = 0, maxHops = 3) {
  const hop = Number(currentHop);
  if (hop >= maxHops) {
    return {
      allowed: false,
      hop,
      maxHops,
      action: 'HALT_EXECUTION_LOOP',
      reason: `Execution exceeded maximum hop cap of ${maxHops} to prevent runaway CPU/token consumption.`,
    };
  }
  return {
    allowed: true,
    hop: hop + 1,
    maxHops,
    remainingHops: maxHops - (hop + 1),
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const taskIdx = argv.indexOf('--task');
  const task = taskIdx !== -1 ? argv[taskIdx + 1] : argv[0] || 'System diagnostic';

  if (argv.includes('--models')) {
    console.log(JSON.stringify(MODEL_TIERS, null, 2));
    process.exit(0);
  }

  const routePlan = scoreTaskComplexity(task);

  if (argv.includes('--failover')) {
    const provIdx = argv.indexOf('--failover');
    const prov = argv[provIdx + 1] || 'anthropic';
    const failover = resolveProviderFallback(prov, { task });
    if (jsonMode) console.log(JSON.stringify(failover, null, 2));
    else console.log(`Failover from [${prov}]: -> Provider: ${failover.fallbackProvider}, Model: ${failover.modelId} (${failover.reason})`);
    process.exit(0);
  }

  if (argv.includes('--split-workflow')) {
    const handoff = buildStrategistHandoff(task, { cpuLoad: 'nominal', repo: 'mac-yolo-safeguards' });
    const sync = buildCrossSessionSyncTrace({
      commands: ['npm test', 'node tools/agent-decision-stack.js'],
      filesModified: ['tools/dual-model-moa-router.js'],
      testOutcomes: { passed: true, total: 1 },
      summary: 'MoA Router updated and validated.',
    });
    const output = { handoff, sync };
    if (jsonMode) console.log(JSON.stringify(output, null, 2));
    else {
      console.log('=== Split Workflow Handshake ===');
      console.log(JSON.stringify(output, null, 2));
    }
    process.exit(0);
  }

  if (jsonMode) {
    console.log(JSON.stringify(routePlan, null, 2));
  } else {
    console.log('=== Dual-Model Mixture-of-Agents (MoA) Playbook Decision ===');
    console.log(`Task:                  "${task}"`);
    console.log(`Complexity:            ${(routePlan.score * 100).toFixed(0)}% (Strategy: ${routePlan.strategy})`);
    console.log(`Strategist (Gemini):   ${routePlan.allocation.strategist || 'Bypassed (0 tokens)'}`);
    console.log(`Tactical (Claude):     ${routePlan.allocation.tacticalExecutor || 'Bypassed (0 tokens)'}`);
    console.log(`Local Proposer:        ${routePlan.allocation.localProposer}`);
    console.log(`Resource Savings:      -${routePlan.estimatedSavings.costReductionPct}% Cost, -${routePlan.estimatedSavings.latencyReductionPct}% Latency`);
  }
}

module.exports = {
  MODEL_TIERS,
  scoreTaskComplexity,
  buildStrategistHandoff,
  buildCrossSessionSyncTrace,
  resolveProviderFallback,
  validateStructuralSchema,
  guardExecutionHopCount,
};
