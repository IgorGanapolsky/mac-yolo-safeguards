#!/usr/bin/env node
'use strict';

/**
 * Pure unit tests for tools/coding-context-pack.js (no live gh/Linear).
 */

const assert = require('assert');
const {
  scoreIssue,
  rankIssues,
  prTouchesIssue,
  routeSkills,
  shipClaimGate,
  extractAcceptanceHints,
  parseArgs,
  buildContextContract,
  buildVerificationContract,
  validateVerificationReceipt,
  formatMinimal,
  parseLinearMapText,
} = require('../tools/coding-context-pack.js');

function testParseArgs() {
  const a = parseArgs(['--json', '--issue', '132', '--write']);
  assert.strictEqual(a.json, true);
  assert.strictEqual(a.issue, 132);
  assert.strictEqual(a.write, true);
  const b = parseArgs(['--issue=141', '--minimal']);
  assert.strictEqual(b.issue, 141);
  assert.strictEqual(b.minimal, true);
  const c = parseArgs(['--verify-receipt', '/tmp/receipt.json', '--json']);
  assert.strictEqual(c.verifyReceipt, '/tmp/receipt.json');
}

function testPrTouches() {
  assert.ok(prTouchesIssue({ title: 'fix #132 identity', body: '' }, 132));
  assert.ok(prTouchesIssue({ title: 'chore', body: 'Closes GH-#242' }, 242));
  assert.ok(!prTouchesIssue({ title: 'unrelated', body: 'see #13 only' }, 132));
}

function testScoreRanking() {
  const prs = [
    {
      number: 1418,
      title: 'fix connection identity for #132',
      body: '',
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      statusCheckRollup: [],
    },
  ];
  const e2e = { unit: 'pass', e2e: 'skipped' };
  const issues = [
    {
      number: 242,
      title: 'Public: Hermes Mobile is live',
      labels: [{ name: 'status:blocked' }, { name: 'area:hermes-mobile' }],
    },
    {
      number: 141,
      title: 'Split notifications',
      labels: [{ name: 'priority:p1' }, { name: 'status:ready' }, { name: 'area:hermes-mobile' }],
    },
    {
      number: 132,
      title: 'P0: make connection identity release-blocking',
      labels: [
        { name: 'priority:p0' },
        { name: 'status:ready' },
        { name: 'bug' },
        { name: 'area:hermes-mobile' },
      ],
    },
  ];
  const ranked = rankIssues(issues, prs, e2e);
  assert.strictEqual(ranked[0].number, 132, 'p0 + ready + open PR should win');
  assert.ok(ranked[0]._score > ranked[1]._score);
  assert.ok(ranked.find((i) => i.number === 242)._score < ranked.find((i) => i.number === 141)._score);

  const blocked = scoreIssue(issues[0], [], e2e);
  assert.ok(blocked.reasons.includes('blocked'));
}

function testSkills() {
  const iss = {
    number: 132,
    title: 'P0: connection identity + auth',
    labels: [{ name: 'area:hermes-mobile' }],
  };
  const skills = routeSkills(iss);
  const ids = skills.map((s) => s.id);
  assert.ok(ids.includes('three-bus-ship-cycle'));
  assert.ok(ids.includes('troubleshoot-hermes-mobile-connectivity'));
  assert.ok(ids.includes('verify-hermes-mobile-ship'));
}

function testShipGate() {
  assert.strictEqual(shipClaimGate(null).ok, false);
  assert.strictEqual(shipClaimGate({ unit: 'pass', e2e: 'pass' }).ok, true);
  assert.strictEqual(shipClaimGate({ unit: 'fail', e2e: 'pass' }).ok, false);
  const mobile = shipClaimGate({ unit: 'pass', e2e: 'skipped' }, { requireE2ePass: true });
  assert.strictEqual(mobile.ok, false);
  assert.ok(mobile.blockers.some((b) => /e2e=/.test(b)));
}

function testAcHints() {
  const body = `## Acceptance\n\n- [ ] unit tests green\n- [x] PR open\n\nSome prose.`;
  const hints = extractAcceptanceHints(body);
  assert.ok(hints.length >= 2);
  assert.ok(hints.some((h) => /unit tests/.test(h)));
}

function testSixBlockContextContract() {
  const generatedAt = '2026-08-26T18:00:00.000Z';
  const focus = {
    number: 2116,
    title: 'Context contract',
    url: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/2116',
    labels: [{ name: 'priority:p1' }],
    linear_id: 'AGENT-544',
  };
  const contract = buildContextContract({
    repo: 'IgorGanapolsky/mac-yolo-safeguards',
    generatedAt,
    focus,
    acceptanceHints: ['- [ ] six blocks', '- [ ] exact-head CI'],
    skills: [{ id: 'context-vault', path: '.agents/skills/context-vault/SKILL.md' }],
    e2e: { unit: 'pass', e2e: 'skipped', updatedAt: generatedAt },
    shipGate: { ok: false, blockers: ['e2e=skipped'] },
  });

  assert.deepStrictEqual(
    contract.blocks.map((block) => block.id),
    ['objective', 'evidence', 'examples', 'procedure', 'constraints', 'rubric'],
  );
  assert.ok(contract.blocks.every((block) => block.provenance?.length > 0));
  assert.strictEqual(contract.budget.within_budget, true);
  assert.ok(contract.budget.estimated_tokens > 0);
  const examples = contract.blocks.find((block) => block.id === 'examples');
  assert.ok(examples.items.some((item) => item.kind === 'good'));
  assert.ok(examples.items.some((item) => item.kind === 'bad'));
  const rubric = contract.blocks.find((block) => block.id === 'rubric');
  assert.ok(rubric.items.some((item) => /behave as intended/i.test(item)));
  const evidence = contract.blocks.find((block) => block.id === 'evidence');
  assert.ok(evidence.items.some((item) => item.linear_id === 'AGENT-544'));
}

function testMinimalPackKeepsContractWithoutFocus() {
  const output = formatMinimal({
    focus: null,
    context_contract: { blocks: new Array(6), budget: { estimated_tokens: 900, max_estimated_tokens: 1600 } },
    verification_contract: { layers: new Array(4) },
  });
  assert.match(output, /no open issues/);
  assert.match(output, /context=6\/6 blocks/);
  assert.match(output, /verify=4 layers/);
}

function testContextContractBoundsAdversarialInputs() {
  const huge = 'x'.repeat(5000);
  const contract = buildContextContract({
    repo: huge,
    focus: { number: 1, title: huge, url: `https://example.com/${huge}`, linear_id: 'AGENT-1' },
    acceptanceHints: new Array(8).fill(huge),
    skills: new Array(8).fill(null).map(() => ({ id: huge, path: huge })),
    e2e: { unit: huge, e2e: huge, updatedAt: huge, path: huge },
    shipGate: { ok: false, blockers: [huge, huge] },
  });
  assert.strictEqual(contract.budget.within_budget, true);
  assert.ok(contract.budget.estimated_tokens <= contract.budget.max_estimated_tokens);
}

function testLinearClaimMirrorMapsGitHubIssue() {
  const map = {};
  parseLinearMapText(`---\nlinear_id: AGENT-544\n---\n# Linear claim AGENT-544\n\n- **Title:** GH #2116: grounded context`, map);
  assert.strictEqual(map[2116], 'AGENT-544');
}

function goodMergeReceipt(now) {
  const head = 'a'.repeat(40);
  return {
    schema: 'agent-verification-receipt/v1',
    stage: 'merge',
    claims: ['code_change'],
    issue_url: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/issues/2116',
    linear_id: 'AGENT-544',
    plan_claim: 'codex-context-contract',
    changed_files: ['tools/coding-context-pack.js'],
    head_sha: head,
    tests: [{ command: 'node tests/test-coding-context-pack.js', exit_code: 0 }],
    pull_request: {
      url: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/pull/2117',
      head_sha: head,
    },
    ci: {
      status: 'pass',
      head_sha: head,
      observed_at: now,
      run_url: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards/actions/runs/123',
      required_checks: [{ name: 'CodeQL', conclusion: 'SUCCESS' }],
    },
    uncertainties: [],
  };
}

function testLayeredVerificationContract() {
  const contract = buildVerificationContract();
  assert.deepStrictEqual(contract.surfaces, ['cli', 'ide']);
  assert.deepStrictEqual(
    contract.layers.map((layer) => layer.id),
    ['local', 'repository_pr', 'ci', 'runtime_provider'],
  );
  assert.ok(contract.review_questions.some((item) => /secure|reliability/i.test(item)));
  assert.ok(contract.metrics.includes('first_attempt_ci_pass'));
}

function testVerificationReceiptValidator() {
  const now = '2026-08-26T18:00:00.000Z';
  const good = goodMergeReceipt(now);
  assert.strictEqual(validateVerificationReceipt(good, { now }).ok, true);

  const missingTests = { ...good, tests: [] };
  const missingTestsResult = validateVerificationReceipt(missingTests, { now });
  assert.strictEqual(missingTestsResult.ok, false);
  assert.ok(missingTestsResult.errors.some((error) => error.code === 'TEST_EVIDENCE_MISSING'));

  const wrongHead = { ...good, ci: { ...good.ci, head_sha: 'b'.repeat(40) } };
  const wrongHeadResult = validateVerificationReceipt(wrongHead, { now });
  assert.strictEqual(wrongHeadResult.ok, false);
  assert.ok(wrongHeadResult.errors.some((error) => error.code === 'CI_HEAD_MISMATCH'));

  const stale = { ...good, ci: { ...good.ci, observed_at: '2026-08-24T17:59:59.000Z' } };
  const staleResult = validateVerificationReceipt(stale, { now });
  assert.strictEqual(staleResult.ok, false);
  assert.ok(staleResult.errors.some((error) => error.code === 'CI_STALE'));

  const liveWithoutRuntime = { ...good, stage: 'runtime', claims: ['live'] };
  const liveResult = validateVerificationReceipt(liveWithoutRuntime, { now });
  assert.strictEqual(liveResult.ok, false);
  assert.ok(liveResult.errors.some((error) => error.code === 'RUNTIME_PROOF_MISSING'));
}

function main() {
  testParseArgs();
  testPrTouches();
  testScoreRanking();
  testSkills();
  testShipGate();
  testAcHints();
  testSixBlockContextContract();
  testMinimalPackKeepsContractWithoutFocus();
  testContextContractBoundsAdversarialInputs();
  testLinearClaimMirrorMapsGitHubIssue();
  testLayeredVerificationContract();
  testVerificationReceiptValidator();
  console.log('test-coding-context-pack: ok');
}

main();
