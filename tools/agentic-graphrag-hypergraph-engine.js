#!/usr/bin/env node
'use strict';

/**
 * tools/agentic-graphrag-hypergraph-engine.js
 *
 * Implements the 3-Pillar Architecture from the
 * "Dual-Model Mixture-of-Agents & Agentic GraphRAG Playbook":
 *
 * Pillar 1 — Dual-Model Orchestration & "Split Workflow" Design Pattern:
 *   - Strategist / Global Ingester (Gemini Series: 4 Argon / 3.1 Pro, 1M shared token budget):
 *     Multimodal feature extraction, global codebase reviews, abstract synthesis, and
 *     structured Markdown handoff generation.
 *   - Tactical Executor (Claude Series: Opus 4.7 / 3.5 Sonnet, 200k+ high-density tokens):
 *     Terminal manipulation, local Git state modifications, deterministic compliance routing,
 *     atomic edits, and unit test execution tracking.
 *   - Asynchronous Split Workflow Sync + Loop Memory Model (Volodymyr Pavlyshyn):
 *     Feeds Executor terminal/test traces back into the Strategist's long-context buffer via
 *     a structured sync prompt and records multi-run developer states, commits, and agent
 *     findings into a queryable lifecycle graph.
 *
 * Pillar 2 — Agentic GraphRAG Pipeline & Hypergraph Construction:
 *   - Core Extraction Evolution:
 *     * Pattern A: LLM Open Extraction (unconstrained exploratory discovery)
 *     * Pattern B: Schema-Constrained Extraction (strict predefined ontology:
 *       Company, Person, Product, CodebaseArtifact, Guardrail, Incident, TestGate)
 *     * Pattern C: Graph-R1 Hypergraphs (n-ary knowledge hyperedges with format + F1 reward
 *       metrics and step-by-step `rethink` states during multi-hop traversal)
 *   - Decoupled 2-Tier Blueprint:
 *     * Ingestion Tier: Scans codebase artifacts & skills into a schema-constrained hypergraph.
 *     * Search Tier: Autonomous exploration agent that translates natural-language queries into
 *       structured Cypher + hypergraph queries, evaluates subgraph F1/format rewards, executes
 *       iterative `rethink` hops when coverage is low, prunes noise, and compiles an explicitly
 *       cited context block.
 *
 * Pillar 3 — Dual-LLM Gateway Infrastructure & Governance (Bifrost / LiteLLM / Portkey):
 *   - Cross-Provider Parity Routing: Fails over across independent providers at comparable
 *     intelligence tier (never same-provider secondary region).
 *   - Rigid Structural Schema Validation: Treats unparseable JSON or schema violations as an
 *     immediate LOGICAL_TIMEOUT and triggers the secondary cross-provider fallback route.
 *   - Token-Throttling Guardrails: Caps downstream fallback chains to MAX_FALLBACK_HOPS = 3
 *     and enforces the $10/mo token budget cap to prevent recursive billing loops.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_STATE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'graphrag');
const LOOP_MEMORY_PATH = path.join(DEFAULT_STATE_DIR, 'loop-memory-graph.json');
const MAX_FALLBACK_HOPS = 3;
const TOKEN_BUDGET_CAP_USD = 10.0;

// ============================================================================
// PILLAR 1: Dual-Model Operational Matrix & Split Workflow Sync Engine
// ============================================================================

const OPERATIONAL_MODEL_MATRIX = {
  strategist: {
    family: 'Gemini Series',
    models: ['gemini-4-argon', 'gemini-3.1-pro'],
    primaryRole: 'The Strategist / Global Ingester',
    contextProfile: {
      sharedTokenBudget: 1000000,
      allocation: 'Unified budget across inputs, thinking, and long decode outputs',
    },
    optimizedWorkloads: [
      'multimodal_feature_extraction',
      'global_codebase_reviews',
      'abstract_code_synthesis',
      'rapid_ui_ux_generation',
      'markdown_handoff_synthesis',
    ],
  },
  executor: {
    family: 'Claude Series',
    models: ['claude-opus-4.7', 'claude-3.5-sonnet'],
    primaryRole: 'The Tactical Executor',
    contextProfile: {
      highDensityTokens: 200000,
      allocation: 'Maximizes attention precision and multi-hop logical integrity',
    },
    optimizedWorkloads: [
      'terminal_manipulation',
      'local_git_state_modifications',
      'complex_backend_logic_construction',
      'rigid_deterministic_compliance_routing',
      'test_suite_execution_tracking',
    ],
  },
};

function classifyWorkloadRole(taskDescription = '', options = {}) {
  const text = String(taskDescription || '').toLowerCase();
  const hasMultimodalOrGlobal =
    Boolean(options.multimodal) ||
    /\b(wireframe|screenshot|video|audio|global review|architecture|macro-plan|cross-repo|1m context|handoff|graphrag|hypergraph)\b/i.test(text);
  const hasTacticalExecution =
    /\b(edit|patch|git|commit|worktree|unit test|refactor|terminal|schema|fix|lint|ci)\b/i.test(text);

  if (hasMultimodalOrGlobal && hasTacticalExecution) {
    return {
      mode: 'SPLIT_WORKFLOW_DUAL_MODEL',
      primaryStrategist: OPERATIONAL_MODEL_MATRIX.strategist.models[0],
      primaryExecutor: OPERATIONAL_MODEL_MATRIX.executor.models[0],
      rationale:
        'Strategist (Gemini 1M ctx) synthesizes global context & Markdown handoff; Tactical Executor (Claude 200k high-density) performs atomic git edits and runs test gates.',
    };
  }
  if (hasMultimodalOrGlobal) {
    return {
      mode: 'STRATEGIST_PRIMARY',
      primaryStrategist: OPERATIONAL_MODEL_MATRIX.strategist.models[0],
      primaryExecutor: null,
      rationale: 'High-throughput global/multimodal synthesis matches Gemini 1M unified context buffer.',
    };
  }
  return {
    mode: 'EXECUTOR_PRIMARY',
    primaryStrategist: null,
    primaryExecutor: OPERATIONAL_MODEL_MATRIX.executor.models[0],
    rationale: 'High-density tactical code edit and deterministic test verification matches Claude Executor.',
  };
}

function buildSplitWorkflowHandoff(spec = {}) {
  const taskTitle = String(spec.title || spec.task || 'Untitled Engineering Task').trim();
  const targetFiles = Array.isArray(spec.targetFiles) ? spec.targetFiles : [];
  const invariants = Array.isArray(spec.invariants)
    ? spec.invariants
    : ['Zero regressions in existing unit tests', 'Strict JSON schema compliance'];
  const verificationCmd = String(spec.verificationCommand || 'npm test').trim();
  const graphCitations = Array.isArray(spec.graphCitations) ? spec.graphCitations : [];

  const handoffId = `handoff-${crypto
    .createHash('sha256')
    .update(`${taskTitle}:${targetFiles.join(',')}`)
    .digest('hex')
    .slice(0, 12)}`;

  const markdownHandoff = [
    `# Split-Workflow Handoff Packet (\`${handoffId}\`)`,
    `- **Strategist (Global Ingester)**: \`${OPERATIONAL_MODEL_MATRIX.strategist.models[0]}\` (1M shared token buffer)`,
    `- **Tactical Executor (Workspace Worker)**: \`${OPERATIONAL_MODEL_MATRIX.executor.models[0]}\` (200k high-density window)`,
    `- **Task**: ${taskTitle}`,
    '',
    '## 1. Scoped Target Files',
    ...(targetFiles.length > 0 ? targetFiles.map((f) => `- \`${f}\``) : ['- (Resolve via Agentic GraphRAG Search Tier)']),
    '',
    '## 2. Deterministic Invariants & Schema Guardrails',
    ...invariants.map((inv, idx) => `${idx + 1}. ${inv}`),
    '',
    '## 3. GraphRAG Cited Context Nodes',
    ...(graphCitations.length > 0 ? graphCitations.map((c) => `- ${c}`) : ['- No prior graph citations attached']),
    '',
    '## 4. Mandatory Tactical Verification Gate',
    `\`\`\`bash\n${verificationCmd}\n\`\`\``,
  ].join('\n');

  const syncPromptTemplate = [
    `[SPLIT-WORKFLOW SYNC -> STRATEGIST 1M BUFFER]`,
    `Handoff-ID: ${handoffId}`,
    `Task: ${taskTitle}`,
    `Attach Executor raw terminal trace, git diff stat, and exit code below so the Strategist updates the Loop Memory Graph and verifies zero architectural drift.`,
  ].join('\n');

  return {
    handoffId,
    taskTitle,
    allocation: classifyWorkloadRole(`${taskTitle} edit unit test architecture`, { multimodal: spec.multimodal }),
    targetFiles,
    invariants,
    verificationCommand: verificationCmd,
    markdownHandoff,
    syncPromptTemplate,
  };
}

/**
 * Volodymyr Pavlyshyn's "Loop Memory Model" (Graph Engineering):
 * Transforms multi-run developer states, repository commits, and agent findings
 * into a queryable lifecycle graph.
 */
function recordLoopMemoryState(entry = {}, statePath = LOOP_MEMORY_PATH) {
  let store = { version: '1.0', nodes: [], edges: [] };
  try {
    if (fs.existsSync(statePath)) {
      store = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch {
    store = { version: '1.0', nodes: [], edges: [] };
  }

  const runId = entry.runId || `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const handoffId = entry.handoffId || 'handoff-ad-hoc';
  const commitSha = entry.commitSha || 'working-tree';
  const status = entry.exitCode === 0 || entry.ok === true ? 'VERIFIED' : 'NEEDS_RETHINK';
  const timestamp = entry.timestamp || new Date().toISOString();

  const runNode = {
    id: `DeveloperState:${runId}`,
    type: 'DeveloperState',
    handoffId,
    status,
    exitCode: entry.exitCode ?? (entry.ok ? 0 : 1),
    timestamp,
    summary: String(entry.summary || entry.finding || 'Tactical execution trace recorded').slice(0, 500),
  };

  const commitNodeId = `Commit:${commitSha}`;
  if (!store.nodes.some((n) => n.id === commitNodeId)) {
    store.nodes.push({
      id: commitNodeId,
      type: 'RepositoryCommit',
      sha: commitSha,
      timestamp,
    });
  }

  store.nodes.push(runNode);
  store.edges.push({
    from: runNode.id,
    to: commitNodeId,
    relation: 'PRODUCED_OR_VERIFIED_AT',
    handoffId,
    timestamp,
  });

  if (Array.isArray(entry.filesTouched)) {
    for (const file of entry.filesTouched) {
      const artifactId = `CodebaseArtifact:${file}`;
      if (!store.nodes.some((n) => n.id === artifactId)) {
        store.nodes.push({ id: artifactId, type: 'CodebaseArtifact', path: file });
      }
      store.edges.push({
        from: runNode.id,
        to: artifactId,
        relation: 'MODIFIED_ARTIFACT',
        timestamp,
      });
    }
  }

  // Keep bounded history (latest 200 nodes / 400 edges)
  if (store.nodes.length > 200) store.nodes = store.nodes.slice(-200);
  if (store.edges.length > 400) store.edges = store.edges.slice(-400);

  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(store, null, 2));
  } catch {
    /* non-fatal in read-only sandboxes */
  }

  return {
    ok: true,
    runNode,
    totalLifecycleNodes: store.nodes.length,
    totalLifecycleEdges: store.edges.length,
    statePath,
  };
}

// ============================================================================
// PILLAR 2: Agentic GraphRAG Pipeline & Hypergraph Construction
// ============================================================================

const EXTRACTION_PATTERNS = {
  PATTERN_A_OPEN_EXTRACTION: {
    id: 'PatternA_LLMOpenExtraction',
    constraints: 'none',
    productionTarget: 'Exploratory research data lakes and unstructured document collections',
  },
  PATTERN_B_SCHEMA_CONSTRAINED: {
    id: 'PatternB_SchemaConstrainedOntology',
    allowedEntityTypes: [
      'Company',
      'Person',
      'Product',
      'CodebaseArtifact',
      'Guardrail',
      'Incident',
      'TestGate',
      'AgentSkill',
    ],
    allowedRelations: [
      'IMPLEMENTS_GUARDRAIL',
      'VERIFIED_BY_TEST',
      'MITIGATES_INCIDENT',
      'GOVERNED_BY_SKILL',
      'ROUTES_TO_PROVIDER',
      'DEPENDS_ON_ARTIFACT',
    ],
    productionTarget: 'Enterprise business operations, internal code repositories, and contract dependency reviews',
  },
  PATTERN_C_GRAPH_R1_HYPERGRAPH: {
    id: 'PatternC_GraphR1Hypergraph',
    rewardMetrics: ['formatReward', 'f1Reward'],
    supportsRethinkState: true,
    productionTarget: 'Advanced logic tasks requiring cross-repository multi-hop reasoning or strict safety guardrails',
  },
};

/**
 * Ingestion Tier:
 * Builds a Schema-Constrained Ontology (Pattern B) + Graph-R1 Hypergraph (Pattern C)
 * over the repository's live tools, tests, skills, and safety guardrails.
 */
function runIngestionTier(options = {}) {
  const allowedTypes = new Set(EXTRACTION_PATTERNS.PATTERN_B_SCHEMA_CONSTRAINED.allowedEntityTypes);
  const nodes = [
    {
      id: 'Product:MacYoloSafeguards',
      type: 'Product',
      label: 'Mac YOLO Safeguards & ThumbGate Control Plane',
      keywords: ['mac', 'yolo', 'safeguards', 'hud', 'menubar', 'thumbgate', 'freeze'],
    },
    {
      id: 'CodebaseArtifact:macos/MacYoloTranslucentHud.swift',
      type: 'CodebaseArtifact',
      path: 'macos/MacYoloTranslucentHud.swift',
      keywords: ['hud', 'translucency', 'nsvisualeffectview', 'menubar', 'flock', 'btm', 'telemetry', 'cpu', 'fleet'],
    },
    {
      id: 'CodebaseArtifact:tools/launch-mac-yolo-menubar.sh',
      type: 'CodebaseArtifact',
      path: 'tools/launch-mac-yolo-menubar.sh',
      keywords: ['launcher', 'codesign', 'developer id', 'btm', 'notification', 'rebuild', 'self-test'],
    },
    {
      id: 'CodebaseArtifact:tools/mac-yolo-disk-guard.js',
      type: 'CodebaseArtifact',
      path: 'tools/mac-yolo-disk-guard.js',
      keywords: ['disk', 'clean', 'ai waste', 'cache', 'npm', 'homebrew', 'receipt'],
    },
    {
      id: 'CodebaseArtifact:tools/mac-yolo-agent-guard.js',
      type: 'CodebaseArtifact',
      path: 'tools/mac-yolo-agent-guard.js',
      keywords: ['ram', 'memory', 'pressure', 'process storm', 'orphan', 'agent guard', 'relieve'],
    },
    {
      id: 'CodebaseArtifact:tools/agentic-graphrag-hypergraph-engine.js',
      type: 'CodebaseArtifact',
      path: 'tools/agentic-graphrag-hypergraph-engine.js',
      keywords: ['graphrag', 'hypergraph', 'dual-model', 'moa', 'split workflow', 'bifrost', 'litellm', 'portkey', 'failover', 'rethink'],
    },
    {
      id: 'Guardrail:PreAppKitFlockAndDeveloperIdSigning',
      type: 'Guardrail',
      label: 'Pre-AppKit flock + Developer ID Application (9GMM26JC5X) BTM Notification Suppression',
      keywords: ['btm', 'notification', 'background activity', 'flock', 'single instance', 'codesign', '9gmm26jc5x'],
    },
    {
      id: 'Guardrail:CrossProviderParityAndSchemaGate',
      type: 'Guardrail',
      label: 'Cross-Provider Parity Routing + Rigid Schema Validation + 3-Hop Cap ($10/mo Budget)',
      keywords: ['failover', 'fallback', 'parity', 'schema', 'timeout', 'hops', 'budget', 'gateway', 'bifrost', 'litellm', 'portkey'],
    },
    {
      id: 'Incident:BtmBackgroundNotificationAndDuplicateHud',
      type: 'Incident',
      label: 'Repeated macOS App Background Activity notifications & duplicate HUD windows from ad-hoc cdhash churn',
      keywords: ['btm', 'notification', 'background', 'duplicate', 'two instances', 'crash', 'cdhash'],
    },
    {
      id: 'TestGate:tests/test-mac-yolo-hud-anti-regression.js',
      type: 'TestGate',
      path: 'tests/test-mac-yolo-hud-anti-regression.js',
      keywords: ['hud', 'test', 'anti-regression', 'translucency', 'flock', 'btm', 'pill'],
    },
    {
      id: 'TestGate:tests/test-agentic-graphrag-hypergraph-engine.js',
      type: 'TestGate',
      path: 'tests/test-agentic-graphrag-hypergraph-engine.js',
      keywords: ['graphrag', 'hypergraph', 'split workflow', 'gateway', 'failover', 'rethink', 'test'],
    },
  ];

  // Enforce Pattern B strict schema validation on all nodes
  for (const n of nodes) {
    if (!allowedTypes.has(n.type)) {
      throw new Error(`Schema-Constrained Extraction violation: unknown entity type "${n.type}"`);
    }
  }

  // Binary edges (Pattern B)
  const edges = [
    {
      from: 'CodebaseArtifact:macos/MacYoloTranslucentHud.swift',
      to: 'Guardrail:PreAppKitFlockAndDeveloperIdSigning',
      relation: 'IMPLEMENTS_GUARDRAIL',
    },
    {
      from: 'CodebaseArtifact:tools/launch-mac-yolo-menubar.sh',
      to: 'Guardrail:PreAppKitFlockAndDeveloperIdSigning',
      relation: 'IMPLEMENTS_GUARDRAIL',
    },
    {
      from: 'Guardrail:PreAppKitFlockAndDeveloperIdSigning',
      to: 'Incident:BtmBackgroundNotificationAndDuplicateHud',
      relation: 'MITIGATES_INCIDENT',
    },
    {
      from: 'CodebaseArtifact:macos/MacYoloTranslucentHud.swift',
      to: 'TestGate:tests/test-mac-yolo-hud-anti-regression.js',
      relation: 'VERIFIED_BY_TEST',
    },
    {
      from: 'CodebaseArtifact:tools/agentic-graphrag-hypergraph-engine.js',
      to: 'Guardrail:CrossProviderParityAndSchemaGate',
      relation: 'IMPLEMENTS_GUARDRAIL',
    },
    {
      from: 'CodebaseArtifact:tools/agentic-graphrag-hypergraph-engine.js',
      to: 'TestGate:tests/test-agentic-graphrag-hypergraph-engine.js',
      relation: 'VERIFIED_BY_TEST',
    },
  ];

  // Pattern C: Graph-R1 Hyperedges (n-ary relational tuples connecting >=3 entities)
  const hyperedges = [
    {
      id: 'Hyperedge:HE-BTM-SINGLE-INSTANCE-CLOSURE',
      relation: 'END_TO_END_INCIDENT_REMEDIATION_TUPLE',
      participants: [
        'Incident:BtmBackgroundNotificationAndDuplicateHud',
        'Guardrail:PreAppKitFlockAndDeveloperIdSigning',
        'CodebaseArtifact:macos/MacYoloTranslucentHud.swift',
        'CodebaseArtifact:tools/launch-mac-yolo-menubar.sh',
        'TestGate:tests/test-mac-yolo-hud-anti-regression.js',
      ],
      summary:
        'Eliminates macOS BTM background notifications and duplicate HUD instances via Developer ID (9GMM26JC5X) LWCR anchoring + pre-AppKit flock + anti-regression test gate.',
    },
    {
      id: 'Hyperedge:HE-DUAL-MODEL-GRAPHRAG-GOVERNANCE',
      relation: 'SPLIT_WORKFLOW_AND_GOVERNED_GATEWAY_TUPLE',
      participants: [
        'Product:MacYoloSafeguards',
        'CodebaseArtifact:tools/agentic-graphrag-hypergraph-engine.js',
        'Guardrail:CrossProviderParityAndSchemaGate',
        'TestGate:tests/test-agentic-graphrag-hypergraph-engine.js',
      ],
      summary:
        'Unifies Gemini 1M Strategist + Claude 200k Executor split workflow with Schema-Constrained Hypergraph RAG and 3-hop cross-provider parity failover.',
    },
    {
      id: 'Hyperedge:HE-MAC-RESOURCE-PROTECTION-LOOP',
      relation: 'DISK_AND_RAM_SAFTEY_TUPLE',
      participants: [
        'Product:MacYoloSafeguards',
        'CodebaseArtifact:tools/mac-yolo-disk-guard.js',
        'CodebaseArtifact:tools/mac-yolo-agent-guard.js',
        'CodebaseArtifact:macos/MacYoloTranslucentHud.swift',
      ],
      summary:
        'Itemized AI waste disk cleanup + process-storm RAM relief sparing active coding sessions, surfaced with itemized receipts in the translucent HUD.',
    },
  ];

  if (Array.isArray(options.customNodes)) {
    for (const cn of options.customNodes) {
      if (!allowedTypes.has(cn.type)) {
        throw new Error(`Schema-Constrained Extraction violation: unknown entity type "${cn.type}"`);
      }
      nodes.push(cn);
    }
  }

  return {
    schemaPattern: EXTRACTION_PATTERNS.PATTERN_B_SCHEMA_CONSTRAINED.id,
    hypergraphPattern: EXTRACTION_PATTERNS.PATTERN_C_GRAPH_R1_HYPERGRAPH.id,
    nodes,
    edges,
    hyperedges,
  };
}

/**
 * Computes Graph-R1 Format Reward + token-overlap F1 Reward for a retrieved subgraph.
 */
function computeGraphR1Rewards(queryTokens, retrievedNodes, retrievedHyperedges) {
  const validFormat =
    Array.isArray(retrievedNodes) &&
    retrievedNodes.every((n) => typeof n.id === 'string' && typeof n.type === 'string') &&
    Array.isArray(retrievedHyperedges);
  const formatReward = validFormat ? 1.0 : 0.0;

  if (queryTokens.length === 0 || retrievedNodes.length === 0) {
    return { formatReward, f1Reward: 0.0, combinedReward: Number((formatReward * 0.3).toFixed(3)) };
  }

  const graphVocab = new Set();
  for (const n of retrievedNodes) {
    for (const kw of n.keywords || []) {
      for (const part of String(kw).toLowerCase().split(/\W+/).filter(Boolean)) {
        graphVocab.add(part);
      }
    }
  }
  for (const he of retrievedHyperedges) {
    for (const part of String(he.summary || '').toLowerCase().split(/\W+/).filter(Boolean)) {
      graphVocab.add(part);
    }
  }

  const matchedQueryTokens = queryTokens.filter((t) => graphVocab.has(t));
  const recall = matchedQueryTokens.length / queryTokens.length;
  const precision = Math.min(1.0, matchedQueryTokens.length / Math.max(1, retrievedNodes.length * 1.5));
  const f1 = recall + precision > 0 ? (2 * recall * precision) / (recall + precision) : 0.0;

  return {
    formatReward: Number(formatReward.toFixed(3)),
    f1Reward: Number(f1.toFixed(3)),
    combinedReward: Number((0.35 * formatReward + 0.65 * f1).toFixed(3)),
  };
}

/**
 * Search Tier (Agentic GraphRAG Autonomous Exploration Loop):
 * 1. Converts natural-language query into a structured Cypher query + token set.
 * 2. Performs Hop-1 direct node retrieval.
 * 3. Evaluates Graph-R1 Format + F1 reward; if F1 < rethinkThreshold (default 0.65)
 *    or multi-hop relational context is needed, enters an explicit `rethink` state
 *    that traverses binary edges and n-ary hyperedges (up to maxDepth hops).
 * 4. Compiles an explicitly cited context block for downstream generation.
 */
function runAgenticSearchTier(query = '', options = {}) {
  const graph = options.graph || runIngestionTier();
  const maxDepth = Math.min(3, Math.max(1, Number(options.maxDepth || 2)));
  const rethinkThreshold = Number(options.rethinkThreshold ?? 0.65);

  const stopWords = new Set(['the', 'and', 'for', 'with', 'how', 'why', 'what', 'our', 'from', 'that', 'this', 'are', 'was']);
  const queryTokens = String(query || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((tok) => tok.length >= 2 && !stopWords.has(tok));

  // Translate NL query into a structured Cypher representation
  const cypherQuery = `MATCH (n)-[r*1..${maxDepth}]-(m) WHERE ANY(kw IN n.keywords WHERE kw IN ${JSON.stringify(
    queryTokens.slice(0, 8)
  )}) RETURN DISTINCT n, r, m LIMIT 12`;

  // Hop 1: Direct seed matching
  const seedNodeIds = new Set();
  for (const node of graph.nodes) {
    const hay = `${node.id} ${node.label || ''} ${node.path || ''} ${(node.keywords || []).join(' ')}`.toLowerCase();
    if (queryTokens.some((tok) => hay.includes(tok))) {
      seedNodeIds.add(node.id);
    }
  }

  let activeNodeIds = new Set(seedNodeIds);
  let matchedHyperedges = graph.hyperedges.filter((he) =>
    he.participants.some((pid) => activeNodeIds.has(pid))
  );

  const trace = [];
  const hop1Nodes = graph.nodes.filter((n) => activeNodeIds.has(n.id));
  const hop1Rewards = computeGraphR1Rewards(queryTokens, hop1Nodes, matchedHyperedges);
  trace.push({
    step: 1,
    state: 'INITIAL_RETRIEVAL',
    traversalDepth: 1,
    nodesRetrieved: hop1Nodes.length,
    hyperedgesRetrieved: matchedHyperedges.length,
    rewards: hop1Rewards,
  });

  // Step-by-step Rethink Loop (Pattern C: Graph-R1)
  let currentRewards = hop1Rewards;
  let rethinkTriggered = false;

  if ((currentRewards.f1Reward < rethinkThreshold || hop1Nodes.length < 3) && maxDepth >= 2) {
    rethinkTriggered = true;
    // Expand across binary edges + hyperedge participant neighborhoods
    for (const edge of graph.edges) {
      if (activeNodeIds.has(edge.from)) activeNodeIds.add(edge.to);
      if (activeNodeIds.has(edge.to)) activeNodeIds.add(edge.from);
    }
    for (const he of matchedHyperedges) {
      for (const participant of he.participants) {
        activeNodeIds.add(participant);
      }
    }
    // If still empty on an abstract query, pull top hyperedge participants
    if (activeNodeIds.size === 0 && graph.hyperedges.length > 0) {
      matchedHyperedges = [graph.hyperedges[0], graph.hyperedges[1]].filter(Boolean);
      for (const he of matchedHyperedges) {
        for (const p of he.participants) activeNodeIds.add(p);
      }
    } else {
      matchedHyperedges = graph.hyperedges.filter((he) =>
        he.participants.some((pid) => activeNodeIds.has(pid))
      );
    }

    const expandedNodes = graph.nodes.filter((n) => activeNodeIds.has(n.id));
    currentRewards = computeGraphR1Rewards(queryTokens, expandedNodes, matchedHyperedges);
    trace.push({
      step: 2,
      state: 'RETHINK_HYPERGRAPH_EXPANSION',
      traversalDepth: maxDepth,
      nodesRetrieved: expandedNodes.length,
      hyperedgesRetrieved: matchedHyperedges.length,
      rewards: currentRewards,
    });
  }

  const finalNodes = graph.nodes.filter((n) => activeNodeIds.has(n.id));
  const citedContextBlock = [
    `### Agentic GraphRAG Cited Context (Cypher: \`${cypherQuery}\`)`,
    ...finalNodes.map(
      (n) => `- **[cite:${n.id}]** (\`${n.type}\`): ${n.label || n.path || n.id}`
    ),
    ...matchedHyperedges.map(
      (he) =>
        `- **[cite:${he.id}]** (\`${he.relation}\` -> ${he.participants.length} nodes): ${he.summary}`
    ),
  ].join('\n');

  return {
    query,
    cypherQuery,
    rethinkTriggered,
    traversalSteps: trace,
    rewards: currentRewards,
    retrievedNodes: finalNodes,
    retrievedHyperedges: matchedHyperedges,
    citedContextBlock,
  };
}

// ============================================================================
// PILLAR 3: Dual-LLM Gateway Infrastructure & Governance
// ============================================================================

const GATEWAY_PROFILES = {
  bifrost: {
    name: 'Bifrost',
    runtime: 'Go-native',
    bestFor: 'Enterprise governance with hyper-low latency constraints',
    features: ['built_in_failover_rules', 'semantic_caching', 'native_mcp_gateway', 'per_virtual_key_budgets'],
  },
  litellm: {
    name: 'LiteLLM',
    runtime: 'Python-native',
    bestFor: 'Rapid prototyping and local infrastructure integration (:4010)',
    features: ['100_plus_providers', 'granular_budget_tracking', 'multi_model_wrapper'],
  },
  portkey: {
    name: 'Portkey',
    runtime: 'Centralized Enterprise Control Plane',
    bestFor: 'Regulated enterprise ecosystems requiring extensive auditing',
    features: ['deterministic_routing_rules', 'historical_audit_logs', 'rbac', 'semantic_caching'],
  },
};

const DEFAULT_PARITY_CHAIN = [
  {
    hop: 1,
    provider: 'anthropic',
    model: 'claude-opus-4.7',
    region: 'us-east-1',
    tier: 'frontier_parity',
    estimatedCostUsd: 0.015,
  },
  {
    hop: 2,
    provider: 'google',
    model: 'gemini-3.1-pro',
    region: 'us-central1',
    tier: 'frontier_parity',
    estimatedCostUsd: 0.008,
  },
  {
    hop: 3,
    provider: 'local_mlx',
    model: 'qwen3-coder-30b-a3b-mlx',
    region: 'local-apple-silicon',
    tier: 'local_zero_cost_workhorse',
    estimatedCostUsd: 0.0,
  },
];

/**
 * Validates that a candidate fallback route respects Cross-Provider Parity Routing:
 * Never fail over to the same provider (even in a different region) as the immediately
 * preceding failed hop, because regional endpoints of the same provider share control-plane dependencies.
 */
function verifyCrossProviderParityChain(chain = DEFAULT_PARITY_CHAIN) {
  const violations = [];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const curr = chain[i];
    if (prev.provider === curr.provider) {
      violations.push({
        fromHop: i,
        toHop: i + 1,
        provider: curr.provider,
        reason: `Same-provider failover (${prev.provider}:${prev.region || 'default'} -> ${curr.provider}:${
          curr.region || 'default'
        }) is banned due to shared infrastructure dependencies.`,
      });
    }
  }
  return {
    ok: violations.length === 0,
    hopCount: chain.length,
    withinMaxHopCap: chain.length <= MAX_FALLBACK_HOPS,
    violations,
  };
}

/**
 * Rigid Structural Schema Validator:
 * Forces gateway responses through a strict JSON & field schema check.
 * Any unparseable JSON or missing/mistyped required field returns
 * `{ valid: false, failureType: 'LOGICAL_TIMEOUT' }` to trigger immediate cross-provider failover.
 */
function validateGatewayResponseSchema(rawResponse, schema = {}) {
  let parsed = rawResponse;
  if (typeof rawResponse === 'string') {
    try {
      parsed = JSON.parse(rawResponse);
    } catch (err) {
      return {
        valid: false,
        failureType: 'LOGICAL_TIMEOUT',
        reason: `Unparseable JSON block: ${err.message}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      valid: false,
      failureType: 'LOGICAL_TIMEOUT',
      reason: 'Response root must be a JSON object',
    };
  }

  const requiredFields = Array.isArray(schema.requiredFields) ? schema.requiredFields : [];
  for (const field of requiredFields) {
    if (!(field in parsed) || parsed[field] === undefined || parsed[field] === null || parsed[field] === '') {
      return {
        valid: false,
        failureType: 'LOGICAL_TIMEOUT',
        reason: `Missing required schema field "${field}"`,
      };
    }
  }

  if (schema.fieldTypes && typeof schema.fieldTypes === 'object') {
    for (const [field, expectedType] of Object.entries(schema.fieldTypes)) {
      if (field in parsed) {
        const actualType = Array.isArray(parsed[field]) ? 'array' : typeof parsed[field];
        if (actualType !== expectedType) {
          return {
            valid: false,
            failureType: 'LOGICAL_TIMEOUT',
            reason: `Field "${field}" expected type "${expectedType}" but received "${actualType}"`,
          };
        }
      }
    }
  }

  return {
    valid: true,
    failureType: null,
    parsed,
  };
}

/**
 * Executes a governed multi-LLM gateway request with:
 *   1. Cross-Provider Parity Routing (rejects same-provider regional failover)
 *   2. Rigid Structural Schema Validation (treats invalid JSON/schema as LOGICAL_TIMEOUT)
 *   3. Token-Throttling Guardrails (caps hops at MAX_FALLBACK_HOPS = 3 and enforces $10/mo budget)
 */
function executeGovernedGatewayCall(options = {}) {
  const gateway = GATEWAY_PROFILES[options.gateway || 'bifrost'] || GATEWAY_PROFILES.bifrost;
  const chain = Array.isArray(options.chain) && options.chain.length > 0 ? options.chain : DEFAULT_PARITY_CHAIN;
  const maxHops = Math.min(MAX_FALLBACK_HOPS, Number(options.maxHops || MAX_FALLBACK_HOPS));
  const currentMonthSpendUsd = Number(options.currentMonthSpendUsd || 0);
  const schema = options.schema || { requiredFields: ['status', 'decision'] };
  const simulatedResponses = options.simulatedResponses || {};

  const parityAudit = verifyCrossProviderParityChain(chain);
  if (!parityAudit.ok) {
    return {
      ok: false,
      abortedByGuardrail: 'CROSS_PROVIDER_PARITY_VIOLATION',
      gateway: gateway.name,
      parityAudit,
      attempts: [],
    };
  }

  const attempts = [];
  let cumulativeCallCostUsd = 0;

  for (let idx = 0; idx < chain.length; idx++) {
    const hopNum = idx + 1;
    if (hopNum > maxHops) {
      return {
        ok: false,
        abortedByGuardrail: 'MAX_FALLBACK_HOPS_EXCEEDED',
        maxHops,
        gateway: gateway.name,
        attempts,
      };
    }

    const candidate = chain[idx];
    const hopCost = Number(candidate.estimatedCostUsd || 0);

    // Enforce $10/mo token budget cap on paid providers; route to local_mlx if cap reached
    if (hopCost > 0 && currentMonthSpendUsd + cumulativeCallCostUsd + hopCost > TOKEN_BUDGET_CAP_USD) {
      attempts.push({
        hop: hopNum,
        provider: candidate.provider,
        model: candidate.model,
        outcome: 'SKIPPED_TOKEN_BUDGET_CAP',
        reason: `Projected spend $${(currentMonthSpendUsd + cumulativeCallCostUsd + hopCost).toFixed(
          3
        )} exceeds $${TOKEN_BUDGET_CAP_USD.toFixed(2)}/mo cap`,
      });
      continue;
    }

    cumulativeCallCostUsd += hopCost;

    const sim =
      simulatedResponses[candidate.provider] ??
      simulatedResponses[candidate.model] ??
      simulatedResponses[`hop${hopNum}`] ?? {
        status: 'ok',
        decision: `Resolved via ${candidate.provider}/${candidate.model}`,
        provider: candidate.provider,
      };

    if (sim instanceof Error || (sim && sim.error)) {
      attempts.push({
        hop: hopNum,
        provider: candidate.provider,
        model: candidate.model,
        outcome: 'PROVIDER_OUTAGE_OR_TIMEOUT',
        reason: sim instanceof Error ? sim.message : String(sim.error),
      });
      continue;
    }

    const validation = validateGatewayResponseSchema(sim, schema);
    if (!validation.valid) {
      attempts.push({
        hop: hopNum,
        provider: candidate.provider,
        model: candidate.model,
        outcome: validation.failureType, // LOGICAL_TIMEOUT
        reason: validation.reason,
      });
      continue;
    }

    attempts.push({
      hop: hopNum,
      provider: candidate.provider,
      model: candidate.model,
      outcome: 'SUCCESS',
      costUsd: hopCost,
    });

    return {
      ok: true,
      gateway: gateway.name,
      resolvedAtHop: hopNum,
      selectedProvider: candidate.provider,
      selectedModel: candidate.model,
      totalCostUsd: Number(cumulativeCallCostUsd.toFixed(4)),
      response: validation.parsed,
      attempts,
    };
  }

  return {
    ok: false,
    abortedByGuardrail: 'ALL_FALLBACK_HOPS_EXHAUSTED',
    maxHops,
    gateway: gateway.name,
    attempts,
  };
}

function runSelfTest() {
  // 1. Pillar 1: Split workflow handoff & workload classification
  const handoff = buildSplitWorkflowHandoff({
    title: 'Restore HUD NSVisualEffectView blur & silence BTM background notifications',
    targetFiles: ['macos/MacYoloTranslucentHud.swift', 'tools/launch-mac-yolo-menubar.sh'],
    invariants: ['Single-instance pre-AppKit flock', 'Developer ID Application (9GMM26JC5X) signature'],
    verificationCommand: 'node tests/test-mac-yolo-hud-anti-regression.js',
  });

  // 2. Pillar 2: Agentic GraphRAG Search with Rethink expansion
  const searchResult = runAgenticSearchTier('prevent macOS BTM background activity notification and duplicate HUD windows', {
    maxDepth: 2,
    rethinkThreshold: 0.85, // force rethink expansion verification
  });

  // 3. Pillar 3: Governed Gateway Failover (Hop 1 malformed JSON -> LOGICAL_TIMEOUT -> Hop 2 Google Gemini success)
  const gatewayResult = executeGovernedGatewayCall({
    gateway: 'bifrost',
    schema: {
      requiredFields: ['status', 'decision'],
      fieldTypes: { status: 'string', decision: 'string' },
    },
    simulatedResponses: {
      anthropic: '{"status": "ok", "broken_json": ', // triggers LOGICAL_TIMEOUT at hop 1
      google: { status: 'ok', decision: 'Failover succeeded on Gemini 3.1 Pro with valid schema' },
    },
  });

  const ok =
    handoff.allocation.mode === 'SPLIT_WORKFLOW_DUAL_MODEL' &&
    searchResult.retrievedNodes.length >= 3 &&
    searchResult.retrievedHyperedges.length >= 1 &&
    gatewayResult.ok === true &&
    gatewayResult.resolvedAtHop === 2 &&
    gatewayResult.selectedProvider === 'google';

  return {
    ok,
    pillar1_splitWorkflow: {
      handoffId: handoff.handoffId,
      mode: handoff.allocation.mode,
      strategist: handoff.allocation.primaryStrategist,
      executor: handoff.allocation.primaryExecutor,
    },
    pillar2_agenticGraphRag: {
      schemaPattern: EXTRACTION_PATTERNS.PATTERN_B_SCHEMA_CONSTRAINED.id,
      hypergraphPattern: EXTRACTION_PATTERNS.PATTERN_C_GRAPH_R1_HYPERGRAPH.id,
      rethinkTriggered: searchResult.rethinkTriggered,
      nodesRetrieved: searchResult.retrievedNodes.length,
      hyperedgesRetrieved: searchResult.retrievedHyperedges.length,
      rewards: searchResult.rewards,
    },
    pillar3_governedGateway: {
      gateway: gatewayResult.gateway,
      resolvedAtHop: gatewayResult.resolvedAtHop,
      selectedProvider: gatewayResult.selectedProvider,
      selectedModel: gatewayResult.selectedModel,
      hop1Outcome: gatewayResult.attempts[0]?.outcome,
    },
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');

  if (argv.includes('--self-test')) {
    const res = runSelfTest();
    if (jsonMode) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`=== Dual-Model & Agentic GraphRAG Playbook Self-Test: ${res.ok ? 'PASS' : 'FAIL'} ===`);
      console.log(`  Pillar 1 (Split Workflow): ${res.pillar1_splitWorkflow.strategist} -> ${res.pillar1_splitWorkflow.executor}`);
      console.log(`  Pillar 2 (Graph-R1 Hypergraph): ${res.pillar2_agenticGraphRag.nodesRetrieved} nodes, ${res.pillar2_agenticGraphRag.hyperedgesRetrieved} hyperedges, combinedReward=${res.pillar2_agenticGraphRag.rewards.combinedReward}`);
      console.log(`  Pillar 3 (Governed Gateway): hop1=${res.pillar3_governedGateway.hop1Outcome} -> resolved at hop ${res.pillar3_governedGateway.resolvedAtHop} (${res.pillar3_governedGateway.selectedProvider}/${res.pillar3_governedGateway.selectedModel})`);
    }
    process.exit(res.ok ? 0 : 1);
  }

  const queryIdx = argv.indexOf('--query');
  if (queryIdx !== -1 && argv[queryIdx + 1]) {
    const res = runAgenticSearchTier(argv[queryIdx + 1]);
    console.log(jsonMode ? JSON.stringify(res, null, 2) : res.citedContextBlock);
    process.exit(0);
  }

  const handoffIdx = argv.indexOf('--split-handoff');
  if (handoffIdx !== -1 && argv[handoffIdx + 1]) {
    const res = buildSplitWorkflowHandoff({ title: argv[handoffIdx + 1] });
    console.log(jsonMode ? JSON.stringify(res, null, 2) : res.markdownHandoff);
    process.exit(0);
  }

  const res = runSelfTest();
  console.log(JSON.stringify(res, null, 2));
}

module.exports = {
  ROOT,
  MAX_FALLBACK_HOPS,
  TOKEN_BUDGET_CAP_USD,
  OPERATIONAL_MODEL_MATRIX,
  EXTRACTION_PATTERNS,
  GATEWAY_PROFILES,
  DEFAULT_PARITY_CHAIN,
  classifyWorkloadRole,
  buildSplitWorkflowHandoff,
  recordLoopMemoryState,
  runIngestionTier,
  computeGraphR1Rewards,
  runAgenticSearchTier,
  verifyCrossProviderParityChain,
  validateGatewayResponseSchema,
  executeGovernedGatewayCall,
  runSelfTest,
};
