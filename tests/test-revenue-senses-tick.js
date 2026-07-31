#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { diffState, senderSummary } = require('../tools/revenue-senses-tick');

// 1. Silence is the normal case. A watcher that shouts every tick gets muted.
assert.deepStrictEqual(
  diffState(
    { reachable: true, funnel: { landingViewsToday: 12, signInClicksToday: 0 }, sender: { brokenSenders: 1, hardBounced: 5 } },
    { reachable: true, funnel: { landingViewsToday: 12, signInClicksToday: 0 }, sender: { brokenSenders: 1, hardBounced: 5 } },
  ),
  [],
);

// 2. First run (no prior state) must not spray every field as a "change".
assert.deepStrictEqual(
  diffState(null, { reachable: true, funnel: { landingViewsToday: 12, signInClicksToday: 0 }, sender: { brokenSenders: 1 } }),
  [],
);

// 3. The money event: a new paid org.
const money = diffState(
  { funnel: { paidOrganizationsTotal: 1 } },
  { funnel: { paidOrganizationsTotal: 2 } },
);
assert.strictEqual(money.length, 1);
assert.strictEqual(money[0].level, 'money');
assert(/NON-OWNER/.test(money[0].text), 'must not let a paid org be called revenue without Stripe verification');

// 4. The falsifiable test from 2026-07-30: sign-in clicks leaving zero.
const converted = diffState(
  { funnel: { signInClicksToday: 0 } },
  { funnel: { signInClicksToday: 3 } },
);
assert(converted.some((c) => c.level === 'signal' && /moved off zero/.test(c.text)));

// ...but 0 -> 0 is not news, and a drop back to 0 (next day rollover) is not a "signal".
assert.deepStrictEqual(diffState({ funnel: { signInClicksToday: 0 } }, { funnel: { signInClicksToday: 0 } }), []);
assert(!diffState({ funnel: { signInClicksToday: 3 } }, { funnel: { signInClicksToday: 0 } })
  .some((c) => c.level === 'signal'));

// 5. A sender going bad is an ALERT — this is the 2026-07-29 failure.
const broke = diffState({ sender: { brokenSenders: 0 } }, { sender: { brokenSenders: 1 } });
assert.strictEqual(broke[0].level, 'alert');
assert(/silently not arriving/.test(broke[0].text));

// Recovery is good news, not an alert.
assert.strictEqual(diffState({ sender: { brokenSenders: 1 } }, { sender: { brokenSenders: 0 } })[0].level, 'signal');

// 6. New hard bounces = reputation being spent.
const bounced = diffState({ sender: { hardBounced: 5 } }, { sender: { hardBounced: 9 } });
assert(bounced.some((c) => c.level === 'alert' && /4 new hard bounce/.test(c.text)));

// 7. Reachability reports on TRANSITION only, never every tick while down.
assert(diffState({ reachable: true }, { reachable: false }).some((c) => /unreachable/.test(c.text)));
assert(!diffState({ reachable: false }, { reachable: false }).some((c) => /unreachable/.test(c.text)));
assert(diffState({ reachable: false }, { reachable: true }).some((c) => /reachable again/.test(c.text)));

// 8. Nulls (an unreachable probe) must never be treated as a measured zero.
assert.deepStrictEqual(
  diffState({ funnel: { landingViewsToday: 12 } }, { funnel: { landingViewsToday: null } }),
  [],
  'a failed probe must not read as a drop to zero',
);

// 9. senderSummary: cleared only by a success AFTER the latest failure.
const summary = senderSummary({
  aliases: {
    'broken@x.com': { lastFailureAt: '2026-07-29T00:00:00Z', lastSuccessAt: null },
    'stale@x.com': { lastFailureAt: '2026-07-29T00:00:00Z', lastSuccessAt: '2026-07-01T00:00:00Z' },
    'ok@x.com': { lastFailureAt: '2026-07-29T00:00:00Z', lastSuccessAt: '2026-07-31T00:00:00Z' },
  },
  hardBounced: { 'a@b.com': {}, 'c@d.com': {} },
});
assert.strictEqual(summary.brokenSenders, 2, 'an older success must not clear a newer failure');
assert.strictEqual(summary.usableSenders, 1);
assert.strictEqual(summary.hardBounced, 2);
assert.deepStrictEqual(senderSummary(null), { present: false });

console.log('revenue-senses-tick tests: PASS (9 groups)');
