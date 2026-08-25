#!/usr/bin/env node
'use strict';

/**
 * Hosted agentic watt — NVIDIA Vera Rubin / Blackwell AgentX process steal
 * for thumbgate.app.
 * Source: https://developer.nvidia.com/blog/nvidia-vera-rubin-and-blackwell-set-a-new-standard-for-agentic-ai-performance-per-watt/
 *
 * Steal: replay agentic turns (tool-call gaps, growing context), credit
 * session context-reuse analog, report useful tokens against interactivity
 * and a small-VPS watt proxy. Not Vera Rubin, AgentX, Dynamo, NVL72, or
 * NVIDIA megawatt factory numbers.
 * Do not dual-edit tools/nvidia-nemo-switchyard.js, nvidia-skill-evaluator.js,
 * or DashboardClient.tsx (AGENT-476 / open dashboard PRs).
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE =
  'NVIDIA Technical Blog 2026-08-24 Vera Rubin + Blackwell AgentX performance-per-watt';
const SCHEMA = 'hosted-agentic-watt/v1';
const DEPLOY_SHA_RE = /^[0-9a-f]{40}$/;
const PLACEHOLDER_SHA_RE = /^(.)\1{39}$/;
const REPO_ROOT = path.join(__dirname, '..');
const FAKE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EXAMPLE_SHA = '34d1a8bd31cd27c386c8a0076cd8a94eef27ad20';

/** Documented small fenced-VPS watt proxy. Not an NVIDIA megawatt. */
const HOSTED_VPS_WATT_PROXY = 15;
/** Hosted fenced lease analog (90s). High tokens/watt is UNUSABLE past this. */
const DEFAULT_SLA_E2E_MS = 90_000;

const NVIDIA_FACTORY_RE =
  /\b(vera rubin|blackwell|gb300|h200|nvl72|nvl8|agentx|inferencex|aiperf|nvidia dynamo|tensorrt-llm|nvlink|tokens? per megawatt|ai-factory)\b/i;
const VENDOR_PROMO_RE =
  /developer\.nvidia\.com|inferencex\.semianalysis|vera rubin|nvl72|agentx|nvidia dynamo/i;

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedVeraRubin: false,
    clonedBlackwell: false,
    clonedAgentX: false,
    clonedDynamo: false,
    clonedNvl72: false,
    dualEditNvidiaNemoSwitchyard: false,
    dualEditDashboardClient: false,
    nvidiaMegawattClaim: false,
    vpsWattProxy: HOSTED_VPS_WATT_PROXY,
    workerLive: false,
    capturedRevenueUsd: 0,
    steal: [
      'replay agentic turns: tool-call gaps are not model time',
      'session context-reuse analog: later turns credit overlapping prompt tokens',
      'tokens-per-watt vs interactivity: high efficiency is UNUSABLE if E2E exceeds the 90s lease',
    ],
    skip: [
      'Vera Rubin / Blackwell / GB300 / H200 / NVL72 hardware',
      'SemiAnalysis AgentX / InferenceX / AIPerf live numbers',
      'NVIDIA Dynamo / TensorRT-LLM / SGLang / DeepGEMM / NVLink',
      'editing tools/nvidia-nemo-switchyard.js or nvidia-skill-evaluator.js',
      'editing DashboardClient.tsx (AGENT-476 / open dashboard PRs)',
      '$499 SKU',
    ],
  };
}

function isTrueFlag(value) {
  return value === true;
}

function isPlaceholderSha(sha) {
  return PLACEHOLDER_SHA_RE.test(String(sha || ''));
}

function isVendorPromo(value) {
  return VENDOR_PROMO_RE.test(String(value || ''));
}

function isNvidiaFactoryClaim(value) {
  return NVIDIA_FACTORY_RE.test(String(value || ''));
}

function isSafeRepoPath(artifact) {
  if (!artifact || typeof artifact !== 'string') return false;
  if (path.isAbsolute(artifact)) return false;
  if (artifact.includes('\0')) return false;
  const parts = artifact.split(/[\\/]/);
  if (parts.some((part) => part === '..' || part === '')) return false;
  return true;
}

function artifactExists(artifact) {
  if (!isSafeRepoPath(artifact)) return false;
  const full = path.resolve(REPO_ROOT, artifact);
  const rel = path.relative(REPO_ROOT, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  try {
    return fs.statSync(full).isFile();
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    return false;
  }
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTurns(input) {
  const raw = (input && input.turns) || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((turn, index) => {
    const ttftMs = Math.max(0, num(turn && turn.ttftMs, 0));
    const toolGapMs = Math.max(0, num(turn && turn.toolGapMs, 0));
    const e2eIn = Math.max(0, num(turn && turn.e2eMs, 0));
    const e2eMs = Math.max(e2eIn, ttftMs + toolGapMs);
    const decodeMs = Math.max(0, e2eMs - ttftMs - toolGapMs);
    return {
      index,
      promptTokens: Math.max(0, Math.floor(num(turn && turn.promptTokens, 0))),
      outputTokens: Math.max(0, Math.floor(num(turn && turn.outputTokens, 0))),
      ttftMs,
      toolGapMs,
      decodeMs,
      e2eMs,
      hasToolCall: Boolean(turn && (turn.hasToolCall || toolGapMs > 0)),
    };
  });
}

function classifySession(input, turns) {
  const claimed = String((input && (input.claimedClass || input.class || input.kind)) || '')
    .toLowerCase()
    .trim();
  const prompt = String((input && (input.prompt || input.text || input.blogUrl)) || '');
  if (
    isNvidiaFactoryClaim(claimed) ||
    isNvidiaFactoryClaim(prompt) ||
    Number.isFinite(Number(input && input.claimedTokensPerMegawatt)) ||
    Number.isFinite(Number(input && input.nvidiaMw))
  ) {
    return {
      class: 'nvidia_factory',
      offered: false,
      reason: 'nvidia_factory_not_offered',
      liveClaim: false,
    };
  }
  const tools = turns.filter((t) => t.hasToolCall).length;
  const growing =
    turns.length >= 2 && turns[turns.length - 1].promptTokens > turns[0].promptTokens;
  if (claimed === 'agentic' || tools > 0 || growing) {
    return {
      class: 'agentic',
      offered: true,
      reason: tools > 0 ? 'tool_calls' : growing ? 'growing_context' : 'claimed_agentic',
      liveClaim: false,
    };
  }
  return {
    class: 'chat',
    offered: true,
    reason: claimed === 'chat' || !claimed ? 'chat' : 'default_chat',
    liveClaim: false,
  };
}

function contextReuse(turns) {
  let reusedPromptTokens = 0;
  let billedPrefillTokens = 0;
  for (let i = 0; i < turns.length; i += 1) {
    const prompt = turns[i].promptTokens;
    if (i === 0) {
      billedPrefillTokens += prompt;
      continue;
    }
    const overlap = Math.min(turns[i - 1].promptTokens, prompt);
    reusedPromptTokens += overlap;
    billedPrefillTokens += Math.max(0, prompt - overlap);
  }
  return { reusedPromptTokens, billedPrefillTokens };
}

function splitSessionLatency(turns) {
  const ttftMs = turns.reduce((s, t) => s + t.ttftMs, 0);
  const toolGapMs = turns.reduce((s, t) => s + t.toolGapMs, 0);
  const decodeMs = turns.reduce((s, t) => s + t.decodeMs, 0);
  const e2eMs = turns.reduce((s, t) => s + t.e2eMs, 0);
  const outputTokens = turns.reduce((s, t) => s + t.outputTokens, 0);
  const e2eSec = e2eMs / 1000;
  const decodeSec = decodeMs / 1000;
  return {
    ttftMs,
    toolGapMs,
    decodeMs,
    e2eMs,
    outputTokens,
    e2eInteractivityTps: e2eSec > 0 ? outputTokens / e2eSec : 0,
    decodeInteractivityTps: decodeSec > 0 ? outputTokens / decodeSec : 0,
    maxTurnE2eMs: turns.reduce((m, t) => Math.max(m, t.e2eMs), 0),
  };
}

function wattProxy(input, turns, latency) {
  const watts = Math.max(0.1, num(input && input.vpsWatts, HOSTED_VPS_WATT_PROXY));
  const leaseSeconds = Math.max(
    latency.e2eMs / 1000,
    num(input && input.leaseSeconds, latency.e2eMs / 1000),
  );
  const wattHours = (watts * leaseSeconds) / 3600;
  const tokensPerWattHour = wattHours > 0 ? latency.outputTokens / wattHours : 0;
  return {
    watts,
    leaseSeconds,
    wattHours,
    outputTokens: latency.outputTokens,
    tokensPerWattHour,
    unit: 'tokens_per_watt_hour_vps_proxy',
    notTokensPerMegawatt: true,
  };
}

function researchToProduction(input, opts) {
  const checkFs = !(opts && opts.checkFs === false);
  const artifact = String((input && (input.evalArtifact || input.researchArtifact)) || '').trim();
  const sha = String((input && input.deploySha) || '').trim();
  const testsPass = isTrueFlag(input && input.testsPass);
  const blog = String((input && (input.blogUrl || input.talkUrl)) || '').trim();
  if (isVendorPromo(artifact) || isVendorPromo(blog)) {
    return {
      ok: false,
      reason: blog && !artifact ? 'talk_is_not_production' : 'vendor_blog_is_not_receipt',
      liveClaim: false,
    };
  }
  if (blog && !artifact) {
    return { ok: false, reason: 'talk_is_not_production', liveClaim: false };
  }
  if (!artifact) {
    return { ok: false, reason: 'eval_artifact_missing', liveClaim: false };
  }
  if (/^https?:\/\//i.test(artifact)) {
    return { ok: false, reason: 'url_is_not_eval_artifact', liveClaim: false };
  }
  if (!isSafeRepoPath(artifact)) {
    return { ok: false, reason: 'eval_artifact_unsafe_path', liveClaim: false };
  }
  if (checkFs && !artifactExists(artifact)) {
    return { ok: false, reason: 'eval_artifact_not_found', liveClaim: false, artifact };
  }
  if (!DEPLOY_SHA_RE.test(sha)) {
    return { ok: false, reason: 'deploy_sha_missing', liveClaim: false };
  }
  if (isPlaceholderSha(sha)) {
    return {
      ok: false,
      reason: 'deploy_sha_placeholder',
      liveClaim: false,
      artifact,
      deploySha: sha,
    };
  }
  if (!testsPass) {
    return {
      ok: false,
      reason: 'tests_not_pass',
      liveClaim: false,
      artifact,
      deploySha: sha,
    };
  }
  return { ok: true, reason: 'ok', liveClaim: false, artifact, deploySha: sha };
}

function gradeHostedWatt(input, opts) {
  const turns = normalizeTurns(input);
  const session = classifySession(input || {}, turns);
  const reuse = contextReuse(turns);
  const latency = splitSessionLatency(turns);
  const watt = wattProxy(input || {}, turns, latency);
  const slaE2eMs = Math.max(1, num(input && input.slaE2eMs, DEFAULT_SLA_E2E_MS));
  const usable = turns.length > 0 && latency.maxTurnE2eMs <= slaE2eMs;
  const research = researchToProduction(input || {}, opts);
  const reasons = [];
  if (session.class === 'nvidia_factory') reasons.push('nvidia_factory_not_offered');
  if (turns.length === 0) reasons.push('session_turns_missing');
  if (!usable && turns.length > 0) reasons.push('interactivity_unusable');
  if (latency.toolGapMs > 0 && latency.toolGapMs >= latency.decodeMs) {
    reasons.push('tool_gap_dominates_decode');
  }
  if (!research.ok) reasons.push(research.reason);
  const workerLive = isTrueFlag(input && input.workerLive);
  const liveClaim =
    reasons.length === 0 &&
    workerLive &&
    research.ok &&
    session.offered &&
    usable;
  let status = 'NOT_LIVE';
  if (liveClaim) status = 'LIVE';
  else if (session.class === 'nvidia_factory') status = 'NOT_OFFERED';
  else if (!usable && turns.length > 0 && research.ok) status = 'UNUSABLE';
  return {
    schema: SCHEMA,
    clonedVeraRubin: false,
    clonedAgentX: false,
    clonedDynamo: false,
    nvidiaMegawattClaim: false,
    workerLive: false,
    capturedRevenueUsd: 0,
    session,
    turns: turns.length,
    reuse,
    latency,
    watt,
    slaE2eMs,
    usable,
    research,
    reasons,
    liveClaim,
    status,
    inputWorkerLive: workerLive,
  };
}

function attachAgenticWatt(receipt, input) {
  const grade = gradeHostedWatt(input || {});
  const incomingLive = Boolean(receipt && receipt.liveClaim);
  return {
    ...(receipt || {}),
    liveClaim: incomingLive && grade.liveClaim,
    agenticWatt: {
      schema: SCHEMA,
      sessionClass: grade.session.class,
      usable: grade.usable,
      liveClaim: grade.liveClaim,
      status: grade.status,
      reasons: grade.reasons,
      tokensPerWattHour: grade.watt.tokensPerWattHour,
      toolGapMs: grade.latency.toolGapMs,
      reusedPromptTokens: grade.reuse.reusedPromptTokens,
      notTokensPerMegawatt: true,
    },
  };
}

const DEMO_CASES = [
  {
    name: 'static_chat_is_not_agentic_replay',
    input: {
      claimedClass: 'chat',
      turns: [{ promptTokens: 8000, outputTokens: 1000, ttftMs: 400, e2eMs: 2000 }],
    },
  },
  {
    name: 'nvidia_blog_is_not_production',
    input: {
      blogUrl:
        'https://developer.nvidia.com/blog/nvidia-vera-rubin-and-blackwell-set-a-new-standard-for-agentic-ai-performance-per-watt/',
    },
  },
  {
    name: 'vera_rubin_30x_not_offered',
    input: {
      claimedClass: 'vera rubin',
      claimedTokensPerMegawatt: 30,
      prompt: 'NVL72 AgentX 160 TPS',
    },
  },
  {
    name: 'tool_gap_not_model_time',
    input: {
      turns: [
        {
          promptTokens: 2000,
          outputTokens: 80,
          ttftMs: 300,
          toolGapMs: 8000,
          e2eMs: 9000,
          hasToolCall: true,
        },
        {
          promptTokens: 4200,
          outputTokens: 120,
          ttftMs: 250,
          toolGapMs: 0,
          e2eMs: 1500,
        },
      ],
    },
  },
  {
    name: 'slow_e2e_unusable_even_if_watt_looks_high',
    input: {
      turns: [
        {
          promptTokens: 1000,
          outputTokens: 50000,
          ttftMs: 200,
          e2eMs: 120000,
          hasToolCall: true,
        },
      ],
      evalArtifact: 'tests/test-hosted-agentic-watt.js',
      deploySha: EXAMPLE_SHA,
      testsPass: true,
      workerLive: true,
    },
  },
];

function runDemo() {
  return DEMO_CASES.map((c) => ({ name: c.name, grade: gradeHostedWatt(c.input) }));
}

function loadGrade(args) {
  if ((args || []).includes('--demo')) return { input: null, source: 'demo' };
  const idx = (args || []).indexOf('--grade');
  if (idx >= 0) {
    const file = args[idx + 1];
    if (!file) return { input: null, source: 'missing_path' };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const input =
      parsed && parsed.input && typeof parsed.input === 'object' ? parsed.input : parsed;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { input: null, source: 'not_object' };
    }
    return { input, source: file };
  }
  return { input: null, source: 'none' };
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const json = args.includes('--json');
  const loaded = loadGrade(args);
  if (loaded.source === 'demo') {
    const cases = runDemo();
    const report = {
      ...honesty(),
      status: 'SUCCESS',
      liveClaim: false,
      eventSource: 'demo',
      cases: cases.map((c) => ({
        name: c.name,
        status: c.grade.status,
        liveClaim: c.grade.liveClaim,
        reasons: c.grade.reasons,
        sessionClass: c.grade.session.class,
        usable: c.grade.usable,
        tokensPerWattHour: c.grade.watt.tokensPerWattHour,
        toolGapMs: c.grade.latency.toolGapMs,
        reusedPromptTokens: c.grade.reuse.reusedPromptTokens,
      })),
    };
    process.stdout.write(`${JSON.stringify(report, null, json ? 2 : 0)}\n`);
    return 0;
  }
  if (!loaded.input) {
    const report = {
      ...honesty(),
      status: 'UNAVAILABLE',
      liveClaim: false,
      reason: 'pass --grade FILE.json or --demo',
    };
    process.stdout.write(`${JSON.stringify(report, null, json ? 2 : 0)}\n`);
    return 1;
  }
  const grade = gradeHostedWatt(loaded.input);
  process.stdout.write(`${JSON.stringify({ ...grade, eventSource: loaded.source }, null, json ? 2 : 0)}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  SCHEMA,
  SOURCE,
  FAKE_SHA,
  EXAMPLE_SHA,
  HOSTED_VPS_WATT_PROXY,
  DEFAULT_SLA_E2E_MS,
  honesty,
  isTrueFlag,
  normalizeTurns,
  classifySession,
  contextReuse,
  splitSessionLatency,
  wattProxy,
  researchToProduction,
  gradeHostedWatt,
  attachAgenticWatt,
  runDemo,
  loadGrade,
  main,
};
