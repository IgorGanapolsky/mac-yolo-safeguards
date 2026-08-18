#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  recordEvent,
  queryWorkHistory,
  generateStandupDigest,
  generateSkillFromHistory,
  getExclusions,
  isExcluded,
} = require('../tools/mac-computer-history');

test('Mac Computer History Engine — Unit & Integration Test Suite', async (t) => {
  await t.test('isExcluded filters credentials and .env paths correctly', () => {
    assert.equal(isExcluded('.env'), true);
    assert.equal(isExcluded('/path/to/my_secret_credentials.json'), true);
    assert.equal(isExcluded('apps/hermes-control-plane/lib/device-auth.ts'), false);
  });

  await t.test('recordEvent logs non-excluded interaction events', () => {
    const res = recordEvent('file_edit', 'apps/hermes-control-plane/lib/device-auth.ts', { author: 'Igor' });
    assert.equal(res.recorded, true);
    assert.ok(res.event.id.startsWith('evt_'));
    assert.equal(res.event.type, 'file_edit');
  });

  await t.test('recordEvent drops excluded paths', () => {
    const res = recordEvent('file_edit', '.env.production');
    assert.equal(res.recorded, false);
    assert.equal(res.reason, 'excluded');
  });

  await t.test('queryWorkHistory recovers context and filters by keyword', () => {
    recordEvent('task_complete', 'Fixed unhandled JSON.parse in device API route', { route: 'tasks/complete' });
    const result = queryWorkHistory('JSON.parse', '1h');
    assert.ok(result.summary.matchingEventsCount >= 1);
    assert.ok(result.events.some((e) => e.detail.includes('JSON.parse')));
  });

  await t.test('generateStandupDigest creates markdown digest', () => {
    const digest = generateStandupDigest('1h');
    assert.ok(digest.includes('# Daily Work & Activity Digest'));
    assert.ok(digest.includes('## 🚀 Key Achievements'));
  });

  await t.test('generateSkillFromHistory scaffolds SKILL.md from recorded events', () => {
    recordEvent('terminal_cmd', 'npm test');
    const skillRes = generateSkillFromHistory('test-auto-workflow', 'Auto generated test skill', 10);
    assert.equal(skillRes.skillName, 'test-auto-workflow');
    assert.ok(fs.existsSync(skillRes.path));

    const content = fs.readFileSync(skillRes.path, 'utf8');
    assert.ok(content.includes('name: test-auto-workflow'));
    assert.ok(content.includes('## Execution Steps'));

    // Cleanup generated test skill
    fs.rmSync(path.dirname(skillRes.path), { recursive: true, force: true });
  });
});
