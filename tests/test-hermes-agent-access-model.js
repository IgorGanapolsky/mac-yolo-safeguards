#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  mintTaskCredential,
  authorizeAction,
  applyTrustRatchet,
  grantReviewFromActivity,
  runDemo,
  GLOBAL_DENY,
  TASK_TEMPLATES,
  OP,
} = require('../tools/hermes-agent-access-model');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aam-'));

test('templates and global deny exist', () => {
  assert.ok(TASK_TEMPLATES.code_fix);
  assert.ok(TASK_TEMPLATES.reconcile_demo);
  assert.ok(GLOBAL_DENY.includes('spend.authorize'));
  assert.ok(GLOBAL_DENY.includes('wallet.pay'));
});

test('dispatch mints task-scoped credential without leaking proofKey in credential', () => {
  const d = mintTaskCredential({
    template: 'code_fix',
    principal: 'igor',
    agentId: 'grok',
    stateDir: tmp,
  });
  assert.strictEqual(d.ok, true);
  assert.ok(d.taskId.startsWith('task_'));
  assert.ok(d.credential.proofKeyFingerprint);
  assert.strictEqual(d.credential.proofKey, undefined);
  assert.ok(d.harness.proofKey);
  assert.strictEqual(d.harness.graph.trustState, 'baseline');
});

test('outside ceiling denied; in ceiling allowed with proof', () => {
  const d = mintTaskCredential({ template: 'mobile_pair', stateDir: tmp });
  const h = d.harness;
  const bad = authorizeAction(h, { tool: 'git.commit', op: OP.WRITE, proofKey: h.proofKey }, { stateDir: tmp });
  assert.strictEqual(bad.allowed, false);
  assert.strictEqual(bad.reason, 'outside_ceiling');
  const good = authorizeAction(h, { tool: 'gateway.health', op: OP.READ, proofKey: h.proofKey }, { stateDir: tmp });
  assert.strictEqual(good.allowed, true);
});

test('proof key mismatch blocks replay', () => {
  const d = mintTaskCredential({ template: 'smoke', stateDir: tmp });
  const r = authorizeAction(
    d.harness,
    { tool: 'fleet.status', op: OP.READ, proofKey: 'stolen' },
    { stateDir: tmp },
  );
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, 'proof_key_mismatch');
});

test('trust ratchet removes tools after protected read', () => {
  const d = mintTaskCredential({ template: 'reconcile_demo', stateDir: tmp });
  const h = d.harness;
  const read = authorizeAction(
    h,
    { tool: 'processor.report', op: OP.READ, proofKey: h.proofKey, protected: true },
    { stateDir: tmp },
  );
  assert.strictEqual(read.allowed, true);
  assert.strictEqual(h.graph.trustState, 'restricted');
  assert.ok(h.graph.removed.includes('support.case'));
  const exfil = authorizeAction(
    h,
    { tool: 'support.case', op: OP.WRITE, proofKey: h.proofKey },
    { stateDir: tmp },
  );
  assert.strictEqual(exfil.allowed, false);
});

test('never-spend global deny', () => {
  const d = mintTaskCredential({ template: 'code_fix', stateDir: tmp });
  const r = authorizeAction(
    d.harness,
    { tool: 'spend.authorize', op: OP.SPEND, proofKey: d.harness.proofKey },
    { stateDir: tmp },
  );
  assert.strictEqual(r.allowed, false);
  assert.ok(r.hardDeny || r.reason.includes('never_spend') || r.reason === 'global_deny_never_spend');
});

test('full recon demo passes', () => {
  const demo = runDemo({ stateDir: tmp });
  assert.strictEqual(demo.ok, true, JSON.stringify(demo.steps, null, 2));
});

test('grant review proposes future-only changes', () => {
  const rev = grantReviewFromActivity({ stateDir: tmp, templateId: 'code_fix' });
  assert.strictEqual(rev.ok, true);
  for (const p of rev.proposals) {
    assert.ok(p.appliesTo === 'future_templates_only' || p.kind);
  }
});

test('ratchet only narrows', () => {
  const d = mintTaskCredential({ template: 'reconcile_demo', stateDir: tmp });
  applyTrustRatchet(d.harness, { stateDir: tmp, removeTools: ['http.egress'] });
  const v1 = d.harness.graph.trustVersion;
  applyTrustRatchet(d.harness, { stateDir: tmp, removeTools: ['http.egress'] });
  assert.ok(d.harness.graph.trustVersion >= v1);
  assert.ok(d.harness.graph.removed.includes('http.egress'));
});

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (process.exitCode) process.exit(process.exitCode);
console.log('test-hermes-agent-access-model: ok');
