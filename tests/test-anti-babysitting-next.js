#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  lintText,
  main,
  parseArgs,
  pickNextResidual,
  refuseForbiddenFlags,
} = require('../tools/anti-babysitting-next');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

{
  const dirty = lintText('Want me to open the PR? Should I rebase?');
  assert.equal(dirty.clean, false);
  assert.ok(dirty.violations.some((v) => v.id === 'want_me_to'));
  assert.ok(dirty.violations.some((v) => v.id === 'should_i'));
  ok('flags want-me-to / should-I wrap-ups');
}

{
  const clean = lintText('Merged #1822 as 21757af97. AGENT-408 marked Done.');
  assert.equal(clean.clean, true);
  assert.deepEqual(clean.violations, []);
  ok('evidence wrap-up without questions is clean');
}

{
  const pick = pickNextResidual({
    merged_not_closed_linear: true,
    own_prs: [{ owner: 'codex', state: 'green', id: 1800 }],
    cheap_leftover: 'write skill',
  });
  assert.equal(pick.pick, 'closeout_linear');
  assert.equal(pick.steal_sibling_pr, false);
  assert.equal(pick.skipped_foreign_green, 1800);
  ok('closeout beats leftover and does not steal a sibling green PR');
}

{
  const pick = pickNextResidual({
    own_prs: [
      { owner: 'grok', state: 'red', id: 1825 },
      { owner: 'grok', state: 'green', id: 1826 },
    ],
  });
  assert.equal(pick.action, 'ci_first_fail');
  assert.equal(pick.detail, 1825);
  ok('own red PR beats own green PR');
}

{
  const pick = pickNextResidual({
    own_prs: [{ owner: 'claude-code', state: 'green', id: 1799 }],
    handoff_next: 'prove ci-first-fail on an open grok PR',
  });
  assert.equal(pick.pick, 'handoff_next');
  assert.equal(pick.steal_sibling_pr, false);
  ok('skips sibling green and takes grok handoff Next');
}

{
  assert.throws(
    () => refuseForbiddenFlags(['--auto-merge-all']),
    /sibling-steal/
  );
  assert.throws(
    () => parseArgs(['--quarantine']),
    /hide-fail/
  );
  ok('refuses --auto-merge-all and --quarantine');
}

{
  const fixture = path.join(__dirname, 'fixtures', 'anti-babysitting-next.json');
  const code = main(['--pick', '--fixture', fixture, '--json']);
  assert.equal(code, 0);
  ok('CLI --pick --fixture exits 0');
}

{
  const code = main(['--lint', 'Let me know if you want me to continue']);
  assert.equal(code, 2);
  ok('CLI --lint exits 2 on babysitting phrases');
}

console.log(`\n${passed} passed`);
