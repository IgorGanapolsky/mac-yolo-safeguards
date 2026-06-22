#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  hasRecentLiveSuccess,
  latestLogTimestamp,
  latestTunnelWebhookProof,
  parseArgs,
  parseOllamaPsContext,
  renderMarkdown,
} = require('../tools/hermes-productivity-audit');

console.log('=== Running hermes-productivity-audit live gate tests ===');

let args = parseArgs(['--send-smoke', '--test-public-webhook', '--json']);
assert.strictEqual(args.sendSmoke, true);
assert.strictEqual(args.testPublicWebhook, true);
assert.strictEqual(args.allowLiveTelegram, false);

args = parseArgs(['--send-smoke', '--test-public-webhook', '--allow-live-telegram']);
assert.strictEqual(args.allowLiveTelegram, true);

const auditSource = fs.readFileSync(path.join(__dirname, '..', 'tools', 'hermes-productivity-audit.js'), 'utf8');
assert(
  auditSource.includes('const allowLive = args.allowLiveTelegram;'),
  '--allow-live-telegram must work in non-interactive agent runs'
);
assert(
  auditSource.includes("telegramWebhookInfo: sh(`python3 - <<'PY'") && auditSource.includes('noRedact: true'),
  'Telegram webhook JSON must be parsed before numeric ID redaction corrupts it'
);
assert(
  auditSource.includes('activeIngressSince') && auditSource.includes('lastWebhookConnectedAt'),
  'Polling conflict checks must use the active ingress window, not stale pre-webhook log tails'
);
assert(
  auditSource.includes('"model_context_length"') && auditSource.includes('primaryHasFullContext'),
  'Ollama fallback warnings must be interpreted against the active primary context'
);
assert(
  auditSource.includes('&& !primaryHasFullContext') && auditSource.includes('&& fullContextFallbacks.length === 0'),
  'An unloaded bounded Ollama fallback must not make a full-context primary/fallback setup look blocked'
);
assert(
  auditSource.includes('"repaired": False') && !auditSource.includes('/setWebhook'),
  'Webhook audit must verify Bot API state without mutating Telegram webhook registration'
);
assert(
  !auditSource.includes('flap_tolerated = true'),
  'Direct Bot API webhook absence must not be hidden by stale tunnel-manager proof'
);

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

const now = Date.parse('2026-06-17T00:03:00.000Z');
assert.strictEqual(
  hasRecentLiveSuccess({ success: true, checkedAt: '2026-06-17T00:00:00.000Z' }, now, 5 * 60 * 1000),
  true
);
assert.strictEqual(
  hasRecentLiveSuccess({ success: true, checkedAt: '2026-06-17T00:00:00.000Z' }, now, 60 * 1000),
  false
);
assert.strictEqual(hasRecentLiveSuccess({ success: false, checkedAt: '2026-06-17T00:00:00.000Z' }, now), false);

assert.strictEqual(
  parseOllamaPsContext('qwen3:8b-64k  1adc23451bf4  8.6 GB  100% GPU  40960  9 minutes from now', 'qwen3:8b-64k'),
  40960
);
assert.strictEqual(parseOllamaPsContext('NAME ID SIZE PROCESSOR CONTEXT UNTIL\n', 'qwen3:8b-64k'), null);

assert.strictEqual(
  latestLogTimestamp([
    '2026-06-17 15:59:40,531 INFO gateway.platforms.telegram: [Telegram] Connected to Telegram (polling mode)',
    '2026-06-17 16:00:27,390 WARNING gateway.platforms.telegram: [Telegram] Telegram polling conflict (1/5)',
    '2026-06-17 16:03:41,667 INFO gateway.platforms.telegram: [Telegram] Connected to Telegram (webhook mode)',
  ].join('\n'), /Connected to Telegram \(webhook mode\)/),
  '2026-06-17 16:03:41'
);

assert.deepStrictEqual(
  latestTunnelWebhookProof([
    'noise',
    '{"before_url_present":false,"set_webhook_ok":true,"webhook_url_registered":false}',
    '{"before_url_present":false,"set_webhook_ok":true,"webhook_url_registered":true,"pending_update_count":0,"last_error_message":null}',
  ].join('\n')),
  {
    webhook_url_registered: true,
    set_webhook_ok: true,
    before_url_present: false,
    pending_update_count: 0,
    last_error_message: null,
  }
);
assert.strictEqual(latestTunnelWebhookProof('noise only'), null);

console.log('test-hermes-productivity-audit-live-gate: PASS');
