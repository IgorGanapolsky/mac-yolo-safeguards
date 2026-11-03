#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  BLOCK_SIZE_TOKENS,
  PagedAttentionPrefixCache,
  computeDeterministicSeed,
  buildVllmGuidedRequest,
  sharedPrefixCacheSalt,
  clerkModelAllowed,
  pinLiveClerkRequest,
  measurePrefixReuse,
  runBenchmarkSimulation,
} = require('../tools/vllm-inference-router');

function main() {
  const cache = new PagedAttentionPrefixCache(BLOCK_SIZE_TOKENS);
  const sys =
    'You are a single-purpose Worker Agent in the MacYoloSafeguards + ThumbGate + Nanobot revenue fleet. Follow strict JSON output contracts and never fabricate revenue numbers.';
  const schemaText =
    'Schema Contract: {"status":"PASS|BLOCK","verified_external_usd":0,"evidence_refs":["string"]}';

  // Turn 1: Cold cache miss -> allocates full prefix blocks
  const req1 = buildVllmGuidedRequest({
    workerId: 'RevenueTruthWorker',
    systemPrompt: sys,
    sharedSchemaPrefix: schemaText,
    userPrompt: 'Audit live Stripe external_net_cents for 2026-11-01.',
    jsonSchema: { type: 'object', required: ['status'] },
    cache,
  });
  assert.strictEqual(req1.pd_tier, 'prefill_heavy');
  assert.strictEqual(req1.profile.kv_cache_dtype, 'nvfp4');
  assert.strictEqual(req1.kv_probe.cached_prefix_tokens, 0);

  // Turn 2: Warm prefix hit across a different worker sharing the prefix!
  const req2 = buildVllmGuidedRequest({
    workerId: 'NanobotRevenueCloser',
    systemPrompt: sys,
    sharedSchemaPrefix: schemaText,
    userPrompt: 'Generate $49 corporate-expense downsell for 4 checkout cancel bounces.',
    jsonSchema: { type: 'object', required: ['status'] },
    cache,
  });
  assert.strictEqual(req2.pd_tier, 'decode_fast');
  assert.strictEqual(req2.profile.kv_cache_dtype, 'fp8_e4m3');
  assert.ok(
    req2.kv_probe.cached_prefix_tokens >= 48,
    `Expected >= 48 cached prefix tokens on warm hit, got ${req2.kv_probe.cached_prefix_tokens}`,
  );
  assert.ok(req2.request_payload.response_format.type === 'json_schema');

  // Deterministic seed invariant
  const s1 = computeDeterministicSeed('OutreachCopyWorker', 'abc12345', 'prospect_01');
  const s2 = computeDeterministicSeed('OutreachCopyWorker', 'abc12345', 'prospect_01');
  assert.strictEqual(s1, s2, 'Seed must be deterministic for identical (worker, prefix, task)');

  assert.strictEqual(req1.prefix_cache_salt, req2.prefix_cache_salt);
  assert.strictEqual(
    req1.prefix_cache_salt,
    sharedPrefixCacheSalt(sys, schemaText),
  );
  assert.strictEqual(req1.request_payload.extra_body.kv_cache_dtype, undefined);
  assert.strictEqual(req1.request_payload.extra_body.speculative_config, undefined);

  assert.strictEqual(clerkModelAllowed('mlx-community/Llama-3.2-1B-Instruct-4bit'), true);
  assert.strictEqual(clerkModelAllowed('mlx-community/Some-30B-4bit'), false);
  const refused = pinLiveClerkRequest(req2, 'mlx-community/Some-30B-4bit');
  assert.strictEqual(refused.applied, false);
  const pinned = pinLiveClerkRequest(req2, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(pinned.applied, true);
  assert.strictEqual(pinned.request_payload.model, 'mlx-community/Llama-3.2-1B-Instruct-4bit');
  assert.strictEqual(pinned.request_payload.extra_body.cache_salt, req2.prefix_cache_salt);
  assert.strictEqual(pinned.request_payload.response_format, undefined);

  const reuse = measurePrefixReuse('http://127.0.0.1:8000/v1', 'mlx-community/Llama-3.2-1B-Instruct-4bit', (url, opts) => {
    const body = JSON.parse(opts.body);
    const n = body.messages[1].content === 'turn B' ? 48 : 0;
    return {
      status: 200,
      json: { usage: { prompt_tokens_details: { cached_tokens: n } } },
    };
  });
  assert.strictEqual(reuse.prefix_reuse_proven, true);
  assert.strictEqual(reuse.reason, 'server_reported_cached_tokens');
  assert.ok(reuse.first.latency_ms >= 0);

  const silent = measurePrefixReuse('http://127.0.0.1:8000/v1', 'mlx-community/Llama-3.2-1B-Instruct-4bit', () => ({
    status: 200,
    json: { usage: { prompt_tokens: 20 } },
  }));
  assert.strictEqual(silent.measured, true);
  assert.strictEqual(silent.prefix_reuse_proven, false);
  assert.strictEqual(silent.reason, 'server_did_not_report_cached_tokens');

  const sim = runBenchmarkSimulation();
  assert.strictEqual(sim.simulated_prefix_cache, true);
  assert.ok(sim.live_server && typeof sim.live_server.reachable === 'boolean');
  assert.strictEqual(sim.schema_version, 'vllm-inference-router/3');
  assert.strictEqual(typeof sim.live_prefix_reuse.prefix_reuse_proven, 'boolean');
  assert.ok(
    sim.apc_summary.overall_prefix_cache_hit_rate_pct >= 55.0,
    `Expected overall APC hit rate >= 55%, got ${sim.apc_summary.overall_prefix_cache_hit_rate_pct}%`,
  );

  console.log(
    `PASS tests/test-vllm-inference-router.js (APC hit rate=${sim.apc_summary.overall_prefix_cache_hit_rate_pct}%, KV blocks=${sim.apc_summary.active_kv_blocks})`,
  );
}

main();
