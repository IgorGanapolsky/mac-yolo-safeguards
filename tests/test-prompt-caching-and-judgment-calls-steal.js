#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  detectAndFixPrefixCacheBusters,
  computeKvCacheEconomics,
  evaluateJudgmentCallSteelmanGate,
  auditJudgmentDeferralAndModeCollapse,
  runAllPromptCachingAndJudgmentCallChecks,
} = require('../tools/prompt-caching-and-judgment-calls-steal');

function main() {
  // 1. Detect & strip cache-busting timestamps/UUIDs and sort MCP tools
  const dirty = detectAndFixPrefixCacheBusters({
    systemPrefix: 'System start at 2026-10-30T10:15:00Z session 123e4567-e89b-12d3-a456-426614174000',
    tools: [{ name: 'zeta_tool' }, { name: 'alpha_tool' }],
  });
  assert.strictEqual(dirty.ok, false);
  assert.strictEqual(dirty.repaired, true);
  assert.strictEqual(dirty.cacheBustersFound.length, 3);
  assert.strictEqual(dirty.sortedTools[0].name, 'alpha_tool');

  // 2. KV-Cache block alignment & savings
  const econ = computeKvCacheEconomics({ staticPrefixTokens: 32_768, dynamicTailTokens: 1_500, turnsCount: 20 });
  assert.strictEqual(econ.ok, true);
  assert.ok(econ.cacheHitRatioPct >= 85.0);
  assert.ok(econ.anthropicSavingsPct >= 80.0);

  // 3. Anthropic agents-judgment-calls Dual-Steelman Gate (mitigates 86% blind deferral)
  const oneSided = evaluateJudgmentCallSteelmanGate({
    isJudgmentCall: true,
    optionA: { label: 'Option A', steelmanArgument: 'Only A argued' },
    optionB: null,
    sensitivityDelta: '',
    provenance: 'agent_default_lean',
  });
  assert.strictEqual(oneSided.ok, false);

  const balanced = evaluateJudgmentCallSteelmanGate({
    isJudgmentCall: true,
    optionA: { label: 'Option A', steelmanArgument: 'Strong case for A' },
    optionB: { label: 'Option B', steelmanArgument: 'Strong case for B' },
    sensitivityDelta: '+2.1% vs +4.2% yield',
    provenance: 'dual_steelman_choice',
  });
  assert.strictEqual(balanced.ok, true);

  // 4. Deferral & Mode-Collapse audit
  const audit = auditJudgmentDeferralAndModeCollapse();
  assert.strictEqual(audit.ok, true);
  assert.ok(audit.deferralRatePct < 86);

  const all = runAllPromptCachingAndJudgmentCallChecks();
  assert.strictEqual(all.ok, true);

  console.log('test-prompt-caching-and-judgment-calls-steal: PASS');
}

main();
