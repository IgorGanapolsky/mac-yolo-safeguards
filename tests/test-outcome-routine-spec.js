'use strict';

const assert = require('assert');
const {
  validateSpec,
  exampleSpec,
  selfTest,
  main,
} = require('../tools/outcome-routine-spec');

console.log('=== test-outcome-routine-spec ===');

const example = exampleSpec();
const good = validateSpec(example);
assert.strictEqual(good.ok, true, JSON.stringify(good.errors));
assert.strictEqual(good.skills.length, 1);
assert.strictEqual(good.routines.length, 1);

const badEvent = validateSpec({
  routines: [{
    name: 'too-broad',
    owning_bot: 'Chief',
    schedule_or_event: 'every new message',
    timezone: 'UTC',
    input_source: 'slack',
    skill_name: 'x',
    expected_result: 'noise',
    approval_boundary: 'drafts only',
    missing_source_policy: 'report failure; do not invent',
    stale_data_policy: 'refetch each run; fail if age > 1h',
    partial_completion_report: 'list failed sources',
  }],
});
assert.strictEqual(badEvent.ok, false);
assert(badEvent.errors.some((e) => /broad/i.test(e)));

const invent = validateSpec({
  routines: [{
    name: 'invent',
    owning_bot: 'Chief',
    schedule_or_event: 'weekday 09:00',
    timezone: 'America/New_York',
    input_source: 'crm',
    skill_name: 'x',
    expected_result: 'list',
    approval_boundary: 'drafts only',
    missing_source_policy: 'guess from memory',
    stale_data_policy: 'reuse yesterday fine',
    partial_completion_report: 'n/a',
  }],
});
assert.strictEqual(invent.ok, false);

const incompleteSkill = validateSpec({ skills: [{ name: 'only-name' }] });
assert.strictEqual(incompleteSkill.ok, false);
assert(incompleteSkill.errors.length >= 5);

const st = selfTest();
assert.strictEqual(st.ok, true);
assert.strictEqual(st.cases, 3);

assert.strictEqual(main(['self-test']), 0);
assert.strictEqual(main(['example']), 0);
assert.strictEqual(main([]), 0);
assert.strictEqual(main(['nope']), 2);

console.log('✅ test-outcome-routine-spec PASSED');
