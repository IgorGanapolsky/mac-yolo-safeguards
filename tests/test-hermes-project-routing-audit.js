#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { collect } = require('../tools/hermes-project-routing-audit');

function mkHermesHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-routing-audit-'));
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  return dir;
}

function writeFixture(home, { cwd, promptPath, tokens = 1200, group = true }) {
  fs.writeFileSync(path.join(home, 'config.yaml'), [
    'terminal:',
    `  cwd: ${cwd}`,
    'telegram:',
    `  group_sessions_per_user: ${group ? 'true' : 'false'}`,
    '  channel_prompts:',
    '    "1234567890": |',
    `      Active repo: ${promptPath}`,
    'session_reset:',
    '  mode: none',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(home, 'sessions/sessions.json'), JSON.stringify({
    'agent:main:telegram:dm:1234567890': {
      session_id: '20260616_120000_test',
      last_prompt_tokens: tokens,
      is_fresh_reset: false,
    },
  }, null, 2));
}

const expected = path.join(os.homedir(), 'workspace/git/igor/skool_top1percent');

{
  const home = mkHermesHome();
  writeFixture(home, { cwd: expected, promptPath: expected, tokens: 1000, group: true });
  const report = collect({ hermesHome: home, expectedCwd: expected, telegramChatId: '1234567890', probeRuntime: false });
  assert.strictEqual(report.ok, true);
  assert.strictEqual(report.findings.length, 0);
  assert.strictEqual(report.sessions.telegramEntries.length, 1);
  fs.rmSync(home, { recursive: true, force: true });
}

{
  const home = mkHermesHome();
  writeFixture(home, {
    cwd: path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards'),
    promptPath: path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards'),
    tokens: 59000,
    group: false,
  });
  const report = collect({ hermesHome: home, expectedCwd: expected, telegramChatId: '1234567890', probeRuntime: false });
  assert.strictEqual(report.ok, false);
  assert(report.findings.some((finding) => finding.title.includes('terminal cwd is not Skool')));
  assert(report.findings.some((finding) => finding.title.includes('does not pin Skool cwd')));
  assert(report.findings.some((finding) => finding.title.includes('large mixed-context session')));
  assert(report.findings.some((finding) => finding.title.includes('not grouped per user')));
  fs.rmSync(home, { recursive: true, force: true });
}

console.log('test-hermes-project-routing-audit: PASS');
