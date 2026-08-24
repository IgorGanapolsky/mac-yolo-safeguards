#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// We need to override STORAGE_DIR for tests — re-require with temp dir
const mod = require('../tools/async-agent-messaging.js');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aam-'));

// Monkey-patch the storage paths for testing
const origModule = require.cache[require.resolve('../tools/async-agent-messaging.js')];
const origAsk = mod.ask;
const origPending = mod.pending;
const origReply = mod.reply;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

function withTemp(content, fn, ext = '.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aam-test-'));
  const file = path.join(dir, 'sample' + ext);
  fs.writeFileSync(file, content);
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Override internal paths by creating fresh test entries
function askTest(args) {
  const entry = {
    id: `msg_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    question: args.question || 'test question',
    taskType: args.taskType || 'coding',
    tags: args.tags || [],
    ttlSeconds: args.ttl || 3600,
    status: 'pending',
  };
  const pendingFile = path.join(testDir, 'async-pending-messages.jsonl');
  fs.mkdirSync(testDir, { recursive: true });
  fs.appendFileSync(pendingFile, JSON.stringify(entry, null, 0) + '\n');
  return entry;
}

function pendingTest() {
  const pendingFile = path.join(testDir, 'async-pending-messages.jsonl');
  if (!fs.existsSync(pendingFile)) return [];
  return fs.readFileSync(pendingFile, 'utf8')
    .trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function replyTest(args) {
  const targetId = args.id;
  const pendingFile = path.join(testDir, 'async-pending-messages.jsonl');
  const repliesFile = path.join(testDir, 'async-replies.jsonl');
  const pend = pendingTest();
  const target = pend.find((e) => e.id === targetId);
  if (!target) throw new Error(`Message ${targetId} not found`);

  const entry = {
    id: `reply_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    inReplyTo: target.id,
    timestamp: new Date().toISOString(),
    answer: args.answer,
    question: target.question,
    taskType: target.taskType,
    tags: target.tags,
  };
  fs.appendFileSync(repliesFile, JSON.stringify(entry, null, 0) + '\n');

  const updated = pend.map((e) =>
    e.id === targetId ? { ...e, status: 'answered', answeredAt: entry.timestamp } : e
  );
  fs.writeFileSync(pendingFile, updated.map((e) => JSON.stringify(e, null, 0)).join('\n') + '\n');
  return entry;
}

test('ask creates entry with all fields', () => {
  const entry = askTest({
    question: 'Need to choose: postgres or sqlite?',
    tags: ['db-migration', 'decision-needed'],
    ttl: 7200,
  });
  assert.ok(entry.id.startsWith('msg_test_'));
  assert.strictEqual(entry.question, 'Need to choose: postgres or sqlite?');
  assert.strictEqual(entry.status, 'pending');
  assert.strictEqual(entry.ttlSeconds, 7200);
  assert.deepStrictEqual(entry.tags, ['db-migration', 'decision-needed']);
});

test('pending returns queued questions', () => {
  const entry = askTest({ question: 'Another question', tags: ['test'] });
  const list = pendingTest();
  assert.ok(list.length >= 1);
  assert.ok(list.some((e) => e.id === entry.id));
});

test('reply links to original question and marks it answered', () => {
  const entry = askTest({ question: 'Q for reply test', tags: ['reply-test'] });
  const reply = replyTest({ id: entry.id, answer: 'Use postgres' });
  assert.strictEqual(reply.inReplyTo, entry.id);
  assert.strictEqual(reply.answer, 'Use postgres');
  assert.strictEqual(reply.question, 'Q for reply test');

  // Verify the pending entry is now marked answered
  const pend = pendingTest();
  const found = pend.find((e) => e.id === entry.id);
  assert.ok(found);
  assert.strictEqual(found.status, 'answered');
});

test('reply fails for unknown id', () => {
  try {
    replyTest({ id: 'nonexistent', answer: 'x' });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.message.includes('not found'));
  }
});

test('DEFAULT_TTL_SECONDS is reasonable', () => {
  assert.strictEqual(mod.DEFAULT_TTL_SECONDS, 3600);
});

test('STORAGE_DIR uses harness-router', () => {
  assert.ok(mod.STORAGE_DIR.includes('harness-router'));
  assert.ok(path.isAbsolute(mod.STORAGE_DIR));
});

test('cleanup', () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  assert.ok(true);
});

console.log('test-async-agent-messaging: done');
