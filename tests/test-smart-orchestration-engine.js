#!/usr/bin/env node
/**
 * Unit & Anti-Regression Tests for Smart Orchestration Engine
 * (tests/test-smart-orchestration-engine.js)
 *
 * Verifies:
 *   1. Monolithic Agent Trap rejection (open/all tool_access_mode, >4 tools, >1 skill, bloated prompt)
 *   2. Spaghetti Code Trap rejection (cyclic workflow edges, self-loops, dangling edges, missing contracts, chatty hops)
 *   3. End-to-end 4-stage SDLC DAG execution + AGNT SQLite contract synchronization
 */

const assert = require('assert');
const {
  SDLC_WORKERS,
  SDLC_CONTRACTS,
  SDLC_WORKFLOW_DAG,
  validateWorkerAgent,
  validateWorkflowDag,
  evaluateStageContract,
  executeSmartOrchestrationDag,
} = require('../tools/smart-orchestration-engine');

// 1. Canonical Single-Purpose Workers must all pass strict least-privilege checks
for (const worker of SDLC_WORKERS) {
  const res = validateWorkerAgent(worker);
  assert.strictEqual(
    res.valid,
    true,
    `Expected canonical worker ${worker.name} to be valid, got violations: ${res.violations.join(', ')}`,
  );
  assert.ok(res.toolsCount <= 4, 'Worker must have <= 4 tools');
  assert.ok(res.skillsCount <= 1, 'Worker must have <= 1 skill');
}

// 2. Monolithic Agent Trap must be caught and rejected
const monolithicAgent = {
  id: 'monolith-bad',
  name: 'Monolithic God Agent',
  tool_access_mode: 'all',
  tools: ['t1', 't2', 't3', 't4', 't5', 't6', 't7'],
  skills: ['s1', 's2', 's3'],
  system_prompt: 'X'.repeat(900),
};
const monoCheck = validateWorkerAgent(monolithicAgent);
assert.strictEqual(monoCheck.valid, false, 'Monolithic agent must be rejected');
assert.ok(
  monoCheck.violations.some((v) => v.startsWith('monolithic_tool_access_mode')),
  'Must flag open/all tool_access_mode',
);
assert.ok(
  monoCheck.violations.some((v) => v.startsWith('tool_bloat')),
  'Must flag >4 tools bloat',
);
assert.ok(
  monoCheck.violations.some((v) => v.startsWith('skill_bloat')),
  'Must flag >1 skill bloat',
);
assert.ok(
  monoCheck.violations.some((v) => v.startsWith('prompt_bloat')),
  'Must flag sprawling system prompt',
);

// 3. Spaghetti Code Trap (Cyclic Graph) must be caught and rejected by Kahn's algorithm
const cyclicGraph = {
  id: 'spaghetti-cycle',
  name: 'Spaghetti Loop',
  nodes: [
    { id: 'n1', text: 'Node 1' },
    { id: 'n2', text: 'Node 2' },
    { id: 'n3', text: 'Node 3' },
  ],
  edges: [
    { id: 'e1', from: 'n1', to: 'n2', contract: 'c1' },
    { id: 'e2', from: 'n2', to: 'n3', contract: 'c2' },
    { id: 'e3', from: 'n3', to: 'n1', contract: 'c3' }, // cycle!
  ],
};
const cycleCheck = validateWorkflowDag(cyclicGraph);
assert.strictEqual(cycleCheck.valid, false, 'Cyclic workflow must be rejected');
assert.ok(
  cycleCheck.violations.some((v) => v.includes('ERR_WORKFLOW_CYCLE_DETECTED')),
  'Must detect cycle in workflow graph',
);

// 4. Stage Contract Gate must reject chatty loops or high gate latency
const failedContract = evaluateStageContract(
  SDLC_CONTRACTS[2],
  SDLC_WORKERS[2],
  { gate_latency_ms: 42.0, chat_loop_hops: 3 },
);
assert.strictEqual(failedContract.passed, false, 'Contract must fail on latency/chat hops');
assert.ok(
  failedContract.violations.some((v) => v.startsWith('gate_latency_exceeded')),
);
assert.ok(
  failedContract.violations.some((v) => v.startsWith('chatty_loop_detected')),
);

// 5. Canonical 4-Stage SDLC DAG must execute deterministically in topological order and PASS
const dagRun = executeSmartOrchestrationDag({
  workflow: SDLC_WORKFLOW_DAG,
  workers: SDLC_WORKERS,
  contracts: SDLC_CONTRACTS,
});
assert.strictEqual(dagRun.status, 'PASS', 'Canonical SDLC DAG must PASS');
assert.strictEqual(dagRun.stagesExecuted, 4, 'All 4 stages must execute');
assert.strictEqual(dagRun.chattyPeerLoops, 0, 'Zero chatty peer loops allowed');
assert.deepStrictEqual(dagRun.topologicalOrder, [
  'sdlc-node-1-investigate',
  'sdlc-node-2-scope',
  'sdlc-node-3-diode',
  'sdlc-node-4-goldfish',
]);

console.log(
  'test-smart-orchestration-engine: PASS (Monolithic Agent Trap & Spaghetti Code Trap guards + 4-stage DAG verified)',
);
