#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseArgs, renderMarkdown } = require('../tools/hermes-productivity-audit');

console.log('=== Running hermes-productivity-audit live gate tests ===');

let args = parseArgs(['--send-smoke', '--test-public-webhook', '--json']);
assert.strictEqual(args.sendSmoke, true);
assert.strictEqual(args.testPublicWebhook, true);
assert.strictEqual(args.allowLiveTelegram, false);

args = parseArgs(['--send-smoke', '--test-public-webhook', '--allow-live-telegram']);
assert.strictEqual(args.allowLiveTelegram, true);

const markdown = renderMarkdown({
  telemetry: {
    checkedAt: '2026-06-17T00:00:00.000Z',
    productivityScore: 100,
    gatewayState: 'running',
    telegramState: 'connected',
    activeAgents: 0,
    gatewayPid: 123,
    counts: {
      gatewayProcesses: 1,
      telegramBridgeProcesses: 0,
    },
    sendSmoke: {
      skipped: true,
      success: null,
      reason: 'live Telegram smoke skipped; pass --allow-live-telegram to post to the real chat',
    },
    telegramWebhook: {
      registered_host: 'example.test',
      url_matches: true,
      pending_update_count: 0,
    },
    publicWebhookTest: {
      skipped: true,
      success: null,
      reason: 'live public webhook test skipped; pass --allow-live-telegram to post to the real chat',
    },
    remotes: [],
  },
  findings: [],
});

assert(markdown.includes('Outbound smoke: skipped'));
assert(markdown.includes('Public webhook POST: skipped'));
assert(!markdown.includes('undefinedms'));

console.log('test-hermes-productivity-audit-live-gate: PASS');
