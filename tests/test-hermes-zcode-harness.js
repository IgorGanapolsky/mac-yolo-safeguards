'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildHarness,
  buildRemoteReceipt,
  detectSourceFeatures,
  parseArgs,
  redact,
  renderMarkdown,
  writeArtifacts,
} = require('../tools/hermes-zcode-harness');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const ZCODE_TEXT = [
  'ZCode, the Official Harness for GLM-5.2, Is Live',
  'Goal Mode with independent verification: set /goal and let a separate verifier confirm when it is actually done.',
  'Custom subagents: assign each subagent its own model and permissions.',
  'Remote session control: no app needed. Just scan a QR code and steer sessions on your desktop.',
  'Coding Plan users get 1.5x usual quota in ZCode.',
].join('\n');

const FAKE_PAT = `ghp_${'A'.repeat(36)}`;
const FAKE_API_KEY = `sk-${'1'.repeat(24)}`;
const FAKE_ENV_KEY_LINE = `Z_AI_API_${'KEY'}=secret-value`;

function fakeLoopState(overrides = {}) {
  return {
    repo: { branch: 'codex/hermes-zcode-harness', head: 'abc1234' },
    git: { dirtyCount: 0 },
    plan: {
      activeTasks: [{
        id: 'T-133',
        title: 'Close Hermes SDD harness gaps from July 10 PDF audit',
        status: 'in_progress',
        owner: 'codex',
        files: '`tools/hermes-zcode-harness.js`, `tools/hermes-retrieval-harness.js`',
      }],
    },
    latestProof: {
      exists: true,
      e2e: 'skipped',
      detail: 'load guard skipped continuous E2E',
    },
    ...overrides,
  };
}

test('parseArgs supports bounded CLI inputs', () => {
  const args = parseArgs([
    '--pdf', '/tmp/zai.pdf',
    '--task', 'Improve Hermes',
    '--json',
    '--write',
    '--now', '2026-07-02T21:30:00Z',
    '--host', 'test-host',
  ]);
  assert.strictEqual(args.pdf, '/tmp/zai.pdf');
  assert.strictEqual(args.task, 'Improve Hermes');
  assert.strictEqual(args.json, true);
  assert.strictEqual(args.write, true);
  assert.strictEqual(args.host, 'test-host');
  assert.throws(() => parseArgs(['--missing']), /Unknown argument/);
});

test('detectSourceFeatures extracts the ZCode announcement signals', () => {
  const features = detectSourceFeatures(ZCODE_TEXT);
  assert.strictEqual(features.filter((feature) => feature.present).length, 5);
  assert(features.find((feature) => feature.id === 'goal_mode_independent_verification').present);
  assert(features.find((feature) => feature.id === 'custom_subagents').present);
  assert(features.find((feature) => feature.id === 'remote_qr_session_control').present);
  assert(features.find((feature) => feature.id === 'coding_plan_quota_boost').present);
});

test('buildHarness creates independent goal verifier and per-subagent permissions', () => {
  const harness = buildHarness({
    sourceText: ZCODE_TEXT,
    task: 'Improve Hermes infrastructure and harness everywhere',
    pdf: '/Users/igorganapolsky/Downloads/zai.pdf',
    now: '2026-07-02T21:30:00Z',
    host: 'test-host',
    loopState: fakeLoopState(),
  });

  assert.strictEqual(harness.source.featureCount, 5);
  assert.strictEqual(harness.goal.implementer, 'implementation_worker');
  assert.strictEqual(harness.goal.verifier, 'independent_verifier');
  assert.strictEqual(harness.goal.selfCompletionAllowed, false);
  assert(harness.goal.gates.some((gate) => gate.id === 'source_pdf_features' && gate.status === 'pass'));
  assert(harness.goal.gates.some((gate) => gate.id === 'plan_ownership' && gate.status === 'pass' && gate.evidence.includes('T-133')));

  for (const subagent of harness.subagents) {
    assert(subagent.model);
    assert(Array.isArray(subagent.permissions) && subagent.permissions.length > 0);
    assert(Array.isArray(subagent.deniedPermissions) && subagent.deniedPermissions.length > 0);
    assert(subagent.verifier);
  }

  const implementer = harness.subagents.find((subagent) => subagent.id === 'implementation_worker');
  const verifier = harness.subagents.find((subagent) => subagent.id === 'independent_verifier');
  assert(implementer.deniedPermissions.includes('edit_unclaimed_files'));
  assert(verifier.deniedPermissions.includes('edit_implementation'));
});

test('remote control receipt is QR-safe and denies destructive actions', () => {
  const receipt = buildRemoteReceipt({
    task: 'Improve Hermes',
    source: {
      path: '/Users/igorganapolsky/Downloads/zai.pdf',
      text: `${ZCODE_TEXT}\n${FAKE_ENV_KEY_LINE}\n${FAKE_API_KEY}`,
    },
    now: '2026-07-02T21:31:00Z',
    host: 'test-host',
  });
  assert(receipt.qrPayload.startsWith('hermes://remote-control/'));
  assert.strictEqual(receipt.redactionCheck.ok, true);
  assert(receipt.allowedActions.includes('request_approval'));
  assert(receipt.deniedActions.includes('merge_pr'));
  assert(receipt.deniedActions.includes('delete_file'));
  assert(!JSON.stringify(receipt).includes('secret-value'));
  assert(!JSON.stringify(receipt).includes(FAKE_API_KEY));
});

test('recommendations keep quota metadata separate from provider changes', () => {
  const harness = buildHarness({
    sourceText: ZCODE_TEXT,
    task: 'Improve Hermes infrastructure and harness everywhere',
    now: '2026-07-02T21:32:00Z',
    host: 'test-host',
    loopState: fakeLoopState(),
  });
  assert.strictEqual(harness.policy.providerCallsMade, false);
  assert.strictEqual(harness.policy.providerDefaultChanged, false);
  assert.strictEqual(harness.policy.spendAllowedByThisHarness, false);
  const quota = harness.recommendations.find((item) => item.id === 'coding_plan_quota_metadata_only');
  assert.strictEqual(quota.status, 'observe_only');
  assert(quota.proofGate.includes('default route remains local'));
});

test('redaction covers common secret shapes', () => {
  const text = redact(`TOKEN=abc123 ${FAKE_PAT} ${FAKE_API_KEY}`);
  assert(!text.includes('abc123'));
  assert(!text.includes(FAKE_PAT));
  assert(!text.includes(FAKE_API_KEY));
});

test('writeArtifacts writes JSON and Markdown receipts', () => {
  const harness = buildHarness({
    sourceText: ZCODE_TEXT,
    task: 'Improve Hermes infrastructure and harness everywhere',
    now: '2026-07-02T21:33:00Z',
    host: 'test-host',
    loopState: fakeLoopState(),
  });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-zcode-harness-'));
  const artifacts = writeArtifacts(harness, outDir);
  assert(fs.existsSync(artifacts.jsonPath));
  assert(fs.existsSync(artifacts.mdPath));
  const md = renderMarkdown(harness);
  assert(md.includes('Hermes ZCode Harness'));
  assert(md.includes('Redaction check: pass'));
  assert(md.includes('Provider calls made: no'));
  fs.rmSync(outDir, { recursive: true, force: true });
});
