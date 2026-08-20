#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mod = require('../tools/activity-trigger.js');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

// Test isolation: use temp dirs for file I/O
function makeTempScope() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trig-'));
  return {
    dir,
    triggersFile: path.join(dir, 'triggers.json'),
    firedLog: path.join(dir, 'fired.jsonl'),
    historyFile: path.join(dir, 'history.json'),
  };
}

function cleanupScope(scope) {
  fs.rmSync(scope.dir, { recursive: true, force: true });
}

test('matchEvent matches event type', () => {
  const rule = { watch: 'git_commit', match: 'merge' };
  const event = { type: 'git_commit', detail: 'merged PR #1905' };
  assert.strictEqual(mod.matchEvent(rule, event), true);
});

test('matchEvent does not match wrong watch', () => {
  const rule = { watch: 'meeting_ended', match: '*' };
  const event = { type: 'git_commit', detail: 'feat: test' };
  assert.strictEqual(mod.matchEvent(rule, event), false);
});

test('matchEvent match without watch', () => {
  const rule = { watch: '', match: 'feat' };
  const event = { type: 'git_commit', detail: 'feat: new feature' };
  assert.strictEqual(mod.matchEvent(rule, event), true);
});

test('matchEvent uses wildcard when no match', () => {
  const rule = { watch: 'git_commit', match: '' };
  const event = { type: 'git_commit', detail: 'anything' };
  assert.strictEqual(mod.matchEvent(rule, event), true);
});

test('matchEvent regex match', () => {
  const rule = { watch: 'git_commit', match: '(merge|pr)\\s*#' };
  const event = { type: 'git_commit', detail: 'merged PR #1905 cognitive debt' };
  assert.strictEqual(mod.matchEvent(rule, event), true);
});

test('matchEvent wildcard watch matches everything', () => {
  const rule = { watch: '*', match: '' };
  const event = { type: 'any_type', detail: 'anything' };
  assert.strictEqual(mod.matchEvent(rule, event), true);
});

test('register creates trigger from JSON with opts', () => {
  const scope = makeTempScope();
  const rule = {
    name: 'test-trigger',
    watch: 'git_commit',
    match: 'merge',
    action: 'echo "triggered"',
  };
  const registered = mod.register({ rule: JSON.stringify(rule), triggersFile: scope.triggersFile });
  assert.strictEqual(registered.name, 'test-trigger');
  assert.strictEqual(registered.enabled, true);
  assert.ok(registered.registeredAt);
  assert.strictEqual(registered.fireCount, 0);

  // Verify it was written to the temp file
  const triggers = mod.readTriggers({ triggersFile: scope.triggersFile });
  assert.ok(triggers.some((t) => t.name === 'test-trigger'));
  cleanupScope(scope);
});

test('register rejects invalid JSON', () => {
  const origExit = process.exit;
  const origError = console.error;
  process.exit = (code) => { throw new Error('exit(' + code + ')'); };
  console.error = () => {};
  try {
    mod.register({ rule: 'not json' });
    assert.fail('should have exited');
  } catch (e) {
    assert.ok(e.message.includes('exit') || e.message.includes('Invalid JSON'), e.message);
  } finally {
    process.exit = origExit;
    console.error = origError;
  }
});

test('register rejects rule missing name', () => {
  const scope = makeTempScope();
  const origExit = process.exit;
  const origError = console.error;
  process.exit = (code) => { throw new Error('exit(' + code + ')'); };
  console.error = () => {};
  try {
    mod.register({ rule: JSON.stringify({ action: 'echo hi' }), triggersFile: scope.triggersFile });
    assert.fail('should have exited');
  } catch {
    assert.ok(true);
  } finally {
    process.exit = origExit;
    console.error = origError;
    cleanupScope(scope);
  }
});

test('findRecentMatches filters by time with opts', () => {
  const scope = makeTempScope();
  const now = Date.now();
  const events = [
    { type: 'git_commit', detail: 'old commit', timestamp: new Date(now - 7200000).toISOString() },
    { type: 'git_commit', detail: 'recent merge', timestamp: new Date(now - 60000).toISOString() },
    { type: 'git_commit', detail: 'another old', timestamp: new Date(now - 10800000).toISOString() },
  ];
  fs.writeFileSync(scope.historyFile, JSON.stringify(events));

  const rule = { watch: 'git_commit', match: 'merge' };
  const matches = mod.findRecentMatches(rule, 3600000, { historyFile: scope.historyFile });
  assert.strictEqual(matches.length, 1);
  assert.strictEqual(matches[0].detail, 'recent merge');
  cleanupScope(scope);
});

test('findRecentMatches returns empty when all events are too old', () => {
  const scope = makeTempScope();
  const now = Date.now();
  const events = [
    { type: 'git_commit', detail: 'old commit', timestamp: new Date(now - 7200000).toISOString() },
  ];
  fs.writeFileSync(scope.historyFile, JSON.stringify(events));

  const rule = { watch: 'git_commit', match: '*' };
  const matches = mod.findRecentMatches(rule, 3600000, { historyFile: scope.historyFile });
  assert.strictEqual(matches.length, 0);
  cleanupScope(scope);
});

test('list returns registered triggers with opts', () => {
  const scope = makeTempScope();
  const rule = { name: 'test-list', watch: 'test', match: '*', action: 'echo hi' };
  mod.register({ rule: JSON.stringify(rule), triggersFile: scope.triggersFile });
  const triggers = mod.readTriggers({ triggersFile: scope.triggersFile });
  assert.ok(triggers.length >= 1);
  assert.ok(triggers.some((t) => t.name === 'test-list'));
  cleanupScope(scope);
});

test('readTriggers returns empty array when file does not exist', () => {
  const scope = makeTempScope();
  const triggers = mod.readTriggers({ triggersFile: path.join(scope.dir, 'nonexistent.json') });
  assert.deepStrictEqual(triggers, []);
  cleanupScope(scope);
});

test('readFiredLog returns empty array when file does not exist', () => {
  const scope = makeTempScope();
  const fired = mod.readFiredLog({ firedLog: path.join(scope.dir, 'nonexistent.jsonl') });
  assert.deepStrictEqual(fired, []);
  cleanupScope(scope);
});

test('STORAGE_DIR points to harness-router', () => {
  assert.ok(mod.STORAGE_DIR.includes('harness-router'));
  assert.ok(path.isAbsolute(mod.STORAGE_DIR));
});

test('TRIGGERS_FILE ends with json', () => {
  assert.ok(mod.TRIGGERS_FILE.endsWith('activity-triggers.json'));
});

test('HISTORY_FILE points to .hermes', () => {
  assert.ok(mod.HISTORY_FILE.includes('.hermes'));
  assert.ok(mod.HISTORY_FILE.includes('computer_history'));
});

test('cleanup', () => {
  assert.ok(true);
});

console.log('test-activity-trigger: done');
