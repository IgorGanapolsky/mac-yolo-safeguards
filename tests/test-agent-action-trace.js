#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mod = require('../tools/agent-action-trace.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

function makeTempScope() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'act-'));
  return {
    dir,
    traceFile: path.join(dir, 'traces.jsonl'),
  };
}

function cleanupScope(scope) {
  fs.rmSync(scope.dir, { recursive: true, force: true });
}

test('startTrace creates trace with id, trigger, context', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({
    trigger: 'github_webhook',
    triggerSource: 'https://api.github.com/repos/.../issues',
    context: ['plan.md', 'tools/foo.js'],
  }, opts);
  assert.ok(t.id.startsWith('trace_'));
  assert.strictEqual(t.trigger, 'github_webhook');
  assert.strictEqual(t.triggerSource, 'https://api.github.com/repos/.../issues');
  assert.deepStrictEqual(t.context, ['plan.md', 'tools/foo.js']);
  assert.strictEqual(t.status, 'running');
  assert.strictEqual(t.endedAt, null);
  assert.deepStrictEqual(t.decisions, []);
  cleanupScope(scope);
});

test('startTrace handles defaults', () => {
  const scope = makeTempScope();
  const t = mod.startTrace({}, { traceFile: scope.traceFile });
  assert.ok(t.id.startsWith('trace_'));
  assert.strictEqual(t.trigger, 'manual');
  assert.strictEqual(t.context.length, 0);
  assert.strictEqual(t.status, 'running');
  cleanupScope(scope);
});

test('recordDecision adds to trace decisions', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({ trigger: 'manual' }, opts);
  const updated = mod.recordDecision({ traceId: t.id, decision: 'chose approach A' }, opts);
  assert.strictEqual(updated.decisions.length, 1);
  assert.strictEqual(updated.decisions[0].decision, 'chose approach A');
  assert.ok(updated.decisions[0].at);
  cleanupScope(scope);
});

test('recordDecision allows detail field', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({ trigger: 'manual' }, opts);
  const updated = mod.recordDecision({ traceId: t.id, decision: 'chose B', detail: 'because of cost' }, opts);
  assert.strictEqual(updated.decisions[0].decision, 'chose B');
  assert.strictEqual(updated.decisions[0].detail, 'because of cost');
  cleanupScope(scope);
});

test('recordDecision fails for nonexistent trace', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const origExit = process.exit;
  const origError = console.error;
  process.exit = (code) => { throw new Error('exit(' + code + ')'); };
  console.error = () => {};
  try {
    mod.recordDecision({ traceId: 'trace_nonexistent', decision: 'test' }, opts);
    assert.fail('should have exited');
  } catch (e) {
    assert.ok(e.message.includes('exit') || e.message.includes('not found'), e.message);
  } finally {
    process.exit = origExit;
    console.error = origError;
    cleanupScope(scope);
  }
});

test('endTrace sets status, endedAt, durationMs', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({ trigger: 'manual' }, opts);
  const ended = mod.endTrace({ traceId: t.id, result: 'tests pass', resultFiles: ['tools/foo.js'] }, opts);
  assert.strictEqual(ended.status, 'completed');
  assert.ok(ended.endedAt);
  assert.ok(ended.durationMs >= 0);
  assert.strictEqual(ended.result, 'tests pass');
  assert.deepStrictEqual(ended.resultFiles, ['tools/foo.js']);
  cleanupScope(scope);
});

test('endTrace supports failed status', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({ trigger: 'manual' }, opts);
  const ended = mod.endTrace({ traceId: t.id, status: 'failed', result: 'tests failed' }, opts);
  assert.strictEqual(ended.status, 'failed');
  assert.strictEqual(ended.result, 'tests failed');
  cleanupScope(scope);
});

test('listTraces returns traces sorted by recent', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t1 = mod.startTrace({ trigger: 'webhook1' }, opts);
  mod.endTrace({ traceId: t1.id, result: 'done' }, opts);
  const t2 = mod.startTrace({ trigger: 'webhook2' }, opts);

  const result = mod.listTraces({ limit: 20, traceFile: scope.traceFile });
  assert.ok(result.total >= 2);
  assert.ok(result.traces.length >= 2);
  // Most recent should be first
  assert.ok(new Date(result.traces[0].startedAt) >= new Date(result.traces[1].startedAt));
  cleanupScope(scope);
});

test('showTrace returns the trace by id', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({ trigger: 'test-show' }, opts);
  const found = mod.showTrace(t.id, opts);
  assert.strictEqual(found.id, t.id);
  assert.strictEqual(found.trigger, 'test-show');
  cleanupScope(scope);
});

test('showTrace fails for unknown id', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const origExit = process.exit;
  const origError = console.error;
  process.exit = (code) => { throw new Error('exit(' + code + ')'); };
  console.error = () => {};
  try {
    mod.showTrace('trace_nonexistent', opts);
    assert.fail('should have exited');
  } catch (e) {
    assert.ok(e.message.includes('exit') || e.message.includes('not found'), e.message);
  } finally {
    process.exit = origExit;
    console.error = origError;
    cleanupScope(scope);
  }
});

test('full lifecycle: start → decision → end → show', () => {
  const scope = makeTempScope();
  const opts = { traceFile: scope.traceFile };
  const t = mod.startTrace({ trigger: 'test-lifecycle', context: ['plan.md'] }, opts);
  mod.recordDecision({ traceId: t.id, decision: 'Use verify + pulse pattern' }, opts);
  const ended = mod.endTrace({ traceId: t.id, result: 'implemented', resultFiles: ['tools/agent-control-plane.js'] }, opts);
  const shown = mod.showTrace(t.id, opts);
  assert.strictEqual(shown.decisions.length, 1);
  assert.strictEqual(shown.decisions[0].decision, 'Use verify + pulse pattern');
  assert.strictEqual(shown.status, 'completed');
  assert.strictEqual(shown.result, 'implemented');
  assert.deepStrictEqual(shown.resultFiles, ['tools/agent-control-plane.js']);
  assert.ok(shown.durationMs >= 0);
  cleanupScope(scope);
});

test('readTraces returns empty array when file does not exist', () => {
  const scope = makeTempScope();
  const traces = mod.readTraces({ traceFile: path.join(scope.dir, 'nonexistent.jsonl') });
  assert.deepStrictEqual(traces, []);
  cleanupScope(scope);
});

test('STORAGE_DIR points to harness-router', () => {
  assert.ok(mod.STORAGE_DIR.includes('harness-router'));
  assert.ok(path.isAbsolute(mod.STORAGE_DIR));
});

test('TRACE_FILE ends with jsonl', () => {
  assert.ok(mod.TRACE_FILE.endsWith('agent-action-traces.jsonl'));
});

console.log('test-agent-action-trace: done');
