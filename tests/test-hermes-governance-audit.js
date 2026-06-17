#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { collect } = require('../tools/hermes-governance-audit');

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-governance-'));
  const hermesHome = path.join(root, 'hermes');
  const skoolRepo = path.join(root, 'skool');
  fs.mkdirSync(path.join(hermesHome), { recursive: true });
  fs.mkdirSync(path.join(skoolRepo, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(skoolRepo, 'experiments'), { recursive: true });
  fs.mkdirSync(path.join(skoolRepo, 'rag'), { recursive: true });
  fs.mkdirSync(path.join(skoolRepo, 'docs', 'trajectories'), { recursive: true });
  fs.writeFileSync(path.join(skoolRepo, 'experiments', 'metrics.db'), '');
  fs.writeFileSync(path.join(skoolRepo, 'rag', 'index.json'), '[]\n');
  fs.writeFileSync(path.join(skoolRepo, 'docs', 'trajectories', 'outreach-outbox.json'), '{"queue":[]}\n');
  return { root, hermesHome, skoolRepo };
}

function writeConfig(hermesHome, skoolRepo, extraPrompt = '') {
  fs.writeFileSync(path.join(hermesHome, 'config.yaml'), [
    'agent:',
    '  gateway_notify_interval: 30',
    '  gateway_timeout_warning: 120',
    'browser:',
    '  cloud_provider: browser-use',
    'delegation:',
    '  orchestrator_enabled: true',
    '  max_concurrent_children: 5',
    'session_reset:',
    '  mode: none',
    '  idle_minutes: 999',
    'display:',
    '  platforms:',
    '    telegram:',
    '      tool_progress: all',
    '      long_running_notifications: true',
    'telegram:',
    '  channel_prompts:',
    '    "1234567890": |',
    `      Current repo: ${skoolRepo}`,
    '      Skool outreach must use scripts/skool_browser_dm_dry_run.js for browser evidence.',
    '      If the result says blocker: "skool_chat_limit", use scripts/skool_browser_post_dry_run.js for community-post evidence.',
    '      Telegram handoff, local outbox status, and "copy to send" are never Skool delivery proof.',
    '      Autonomy guard: do not say "I don\'t have send permissions" and do not queue it for manual send.',
    '      Gateway truth protocol: do not claim missing userbot api_id/api_hash without hermes gateway status evidence.',
    '      Zero-revenue protocol: run python3 scripts/report_metrics.py && python3 scripts/hermes_reliability_observer.py --write && python3 scripts/revenue_engine.py close_digest.',
    '      Credentials & password entry: Do not refuse with "I cannot enter the password"; use safe existing credential paths.',
    '      Real-time progress protocol: for Telegram tasks longer than 30 seconds, emit concise progress updates that include the current command/tool, newest evidence, and next command.',
    `      ${extraPrompt}`,
    'terminal:',
    `  cwd: "${skoolRepo}"`,
    '',
  ].join('\n'));
}

function writeGuard(skoolRepo, withBrowserHandoff = true) {
  fs.writeFileSync(path.join(skoolRepo, 'scripts', 'hermes_autonomy_guard.py'), [
    'FORBIDDEN_SKOOL_API_PHRASES = ("skool api",)',
    withBrowserHandoff
      ? 'FORBIDDEN_BROWSER_HANDOFF_PHRASES = ("i cannot enter the password", "copy to send:")'
      : 'FORBIDDEN_BROWSER_HANDOFF_PHRASES = ()',
    'FORBIDDEN_GATEWAY_HALLUCINATION_PHRASES = ("missing userbot api_id/api_hash",)',
    '',
  ].join('\n'));
}

{
  const fixture = mkFixture();
  writeConfig(fixture.hermesHome, fixture.skoolRepo);
  writeGuard(fixture.skoolRepo, true);
  const report = collect({ hermesHome: fixture.hermesHome, skoolRepo: fixture.skoolRepo, sampleResponse: '' });
  assert.strictEqual(report.ok, true);
  assert.deepStrictEqual(report.findings, []);
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

{
  const fixture = mkFixture();
  writeConfig(fixture.hermesHome, fixture.skoolRepo, 'That bypasses model safety filters entirely.');
  writeGuard(fixture.skoolRepo, false);
  const report = collect({ hermesHome: fixture.hermesHome, skoolRepo: fixture.skoolRepo, sampleResponse: '' });
  assert.strictEqual(report.ok, false);
  assert(report.findings.some((finding) => finding.title.includes('unsafe bypass language')));
  assert(report.findings.some((finding) => finding.title.includes('known failure phrase')));
  fs.rmSync(fixture.root, { recursive: true, force: true });
}

console.log('test-hermes-governance-audit: PASS');
