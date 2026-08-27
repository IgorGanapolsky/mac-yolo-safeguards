'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  PATTERNS,
  selectPatterns,
  stableStringify,
  validateManifest,
} = require('../tools/agentic-pattern-selector');

function manifest(overrides = {}) {
  return {
    schema: 'agentic-pattern-task/v1',
    taskId: 'task-001',
    goal: 'Produce a verified deterministic artifact',
    risk: 'low',
    effect: 'none',
    uncertainty: 'low',
    independentWorkstreams: 1,
    disjointResources: false,
    specializedRoles: [],
    crossSession: false,
    recurringFeedback: false,
    retrievalNeeded: false,
    dynamicRouting: false,
    resourceConstrained: false,
    humanConfirmation: 'not_required',
    successMetrics: ['focused tests pass'],
    ...overrides,
  };
}

test('registry covers the 21 source patterns exactly once', () => {
  assert.strictEqual(PATTERNS.length, 21);
  assert.strictEqual(new Set(PATTERNS.map((pattern) => pattern.id)).size, 21);
});

test('invalid manifests fail closed with actionable errors', () => {
  const errors = validateManifest({ schema: 'agentic-pattern-task/v1', taskId: 'x' });
  assert(errors.some((error) => error.includes('goal')));
  assert(errors.some((error) => error.includes('risk')));
  assert(errors.some((error) => error.includes('successMetrics')));

  const receipt = selectPatterns({ schema: 'agentic-pattern-task/v1', taskId: 'x' });
  assert.strictEqual(receipt.status, 'block');
  assert.strictEqual(receipt.selected.length, 0);
  assert(receipt.errors.length >= 3);
});

test('simple deterministic work avoids agentic cargo culting', () => {
  const receipt = selectPatterns(manifest());
  assert.strictEqual(receipt.status, 'pass');
  assert.deepStrictEqual(receipt.selected.map((entry) => entry.id), ['evaluation_monitoring']);
  assert(receipt.rejected.some((entry) => entry.id === 'parallelization'));
  assert(receipt.rejected.some((entry) => entry.id === 'multi_agent'));
  assert(receipt.rejected.some((entry) => entry.id === 'planning'));
  assert.strictEqual(receipt.complexity.selectedCount, 1);
});

test('evidence research selects retrieval, tools, reflection, and evaluation', () => {
  const receipt = selectPatterns(manifest({
    goal: 'Research current market claims and produce cited findings',
    effect: 'read',
    uncertainty: 'high',
    retrievalNeeded: true,
  }));
  const ids = receipt.selected.map((entry) => entry.id);
  assert.deepStrictEqual(ids, ['reflection', 'tool_use', 'knowledge_retrieval', 'reasoning_techniques', 'evaluation_monitoring', 'exploration_discovery']);
  assert(receipt.gates.includes('source_provenance'));
  assert(receipt.gates.includes('unsupported_claim_check'));
});

test('consequential external writes require the complete safety envelope', () => {
  const receipt = selectPatterns(manifest({
    goal: 'Publish a verified production configuration change',
    risk: 'high',
    effect: 'external_write',
    uncertainty: 'medium',
    dynamicRouting: true,
    humanConfirmation: 'required',
  }));
  const ids = new Set(receipt.selected.map((entry) => entry.id));
  for (const id of ['routing', 'tool_use', 'planning', 'exception_recovery', 'human_in_loop', 'reasoning_techniques', 'guardrails', 'evaluation_monitoring']) {
    assert(ids.has(id), `missing ${id}`);
  }
  for (const gate of ['pre_action_policy', 'human_confirmation', 'idempotency_or_dedup', 'post_action_readback', 'rollback_or_compensation']) {
    assert(receipt.gates.includes(gate), `missing gate ${gate}`);
  }
});

test('consequential writes without confirmation fail closed', () => {
  const receipt = selectPatterns(manifest({
    risk: 'high',
    effect: 'external_write',
    humanConfirmation: 'not_required',
  }));
  assert.strictEqual(receipt.status, 'block');
  assert(receipt.errors.some((error) => error.includes('humanConfirmation')));

  const internal = selectPatterns(manifest({
    risk: 'high',
    effect: 'internal_write',
    humanConfirmation: 'not_required',
  }));
  assert.strictEqual(internal.status, 'block');
  assert(internal.errors.some((error) => error.includes('humanConfirmation')));
});

test('parallelization requires explicit independent workstreams and disjoint resources', () => {
  const serialized = selectPatterns(manifest({ independentWorkstreams: 3, disjointResources: false }));
  assert(!serialized.selected.some((entry) => entry.id === 'parallelization'));
  assert(serialized.rejected.find((entry) => entry.id === 'parallelization').reason.includes('disjoint'));

  const parallel = selectPatterns(manifest({ independentWorkstreams: 3, disjointResources: true }));
  assert(parallel.selected.some((entry) => entry.id === 'parallelization'));
});

test('multi-agent requires multiple explicit specialized roles', () => {
  const noRoles = selectPatterns(manifest({ independentWorkstreams: 2, disjointResources: true }));
  assert(!noRoles.selected.some((entry) => entry.id === 'multi_agent'));

  const multi = selectPatterns(manifest({
    independentWorkstreams: 2,
    disjointResources: true,
    specializedRoles: ['security reviewer', 'implementation worker'],
  }));
  assert(multi.selected.some((entry) => entry.id === 'multi_agent'));
  assert(multi.selected.some((entry) => entry.id === 'inter_agent_communication'));
  assert(multi.gates.includes('ownership_map'));

  const aliases = selectPatterns(manifest({
    independentWorkstreams: 2,
    disjointResources: true,
    specializedRoles: ['Reviewer', ' reviewer '],
  }));
  assert.strictEqual(aliases.status, 'block');
  assert(aliases.errors.some((error) => error.includes('unique')));

  for (const specializedRoles of [
    ['Security Reviewer', 'security  reviewer'],
    ['Reviewer', 'Ｒｅｖｉｅｗｅｒ'],
    ['Reviewer', 'reviewer\u200b'],
  ]) {
    const normalizedAlias = selectPatterns(manifest({
      independentWorkstreams: 2,
      disjointResources: true,
      specializedRoles,
    }));
    assert.strictEqual(normalizedAlias.status, 'block', JSON.stringify(specializedRoles));
    assert(normalizedAlias.errors.some((error) => error.includes('unique')));
  }
});

test('cross-session feedback loops select durable memory, goals, reflection, and adaptation', () => {
  const receipt = selectPatterns(manifest({
    crossSession: true,
    recurringFeedback: true,
  }));
  const ids = receipt.selected.map((entry) => entry.id);
  for (const id of ['reflection', 'memory_management', 'learning_adaptation', 'goal_monitoring']) {
    assert(ids.includes(id), `missing ${id}`);
  }
  assert(receipt.gates.includes('durable_state_location'));
  assert(receipt.gates.includes('feedback_to_eval'));
});

test('resource constraints select budget-aware execution', () => {
  const receipt = selectPatterns(manifest({ resourceConstrained: true }));
  assert(receipt.selected.some((entry) => entry.id === 'resource_aware_optimization'));
  assert(receipt.gates.includes('runtime_or_cost_budget'));
});

test('unknown fields and secret-shaped fields are rejected', () => {
  const unknown = validateManifest(manifest({ surprise: true }));
  assert(unknown.some((error) => error.includes('unknown field')));

  const secret = validateManifest(manifest({ apiKey: 'x' }));
  assert(secret.some((error) => error.includes('secret-shaped field')));

  const sentinel = ['ZXCV', 'SECRET', 'SENTINEL', '918273'].join('_');
  const blocked = selectPatterns(manifest({
    [`token_${sentinel}`]: 'x',
    [`unknown_${sentinel}`]: true,
  }));
  assert.strictEqual(blocked.status, 'block');
  assert(!JSON.stringify(blocked).includes(sentinel));

  const invalidWithTaskId = selectPatterns({
    ...manifest(),
    schema: 'invalid-schema',
    taskId: `task-${sentinel}`,
  });
  assert.strictEqual(invalidWithTaskId.status, 'block');
  assert.strictEqual(invalidWithTaskId.taskId, null);
  assert(!JSON.stringify(invalidWithTaskId).includes(sentinel));

  let deeplyNested = 0;
  for (let index = 0; index < 10_000; index += 1) deeplyNested = { nested: deeplyNested };
  const deepBlocked = selectPatterns(deeplyNested);
  assert.strictEqual(deepBlocked.status, 'block');
  assert.match(deepBlocked.receiptHash, /^[a-f0-9]{64}$/);

  const valueSentinel = ['VALUE', 'SECRET', 'SENTINEL', '86420'].join('_');
  for (const secretValueManifest of [
    manifest({ successMetrics: [`authorization: Bearer ${valueSentinel}`] }),
    manifest({ goal: `Analyze evidence without token=${valueSentinel}` }),
    manifest({ specializedRoles: [`password=${valueSentinel}`] }),
  ]) {
    const secretValueReceipt = selectPatterns(secretValueManifest);
    assert.strictEqual(secretValueReceipt.status, 'block');
    assert(secretValueReceipt.errors.includes('secret-shaped values are forbidden'));
    assert(!JSON.stringify(secretValueReceipt).includes(valueSentinel));
  }
});

test('validation rejects duplicate roles and invalid metric values', () => {
  assert.deepStrictEqual(validateManifest(null), ['manifest must be an object']);
  const errors = validateManifest(manifest({
    specializedRoles: ['reviewer', 'reviewer'],
    successMetrics: ['x'],
  }));
  assert(errors.some((error) => error.includes('unique')));
  assert(errors.some((error) => error.includes('3-160')));
});

test('internal writes and MCP integrations emit their specific gates', () => {
  const receipt = selectPatterns(manifest({
    effect: 'internal_write',
    mcpIntegration: true,
  }));
  assert(receipt.gates.includes('targeted_tests'));
  assert(receipt.gates.includes('rollback_or_compensation'));
  assert(receipt.gates.includes('mcp_tool_schema'));
  assert(receipt.gates.includes('mcp_origin_and_auth_scope'));
  assert(receipt.selected.some((entry) => entry.id === 'model_context_protocol'));
});

test('fully justified workflows are classified as complex', () => {
  const receipt = selectPatterns(manifest({
    risk: 'high',
    effect: 'external_write',
    uncertainty: 'high',
    independentWorkstreams: 3,
    disjointResources: true,
    specializedRoles: ['planner', 'worker'],
    crossSession: true,
    recurringFeedback: true,
    retrievalNeeded: true,
    dynamicRouting: true,
    resourceConstrained: true,
    humanConfirmation: 'required',
    sequentialStages: true,
    mcpIntegration: true,
    competingPriorities: true,
    explorationNeeded: true,
  }));
  assert.strictEqual(receipt.status, 'pass');
  assert.strictEqual(receipt.complexity.level, 'complex');
  assert(receipt.complexity.selectedCount > 6);
});

test('receipt hash is stable across input key order and excludes generated time', () => {
  const input = manifest({ retrievalNeeded: true, effect: 'read' });
  const reverse = Object.fromEntries(Object.entries(input).reverse());
  const first = selectPatterns(input);
  const second = selectPatterns(reverse);
  assert.strictEqual(first.receiptHash, second.receiptHash);
  assert.strictEqual(stableStringify(first), stableStringify(second));
  assert(!Object.hasOwn(first, 'generatedAt'));

  const invalidA = selectPatterns({ unknownA: 1, unknownB: 2 });
  const invalidB = selectPatterns({ unknownB: 2, unknownA: 1 });
  assert.strictEqual(invalidA.status, 'block');
  assert.strictEqual(invalidA.receiptHash, invalidB.receiptHash);
  assert.deepStrictEqual(invalidA.errors, invalidB.errors);
});

test('CLI emits a deterministic receipt and returns nonzero for invalid input', () => {
  const cli = path.join(__dirname, '..', 'tools', 'agentic-pattern-selector.js');
  const good = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: JSON.stringify(manifest({ resourceConstrained: true })),
  });
  assert.strictEqual(good.status, 0, good.stderr);
  const parsed = JSON.parse(good.stdout);
  assert.strictEqual(parsed.status, 'pass');
  assert.match(parsed.receiptHash, /^[a-f0-9]{64}$/);

  const bad = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({ schema: 'agentic-pattern-task/v1' }),
  });
  assert.strictEqual(bad.status, 2);
  assert.strictEqual(JSON.parse(bad.stdout).status, 'block');
});

test('CLI help, argument errors, and malformed files are bounded', () => {
  const cli = path.join(__dirname, '..', 'tools', 'agentic-pattern-selector.js');
  const help = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' });
  assert.strictEqual(help.status, 0);
  assert.match(help.stdout, /Usage:/);

  const argumentSentinel = ['ARGUMENT', 'SENTINEL', '927461'].join('_');
  const unknown = spawnSync(process.execPath, [cli, `--unknown-${argumentSentinel}`], {
    encoding: 'utf8',
  });
  assert.strictEqual(unknown.status, 2);
  assert.strictEqual(unknown.stderr, 'unknown argument\n');
  assert(!unknown.stderr.includes(argumentSentinel));

  const missing = spawnSync(process.execPath, [cli, '--manifest', path.join(__dirname, 'does-not-exist.json')], {
    encoding: 'utf8',
  });
  assert.strictEqual(missing.status, 2);
  assert.strictEqual(JSON.parse(missing.stdout).status, 'block');

  const oversizedPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-pattern-large-')), 'large.json');
  fs.writeFileSync(oversizedPath, JSON.stringify({ ...manifest(), goal: 'x'.repeat(300_000) }));
  const oversizedFile = spawnSync(process.execPath, [cli, '--manifest', oversizedPath], { encoding: 'utf8' });
  assert.strictEqual(oversizedFile.status, 2);
  assert.match(JSON.parse(oversizedFile.stdout).errors[0], /256 KiB/);

  const oversizedStdin = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({ ...manifest(), goal: 'x'.repeat(300_000) }),
  });
  assert.strictEqual(oversizedStdin.status, 2);
  assert.match(JSON.parse(oversizedStdin.stdout).errors[0], /256 KiB/);

  const malformedSecret = ['TOP', 'SECRET', '123'].join('_');
  const malformedA = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: `{"password":${malformedSecret}}`,
  });
  const malformedB = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: `{"password":${malformedSecret}_DIFFERENT}`,
  });
  const malformedReceiptA = JSON.parse(malformedA.stdout);
  const malformedReceiptB = JSON.parse(malformedB.stdout);
  assert.strictEqual(malformedA.status, 2);
  assert.deepStrictEqual(malformedReceiptA.errors, ['manifest JSON is invalid']);
  assert(!malformedA.stdout.includes(malformedSecret));
  assert.notStrictEqual(malformedReceiptA.inputHash, malformedReceiptB.inputHash);

  const invalidByteA = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: Buffer.from([0x80]),
  });
  const invalidByteB = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: Buffer.from([0x81]),
  });
  const invalidByteReceiptA = JSON.parse(invalidByteA.stdout);
  const invalidByteReceiptB = JSON.parse(invalidByteB.stdout);
  assert.deepStrictEqual(invalidByteReceiptA.errors, ['manifest encoding is invalid']);
  assert.notStrictEqual(invalidByteReceiptA.inputHash, invalidByteReceiptB.inputHash);

  const validManifest = manifest({ taskId: 'canonical-cli-proof' });
  const reversedManifest = Object.fromEntries(Object.entries(validManifest).reverse());
  const canonicalA = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: JSON.stringify(validManifest),
  });
  const canonicalB = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: JSON.stringify(reversedManifest, null, 2),
  });
  assert.strictEqual(canonicalA.status, 0);
  assert.strictEqual(canonicalB.status, 0);
  assert.strictEqual(JSON.parse(canonicalA.stdout).inputHash, JSON.parse(canonicalB.stdout).inputHash);
  assert.strictEqual(JSON.parse(canonicalA.stdout).receiptHash, JSON.parse(canonicalB.stdout).receiptHash);

  const utf8Manifest = Buffer.from(JSON.stringify(manifest({
    goal: 'Validate UTF8_MARKER safely without replacement decoding',
  })));
  const markerIndex = utf8Manifest.indexOf('UTF8_MARKER');
  assert(markerIndex > 0);
  utf8Manifest[markerIndex] = 0x80;
  const invalidUtf8 = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: utf8Manifest,
  });
  assert.strictEqual(invalidUtf8.status, 2);
  assert.deepStrictEqual(JSON.parse(invalidUtf8.stdout).errors, ['manifest encoding is invalid']);

  const deepJson = `${'{"nested":'.repeat(10_000)}0${'}'.repeat(10_000)}`;
  assert(Buffer.byteLength(deepJson) < 256 * 1024);
  const deepJsonBlocked = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: deepJson,
  });
  assert.strictEqual(deepJsonBlocked.status, 2);
  const deepJsonReceipt = JSON.parse(deepJsonBlocked.stdout);
  assert.strictEqual(deepJsonReceipt.status, 'block');
  assert.match(deepJsonReceipt.receiptHash, /^[a-f0-9]{64}$/);
  assert(!deepJsonBlocked.stderr.includes('RangeError'));

  const validJsonSentinel = ['CLI', 'SECRET', 'SENTINEL', '7462'].join('_');
  const validJsonBlocked = spawnSync(process.execPath, [cli, '--manifest', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({ ...manifest(), [`token_${validJsonSentinel}`]: 'x' }),
  });
  assert.strictEqual(validJsonBlocked.status, 2);
  assert(!validJsonBlocked.stdout.includes(validJsonSentinel));
});
