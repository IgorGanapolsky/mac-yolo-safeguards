#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  MOE_SLOTS,
  computePromptHash,
  getOrCreateSharedContextCapsule,
  evaluateSwarmCandidatesWithLlmJudge,
  gradeSixPlaneCoordination,
  generateSwarmSowArtifact,
} = require('../tools/herdr-moe-llm-judge-swarm-sow');

function main() {
  // 1. Deterministic prompt hash & Shared Context Capsule
  const h1 = computePromptHash('Make money and fix HUD');
  const h2 = computePromptHash('  make MONEY   and fix hud ');
  assert.strictEqual(h1, h2);

  const cap = getOrCreateSharedContextCapsule('Make money and fix HUD');
  assert.strictEqual(cap.ok, true);
  assert.strictEqual(MOE_SLOTS.length, 4);

  // 2. LLM-as-Judge 100-point rubric + single-writer lease award
  const judge = evaluateSwarmCandidatesWithLlmJudge();
  assert.strictEqual(judge.ok, true);
  assert.strictEqual(judge.winnerScore, 100);
  assert.strictEqual(judge.exclusiveWriteLeaseGrantedTo, 'slot1_deep_architect_omp');

  // 3. 6-Plane Coordination Scorecard (10/10 A+)
  const grade = gradeSixPlaneCoordination();
  assert.strictEqual(grade.ok, true);
  assert.strictEqual(grade.overallScore, 10.0);
  assert.strictEqual(grade.overallGrade, 'A+');
  assert.strictEqual(grade.planes.length, 6);

  const full = generateSwarmSowArtifact();
  assert.strictEqual(full.ok, true);

  console.log('test-herdr-moe-llm-judge-swarm-sow: PASS (10/10 A+ across all 6 planes)');
}

main();
