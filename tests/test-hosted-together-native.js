#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  FAKE_SHA,
  honesty,
  classifyWorkload,
  capacityIsNotFrontier,
  researchToProduction,
  gradeHostedClaim,
  attachTogetherNative,
  main,
} = require('../tools/hosted-together-native');

const h = honesty();
assert.strictEqual(h.clonedTogetherCloud, false);
assert.strictEqual(h.clonedFlashAttention, false);
assert.strictEqual(h.clonedThunderAgent, false);
assert.strictEqual(h.clonedInstantClusters, false);
assert.strictEqual(h.dualEditAiNativeSdlc, false);
assert.strictEqual(h.dualEditAcademy4d, false);
assert.strictEqual(h.dualEditTogetherResearchDoc, false);
assert.strictEqual(h.capacityIsNotFrontier, true);
assert.strictEqual(h.workerLive, false);
assert.strictEqual(h.capturedRevenueUsd, 0);

const chat = classifyWorkload({ claimedClass: 'chat' });
assert.strictEqual(chat.class, 'serverless');
assert.strictEqual(chat.offered, true);

const batch = classifyWorkload({ claimedClass: 'overnight' });
assert.strictEqual(batch.class, 'batch');

const promptBatch = classifyWorkload({ prompt: 'run the overnight eval on the VPS' });
assert.strictEqual(promptBatch.class, 'batch');

const dedicated = classifyWorkload({ claimedClass: 'gpu' });
assert.strictEqual(dedicated.class, 'dedicated');
assert.strictEqual(dedicated.offered, false);

const promptDedicated = classifyWorkload({
  claimedClass: 'chat',
  prompt: 'keep us at the frontier on Instant Clusters',
});
assert.strictEqual(promptDedicated.class, 'dedicated');
assert.strictEqual(promptDedicated.offered, false);

const cap = capacityIsNotFrontier({ quotaRemainingUsd: 8.5, vpsUp: true });
assert.strictEqual(cap.capacity, true);
assert.strictEqual(cap.liveFromCapacity, false);
assert.strictEqual(cap.capacityIsNotFrontier, true);

const talk = researchToProduction({
  blogUrl: 'https://www.together.ai/ainativeconf',
});
assert.strictEqual(talk.ok, false);
assert.strictEqual(talk.reason, 'talk_is_not_production');

const vendorArtifact = researchToProduction({
  evalArtifact: 'https://www.together.ai/blog/flashattention-4',
  deploySha: FAKE_SHA,
  testsPass: true,
});
assert.strictEqual(vendorArtifact.ok, false);
assert.ok(
  vendorArtifact.reason === 'vendor_blog_is_not_receipt' ||
    vendorArtifact.reason === 'url_is_not_eval_artifact',
);

const missingSha = researchToProduction({
  evalArtifact: 'tests/test-hosted-together-native.js',
  testsPass: true,
});
assert.strictEqual(missingSha.reason, 'deploy_sha_missing');

const testsFail = researchToProduction({
  evalArtifact: 'tests/test-hosted-together-native.js',
  deploySha: FAKE_SHA,
  testsPass: false,
});
assert.strictEqual(testsFail.reason, 'tests_not_pass');

const researchOk = researchToProduction({
  evalArtifact: 'tests/test-hosted-together-native.js',
  deploySha: FAKE_SHA,
  testsPass: true,
});
assert.strictEqual(researchOk.ok, true);
assert.strictEqual(researchOk.liveClaim, false);

const quotaGrade = gradeHostedClaim({
  claimedClass: 'chat',
  quotaRemainingUsd: 8.5,
  vpsUp: true,
});
assert.strictEqual(quotaGrade.status, 'NOT_LIVE');
assert.strictEqual(quotaGrade.liveClaim, false);
assert.ok(quotaGrade.reasons.includes('capacity_is_not_frontier'));
assert.ok(quotaGrade.reasons.includes('eval_artifact_missing'));

const gpuGrade = gradeHostedClaim({ claimedClass: 'dedicated' });
assert.strictEqual(gpuGrade.status, 'NOT_OFFERED');
assert.strictEqual(gpuGrade.liveClaim, false);

const batchGrade = gradeHostedClaim({
  claimedClass: 'batch',
  evalArtifact: 'evals/hosted-together-native.json',
  deploySha: FAKE_SHA,
  testsPass: true,
  workerLive: true,
});
assert.strictEqual(batchGrade.status, 'BATCH_COMPLETE');
assert.strictEqual(batchGrade.liveClaim, false);
assert.ok(batchGrade.reasons.includes('batch_is_not_live'));

const unpaidSla = gradeHostedClaim({
  claimedClass: 'provisioned',
  evalArtifact: 'tests/test-hosted-together-native.js',
  deploySha: FAKE_SHA,
  testsPass: true,
  workerLive: true,
  stripePaid: false,
});
assert.strictEqual(unpaidSla.liveClaim, false);
assert.ok(unpaidSla.reasons.includes('provisioned_requires_paid'));

const paidSla = gradeHostedClaim({
  claimedClass: 'provisioned',
  evalArtifact: 'tests/test-hosted-together-native.js',
  deploySha: FAKE_SHA,
  testsPass: true,
  workerLive: true,
  stripePaid: true,
});
assert.strictEqual(paidSla.liveClaim, true);
assert.strictEqual(paidSla.status, 'LIVE');
assert.strictEqual(paidSla.workerLive, false);

const frontier = gradeHostedClaim({
  claimedClass: 'serverless',
  evalArtifact: 'tests/test-hosted-together-native.js',
  deploySha: FAKE_SHA,
  testsPass: true,
  workerLive: true,
});
assert.strictEqual(frontier.liveClaim, true);
assert.strictEqual(frontier.status, 'LIVE');
assert.strictEqual(frontier.workerLive, false);

const unwired = gradeHostedClaim({
  claimedClass: 'serverless',
  evalArtifact: 'tests/test-hosted-together-native.js',
  deploySha: FAKE_SHA,
  testsPass: true,
  workerLive: false,
});
assert.strictEqual(unwired.liveClaim, false);

const attached = attachTogetherNative(
  { liveClaim: true, outcome: 'done' },
  { claimedClass: 'chat', quotaRemainingUsd: 10, vpsUp: true },
);
assert.strictEqual(attached.liveClaim, false);
assert.strictEqual(attached.togetherNative.capacityIsNotFrontier, true);
assert.strictEqual(attached.togetherNative.liveClaim, false);

const attachedLive = attachTogetherNative(
  { liveClaim: true },
  {
    claimedClass: 'serverless',
    evalArtifact: 'tests/test-hosted-together-native.js',
    deploySha: FAKE_SHA,
    testsPass: true,
    workerLive: true,
  },
);
assert.strictEqual(attachedLive.liveClaim, true);

const origWrite = process.stdout.write.bind(process.stdout);
let buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const missingCode = main(['--json']);
process.stdout.write = origWrite;
const missing = JSON.parse(buf);
assert.strictEqual(missingCode, 1);
assert.strictEqual(missing.status, 'UNAVAILABLE');
assert.strictEqual(missing.liveClaim, false);

buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const demoCode = main(['--json', '--demo']);
process.stdout.write = origWrite;
const demo = JSON.parse(buf);
assert.strictEqual(demoCode, 0);
assert.strictEqual(demo.status, 'SUCCESS');
assert.strictEqual(demo.liveClaim, false);
assert.strictEqual(demo.workerLive, false);
const byName = Object.fromEntries(demo.cases.map((c) => [c.name, c]));
assert.strictEqual(byName.quota_only.status, 'NOT_LIVE');
assert.strictEqual(byName.conference_talk.liveClaim, false);
assert.strictEqual(byName.dedicated_gpu.status, 'NOT_OFFERED');
assert.strictEqual(byName.batch_eval.status, 'BATCH_COMPLETE');
assert.strictEqual(byName.frontier_receipt.status, 'LIVE');
assert.strictEqual(byName.frontier_receipt.liveClaim, true);

const tmp = path.join(os.tmpdir(), 'hosted-together-grade.json');
fs.writeFileSync(
  tmp,
  JSON.stringify({
    claimedClass: 'chat',
    quotaRemainingUsd: 1,
    vpsUp: true,
  }),
);
buf = '';
process.stdout.write = (chunk) => {
  buf += String(chunk);
  return true;
};
const fileCode = main(['--json', '--grade', tmp]);
process.stdout.write = origWrite;
const fromFile = JSON.parse(buf);
assert.strictEqual(fileCode, 0);
assert.strictEqual(fromFile.liveClaim, false);
assert.ok(fromFile.reasons.includes('capacity_is_not_frontier'));

process.stdout.write('ok tests/test-hosted-together-native.js\n');
