#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  authorizeToolCall,
  guardedInvoke,
  riskMatrix,
  runDemo,
  recordAudit,
  scrubArgs,
  RiskLevel,
  TOOL_CATALOG,
} = require('../tools/hermes-mcp-writeguard');

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

test('catalog has risk tiers and critical defaults disabled', () => {
  assert.strictEqual(TOOL_CATALOG.get_merge_request.riskLevel, RiskLevel.READ_ONLY);
  assert.strictEqual(TOOL_CATALOG.merge_mr.enabled, false);
  assert.strictEqual(TOOL_CATALOG.spend_authorize.hardDeny, true);
});

test('read allowed; merge blocked; spend hard-deny', () => {
  assert.strictEqual(authorizeToolCall('get_merge_request', { agent: 'a' }).allowed, true);
  const m = authorizeToolCall('merge_mr', { agent: 'a' });
  assert.strictEqual(m.allowed, false);
  assert.strictEqual(m.reason, 'tool_disabled');
  const s = authorizeToolCall('spend_authorize', { agent: 'a' });
  assert.strictEqual(s.allowed, false);
  assert.strictEqual(s.reason, 'hard_deny_never_spend');
});

test('contained write gets agent attribution', () => {
  const r = authorizeToolCall('create_mr_note', {
    agent: 'cleanup-bot',
    principal: 'joe',
    args: { body: 'Closing as done' },
  });
  assert.strictEqual(r.allowed, true);
  assert.ok(r.args.body.includes('via agent'));
  assert.ok(r.args.body.includes('cleanup-bot'));
  assert.ok(r.args.body.includes('joe'));
});

test('unknown tool blocked', () => {
  const r = authorizeToolCall('drop_production_db', { agent: 'x' });
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.reason, 'unknown_tool');
});

test('guardedInvoke skips handler when blocked', () => {
  let ran = false;
  const out = guardedInvoke('merge_mr', () => {
    ran = true;
    return 'merged';
  }, { agent: 'x', record: false });
  assert.strictEqual(out.blocked, true);
  assert.strictEqual(ran, false);
});

test('guardedInvoke runs handler when allowed', () => {
  const out = guardedInvoke(
    'get_merge_request',
    (args) => ({ id: 1, ...args }),
    { agent: 'x', record: false, args: { mr: 42 } },
  );
  assert.strictEqual(out.ok, true);
  assert.strictEqual(out.result.mr, 42);
});

test('scrubArgs redacts sensitive key names', () => {
  const sensitiveKey = ['api', 'key'].join('_');
  const raw = { body: 'hi' };
  raw[sensitiveKey] = 'should-not-appear-in-output';
  const scrubbed = scrubArgs(raw);
  assert.strictEqual(scrubbed[sensitiveKey], '[redacted]');
  assert.strictEqual(scrubbed.body, 'hi');
  const tmp = path.join(os.tmpdir(), `wg-audit-${Date.now()}.jsonl`);
  const d = authorizeToolCall('create_mr_note', {
    agent: 'a',
    args: scrubbed,
  });
  recordAudit(d.audit, tmp);
  assert.ok(fs.existsSync(tmp));
  fs.unlinkSync(tmp);
});

test('demo story passes', () => {
  const demo = runDemo();
  assert.strictEqual(demo.ok, true, JSON.stringify(demo.steps));
});

test('risk matrix groups tools', () => {
  const m = riskMatrix();
  assert.ok(m.byRisk[RiskLevel.CRITICAL].length >= 3);
  assert.ok(m.byRisk[RiskLevel.READ_ONLY].length >= 1);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('test-hermes-mcp-writeguard: ok');
