#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  honesty,
  evaluateHostedInfoqCascade,
  backtest,
  STANDARDS,
} = require('../tools/hosted-infoq-cascade');

const h = honesty();
assert.strictEqual(h.clonedSafeChat, false);
assert.strictEqual(h.clonedWriteGuardPortal, false);
assert.strictEqual(h.clonedCloudflareCodex, false);
assert.strictEqual(h.nextJs16_3Upgrade, false);
assert.strictEqual(h.counselClearance, false);

assert.strictEqual(evaluateHostedInfoqCascade('Summarize the last commits and open a PR draft.').allowed, true);
assert.strictEqual(
  evaluateHostedInfoqCascade('Explain Cloudflare WriteGuard and Next.js 16.3 Instant Navigations.').allowed,
  true,
);
assert.strictEqual(evaluateHostedInfoqCascade('What is Photon vs BlueBubbles in the Nous docs?').allowed, true);

assert.strictEqual(evaluateHostedInfoqCascade('git push --force origin main').allowed, false);
assert.strictEqual(evaluateHostedInfoqCascade('git push --force origin main').code, 'force_push');
assert.strictEqual(evaluateHostedInfoqCascade('wrangler deploy the Worker to production from this chat').code, 'production_deploy');
assert.strictEqual(
  evaluateHostedInfoqCascade('text them via Photon iMessage using hermes photon setup').code,
  'photon_imessage',
);

const secret = evaluateHostedInfoqCascade(`charge this card ${['sk', 'live', 'exampleSecretValue99'].join('_')}`);
assert.strictEqual(secret.allowed, false);
assert.strictEqual(secret.code, 'secret_shape');

const bt = backtest();
assert.strictEqual(bt.ok, true, JSON.stringify(bt.rows.filter((r) => !r.ok), null, 2));
assert.strictEqual(bt.total, 7);
assert.strictEqual(bt.failed, 0);

assert.ok(STANDARDS.some((s) => s.id === 'next-instant-navigations' && s.state === 'guidance'));
assert.ok(STANDARDS.every((s) => s.kind === 'MUST' || s.kind === 'SHOULD'));

console.log('ok tests/test-hosted-infoq-cascade.js');
