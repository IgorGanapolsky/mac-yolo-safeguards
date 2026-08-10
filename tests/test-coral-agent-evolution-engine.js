'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { CoralEvolutionEngine } = require('../tools/coral-agent-evolution-engine');

console.log('=== Testing CORAL Autonomous Multi-Agent Evolution Engine (arXiv:2604.01658) ===');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coral-test-'));
try {
  const engine = new CoralEvolutionEngine({
    memoryDir: path.join(tmpDir, 'memory'),
    evolutionLog: path.join(tmpDir, 'evolution.jsonl'),
    maxAgents: 4,
  });

  // 1. Register candidate solutions
  const solution1 = engine.registerSolution('agent-alpha', {
    score: 110,
    verificationPassed: true,
    metrics: { durationMs: 45 },
  });
  assert(solution1.solutionId);

  // 2. Test getBestSolutions
  const best = engine.getBestSolutions(1);
  assert.strictEqual(best.length, 1);
  assert.strictEqual(best[0].score, 110);

  // 3. Test multi-agent evolution cycle
  const mockAgents = [
    { task: () => ({ passed: true, score: 120 }) },
    { task: () => ({ passed: true, score: 140 }) },
  ];
  const summary = engine.runEvolutionCycle(mockAgents);
  assert.strictEqual(summary.activeAgents, 2);
  assert.strictEqual(summary.maxCycleScore, 140);
  assert(summary.improvementRate > 0);

  console.log('✅ CORAL Multi-Agent Evolution Engine Tests PASSED!');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
