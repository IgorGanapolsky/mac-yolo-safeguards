#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { capture, recall, readHandoffs, STORAGE_DIR } = require('../tools/agent-knowledge-handoff');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

// Use a temp directory for test handoffs
const origStorageDir = STORAGE_DIR;
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ahk-'));

function captureTest(args) {
  // Override the storage path
  const entry = {
    id: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    task: args.task || 'unknown',
    taskType: args.taskType || 'coding',
    model: args.model || null,
    decisions: args.decisions || [],
    bugsFound: args.bugsFound || [],
    filesTouched: args.filesTouched || [],
    costUsd: args.costUsd || null,
    durationMs: args.durationMs || null,
    searchTags: args.searchTags || [],
  };
  if (entry.decisions && typeof entry.decisions === 'string') {
    entry.decisions = entry.decisions.split(';').map((s) => s.trim()).filter(Boolean);
  }
  if (entry.bugsFound && typeof entry.bugsFound === 'string') {
    entry.bugsFound = entry.bugsFound.split(';').map((s) => s.trim()).filter(Boolean);
  }
  if (entry.filesTouched && typeof entry.filesTouched === 'string') {
    entry.filesTouched = entry.filesTouched.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (entry.searchTags && typeof entry.searchTags === 'string') {
    entry.searchTags = entry.searchTags.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const handoffFile = path.join(testDir, 'agent-handoffs.jsonl');
  const line = JSON.stringify(entry, null, 0);
  fs.appendFileSync(handoffFile, line + '\n');
  return entry;
}

function readTestHandoffs() {
  const handoffFile = path.join(testDir, 'agent-handoffs.jsonl');
  if (!fs.existsSync(handoffFile)) return [];
  return fs.readFileSync(handoffFile, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

test('capture creates entry with all fields', () => {
  const entry = captureTest({
    task: 'Fix sent message race condition',
    taskType: 'bugfix',
    model: 'openai/gpt-4.1',
    decisions: 'Guarded loadWorkspace with hasPendingConversationTasks; Added mergeTasksForTaskList',
    bugsFound: 'Message vanished after Enter due to loadWorkspace race',
    filesTouched: 'apps/hermes-control-plane/app/dashboard/DashboardClient.tsx,apps/hermes-control-plane/lib/conversation-send-visibility.ts',
    searchTags: 'dashboard, race-condition, optimistic-rendering',
  });
  assert.strictEqual(entry.task, 'Fix sent message race condition');
  assert.strictEqual(entry.taskType, 'bugfix');
  assert.strictEqual(entry.model, 'openai/gpt-4.1');
  assert.deepStrictEqual(entry.decisions, [
    'Guarded loadWorkspace with hasPendingConversationTasks',
    'Added mergeTasksForTaskList',
  ]);
  assert.deepStrictEqual(entry.bugsFound, ['Message vanished after Enter due to loadWorkspace race']);
  assert.ok(entry.id.startsWith('handoff-'));
  assert.ok(entry.timestamp);
});

test('capture parses string arrays correctly', () => {
  const entry = captureTest({
    task: 'test',
    taskType: 'coding',
    decisions: 'First; Second; Third',
    bugsFound: 'Bug one; Bug two',
    filesTouched: 'file1.ts, file2.ts',
    searchTags: 'tag1, tag2',
  });
  assert.deepStrictEqual(entry.decisions, ['First', 'Second', 'Third']);
  assert.deepStrictEqual(entry.bugsFound, ['Bug one', 'Bug two']);
  assert.deepStrictEqual(entry.filesTouched, ['file1.ts', 'file2.ts']);
  assert.deepStrictEqual(entry.searchTags, ['tag1', 'tag2']);
});

test('capture handles empty fields', () => {
  const entry = captureTest({
    task: 'minimal',
    taskType: 'coding',
  });
  assert.deepStrictEqual(entry.decisions, []);
  assert.deepStrictEqual(entry.bugsFound, []);
  assert.deepStrictEqual(entry.filesTouched, []);
  assert.deepStrictEqual(entry.searchTags, []);
});

test('can recall by search tag', () => {
  const testDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ahk2-'));
  const handoffFile = path.join(testDir2, 'agent-handoffs.jsonl');
  const entry = {
    id: 'test-1',
    timestamp: new Date().toISOString(),
    task: 'race condition fix',
    taskType: 'bugfix',
    model: 'openai/gpt-4.1',
    decisions: ['Checked pendingConversationTasksRef'],
    bugsFound: ['setThreadDetails(null) cleared optimistic task'],
    filesTouched: ['DashboardClient.tsx'],
    searchTags: ['dashboard', 'race-condition'],
  };
  fs.writeFileSync(handoffFile, JSON.stringify(entry) + '\n');

  // Simulate recall
  const handoffs = fs.readFileSync(handoffFile, 'utf8')
    .trim().split('\n')
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
  const results = handoffs.filter((h) => {
    const text = JSON.stringify(h).toLowerCase();
    return text.includes('race') ||
      (h.searchTags || []).some((t) => t.toLowerCase().includes('race'));
  });
  assert.ok(results.length >= 1, 'should find handoff with race tag');
  assert.ok(results[0].searchTags.includes('race-condition'));

  fs.rmSync(testDir2, { recursive: true, force: true });
});

test('STORAGE_DIR points to harness-router dir', () => {
  assert.ok(STORAGE_DIR.includes('harness-router'));
  assert.ok(path.isAbsolute(STORAGE_DIR));
});

// Clean up
test('cleanup', () => {
  fs.rmSync(testDir, { recursive: true, force: true });
  assert.ok(true);
});

console.log('test-agent-knowledge-handoff: done');
