#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  SOFTWARE_FACTORY_PROFILES,
  resolveTriggeredMicroagents,
  detectStuckTrajectory,
  condenseEventStream,
  evaluateWithRubricCritic,
  runSelfTestAndPersistReceipt,
} = require('../tools/openhands-architecture-engine');

function main() {
  // 1. Deterministic Path-Triggered + Keyword-Triggered Microagents
  const matched = resolveTriggeredMicroagents({
    touchedPaths: ['macos/MacYoloTranslucentHud.swift', 'tools/nanobot-revenue-engine.js'],
    promptText: 'Use vllm and nanobot to make money',
  });
  const ids = matched.map((m) => m.id);
  assert.ok(ids.includes('path:macos-hud-guard'));
  assert.ok(ids.includes('path:revenue-truth-guard'));
  assert.ok(ids.includes('keyword:revenue-closer'));
  assert.ok(ids.includes('keyword:vllm-inference'));
  const invariantText = matched.flatMap((agent) => agent.injected_invariants).join('\n');
  assert.ok(!invariantText.includes('149'));
  assert.ok(!invariantText.includes('9,998'));
  assert.ok(!invariantText.includes('Route $499'));
  assert.ok(invariantText.includes('HTTP 404'));
  assert.ok(invariantText.includes('127.0.0.1:8000'));

  // 2. 5-Pattern Stuck-Loop Detector
  assert.strictEqual(
    detectStuckTrajectory([
      { action_type: 'edit', action_args: 'a.js', observation_status: 'ok', observation_summary: 'same' },
      { action_type: 'edit', action_args: 'a.js', observation_status: 'ok', observation_summary: 'same' },
      { action_type: 'edit', action_args: 'a.js', observation_status: 'ok', observation_summary: 'same' },
    ]).pattern,
    'repeating_action_observation',
  );
  assert.strictEqual(
    detectStuckTrajectory([
      { action_type: 'monologue' },
      { action_type: 'monologue' },
      { action_type: 'monologue' },
    ]).pattern,
    'monologue_loop',
  );
  assert.strictEqual(
    detectStuckTrajectory([
      { action_type: 'read', action_args: 'x' },
      { action_type: 'grep', action_args: 'y' },
      { action_type: 'read', action_args: 'x' },
      { action_type: 'grep', action_args: 'y' },
    ]).pattern,
    'alternating_ab_cycle',
  );
  assert.strictEqual(
    detectStuckTrajectory([
      { action_type: 'bash', observation_status: 'error', observation_summary: 'context window exceeded' },
    ]).pattern,
    'context_window_overflow',
  );

  // 3. Head+Tail Condenser
  const events = Array.from({ length: 16 }, (_, i) => ({
    action_type: 'tool_call',
    action_args: `payload_${i}_${'a'.repeat(160)}`,
    observation_status: 'ok',
    observation_summary: `obs_${i}_${'b'.repeat(160)}`,
  }));
  const condensed = condenseEventStream(events, { keepHead: 2, keepTail: 4, maxEventsBeforeCondense: 8 });
  assert.strictEqual(condensed.condensed, true);
  assert.strictEqual(condensed.retained_event_count, 7); // 2 head + 1 summary + 4 tail
  assert.ok(condensed.token_reduction_pct >= 50.0);
  assert.strictEqual(condensed.reduction_basis, 'synthetic_character_length');

  // 4. Software Factory least-privilege & zero-LLM watchdog
  assert.strictEqual(SOFTWARE_FACTORY_PROFILES['factory-reviewer'].can_push_code, false);
  assert.strictEqual(SOFTWARE_FACTORY_PROFILES['factory-reviewer'].credentials_issued, false);
  assert.deepStrictEqual(SOFTWARE_FACTORY_PROFILES['factory-developer'].secret_scope, []);
  assert.strictEqual(SOFTWARE_FACTORY_PROFILES['factory-watchdog'].deterministic_zero_llm, true);

  // 5. Rubric-Supervised Critic
  const bad = evaluateWithRubricCritic({
    has_executable_verification: false,
    claims_revenue_without_stripe_receipt: true,
  });
  assert.strictEqual(bad.passed, false);
  assert.strictEqual(bad.refinement_required, true);

  const good = evaluateWithRubricCritic({
    has_executable_verification: true,
    claims_revenue_without_stripe_receipt: false,
    incomplete_changes: false,
    asks_user_to_run_manual_command: false,
  });
  assert.strictEqual(good.passed, true);
  assert.strictEqual(good.success_likelihood, 1.0);

  const uncited = evaluateWithRubricCritic({
    has_executable_verification: true,
    claims_revenue_without_stripe_receipt: false,
    incomplete_changes: false,
    asks_user_to_run_manual_command: false,
    text: 'Anchor revenue to $149.00 historical external cash.',
  });
  assert.strictEqual(uncited.passed, false);
  assert.ok(!JSON.stringify(uncited.detected_issues).includes('149'));

  const honestZero = evaluateWithRubricCritic({
    has_executable_verification: true,
    claims_revenue_without_stripe_receipt: false,
    incomplete_changes: false,
    asks_user_to_run_manual_command: false,
    text: 'Measured stranger cash is $0.',
  });
  assert.strictEqual(honestZero.passed, true);

  const report = runSelfTestAndPersistReceipt();
  assert.strictEqual(report.capabilities.critic_refinement_verified, true);
  console.log(
    `PASS tests/test-openhands-architecture-engine.js (microagents=${matched.length}, condenser=${condensed.token_reduction_pct}%, critic=1.0)`,
  );
}

main();
