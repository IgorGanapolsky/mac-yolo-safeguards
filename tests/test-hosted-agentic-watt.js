#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  FAKE_SHA,
  EXAMPLE_SHA,
  HOSTED_VPS_WATT_PROXY,
  honesty,
  isTrueFlag,
  normalizeTurns,
  classifySession,
  contextReuse,
  gradeHostedWatt,
  attachAgenticWatt,
  main,
} = require('../tools/hosted-agentic-watt');

const h = honesty();
assert.strictEqual(h.clonedVeraRubin, false);
assert.strictEqual(h.clonedBlackwell, false);
assert.strictEqual(h.clonedAgentX, false);
assert.strictEqual(h.clonedDynamo, false);
assert.strictEqual(h.clonedNvl72, false);
assert.strictEqual(h.dualEditNvidiaNemoSwitchyard, false);
assert.strictEqual(h.dualEditDashboardClient, false);
assert.strictEqual(h.nvidiaMegawattClaim, false);
assert.strictEqual(h.vpsWattProxy, HOSTED_VPS_WATT_PROXY);
assert.strictEqual(h.workerLive, false);
assert.strictEqual(h.capturedRevenueUsd, 0);

assert.strictEqual(isTrueFlag(true), true);
assert.strictEqual(isTrueFlag('false'), false);
assert.strictEqual(isTrueFlag('true'), false);
assert.strictEqual(isTrueFlag(1), false);

const chat = classifySession({ claimedClass: 'chat' }, [
  { promptTokens: 8000, outputTokens: 1000, hasToolCall: false },
]);
assert.strictEqual(chat.class, 'chat');
assert.strictEqual(chat.offered, true);

const agenticTools = classifySession({}, [
  { promptTokens: 100, outputTokens: 10, hasToolCall: true },
]);
assert.strictEqual(agenticTools.class, 'agentic');
assert.strictEqual(agenticTools.reason, 'tool_calls');

const growing = classifySession({}, [
  { promptTokens: 1000, outputTokens: 50, hasToolCall: false },
  { promptTokens: 4000, outputTokens: 80, hasToolCall: false },
]);
assert.strictEqual(growing.class, 'agentic');
assert.strictEqual(growing.reason, 'growing_context');

const factory = classifySession(
  { claimedClass: 'vera rubin', claimedTokensPerMegawatt: 30 },
  [],
);
assert.strictEqual(factory.class, 'nvidia_factory');
assert.strictEqual(factory.offered, false);

const turns = normalizeTurns({
  turns: [
    { promptTokens: 2000, outputTokens: 80, ttftMs: 300, toolGapMs: 8000, e2eMs: 9000 },
    { promptTokens: 4200, outputTokens: 120, ttftMs: 250, e2eMs: 1500 },
  ],
});
assert.strictEqual(turns[0].hasToolCall, true);
assert.strictEqual(turns[0].decodeMs, 700);
assert.strictEqual(turns[1].toolGapMs, 0);

const reuse = contextReuse(turns);
assert.strictEqual(reuse.reusedPromptTokens, 2000);
assert.strictEqual(reuse.billedPrefillTokens, 4200);

const nvidiaGrade = gradeHostedWatt({
  claimedClass: 'chat',
  prompt: 'NVL72 AgentX 160 TPS',
});
assert.strictEqual(nvidiaGrade.status, 'NOT_OFFERED');
assert.strictEqual(nvidiaGrade.liveClaim, false);
assert.ok(nvidiaGrade.reasons.includes('nvidia_factory_not_offered'));

const blog = gradeHostedWatt({
  blogUrl:
    'https://developer.nvidia.com/blog/nvidia-vera-rubin-and-blackwell-set-a-new-standard-for-agentic-ai-performance-per-watt/',
});
assert.strictEqual(blog.liveClaim, false);
assert.ok(blog.reasons.includes('talk_is_not_production'));

const stringFalse = gradeHostedWatt({
  turns: [{ promptTokens: 10, outputTokens: 5, ttftMs: 10, e2eMs: 20, hasToolCall: true }],
  evalArtifact: 'tests/test-hosted-agentic-watt.js',
  deploySha: EXAMPLE_SHA,
  testsPass: 'false',
  workerLive: true,
});
assert.ok(stringFalse.reasons.includes('tests_not_pass'));
assert.strictEqual(stringFalse.liveClaim, false);

const placeholder = gradeHostedWatt({
  turns: [{ promptTokens: 10, outputTokens: 5, ttftMs: 10, e2eMs: 20, hasToolCall: true }],
  evalArtifact: 'tests/test-hosted-agentic-watt.js',
  deploySha: FAKE_SHA,
  testsPass: true,
  workerLive: true,
});
assert.strictEqual(placeholder.liveClaim, false);
assert.ok(placeholder.reasons.includes('deploy_sha_placeholder'));

const missingFile = gradeHostedWatt({
  turns: [{ promptTokens: 10, outputTokens: 5, ttftMs: 10, e2eMs: 20, hasToolCall: true }],
  evalArtifact: 'tests/does-not-exist-agentic-watt.js',
  deploySha: EXAMPLE_SHA,
  testsPass: true,
  workerLive: true,
});
assert.ok(missingFile.reasons.includes('eval_artifact_not_found'));

const unusable = gradeHostedWatt({
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
});
assert.strictEqual(unusable.usable, false);
assert.strictEqual(unusable.status, 'UNUSABLE');
assert.strictEqual(unusable.liveClaim, false);
assert.ok(unusable.reasons.includes('interactivity_unusable'));
assert.strictEqual(unusable.watt.notTokensPerMegawatt, true);
assert.strictEqual(unusable.workerLive, false);

const liveOk = gradeHostedWatt({
  turns: [
    {
      promptTokens: 2000,
      outputTokens: 80,
      ttftMs: 300,
      toolGapMs: 400,
      e2eMs: 1200,
      hasToolCall: true,
    },
    { promptTokens: 2800, outputTokens: 90, ttftMs: 200, e2eMs: 900 },
  ],
  evalArtifact: 'tests/test-hosted-agentic-watt.js',
  deploySha: EXAMPLE_SHA,
  testsPass: true,
  workerLive: true,
});
assert.strictEqual(liveOk.session.class, 'agentic');
assert.strictEqual(liveOk.usable, true);
assert.strictEqual(liveOk.liveClaim, true);
assert.strictEqual(liveOk.status, 'LIVE');
assert.strictEqual(liveOk.workerLive, false);
assert.ok(liveOk.watt.tokensPerWattHour > 0);
assert.ok(liveOk.reuse.reusedPromptTokens > 0);

const liveInput = {
  turns: [
    {
      promptTokens: 2000,
      outputTokens: 80,
      ttftMs: 300,
      toolGapMs: 400,
      e2eMs: 1200,
      hasToolCall: true,
    },
    { promptTokens: 2800, outputTokens: 90, ttftMs: 200, e2eMs: 900 },
  ],
  evalArtifact: 'tests/test-hosted-agentic-watt.js',
  deploySha: EXAMPLE_SHA,
  testsPass: true,
  workerLive: true,
};
const attached = attachAgenticWatt({ liveClaim: true }, liveInput);
assert.strictEqual(attached.liveClaim, true);
assert.strictEqual(attached.agenticWatt.notTokensPerMegawatt, true);

const blocked = attachAgenticWatt({ liveClaim: true }, { claimedTokensPerMegawatt: 80 });
assert.strictEqual(blocked.liveClaim, false);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-watt-'));
const gradeFile = path.join(tmp, 'grade.json');
fs.writeFileSync(
  gradeFile,
  JSON.stringify({
    turns: [{ promptTokens: 10, outputTokens: 5, ttftMs: 10, e2eMs: 40, hasToolCall: true }],
    evalArtifact: 'tests/test-hosted-agentic-watt.js',
    deploySha: EXAMPLE_SHA,
    testsPass: true,
    workerLive: true,
  }),
);

const origOut = process.stdout.write.bind(process.stdout);
let buf = '';
process.stdout.write = (chunk) => {
  buf += chunk;
  return true;
};
try {
  const demoExit = main(['--demo', '--json']);
  assert.strictEqual(demoExit, 0);
  const demo = JSON.parse(buf);
  assert.strictEqual(demo.liveClaim, false);
  assert.strictEqual(demo.clonedVeraRubin, false);
  assert.ok(demo.cases.some((c) => c.name === 'vera_rubin_30x_not_offered' && c.status === 'NOT_OFFERED'));
  assert.ok(demo.cases.some((c) => c.name === 'slow_e2e_unusable_even_if_watt_looks_high' && c.status === 'UNUSABLE'));
  buf = '';
  const gradeExit = main(['--grade', gradeFile, '--json']);
  assert.strictEqual(gradeExit, 0);
  const graded = JSON.parse(buf);
  assert.strictEqual(graded.liveClaim, true);
  assert.strictEqual(graded.workerLive, false);
} finally {
  process.stdout.write = origOut;
}

console.log('test-hosted-agentic-watt: ok');
