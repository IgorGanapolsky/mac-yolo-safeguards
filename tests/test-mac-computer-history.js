#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const history = require('../tools/mac-computer-history');

const HISTORY_FILE = path.join(os.homedir(), '.hermes', 'computer_history.json');
const TOOL = path.join(__dirname, '..', 'tools', 'mac-computer-history.js');

test('Mac Computer History is fail-closed — not ChatGPT Computer History', async (t) => {
  await t.test('doctor: we are not ChatGPT Computer History / Windows Recall / a Mac keylogger', () => {
    const doc = history.doctorHonesty();
    assert.equal(doc.weAreChatGPTComputerHistory, false);
    assert.equal(doc.weAreWindowsRecall, false);
    assert.equal(doc.weAreMacKeylogger, false);
    assert.equal(doc.storesUnencryptedHistory, false);
    assert.equal(doc.capturesKeystrokes, false);
    assert.equal(doc.capturesClicks, false);
    assert.equal(doc.buildsLocalActivityTimeline, false);
    assert.equal(doc.learnsFromEverythingYouDo, false);
    assert.equal(doc.grabsCursor, false);
    assert.equal(doc.canReadSecrets, false);
    assert.equal(doc.ingestForeignSlackOrDms, false);
    assert.equal(doc.fencedVpsDoesNotGrabCursor, true);
    assert.equal(doc.status, 'FAIL_CLOSED');
    assert.match(doc.counsel, /not ChatGPT Computer History/);
    assert.match(doc.counsel, /not Windows Recall/);
    assert.match(doc.counsel, /not a Mac keylogger/);
    assert.doesNotMatch(doc.counsel, /learn from everything you do on your computer/);
  });

  await t.test('least privilege: cannot read secrets; Slack/DMs stay out', () => {
    assert.equal(history.canReadSecrets(), false);
    assert.equal(history.ingestForeignSlackOrDms(), false);
    assert.equal(history.isExcluded('.env'), true);
    assert.equal(history.isExcluded('/path/to/my_secret_credentials.json'), true);
    const secret = history.recordEvent('file_edit', '.env.production');
    assert.equal(secret.recorded, false);
    assert.equal(secret.reason, 'SECRETS_FORBIDDEN');
    const slack = history.recordEvent('ingest', "other people's Slack DMs");
    assert.equal(slack.recorded, false);
    assert.equal(slack.reason, 'PRIVATE_SLACK_DM_FORBIDDEN');
  });

  await t.test('recordEvent never writes unencrypted computer history', () => {
    const before = fs.existsSync(HISTORY_FILE) ? fs.statSync(HISTORY_FILE).mtimeMs : null;
    const res = history.recordEvent('file_edit', 'apps/hermes-control-plane/lib/device-auth.ts', {
      author: 'Igor',
    });
    assert.equal(res.recorded, false);
    assert.equal(res.storesUnencryptedHistory, false);
    assert.equal(res.historyFileWritten, false);
    assert.equal(res.reason, 'COMPUTER_HISTORY_DENIED');
    assert.equal(res.weAreChatGPTComputerHistory, false);
    if (before == null) {
      assert.equal(fs.existsSync(HISTORY_FILE), false);
    } else {
      assert.equal(fs.statSync(HISTORY_FILE).mtimeMs, before);
    }
  });

  await t.test('a helper that would enable macOS input capture is denied', () => {
    const keystroke = history.recordEvent('keystroke', 'cmd+c');
    assert.equal(keystroke.recorded, false);
    assert.equal(keystroke.reason, 'MACOS_INPUT_CAPTURE_DENIED');
    const click = history.recordEvent('click', 'menu bar');
    assert.equal(click.recorded, false);
    assert.equal(click.reason, 'MACOS_INPUT_CAPTURE_DENIED');
    const learn = history.recordEvent('memory', 'learn from everything you do on your computer');
    assert.equal(learn.recorded, false);
    assert.equal(learn.reason, 'MACOS_INPUT_CAPTURE_DENIED');
    const helper = history.enableMacOsInputCapture('eventtap-keylogger');
    assert.equal(helper.enabled, false);
    assert.equal(helper.reason, 'MACOS_INPUT_CAPTURE_DENIED');
  });

  await t.test('query / standup / skill generation do not emit a local timeline', () => {
    const result = history.queryWorkHistory('JSON.parse', '1h');
    assert.equal(result.summary.matchingEventsCount, 0);
    assert.equal(result.events.length, 0);
    assert.equal(result.storesUnencryptedHistory, false);
    const digest = history.generateStandupDigest('1h');
    assert.match(digest, /not ChatGPT Computer History/);
    assert.doesNotMatch(digest, /learn from everything you do on your computer/);
    const skillRes = history.generateSkillFromHistory('test-auto-workflow', 'should not write');
    assert.equal(skillRes.written, false);
    assert.equal(skillRes.path, null);
    assert.equal(skillRes.reason, 'COMPUTER_HISTORY_DENIED');
  });

  await t.test('CLI record and enable-input-capture exit 2', () => {
    const rec = spawnSync(process.execPath, [TOOL, 'record', '--type', 'keystroke', '--detail', 'a'], {
      encoding: 'utf8',
    });
    assert.equal(rec.status, 2, rec.stderr);
    const parsed = JSON.parse(rec.stdout);
    assert.equal(parsed.recorded, false);
    assert.equal(parsed.reason, 'MACOS_INPUT_CAPTURE_DENIED');
    const enable = spawnSync(process.execPath, [TOOL, 'enable-macos-input-capture', 'hid-tap'], {
      encoding: 'utf8',
    });
    assert.equal(enable.status, 2, enable.stderr);
    assert.equal(JSON.parse(enable.stdout).reason, 'MACOS_INPUT_CAPTURE_DENIED');
  });
});
