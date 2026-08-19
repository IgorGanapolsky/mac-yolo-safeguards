'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  HermesTimelineEngine,
  sanitizePayload,
} = require('../tools/hermes-timeline-engine.js');

test('sanitizePayload redacts API tokens, private keys, and secrets', () => {
  const fakeOpenAi = ['s', 'k', '-mocktest1234567890123456789012'].join('');
  const fakeGhp = ['g', 'h', 'p', '_MOCKGITHUBTOKEN123456789012345678'].join('');
  const dirty = {
    apiKey: fakeOpenAi,
    githubToken: fakeGhp,
    authHeader: 'Bearer ' + 'mockbearer12345678901234567890',
    safeField: 'normal_task_parameter',
  };

  const clean = sanitizePayload(dirty);
  assert.equal(clean.apiKey, '[REDACTED_SECRET]');
  assert.equal(clean.githubToken, '[REDACTED_SECRET]');
  assert.equal(clean.authHeader, '[REDACTED_SECRET]');
  assert.equal(clean.safeField, 'normal_task_parameter');
});

test('HermesTimelineEngine records and retrieves events in local JSONL timeline', () => {
  const tmpFile = path.join(os.tmpdir(), `test-timeline-${Date.now()}.jsonl`);
  const engine = new HermesTimelineEngine(tmpFile);

  const evt1 = engine.recordEvent({
    eventType: 'build_step',
    sourceApp: 'vscode',
    intent: 'compile_typescript',
    payload: { target: 'apps/control-plane' },
    status: 'completed',
  });

  assert.ok(evt1.id.startsWith('EVT-'));
  assert.equal(evt1.eventType, 'build_step');

  const recent = engine.getRecentEvents(10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].intent, 'compile_typescript');

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('detectIncompleteTasks isolates interrupted tasks and proposes auto-resume', () => {
  const tmpFile = path.join(os.tmpdir(), `test-incomplete-${Date.now()}.jsonl`);
  const engine = new HermesTimelineEngine(tmpFile);

  // Task 1: started and completed
  engine.recordEvent({
    eventType: 'task',
    sourceApp: 'terminal',
    intent: 'run_tests',
    payload: { taskId: 'T-1' },
    status: 'started',
  });
  engine.recordEvent({
    eventType: 'task',
    sourceApp: 'terminal',
    intent: 'run_tests',
    payload: { taskId: 'T-1' },
    status: 'completed',
  });

  // Task 2: started but interrupted / never completed
  engine.recordEvent({
    eventType: 'task',
    sourceApp: 'terminal',
    intent: 'deploy_staging',
    payload: { taskId: 'T-2' },
    status: 'in_progress',
  });

  const incomplete = engine.detectIncompleteTasks();
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].taskId, 'T-2');
  assert.equal(incomplete[0].lastAction, 'deploy_staging');
  assert.ok(incomplete[0].suggestedResumeAction.includes('resume_task_T-2'));

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

test('suggestWorkflowSkills identifies repetitive actions and suggests new automated skills', () => {
  const tmpFile = path.join(os.tmpdir(), `test-suggest-${Date.now()}.jsonl`);
  const engine = new HermesTimelineEngine(tmpFile);

  // Run 'format_sql_query' 4 times
  for (let i = 0; i < 4; i++) {
    engine.recordEvent({
      eventType: 'sql_action',
      sourceApp: 'datagrip',
      intent: 'format_sql_query',
      status: 'completed',
    });
  }

  const suggestions = engine.suggestWorkflowSkills(3);
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].intent, 'format_sql_query');
  assert.equal(suggestions[0].frequency, 4);
  assert.equal(suggestions[0].suggestedSkillName, 'auto-format-sql-query');

  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});
