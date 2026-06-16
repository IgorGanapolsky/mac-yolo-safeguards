'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  collect,
  genericContextLoss,
  inboundMessages,
  parseArgs,
  responseReady,
} = require('../tools/hermes-telegram-incident-audit');

assert.strictEqual(parseArgs(['--slow-turn-seconds', '120']).slowTurnSeconds, 120);
assert.throws(() => parseArgs(['--slow-turn-seconds', '0']), /positive number/);

const sampleLines = [
  "2026-06-16 10:57:53,155 INFO gateway.run: inbound message: platform=telegram user=Igor Ganapolsky chat=123456789 msg='Why are we blocked on making money?'",
  '2026-06-16 11:04:16,359 INFO agent.auxiliary_client: Auxiliary compression: transient transport error; retrying once on the same provider before fallback: Request timed out.',
  "2026-06-16 11:14:31,917 INFO agent.chat_completion_helpers: Streaming failed before delivery: Error code: 401 - {'status': 401, 'message': 'Your API key is invalid, blocked or out of funds.'}",
  '2026-06-16 11:15:29,228 INFO gateway.run: response ready: platform=telegram chat=123456789 time=1056.1s api_calls=4 response=367 chars',
  '2026-06-16 11:16:18,439 WARNING gateway.platforms.telegram: [Telegram] Telegram polling conflict (1/5) — previous session still held open on Telegram servers. Waiting 20s for it to expire. Error: Conflict: terminated by other getUpdates request',
  "2026-06-16 11:37:00,000 INFO gateway.run: outbound message delivered: Done: No, it's not hopeless. I'm here to help you solve whatever problem you're facing. Please let me know what you need assistance with.",
];

assert.strictEqual(inboundMessages(sampleLines).length, 1);
assert.strictEqual(responseReady(sampleLines)[0].seconds, 1056.1);
assert.strictEqual(genericContextLoss(sampleLines).length, 1);

const hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-incident-test-'));
fs.mkdirSync(path.join(hermesHome, 'logs'));
fs.writeFileSync(path.join(hermesHome, 'logs', 'gateway.log'), `${sampleLines.join('\n')}\n`);
fs.writeFileSync(path.join(hermesHome, 'logs', 'gateway.error.log'), '');
fs.writeFileSync(path.join(hermesHome, 'logs', 'agent.log'), [
  '2026-06-16 10:57:59,774 INFO agent.conversation_compression: context compression started: session=abc messages=128 tokens=~91056',
  '2026-06-16 11:14:00,000 WARNING agent.conversation_loop: API call failed provider=nous summary=HTTP 503 temporarily unavailable',
].join('\n'));

const report = collect({ hermesHome, slowTurnSeconds: 300 });
assert.strictEqual(report.metrics.inboundMessages, 1);
assert.strictEqual(report.metrics.slowResponses, 1);
assert.strictEqual(report.metrics.worstResponseSeconds, 1056.1);
assert.ok(report.metrics.pollingConflicts >= 1);
assert.ok(report.metrics.providerFailures >= 1);
assert.ok(report.metrics.compressionStarts >= 1);
assert.ok(report.metrics.genericContextLossReplies >= 1);
assert.ok(report.findings.some((finding) => finding.title.includes('operator timeout')));
assert.ok(report.findings.some((finding) => finding.title.includes('polling conflicts')));
assert.ok(report.findings.some((finding) => finding.title.includes('context-lost')));

fs.rmSync(hermesHome, { recursive: true, force: true });

console.log('Hermes Telegram incident audit tests: PASS');
