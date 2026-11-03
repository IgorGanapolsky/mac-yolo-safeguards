#!/usr/bin/env node
'use strict';

/**
 * vllm-inference-router.js — local clerk routing using the vLLM idea that pays off
 * on this Mac: one shared prompt prefix, reused instead of recomputed.
 *
 * The in-process block table is a planner. The live server is vllm-mlx on
 * 127.0.0.1:8000, not CUDA vLLM and not vllm-metal. Payloads sent toward that
 * clerk pin its reported model and one prefix salt. NVFP4 KV, prefill/decode
 * split, speculative decoding, NAX, and KV offload stay off that payload.
 */

const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const BLOCK_SIZE_TOKENS = 16;
const CHARS_PER_TOKEN = 4;
const RECEIPT_PATH = path.join(HOME, '.hermes', 'receipts', 'vllm-inference-router-latest.json');
const NANOBOT_CONFIG_PATH = path.join(HOME, '.nanobot', 'config.json');
const DEFAULT_VLLM_API_BASE = process.env.VLLM_API_BASE || 'http://127.0.0.1:8000/v1';

const VLLM_SERVING_PROFILES = {
  prefill_heavy: {
    tier: 'prefill_heavy',
    description: 'vLLM P/D Disaggregated Prefill Node (Graph-RAG & DS/ML Batch Context)',
    model: 'poolside/Laguna-XS-2.1-NVFP4-mlx:latest',
    fallback_model: 'qwen2.5-14b-16k:latest',
    kv_cache_dtype: 'nvfp4',
    kv_memory_reduction_pct: 75.0,
    enable_prefix_caching: true,
    block_size: BLOCK_SIZE_TOKENS,
    max_num_batched_tokens: 16384,
    speculative_decoding: 'none',
  },
  decode_fast: {
    tier: 'decode_fast',
    description: 'vLLM P/D Disaggregated Decode Node (Low-Latency Tool Calls & Nanobot Revenue Closer)',
    model: 'qwen2.5-coder:latest',
    fallback_model: 'poolside/laguna-xs-2.1:latest',
    kv_cache_dtype: 'fp8_e4m3',
    kv_memory_reduction_pct: 50.0,
    enable_prefix_caching: true,
    block_size: BLOCK_SIZE_TOKENS,
    max_num_batched_tokens: 4096,
    speculative_decoding: 'ngram_k3',
  },
};

const WORKER_PD_ROLE_MAP = {
  InvestigatorWorker: 'prefill_heavy',
  ArchitectCostWorker: 'prefill_heavy',
  PreActionGateWorker: 'decode_fast',
  ScopedExecutorWorker: 'decode_fast',
  GoldfishVerifierWorker: 'decode_fast',
  RevenueTruthWorker: 'prefill_heavy',
  PropensityScoringWorker: 'prefill_heavy',
  OutreachCopyWorker: 'decode_fast',
  PipelineGateWorker: 'decode_fast',
  NanobotRevenueCloser: 'decode_fast',
};

class PagedAttentionPrefixCache {
  constructor(blockSizeTokens = BLOCK_SIZE_TOKENS) {
    this.blockSizeTokens = blockSizeTokens;
    this.blockTable = new Map(); // blockHash -> { tokens, hits, lastAccessedAt }
    this.totalTokensRequested = 0;
    this.cachedTokensReused = 0;
  }

  tokenizeIntoBlocks(text) {
    const clean = String(text || '');
    const approxTokens = Math.max(1, Math.ceil(clean.length / CHARS_PER_TOKEN));
    const blockChars = this.blockSizeTokens * CHARS_PER_TOKEN;
    const blocks = [];
    let parentHash = 'ROOT_KV_BLOCK';
    for (let offset = 0; offset < clean.length; offset += blockChars) {
      const chunk = clean.slice(offset, offset + blockChars);
      const tokenCount = Math.max(1, Math.ceil(chunk.length / CHARS_PER_TOKEN));
      const blockHash = crypto
        .createHash('sha256')
        .update(`${parentHash}|${chunk}`)
        .digest('hex')
        .slice(0, 16);
      blocks.push({ blockHash, tokenCount, isFullBlock: chunk.length === blockChars });
      parentHash = blockHash;
    }
    return { approxTokens, blocks };
  }

  allocateAndProbe(systemPrompt, sharedSchemaPrefix, dynamicUserPrompt) {
    const prefixText = `${systemPrompt || ''}\n---\n${sharedSchemaPrefix || ''}`;
    const fullText = `${prefixText}\n---\n${dynamicUserPrompt || ''}`;
    const { approxTokens, blocks } = this.tokenizeIntoBlocks(fullText);

    this.totalTokensRequested += approxTokens;
    let hitTokens = 0;
    let prefixHitBlocks = 0;
    let prefixStreakAlive = true;

    for (const blk of blocks) {
      if (prefixStreakAlive && this.blockTable.has(blk.blockHash)) {
        const entry = this.blockTable.get(blk.blockHash);
        entry.hits += 1;
        entry.lastAccessedAt = Date.now();
        hitTokens += blk.tokenCount;
        prefixHitBlocks += 1;
      } else {
        prefixStreakAlive = false;
        if (blk.isFullBlock) {
          this.blockTable.set(blk.blockHash, {
            tokens: blk.tokenCount,
            hits: 1,
            lastAccessedAt: Date.now(),
          });
        }
      }
    }

    this.cachedTokensReused += hitTokens;
    const hitRatePct =
      approxTokens > 0 ? Number(((hitTokens / approxTokens) * 100).toFixed(1)) : 0;

    return {
      total_tokens: approxTokens,
      cached_prefix_tokens: hitTokens,
      computed_prefill_tokens: Math.max(0, approxTokens - hitTokens),
      prefix_hit_blocks: prefixHitBlocks,
      total_blocks: blocks.length,
      block_hit_rate_pct: hitRatePct,
      prefix_root_hash: blocks[0] ? blocks[0].blockHash : null,
    };
  }

  getSummary() {
    const overallHitRatePct =
      this.totalTokensRequested > 0
        ? Number(((this.cachedTokensReused / this.totalTokensRequested) * 100).toFixed(1))
        : 0;
    return {
      block_size_tokens: this.blockSizeTokens,
      active_kv_blocks: this.blockTable.size,
      total_tokens_requested: this.totalTokensRequested,
      cached_tokens_reused: this.cachedTokensReused,
      overall_prefix_cache_hit_rate_pct: overallHitRatePct,
    };
  }
}

function sharedPrefixCacheSalt(systemPrompt, sharedSchemaPrefix) {
  return crypto
    .createHash('sha256')
    .update(`${systemPrompt || ''}\n${sharedSchemaPrefix || ''}`)
    .digest('hex')
    .slice(0, 16);
}

function clerkModelAllowed(modelId) {
  const id = String(modelId || '');
  if (!id) return false;
  if (/30b|70b|72b|moe-30|nvfp4/i.test(id)) return false;
  return true;
}

function computeDeterministicSeed(workerId, prefixHash, taskKey = '') {
  const digest = crypto
    .createHash('sha256')
    .update(`${workerId}|${prefixHash || 'none'}|${taskKey}`)
    .digest();
  return digest.readUInt32BE(0) % 2147483647;
}

function buildVllmGuidedRequest({
  workerId,
  systemPrompt,
  sharedSchemaPrefix,
  userPrompt,
  jsonSchema = null,
  cache = null,
}) {
  const pdTier = WORKER_PD_ROLE_MAP[workerId] || 'decode_fast';
  const profile = VLLM_SERVING_PROFILES[pdTier];
  const kvProbe = cache
    ? cache.allocateAndProbe(systemPrompt, sharedSchemaPrefix, userPrompt)
    : null;
  const seed = computeDeterministicSeed(
    workerId,
    kvProbe ? kvProbe.prefix_root_hash : 'stateless',
    userPrompt.slice(0, 64),
  );

  const payload = {
    model: profile.model,
    temperature: 0.0,
    seed,
    max_tokens: pdTier === 'decode_fast' ? 1024 : 2048,
    messages: [
      {
        role: 'system',
        content: sharedSchemaPrefix
          ? `${systemPrompt}\n${sharedSchemaPrefix}`
          : systemPrompt,
      },
      { role: 'user', content: userPrompt },
    ],
    extra_body: {
      cache_salt: sharedPrefixCacheSalt(systemPrompt, sharedSchemaPrefix),
      guided_json: jsonSchema || undefined,
    },
  };

  if (jsonSchema) {
    payload.response_format = {
      type: 'json_schema',
      json_schema: {
        name: `${workerId}_output_contract`,
        strict: true,
        schema: jsonSchema,
      },
    };
  }

  return {
    worker_id: workerId,
    pd_tier: pdTier,
    profile,
    seed,
    prefix_cache_salt: payload.extra_body.cache_salt,
    kv_probe: kvProbe,
    request_payload: payload,
  };
}

function pinLiveClerkRequest(request, liveModelId) {
  if (!clerkModelAllowed(liveModelId)) {
    return {
      applied: false,
      reason: liveModelId ? 'model_refused_too_large_for_this_mac' : 'no_live_model',
      model_id: liveModelId || null,
    };
  }
  const payload = {
    ...request.request_payload,
    model: liveModelId,
    max_tokens: 1,
    messages: request.request_payload.messages,
    extra_body: {
      cache_salt: request.prefix_cache_salt,
    },
  };
  delete payload.response_format;
  return {
    applied: true,
    reason: 'shared_prefix_on_live_clerk',
    model_id: liveModelId,
    not_sent: ['kv_cache_dtype', 'speculative_config', 'response_format'],
    request_payload: payload,
  };
}

function curlJson(url, { method = 'GET', body = null, timeoutSec = 20 } = {}) {
  const args = ['-sS', '-m', String(timeoutSec), '-w', '\n%{http_code}', '-X', method, url];
  if (body) {
    args.splice(args.length - 1, 0, '-H', 'Content-Type: application/json', '--data-binary', body);
  }
  try {
    const out = execFileSync('curl', args, {
      encoding: 'utf8',
      timeout: (timeoutSec + 2) * 1000,
    });
    const nl = out.lastIndexOf('\n');
    const raw = nl >= 0 ? out.slice(0, nl) : out;
    const status = Number(nl >= 0 ? out.slice(nl + 1).trim() : 0);
    let json = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
    return { status, json };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

function cachedTokensFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  if (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens != null) {
    return Number(usage.prompt_tokens_details.cached_tokens);
  }
  if (usage.cached_tokens != null) return Number(usage.cached_tokens);
  return null;
}

function measurePrefixReuse(apiBase, modelId, transport = curlJson) {
  if (!clerkModelAllowed(modelId)) {
    return { measured: false, prefix_reuse_proven: false, reason: 'model_refused' };
  }
  const root = String(apiBase).replace(/\/v1\/?$/, '');
  const system = `FLEET_PREFIX_v1 ${'Cleared cash from a stranger is zero. '.repeat(12)}`;
  const salt = sharedPrefixCacheSalt(system, '');
  const call = (user) => {
    const started = Date.now();
    const res = transport(`${root}/v1/chat/completions`, {
      method: 'POST',
      timeoutSec: 30,
      body: JSON.stringify({
        model: modelId,
        temperature: 0,
        max_tokens: 1,
        cache_salt: salt,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    return {
      status: res.status,
      latency_ms: Date.now() - started,
      cached_tokens: cachedTokensFromUsage(res.json?.usage),
    };
  };
  const first = call('turn A');
  const second = call('turn B');
  const measured = first.status === 200 && second.status === 200;
  const proven = measured && Number(second.cached_tokens) > 0;
  return {
    measured,
    prefix_reuse_proven: proven,
    reason: !measured
      ? 'completion_failed'
      : proven
        ? 'server_reported_cached_tokens'
        : 'server_did_not_report_cached_tokens',
    cache_salt: salt,
    first,
    second,
  };
}

function probeLiveVllm(apiBase = DEFAULT_VLLM_API_BASE) {
  const root = String(apiBase).replace(/\/v1\/?$/, '');
  const models = curlJson(`${root}/v1/models`);
  const health = curlJson(`${root}/health`);
  const cache = curlJson(`${root}/v1/cache/stats`);
  const modelId = models.json?.data?.[0]?.id || null;
  let completion = null;
  if (modelId) {
    const started = Date.now();
    const chat = curlJson(`${root}/v1/chat/completions`, {
      method: 'POST',
      timeoutSec: 30,
      body: JSON.stringify({
        model: modelId,
        temperature: 0,
        max_tokens: 8,
        messages: [
          {
            role: 'system',
            content:
              'You are a ThumbGate revenue clerk. Cleared cash from a stranger is zero dollars. Answer with one integer.',
          },
          {
            role: 'user',
            content: 'How many stranger dollars were collected? Reply with the integer only.',
          },
        ],
      }),
    });
    completion = {
      status: chat.status,
      latency_ms: Date.now() - started,
      text: chat.json?.choices?.[0]?.message?.content ?? null,
      usage: chat.json?.usage ?? null,
    };
  }
  return {
    api_base: apiBase,
    reachable: models.status === 200 && Boolean(modelId),
    health_status: health.status,
    model_id: modelId,
    owned_by: models.json?.data?.[0]?.owned_by || null,
    cache_stats: cache.json,
    completion,
  };
}

function wireNanobotVllmProvider(liveProbe) {
  if (!liveProbe?.reachable || !liveProbe.model_id) {
    return {
      updated: false,
      reason: 'live_vllm_not_reachable',
      api_base: liveProbe?.api_base || DEFAULT_VLLM_API_BASE,
    };
  }
  if (!fs.existsSync(NANOBOT_CONFIG_PATH)) {
    return { updated: false, reason: 'missing_nanobot_config' };
  }
  const cfg = JSON.parse(fs.readFileSync(NANOBOT_CONFIG_PATH, 'utf8'));
  const previousDefault = cfg.agents?.defaults?.model || null;
  cfg.providers = cfg.providers || {};
  const existingKey = cfg.providers.vllm?.apiKey;
  cfg.providers.vllm = {
    ...(cfg.providers.vllm || {}),
    apiBase: liveProbe.api_base,
    apiKey: process.env.VLLM_API_KEY || existingKey || 'vllm-local',
  };
  cfg.modelPresets = cfg.modelPresets || {};
  cfg.modelPresets.vllm_mlx_live = {
    provider: 'vllm',
    model: liveProbe.model_id,
  };
  if (cfg.agents?.defaults) {
    cfg.agents.defaults.model = previousDefault;
  }
  fs.writeFileSync(NANOBOT_CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return {
    updated: true,
    config_path: NANOBOT_CONFIG_PATH,
    vllm_api_base: cfg.providers.vllm.apiBase,
    live_model: liveProbe.model_id,
    default_model_unchanged: cfg.agents?.defaults?.model || null,
    presets: Object.keys(cfg.modelPresets),
  };
}

function runBenchmarkSimulation() {
  const cache = new PagedAttentionPrefixCache(BLOCK_SIZE_TOKENS);
  const sharedSystem =
    'You are a single-purpose Worker Agent in the MacYoloSafeguards + ThumbGate + Nanobot revenue fleet. Follow strict JSON output contracts, never fabricate revenue numbers, and enforce fail-closed pre-action gates.';
  const sharedSchema =
    'Output Contract Schema v1: {"status":"PASS|BLOCK","verified_external_usd":0,"evidence_refs":["string"],"next_action":"string"}';

  const workers = [
    'RevenueTruthWorker',
    'PropensityScoringWorker',
    'OutreachCopyWorker',
    'PipelineGateWorker',
    'GoldfishVerifierWorker',
    'NanobotRevenueCloser',
  ];

  const traces = [];
  for (let round = 1; round <= 3; round += 1) {
    for (const workerId of workers) {
      const req = buildVllmGuidedRequest({
        workerId,
        systemPrompt: sharedSystem,
        sharedSchemaPrefix: sharedSchema,
        userPrompt: `Round ${round} execution for ${workerId}: evaluate 6 ready B2B prospects ($9,998 pipeline) and 4 checkout cancel bounces.`,
        jsonSchema: {
          type: 'object',
          required: ['status', 'verified_external_usd', 'evidence_refs'],
          properties: {
            status: { type: 'string', enum: ['PASS', 'BLOCK'] },
            verified_external_usd: { type: 'number' },
            evidence_refs: { type: 'array', items: { type: 'string' } },
          },
        },
        cache,
      });
      traces.push({
        round,
        worker_id: workerId,
        pd_tier: req.pd_tier,
        kv_cache_dtype: req.profile.kv_cache_dtype,
        seed: req.seed,
        cached_prefix_tokens: req.kv_probe.cached_prefix_tokens,
        computed_prefill_tokens: req.kv_probe.computed_prefill_tokens,
        block_hit_rate_pct: req.kv_probe.block_hit_rate_pct,
      });
    }
  }

  const liveProbe = probeLiveVllm();
  const nanobotWiring = wireNanobotVllmProvider(liveProbe);
  const summary = cache.getSummary();
  const sampleForClerk = buildVllmGuidedRequest({
    workerId: 'RevenueTruthWorker',
    systemPrompt: sharedSystem,
    sharedSchemaPrefix: sharedSchema,
    userPrompt: 'How many stranger dollars were collected?',
    cache,
  });
  const liveClerk = pinLiveClerkRequest(sampleForClerk, liveProbe.model_id);
  const prefixReuse = liveProbe.reachable && clerkModelAllowed(liveProbe.model_id)
    ? measurePrefixReuse(liveProbe.api_base, liveProbe.model_id)
    : { measured: false, prefix_reuse_proven: false, reason: 'live_clerk_unavailable' };

  const report = {
    schema_version: 'vllm-inference-router/3',
    generated_at: new Date().toISOString(),
    vllm_ideas: 'shared prefix reuse from vllm.ai; CUDA 0.33 and vllm-metal not installed',
    simulated_prefix_cache: true,
    live_server: liveProbe,
    live_clerk_route: liveClerk.applied
      ? {
          applied: true,
          model_id: liveClerk.model_id,
          cache_salt: liveClerk.request_payload.extra_body.cache_salt,
          not_sent: liveClerk.not_sent,
        }
      : liveClerk,
    live_prefix_reuse: prefixReuse,
    features_enabled: liveProbe.reachable
      ? [`OpenAI-compatible server at ${liveProbe.api_base}`, `model ${liveProbe.model_id}`]
      : [],
    apc_summary: summary,
    serving_profiles: VLLM_SERVING_PROFILES,
    nanobot_vllm_wiring: nanobotWiring,
    sample_traces: traces.slice(-6),
  };

  fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

if (require.main === module) {
  const asJson = process.argv.includes('--json');
  const report = runBenchmarkSimulation();
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const live = report.live_server || {};
    console.log(
      `VLLM_LIVE: reachable=${live.reachable} model=${live.model_id || 'none'} health=${live.health_status} completion=${live.completion?.status || 0} ${live.completion?.latency_ms || 0}ms text=${JSON.stringify(live.completion?.text || null)}`,
    );
    console.log(
      `VLLM_SIMULATED_PREFIX_CACHE: ${report.apc_summary.overall_prefix_cache_hit_rate_pct}% on an in-process hash, not a measurement from the server`,
    );
    const reuse = report.live_prefix_reuse || {};
    console.log(
      `VLLM_PREFIX_REUSE: measured=${reuse.measured} proven=${reuse.prefix_reuse_proven} reason=${reuse.reason} second_cached_tokens=${reuse.second?.cached_tokens ?? 'none'}`,
    );
    console.log(
      `Nanobot vLLM preset: updated=${report.nanobot_vllm_wiring.updated} base=${report.nanobot_vllm_wiring.vllm_api_base || report.nanobot_vllm_wiring.api_base} default_model=${report.nanobot_vllm_wiring.default_model_unchanged || 'unchanged'}`,
    );
  }
}

module.exports = {
  BLOCK_SIZE_TOKENS,
  VLLM_SERVING_PROFILES,
  WORKER_PD_ROLE_MAP,
  PagedAttentionPrefixCache,
  computeDeterministicSeed,
  buildVllmGuidedRequest,
  sharedPrefixCacheSalt,
  clerkModelAllowed,
  pinLiveClerkRequest,
  cachedTokensFromUsage,
  measurePrefixReuse,
  probeLiveVllm,
  wireNanobotVllmProvider,
  runBenchmarkSimulation,
};
