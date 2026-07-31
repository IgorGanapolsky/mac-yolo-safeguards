#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  classifyDsn, isRoleAddress, recordDsns, recordAliasSuccess, preflight, emptyLedger, parseArgs,
} = require('../tools/outreach-delivery-guard');

// Real DSN snippets captured from Gmail on 2026-07-31 — not paraphrased.
const DSN_ADDRESS_NOT_FOUND = "Address not found Your message wasn't delivered to hello@factory.ai because the address couldn't be found, or is unable to receive mail. The response was: 550 5.1.1 The email account";
const DSN_ALIAS_BROKEN = "Message not delivered You're sending this from a different address or alias using the 'Send mail as' feature. The settings for your 'Send mail as' account are misconfigured or out of date.";

assert.strictEqual(classifyDsn(DSN_ADDRESS_NOT_FOUND), 'address_not_found');
assert.strictEqual(classifyDsn(DSN_ALIAS_BROKEN), 'sender_alias_misconfigured');
assert.strictEqual(classifyDsn('your mailbox is over quota'), 'other');
assert.strictEqual(classifyDsn(''), 'other');
assert.strictEqual(classifyDsn(null), 'other');

// The alias classifier must win: that DSN also contains "not delivered" wording.
assert.strictEqual(classifyDsn(`${DSN_ALIAS_BROKEN} 550 5.1.1`), 'sender_alias_misconfigured');

assert(isRoleAddress('hello@factory.ai'));
assert(isRoleAddress('TEAM@galileo.ai'));
assert(isRoleAddress('support@mem0.ai'));
assert(!isRoleAddress('raj@teamcalendar.ai'));
assert(!isRoleAddress('vinod@chatfin.ai'));

// Build the ledger from the real 2026-07-29 / 2026-07-31 events.
let ledger = recordDsns(emptyLedger(), [
  { kind: 'address_not_found', recipient: 'hello@factory.ai', at: '2026-07-31T13:21:48Z' },
  { kind: 'address_not_found', recipient: 'team@galileo.ai', at: '2026-07-31T13:21:32Z' },
  { kind: 'sender_alias_misconfigured', alias: 'igor@igorganapolsky.com', at: '2026-07-29T19:04:11Z' },
  { kind: 'sender_alias_misconfigured', alias: 'igor@igorganapolsky.com', at: '2026-07-30T00:53:07Z' },
]);
assert.strictEqual(Object.keys(ledger.hardBounced).length, 2);
assert.strictEqual(ledger.aliases['igor@igorganapolsky.com'].failures, 2);

// 1. The class-B catch: a broken alias blocks the send even to a perfect recipient.
const aliasBlocked = preflight({
  from: 'igor@igorganapolsky.com',
  to: ['raj@teamcalendar.ai'],
  ledger,
  now: '2026-07-31T14:00:00Z',
});
assert.strictEqual(aliasBlocked.length, 1);
assert(/unresolved delivery failure/.test(aliasBlocked[0]));

// 2. The class-A catch: re-sending to a known hard bounce is blocked.
assert(preflight({
  from: 'iganapolsky@gmail.com',
  to: ['hello@factory.ai'],
  ledger,
  now: '2026-07-31T14:00:00Z',
}).some((v) => /previously hard-bounced/.test(v)));

// 3. Guessed role addresses are blocked by default...
assert(preflight({
  from: 'iganapolsky@gmail.com',
  to: ['hello@somenewvendor.ai'],
  ledger,
  now: '2026-07-31T14:00:00Z',
}).some((v) => /guessed role address/.test(v)));

// ...but remain possible with an explicit, deliberate opt-in.
assert.strictEqual(preflight({
  from: 'iganapolsky@gmail.com',
  to: ['hello@somenewvendor.ai'],
  ledger,
  now: '2026-07-31T14:00:00Z',
  allowRoleAddress: true,
}).length, 0);

// 4. A named human on a healthy alias passes — the guard must not block real work.
assert.strictEqual(preflight({
  from: 'iganapolsky@gmail.com',
  to: ['raj@teamcalendar.ai', 'vinod@chatfin.ai'],
  ledger,
  now: '2026-07-31T14:00:00Z',
}).length, 0);

// 5. Only a verified delivery AFTER the failure clears an alias.
const repaired = recordAliasSuccess(ledger, 'igor@igorganapolsky.com', '2026-07-31T15:00:00Z');
assert.strictEqual(preflight({
  from: 'igor@igorganapolsky.com',
  to: ['raj@teamcalendar.ai'],
  ledger: repaired,
  now: '2026-07-31T15:30:00Z',
}).length, 0, 'alias clears once it actually delivers');

// A success recorded BEFORE the failure must not clear it.
const stillBroken = recordDsns(
  recordAliasSuccess(emptyLedger(), 'igor@igorganapolsky.com', '2026-07-01T00:00:00Z'),
  [{ kind: 'sender_alias_misconfigured', alias: 'igor@igorganapolsky.com', at: '2026-07-29T19:04:11Z' }],
);
assert.strictEqual(preflight({
  from: 'igor@igorganapolsky.com',
  to: ['raj@teamcalendar.ai'],
  ledger: stillBroken,
  now: '2026-07-31T14:00:00Z',
}).length, 1, 'an older success must not clear a newer failure');

// 6. A long-stale alias is flagged for re-probing before a batch.
const stale = recordAliasSuccess(
  recordDsns(emptyLedger(), [{ kind: 'sender_alias_misconfigured', alias: 'x@y.com', at: '2026-05-01T00:00:00Z' }]),
  'x@y.com', '2026-05-02T00:00:00Z',
);
assert(preflight({ from: 'x@y.com', to: ['a@b.com'], ledger: stale, now: '2026-07-31T00:00:00Z' })
  .some((v) => /re-probe/.test(v)));

// 7. Unknown alias with an empty ledger is not blocked — fail-closed on evidence, not on ignorance.
assert.strictEqual(preflight({
  from: 'brand-new@alias.com', to: ['someone@real.com'], ledger: emptyLedger(), now: '2026-07-31T00:00:00Z',
}).length, 0);

// 8. Arg parsing.
const p = parseArgs(['check', '--from', 'a@b.com', '--to', 'x@y.com', 'z@w.com', '--json']);
assert.strictEqual(p.command, 'check');
assert.deepStrictEqual(p.to, ['x@y.com', 'z@w.com']);
assert.strictEqual(p.json, true);
assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);

console.log('outreach-delivery-guard tests: PASS (8 groups)');
