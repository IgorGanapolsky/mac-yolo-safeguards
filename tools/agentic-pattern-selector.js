#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');

const SCHEMA = 'agentic-pattern-task/v1';
const RECEIPT_SCHEMA = 'agentic-pattern-receipt/v1';
const MAX_MANIFEST_BYTES = 256 * 1024;

const PATTERNS = Object.freeze([
  { id: 'prompt_chaining', label: 'Prompt Chaining' },
  { id: 'routing', label: 'Routing' },
  { id: 'parallelization', label: 'Parallelization' },
  { id: 'reflection', label: 'Reflection' },
  { id: 'tool_use', label: 'Tool Use' },
  { id: 'planning', label: 'Planning' },
  { id: 'multi_agent', label: 'Multi-Agent' },
  { id: 'memory_management', label: 'Memory Management' },
  { id: 'learning_adaptation', label: 'Learning and Adaptation' },
  { id: 'model_context_protocol', label: 'Model Context Protocol' },
  { id: 'goal_monitoring', label: 'Goal Setting and Monitoring' },
  { id: 'exception_recovery', label: 'Exception Handling and Recovery' },
  { id: 'human_in_loop', label: 'Human in the Loop' },
  { id: 'knowledge_retrieval', label: 'Knowledge Retrieval' },
  { id: 'inter_agent_communication', label: 'Inter-Agent Communication' },
  { id: 'resource_aware_optimization', label: 'Resource-Aware Optimization' },
  { id: 'reasoning_techniques', label: 'Reasoning Techniques' },
  { id: 'guardrails', label: 'Guardrails and Safety' },
  { id: 'evaluation_monitoring', label: 'Evaluation and Monitoring' },
  { id: 'prioritization', label: 'Prioritization' },
  { id: 'exploration_discovery', label: 'Exploration and Discovery' },
]);

const ALLOWED_FIELDS = new Set([
  'schema',
  'taskId',
  'goal',
  'risk',
  'effect',
  'uncertainty',
  'independentWorkstreams',
  'disjointResources',
  'specializedRoles',
  'crossSession',
  'recurringFeedback',
  'retrievalNeeded',
  'dynamicRouting',
  'resourceConstrained',
  'humanConfirmation',
  'successMetrics',
  'sequentialStages',
  'mcpIntegration',
  'competingPriorities',
  'explorationNeeded',
]);

const SECRET_FIELD = /(?:api.?key|authorization|bearer|credential|password|secret|token)/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function normalizeRole(role) {
  return role
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

function validateManifest(input) {
  const errors = [];
  if (!isPlainObject(input)) return ['manifest must be an object'];

  for (const key of Object.keys(input)) {
    if (SECRET_FIELD.test(key)) errors.push(`secret-shaped field is forbidden: ${key}`);
    if (!ALLOWED_FIELDS.has(key)) errors.push(`unknown field: ${key}`);
  }

  if (input.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (typeof input.taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(input.taskId)) {
    errors.push('taskId must be a stable 1-80 character identifier');
  }
  if (typeof input.goal !== 'string' || input.goal.trim().length < 10 || input.goal.length > 500) {
    errors.push('goal must contain 10-500 characters');
  }
  if (!['low', 'medium', 'high'].includes(input.risk)) {
    errors.push('risk must be low, medium, or high');
  }
  if (!['none', 'read', 'internal_write', 'external_write'].includes(input.effect)) {
    errors.push('effect must be none, read, internal_write, or external_write');
  }
  if (!['low', 'medium', 'high'].includes(input.uncertainty)) {
    errors.push('uncertainty must be low, medium, or high');
  }
  if (!Number.isInteger(input.independentWorkstreams) || input.independentWorkstreams < 1 || input.independentWorkstreams > 20) {
    errors.push('independentWorkstreams must be an integer from 1 to 20');
  }

  for (const field of [
    'disjointResources',
    'crossSession',
    'recurringFeedback',
    'retrievalNeeded',
    'dynamicRouting',
    'resourceConstrained',
  ]) {
    if (typeof input[field] !== 'boolean') errors.push(`${field} must be boolean`);
  }
  for (const field of ['sequentialStages', 'mcpIntegration', 'competingPriorities', 'explorationNeeded']) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') errors.push(`${field} must be boolean when provided`);
  }

  if (!Array.isArray(input.specializedRoles) || input.specializedRoles.length > 10) {
    errors.push('specializedRoles must be an array with at most 10 entries');
  } else {
    const invalidRole = input.specializedRoles.some(
      (role) => typeof role !== 'string' || role.trim().length < 2 || role.length > 80,
    );
    if (invalidRole) errors.push('specializedRoles entries must contain 2-80 characters');
    const normalizedRoles = input.specializedRoles.map((role) =>
      typeof role === 'string' ? normalizeRole(role) : role,
    );
    if (new Set(normalizedRoles).size !== normalizedRoles.length) {
      errors.push('specializedRoles entries must be unique');
    }
  }

  if (!['required', 'not_required'].includes(input.humanConfirmation)) {
    errors.push('humanConfirmation must be required or not_required');
  }
  const consequentialWrite =
    input.effect === 'external_write' ||
    (input.effect === 'internal_write' && input.risk === 'high');
  if (consequentialWrite && input.humanConfirmation !== 'required') {
    errors.push('humanConfirmation must be required for consequential write effects');
  }

  if (!Array.isArray(input.successMetrics) || input.successMetrics.length < 1 || input.successMetrics.length > 10) {
    errors.push('successMetrics must be a non-empty array with at most 10 entries');
  } else if (
    input.successMetrics.some(
      (metric) => typeof metric !== 'string' || metric.trim().length < 3 || metric.length > 160,
    )
  ) {
    errors.push('successMetrics entries must contain 3-160 characters');
  }

  return [...new Set(errors)].sort();
}

function conditionsFor(manifest) {
  const writes = ['internal_write', 'external_write'].includes(manifest.effect);
  const externalWrite = manifest.effect === 'external_write';
  const multiAgent =
    manifest.independentWorkstreams >= 2 &&
    manifest.disjointResources &&
    manifest.specializedRoles.length >= 2;
  const parallel = manifest.independentWorkstreams >= 2 && manifest.disjointResources;
  const uncertain = ['medium', 'high'].includes(manifest.uncertainty);

  return {
    prompt_chaining: {
      selected: manifest.sequentialStages === true,
      selectedReason: 'task declares dependent sequential stages',
      rejectedReason: 'no dependent sequential stages declared',
    },
    routing: {
      selected: manifest.dynamicRouting,
      selectedReason: 'task declares runtime path or model routing',
      rejectedReason: 'one deterministic execution path is sufficient',
    },
    parallelization: {
      selected: parallel,
      selectedReason: `${manifest.independentWorkstreams} independent workstreams have disjoint resources`,
      rejectedReason:
        manifest.independentWorkstreams < 2
          ? 'fewer than two independent workstreams'
          : 'workstreams do not declare disjoint resources',
    },
    reflection: {
      selected: manifest.uncertainty === 'high' || manifest.recurringFeedback,
      selectedReason:
        manifest.uncertainty === 'high'
          ? 'high uncertainty requires an explicit critique pass'
          : 'recurring feedback requires output reflection',
      rejectedReason: 'low/medium uncertainty without a recurring feedback loop',
    },
    tool_use: {
      selected: manifest.effect !== 'none' || manifest.retrievalNeeded || manifest.mcpIntegration === true,
      selectedReason: 'task reads, writes, retrieves, or invokes an external capability',
      rejectedReason: 'task is a pure deterministic computation',
    },
    planning: {
      selected: manifest.risk === 'high' || externalWrite || manifest.sequentialStages === true,
      selectedReason: 'high-risk, external, or staged work needs a pre-execution plan',
      rejectedReason: 'bounded low-risk work can execute directly from its manifest',
    },
    multi_agent: {
      selected: multiAgent,
      selectedReason: 'multiple independent workstreams require distinct explicit specialties',
      rejectedReason:
        !parallel
          ? 'parallel work is not eligible'
          : 'fewer than two explicit specialized roles',
    },
    memory_management: {
      selected: manifest.crossSession,
      selectedReason: 'task must persist state across sessions',
      rejectedReason: 'task completes within one bounded session',
    },
    learning_adaptation: {
      selected: manifest.recurringFeedback,
      selectedReason: 'recurring feedback must update a versioned eval or policy',
      rejectedReason: 'no recurring feedback loop declared',
    },
    model_context_protocol: {
      selected: manifest.mcpIntegration === true,
      selectedReason: 'task explicitly integrates an MCP capability',
      rejectedReason: 'no MCP integration declared',
    },
    goal_monitoring: {
      selected: manifest.crossSession,
      selectedReason: 'cross-session work needs durable progress and stop criteria',
      rejectedReason: 'single-session success metrics are sufficient',
    },
    exception_recovery: {
      selected: writes || manifest.risk === 'high',
      selectedReason: 'mutating or high-risk work needs typed failure recovery',
      rejectedReason: 'read-only low/medium-risk work has no mutation to recover',
    },
    human_in_loop: {
      selected: manifest.humanConfirmation === 'required' || externalWrite,
      selectedReason: 'consequential action requires explicit human confirmation',
      rejectedReason: 'manifest declares no consequential action requiring confirmation',
    },
    knowledge_retrieval: {
      selected: manifest.retrievalNeeded,
      selectedReason: 'task requires evidence retrieval rather than model memory',
      rejectedReason: 'task does not require external knowledge retrieval',
    },
    inter_agent_communication: {
      selected: multiAgent,
      selectedReason: 'selected specialist agents need a typed handoff contract',
      rejectedReason: 'multi-agent execution is not justified',
    },
    resource_aware_optimization: {
      selected: manifest.resourceConstrained,
      selectedReason: 'task declares an explicit runtime, cost, or capacity constraint',
      rejectedReason: 'no resource constraint declared',
    },
    reasoning_techniques: {
      selected: uncertain || manifest.risk === 'high',
      selectedReason: 'uncertainty or high risk requires explicit decision reasoning',
      rejectedReason: 'low-uncertainty, low-risk task needs no enhanced reasoning pattern',
    },
    guardrails: {
      selected: writes || manifest.risk === 'high',
      selectedReason: 'mutating or high-risk work needs deterministic policy gates',
      rejectedReason: 'read-only low/medium-risk work has no policy-sensitive effect',
    },
    evaluation_monitoring: {
      selected: true,
      selectedReason: 'every task must prove its declared success metrics',
      rejectedReason: '',
    },
    prioritization: {
      selected: manifest.competingPriorities === true,
      selectedReason: 'task declares competing priorities that require ranking',
      rejectedReason: 'no competing priorities declared',
    },
    exploration_discovery: {
      selected:
        manifest.explorationNeeded === true ||
        (manifest.uncertainty === 'high' && manifest.retrievalNeeded),
      selectedReason: 'high-uncertainty discovery requires bounded exploration',
      rejectedReason: 'task has a known target and bounded execution path',
    },
  };
}

function gatesFor(manifest, selectedIds) {
  const gates = new Set(['evaluation_receipt']);
  if (manifest.retrievalNeeded) {
    gates.add('source_provenance');
    gates.add('unsupported_claim_check');
  }
  if (manifest.effect === 'external_write') {
    gates.add('pre_action_policy');
    gates.add('human_confirmation');
    gates.add('idempotency_or_dedup');
    gates.add('post_action_readback');
    gates.add('rollback_or_compensation');
  } else if (manifest.effect === 'internal_write') {
    gates.add('targeted_tests');
    gates.add('rollback_or_compensation');
    if (manifest.risk === 'high') {
      gates.add('pre_action_policy');
      gates.add('human_confirmation');
    }
  }
  if (selectedIds.has('multi_agent')) {
    gates.add('ownership_map');
    gates.add('typed_handoff');
  }
  if (manifest.crossSession) gates.add('durable_state_location');
  if (manifest.recurringFeedback) gates.add('feedback_to_eval');
  if (manifest.resourceConstrained) gates.add('runtime_or_cost_budget');
  if (manifest.mcpIntegration === true) {
    gates.add('mcp_tool_schema');
    gates.add('mcp_origin_and_auth_scope');
  }
  if (manifest.dynamicRouting) gates.add('route_receipt');
  return [...gates].sort();
}

function complexityLevel(selectedCount) {
  if (selectedCount <= 2) return 'minimal';
  if (selectedCount <= 6) return 'bounded';
  return 'complex';
}

function blockedReceipt(input, errors) {
  const base = {
    schema: RECEIPT_SCHEMA,
    taskId: isPlainObject(input) && typeof input.taskId === 'string' ? input.taskId : null,
    status: 'block',
    errors: [...new Set(errors)].sort(),
    selected: [],
    rejected: [],
    gates: [],
    complexity: { selectedCount: 0, level: 'invalid' },
    inputHash: crypto.createHash('sha256').update(stableStringify(input ?? null)).digest('hex'),
  };
  return { ...base, receiptHash: crypto.createHash('sha256').update(stableStringify(base)).digest('hex') };
}

function selectPatterns(input) {
  const errors = validateManifest(input);
  if (errors.length) return blockedReceipt(input, errors);

  const conditions = conditionsFor(input);
  const selected = [];
  const rejected = [];
  for (const pattern of PATTERNS) {
    const condition = conditions[pattern.id];
    if (condition.selected) {
      selected.push({ id: pattern.id, label: pattern.label, reason: condition.selectedReason });
    } else {
      rejected.push({ id: pattern.id, label: pattern.label, reason: condition.rejectedReason });
    }
  }

  const selectedIds = new Set(selected.map((entry) => entry.id));
  const base = {
    schema: RECEIPT_SCHEMA,
    taskId: input.taskId,
    status: 'pass',
    errors: [],
    selected,
    rejected,
    gates: gatesFor(input, selectedIds),
    complexity: {
      selectedCount: selected.length,
      rejectedCount: rejected.length,
      level: complexityLevel(selected.length),
    },
    successMetrics: [...input.successMetrics],
    inputHash: crypto.createHash('sha256').update(stableStringify(input)).digest('hex'),
  };
  return { ...base, receiptHash: crypto.createHash('sha256').update(stableStringify(base)).digest('hex') };
}

function parseCli(argv) {
  let manifestPath = '';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') manifestPath = argv[++index] || '';
    else if (arg === '--help' || arg === '-h') return { help: true, manifestPath: '' };
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!manifestPath) throw new Error('--manifest <path|-> is required');
  return { help: false, manifestPath };
}

function readBoundedManifest(manifestPath) {
  if (manifestPath !== '-') {
    const stat = fs.statSync(manifestPath);
    if (!stat.isFile()) throw new Error('manifest must be a regular file');
    if (stat.size > MAX_MANIFEST_BYTES) throw new Error('manifest exceeds 256 KiB');
    return fs.readFileSync(manifestPath, 'utf8');
  }

  const chunks = [];
  let total = 0;
  while (true) {
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_MANIFEST_BYTES + 1 - total));
    const bytesRead = fs.readSync(0, buffer, 0, buffer.length, null);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > MAX_MANIFEST_BYTES) throw new Error('manifest exceeds 256 KiB');
    chunks.push(buffer.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function cli(argv = process.argv.slice(2)) {
  let parsed;
  try {
    parsed = parseCli(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write('Usage: node tools/agentic-pattern-selector.js --manifest <path|->\n');
    return 0;
  }

  let input;
  try {
    const raw = readBoundedManifest(parsed.manifestPath);
    input = JSON.parse(raw);
  } catch (error) {
    const receipt = blockedReceipt(null, [`manifest load failed: ${error.message}`]);
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return 2;
  }

  const receipt = selectPatterns(input);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  return receipt.status === 'pass' ? 0 : 2;
}

module.exports = {
  PATTERNS,
  SCHEMA,
  RECEIPT_SCHEMA,
  MAX_MANIFEST_BYTES,
  blockedReceipt,
  normalizeRole,
  readBoundedManifest,
  selectPatterns,
  stableStringify,
  validateManifest,
};

if (require.main === module) process.exitCode = cli();
