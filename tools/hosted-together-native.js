#!/usr/bin/env node
'use strict';

/**
 * Hosted Together Native — Together AI Native Conf process steal for thumbgate.app.
 * Source: ~/Downloads/together.pdf (Gmail 2026-08-25 hello@together.ai)
 *         + https://www.together.ai/ainativeconf
 *
 * Steal: capacity ≠ frontier; serverless/batch/provisioned/dedicated honesty;
 * research-to-production receipts. Not Together Cloud, not FlashAttention-4,
 * not ThunderAgent, not Instant Clusters.
 * Do not dual-edit tools/ai-native-sdlc.js, PR #2088 academy-4d, or
 * docs/RESEARCH-together-cursor-decagon-hedra-2026-07.md.
 */

const fs = require('fs');

const SOURCE =
  'Together AI Native Conf promo (2026-08-25 Gmail) + together.ai/ainativeconf';
const SCHEMA = 'hosted-together-native/v1';
const DEPLOY_SHA_RE = /^[0-9a-f]{40}$/;
const VENDOR_PROMO_RE = /together\.ai|ainativeconf|flashattention|thunderagent|thunderkittens|instant clusters?/i;
const DEDICATED_RE =
  /\b(gpu clusters?|instant clusters?|dedicated (gpu|model|container|inference)|together cloud)\b/i;
const BATCH_RE = /\b(batch|overnight|async eval|offline eval|asynchronous)\b/i;

const CLASS_ALIASES = {
  serverless: 'serverless',
  chat: 'serverless',
  realtime: 'serverless',
  interactive: 'serverless',
  ask: 'serverless',
  summarize: 'serverless',
  batch: 'batch',
  async: 'batch',
  overnight: 'batch',
  eval: 'batch',
  offline: 'batch',
  provisioned: 'provisioned',
  sla: 'provisioned',
  reserved: 'provisioned',
  subscriber: 'provisioned',
  dedicated: 'dedicated',
  gpu: 'dedicated',
  cluster: 'dedicated',
  'instant-cluster': 'dedicated',
  gpu_cluster: 'dedicated',
};

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedTogetherCloud: false,
    clonedFlashAttention: false,
    clonedThunderAgent: false,
    clonedInstantClusters: false,
    dualEditAiNativeSdlc: false,
    dualEditAcademy4d: false,
    dualEditTogetherResearchDoc: false,
    capacityIsNotFrontier: true,
    workerLive: false,
    capturedRevenueUsd: 0,
    steal: [
      'capacity ≠ frontier: leftover $10 quota / VPS-up is not a LIVE claim',
      'workload class: serverless chat vs batch vs provisioned vs dedicated-not-offered',
      'research-to-production: named eval artifact + deploy SHA; talks/blogs are not receipts',
    ],
    skip: [
      'Together Cloud / Instant Clusters / GPU clusters',
      'FlashAttention-4 / ThunderKittens / together.compile',
      'ThunderAgent / RL API / ATLAS-2',
      'editing tools/ai-native-sdlc.js',
      'editing hosted-academy-4d / execution-receipt.ts (PR #2088)',
      'editing docs/RESEARCH-together-cursor-decagon-hedra-2026-07.md',
      '$499 SKU',
    ],
  };
}

function isVendorPromo(value) {
  return VENDOR_PROMO_RE.test(String(value || ''));
}

function classifyWorkload(input) {
  const claimed = String((input && (input.claimedClass || input.class || input.kind)) || '')
    .toLowerCase()
    .trim();
  const prompt = String((input && (input.prompt || input.text)) || '');
  if (DEDICATED_RE.test(prompt) || CLASS_ALIASES[claimed] === 'dedicated') {
    return {
      class: 'dedicated',
      offered: false,
      reason: 'dedicated_not_offered',
      liveClaim: false,
    };
  }
  const aliased = CLASS_ALIASES[claimed];
  if (aliased === 'batch' || (!aliased && BATCH_RE.test(prompt))) {
    return {
      class: 'batch',
      offered: true,
      reason: 'batch',
      liveClaim: false,
    };
  }
  if (aliased === 'provisioned') {
    return {
      class: 'provisioned',
      offered: true,
      reason: 'provisioned',
      liveClaim: false,
    };
  }
  return {
    class: 'serverless',
    offered: true,
    reason: aliased === 'serverless' || !claimed ? 'serverless' : 'default_serverless',
    liveClaim: false,
  };
}

function capacityIsNotFrontier(input) {
  const quota = Number(input && input.quotaRemainingUsd);
  const tokensLeft = Number(input && input.tokensLeft);
  const vpsUp = Boolean(input && input.vpsUp);
  const hasCapacity =
    (Number.isFinite(quota) && quota > 0) ||
    (Number.isFinite(tokensLeft) && tokensLeft > 0) ||
    vpsUp;
  return {
    capacity: hasCapacity,
    capacityIsNotFrontier: true,
    liveFromCapacity: false,
    quotaRemainingUsd: Number.isFinite(quota) ? quota : null,
    tokensLeft: Number.isFinite(tokensLeft) ? tokensLeft : null,
    vpsUp,
  };
}

function researchToProduction(input) {
  const artifact = String((input && (input.evalArtifact || input.researchArtifact)) || '').trim();
  const sha = String((input && input.deploySha) || '').trim();
  const testsPass = Boolean(input && input.testsPass);
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
  if (!DEPLOY_SHA_RE.test(sha)) {
    return { ok: false, reason: 'deploy_sha_missing', liveClaim: false };
  }
  if (!testsPass) {
    return { ok: false, reason: 'tests_not_pass', liveClaim: false, artifact, deploySha: sha };
  }
  return { ok: true, reason: 'ok', liveClaim: false, artifact, deploySha: sha };
}

function gradeHostedClaim(input) {
  const body = input && typeof input === 'object' ? input : {};
  const workload = classifyWorkload(body);
  const capacity = capacityIsNotFrontier(body);
  const research = researchToProduction(body);
  const reasons = [];
  if (workload.class === 'dedicated') reasons.push('dedicated_not_offered');
  if (workload.class === 'batch') reasons.push('batch_is_not_live');
  if (workload.class === 'provisioned' && !body.stripePaid) {
    reasons.push('provisioned_requires_paid');
  }
  if (!research.ok) reasons.push(research.reason);
  if (capacity.capacity && !research.ok) reasons.push('capacity_is_not_frontier');
  const workerLive = Boolean(body.workerLive);
  const classAllowsLive =
    workload.class === 'serverless' ||
    (workload.class === 'provisioned' && Boolean(body.stripePaid));
  const liveClaim = reasons.length === 0 && workerLive && research.ok && classAllowsLive;
  let status = 'NOT_LIVE';
  if (liveClaim) status = 'LIVE';
  else if (workload.class === 'batch' && research.ok) status = 'BATCH_COMPLETE';
  else if (workload.class === 'dedicated') status = 'NOT_OFFERED';
  return {
    ...honesty(),
    workload,
    capacity,
    research,
    reasons,
    liveClaim,
    status,
    workerLive: honesty().workerLive,
    inputWorkerLive: workerLive,
  };
}

function attachTogetherNative(receipt, input) {
  const grade = gradeHostedClaim(input || {});
  const incomingLive = Boolean(receipt && receipt.liveClaim);
  return {
    ...(receipt && typeof receipt === 'object' ? receipt : {}),
    liveClaim: incomingLive && grade.liveClaim,
    togetherNative: {
      schema: SCHEMA,
      workloadClass: grade.workload.class,
      capacityIsNotFrontier: true,
      liveClaim: grade.liveClaim,
      status: grade.status,
      reasons: grade.reasons,
    },
  };
}

const FAKE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const DEMO_CASES = [
  {
    name: 'quota_only',
    input: { claimedClass: 'chat', quotaRemainingUsd: 8.5, vpsUp: true },
  },
  {
    name: 'conference_talk',
    input: {
      claimedClass: 'chat',
      blogUrl: 'https://www.together.ai/ainativeconf',
    },
  },
  {
    name: 'dedicated_gpu',
    input: { claimedClass: 'dedicated', prompt: 'spin up Instant Clusters' },
  },
  {
    name: 'batch_eval',
    input: {
      claimedClass: 'batch',
      evalArtifact: 'evals/hosted-together-native.json',
      deploySha: FAKE_SHA,
      testsPass: true,
      workerLive: true,
    },
  },
  {
    name: 'frontier_receipt',
    input: {
      claimedClass: 'serverless',
      evalArtifact: 'tests/test-hosted-together-native.js',
      deploySha: FAKE_SHA,
      testsPass: true,
      workerLive: true,
    },
  },
];

function runDemo() {
  return DEMO_CASES.map((c) => ({ name: c.name, grade: gradeHostedClaim(c.input) }));
}

function loadGrade(args) {
  if ((args || []).includes('--demo')) return { input: null, source: 'demo' };
  const idx = (args || []).indexOf('--grade');
  if (idx >= 0) {
    const file = args[idx + 1];
    if (!file) return { input: null, source: 'missing_path' };
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const input = parsed && parsed.input && typeof parsed.input === 'object' ? parsed.input : parsed;
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
        workloadClass: c.grade.workload.class,
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
  const grade = gradeHostedClaim(loaded.input);
  const report = {
    ...grade,
    eventSource: loaded.source,
  };
  process.stdout.write(`${JSON.stringify(report, null, json ? 2 : 0)}\n`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  SCHEMA,
  SOURCE,
  FAKE_SHA,
  honesty,
  classifyWorkload,
  capacityIsNotFrontier,
  researchToProduction,
  gradeHostedClaim,
  attachTogetherNative,
  runDemo,
  loadGrade,
  main,
};
