#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { findCrossPrConflicts, isClaimedPath, parseArgs } = require('../tools/plan-claim-conflicts');

// Real claim-line shapes copied from plan.md §2 so the parser is exercised against
// production formatting, not a tidied-up fixture.
const OTHER_PR = {
  number: 1191,
  branch: 'fix/hermes-mobile-aeo-seo-20260723',
  author: 'grok',
  addedLines: [
    '- `hermes-mobile/src/screens/ChatScreen.tsx` (composer only), `plan.md` → **grok-hermes-mobile-aeo-20260723** (T-HERMES-MOBILE-AEO-SEO-20260723) (2026-07-23T10:00:00Z)',
  ],
};

// 1. The 2026-07-23 hole: a claim that exists only on an unmerged branch is found.
const hit = findCrossPrConflicts({
  files: ['hermes-mobile/src/screens/ChatScreen.tsx'],
  prClaims: [OTHER_PR],
});
assert.strictEqual(hit.length, 1, 'claim living only in an open PR is detected');
assert.strictEqual(hit[0].owner, 'grok-hermes-mobile-aeo-20260723');
assert.strictEqual(hit[0].pr, 1191);

// 2. Your own claim is not a conflict with yourself.
assert.strictEqual(
  findCrossPrConflicts({
    files: ['hermes-mobile/src/screens/ChatScreen.tsx'],
    prClaims: [OTHER_PR],
    selfOwner: 'grok-hermes-mobile-aeo-20260723',
  }).length,
  0,
);

// 3. Your own PR is skipped entirely.
assert.strictEqual(
  findCrossPrConflicts({
    files: ['hermes-mobile/src/screens/ChatScreen.tsx'],
    prClaims: [OTHER_PR],
    selfPr: 1191,
  }).length,
  0,
);

// 4. Unrelated files do not trip it — this gate must not cry wolf, or agents route around it.
assert.strictEqual(
  findCrossPrConflicts({ files: ['tools/hermes-economic-router.js'], prClaims: [OTHER_PR] }).length,
  0,
);

// 5. `released by` lines are NOT active claims (parseOwnershipLocks drops them).
assert.strictEqual(
  findCrossPrConflicts({
    files: ['apps/hermes-control-plane/app/page.tsx'],
    prClaims: [{
      number: 744,
      addedLines: ['- `apps/hermes-control-plane/app/page.tsx`, `plan.md` → **released by codex-thumbgate-ux** after PR #744 merged (2026-07-21T23:05:00Z)'],
    }],
  }).length,
  0,
  'a released lock must not block a new claim',
);

// 6. Directory claims cover files beneath them.
assert.strictEqual(
  findCrossPrConflicts({
    files: ['hermes-mobile/src/utils/gatewayEndpoint.ts'],
    prClaims: [{ number: 9, addedLines: ['- `hermes-mobile/src/utils` → **codex-utils** (T-X) (2026-07-30T00:00:00Z)'] }],
  }).length,
  1,
  'directory claim covers nested files',
);

// 7. Glob claims (`drizzle/meta/*`) appear verbatim in plan.md and must match.
assert(isClaimedPath('apps/hermes-control-plane/drizzle/meta/0001_snapshot.json', 'apps/hermes-control-plane/drizzle/meta/*'));
assert(!isClaimedPath('apps/hermes-control-plane/db/schema.ts', 'apps/hermes-control-plane/drizzle/meta/*'));

// 8. A near-miss prefix must not match: `app/page.tsx` vs a claim on `app/page.tsx.bak`.
assert(!isClaimedPath('apps/x/page.tsx', 'apps/x/page.tsx.bak'));
assert(!isClaimedPath('toolsX/a.js', 'tools'));

// 9. Multiple open PRs both claiming the same file report both owners.
const twoWay = findCrossPrConflicts({
  files: ['plan.md'],
  prClaims: [
    { number: 1, addedLines: ['- `plan.md` → **agent-a** (T-A) (2026-07-31T00:00:00Z)'] },
    { number: 2, addedLines: ['- `plan.md` → **agent-b** (T-B) (2026-07-31T00:00:00Z)'] },
  ],
});
assert.strictEqual(twoWay.length, 2);
assert.deepStrictEqual(twoWay.map((c) => c.owner).sort(), ['agent-a', 'agent-b']);

// 10. Empty / malformed input is inert rather than throwing.
assert.strictEqual(findCrossPrConflicts({ files: [], prClaims: [] }).length, 0);
assert.strictEqual(findCrossPrConflicts({ files: ['a.js'], prClaims: [{ number: 3, addedLines: [] }] }).length, 0);
assert.strictEqual(findCrossPrConflicts({ files: ['a.js'], prClaims: [{ number: 3 }] }).length, 0);

// 11. Arg parsing: --files consumes until the next flag.
const parsed = parseArgs(['--files', 'a.js', 'b.js', '--owner', 'me', '--self-pr', '42', '--json']);
assert.deepStrictEqual(parsed.files, ['a.js', 'b.js']);
assert.strictEqual(parsed.owner, 'me');
assert.strictEqual(parsed.selfPr, 42);
assert.strictEqual(parsed.json, true);
assert.throws(() => parseArgs(['--nope']), /Unknown argument/);

console.log('plan-claim-conflicts tests: PASS (11 groups)');
