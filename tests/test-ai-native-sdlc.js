#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  SOURCE,
  INTENT_CONTRACT,
  catalog,
  artifactChain,
  nextArtifact,
  productionGate,
  testEditPolicy,
  renderIntent,
  incidentToIntent,
  auditRepo,
  getHealthStatus,
} = require('../tools/ai-native-sdlc');

function main() {
  assert.strictEqual(SOURCE, 'https://claude.com/blog/the-ai-native-sdlc-playbook');
  assert.strictEqual(INTENT_CONTRACT, '.intent/contract.yaml');

  const have = catalog('HAVE').map((p) => p.id);
  assert.ok(have.includes('agents-md'));
  assert.ok(have.includes('plan-md'));
  assert.ok(have.includes('skills'));
  assert.ok(have.includes('hooks'));
  assert.ok(have.includes('worktrees'));
  assert.ok(have.includes('feedback-loop'));
  assert.ok(have.includes('pr-review-loop'));

  const skip = catalog('SKIP').map((p) => p.id);
  assert.ok(skip.includes('claude-evals-yaml'));
  assert.ok(skip.includes('mdm-managed-settings'));
  assert.ok(skip.includes('western-electric-auto-quarantine'));
  assert.ok(skip.includes('continuity-close-loop'));
  assert.ok(skip.includes('claude-code-auto-mode'));
  assert.ok(skip.includes('claude-tag-on-call'));

  const adapter = catalog('ADAPTER').map((p) => p.id);
  assert.ok(adapter.includes('intent-md'));
  assert.ok(adapter.includes('spec-md'));
  assert.ok(adapter.includes('review-md'));
  assert.ok(adapter.includes('production-gate'));
  assert.ok(adapter.includes('fix-code-not-test'));
  assert.ok(adapter.includes('maintain-writeback'));

  for (const row of catalog()) {
    assert.strictEqual(row.liveClaim, row.verdict === 'HAVE');
    assert.strictEqual(row.documentation_url, SOURCE);
  }

  const chain = artifactChain();
  assert.strictEqual(chain.length, 6);
  assert.strictEqual(chain[0].artifact, 'intent.md');
  assert.strictEqual(chain[5].next, 'intent.md');
  assert.strictEqual(nextArtifact('intent.md'), 'spec.md');
  assert.strictEqual(nextArtifact('plan.md'), 'tests/diff');
  assert.strictEqual(nextArtifact('build'), 'tests/diff');
  assert.strictEqual(nextArtifact('tests/diff'), 'PR/REVIEW.md');
  assert.strictEqual(nextArtifact('incident'), 'intent.md');

  const dev = productionGate({ env: 'development', command: 'npm run deploy:dev' });
  assert.strictEqual(dev.decision, 'ALLOW');
  assert.strictEqual(dev.wiredAsClaudeHook, false);
  assert.strictEqual(dev.liveClaim, false);

  const blocked = productionGate({
    env: 'production',
    command: 'wrangler deploy --env production',
    releaseApproval: '',
  });
  assert.strictEqual(blocked.decision, 'BLOCK');
  assert.match(blocked.reason, /RELEASE_APPROVAL/);

  const allowed = productionGate({
    env: 'production',
    command: 'wrangler deploy --env production',
    releaseApproval: 'igor-2026-08-24',
  });
  assert.strictEqual(allowed.decision, 'ALLOW');

  const dry = productionGate({
    command: 'wrangler deploy --env production --dry-run',
    env: 'production',
  });
  assert.strictEqual(dry.decision, 'ALLOW');

  const fixBlock = testEditPolicy({ taskKind: 'bugfix', path: 'tests/test-payment.js' });
  assert.strictEqual(fixBlock.decision, 'BLOCK');
  assert.match(fixBlock.reason, /Fix the code, not the test/);

  const featureTest = testEditPolicy({ taskKind: 'feature', path: 'tests/test-payment.js' });
  assert.strictEqual(featureTest.decision, 'ALLOW');

  const fixCode = testEditPolicy({ taskKind: 'bugfix', path: 'tools/ai-native-sdlc.js' });
  assert.strictEqual(fixCode.decision, 'ALLOW');

  const repo = path.resolve(__dirname, '..');
  const contractPath = path.join(repo, INTENT_CONTRACT);
  assert.ok(fs.existsSync(contractPath), '.intent/contract.yaml must remain (AGENT-407)');
  const beforeHash = fs.readFileSync(contractPath);

  const rendered = renderIntent({
    title: 'Claims status self-service',
    problem: 'Customers phone for claim status',
    outcome: 'Portal shows status and next step',
    users: 'Claims handlers',
    constraints: 'No new PII',
  });
  assert.match(rendered.content, /# Intent: Claims status self-service/);
  assert.match(rendered.content, /Customers phone for claim status/);
  assert.match(rendered.content, /No new PII/);
  assert.strictEqual(rendered.written, null);
  assert.ok(rendered.dualEditForbidden.includes(INTENT_CONTRACT));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-intent-'));
  try {
    const wrote = renderIntent({
      title: 'Tmp only',
      problem: 'tmp',
      outcome: 'tmp',
    }, { repoRoot: repo, write: true, dir: tmp });
    assert.ok(wrote.written && wrote.written.startsWith(tmp));
    assert.ok(fs.existsSync(wrote.written));
    assert.ok(!wrote.written.includes('.intent/'));

    const incident = incidentToIntent({
      metric: 'ci_test_failure_rate',
      evidence: 'synthetic fixture, not live',
    }, { repoRoot: repo, write: true, dir: tmp });
    assert.match(incident.content, /Incident: ci_test_failure_rate/);
    assert.match(incident.content, /No auto-merge/);
    assert.match(incident.content, /no Continuity/i);
    assert.ok(incident.written.startsWith(tmp));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const afterHash = fs.readFileSync(contractPath);
  assert.deepStrictEqual(afterHash, beforeHash, 'must not mutate AGENT-407 contract');

  const audit = auditRepo(repo);
  assert.strictEqual(audit.liveClaim, false);
  assert.strictEqual(audit.productionGateWired, false);
  assert.strictEqual(audit.ok, true);
  assert.ok(audit.dualEditForbidden.includes(INTENT_CONTRACT));
  assert.ok(audit.dualEditForbidden.includes('scripts/intent-check.js'));
  const byId = Object.fromEntries(audit.checks.map((c) => [c.id, c]));
  assert.strictEqual(byId['agents-md'].ok, true);
  assert.strictEqual(byId['claude-md-pointer'].ok, true);
  assert.strictEqual(byId['intent-template'].ok, true);
  assert.strictEqual(byId['spec-template'].ok, true);
  assert.strictEqual(byId['review-md'].ok, true);
  assert.strictEqual(byId['intent-contract-present'].dualEditForbidden, true);

  const health = getHealthStatus(repo);
  assert.strictEqual(health.liveClaim, false);
  assert.strictEqual(health.productionGateWired, false);
  assert.strictEqual(health.analogClaudeMd, 'AGENTS.md');
  assert.ok(health.skipCount >= 5);
  assert.strictEqual(health.auditOk, true);
  assert.doesNotMatch(JSON.stringify(health), /10\/10/);
  assert.doesNotMatch(JSON.stringify(health), /systemReady": true/);
  assert.ok(health.skip.includes('continuity-close-loop'));

  const review = fs.readFileSync(path.join(repo, 'REVIEW.md'), 'utf8');
  assert.match(review, /at most \*\*5 nits\*\*/i);
  assert.match(review, /Fix the code, not the test/);
  assert.match(review, /Do not restore Continuity, Mac-pair, or a RUN ON picker/);

  const intentTpl = fs.readFileSync(path.join(repo, 'intent', 'TEMPLATE.md'), 'utf8');
  assert.match(intentTpl, /## Problem/);
  assert.match(intentTpl, /## Proposed outcome/);
  assert.match(intentTpl, /## Constraints/);

  const specTpl = fs.readFileSync(path.join(repo, 'spec', 'TEMPLATE.md'), 'utf8');
  assert.match(specTpl, /Flagged Areas of Concern/);
  assert.match(specTpl, /intent\.md/);
}

main();
console.log('ok tests/test-ai-native-sdlc.js');
