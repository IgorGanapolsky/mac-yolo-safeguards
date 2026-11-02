'use strict';

const assert = require('assert');
const {
  assessInteractCue,
  assessPreview,
  assessAnswer,
} = require('../tools/interact-cue-gate');

const empty = assessInteractCue();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.cue_installed, false);
assert.strictEqual(empty.intranet_shipped, false);
assert.strictEqual(empty.workday_connected, false);
assert.strictEqual(empty.servicenow_connected, false);
assert.strictEqual(empty.awards_claimed, false);
assert.strictEqual(empty.answer_first_cited_retrieval.answer_comes_first, false);
assert.strictEqual(empty.answer_first_cited_retrieval.citation_checked, false);
assert.strictEqual(empty.answer_first_cited_retrieval.shape_complete, false);
assert.deepStrictEqual(empty.system_of_record_task_completion.action_preview_card_contract.controls, [
  'Confirm',
  'Edit',
]);
assert.strictEqual(empty.system_of_record_task_completion.action_preview_card_contract.controls_enabled, false);
assert.strictEqual(empty.system_of_record_task_completion.action_performed, false);
assert.deepStrictEqual(empty.system_of_record_task_completion.connected_systems, []);
assert.strictEqual(empty.two_lane_priority_feed.needs_you_split, false);
assert.strictEqual(empty.two_lane_priority_feed.needs_you_count, null);
assert.strictEqual(empty.two_lane_priority_feed.inline_one_click_actions_enabled, false);
assert.strictEqual(empty.permission_aware_governance.enforces_caller_lease_permissions, false);
assert.strictEqual(empty.permission_aware_governance.cross_scope_quote_leak_blocked, false);
assert.strictEqual(empty.permission_aware_governance.permission_check_ran, false);
assert.strictEqual(empty.layout_adapted, false);
assert.strictEqual(empty.directory_read, false);
assert.deepStrictEqual(empty.lenses_planned, ['new starter', 'manager', 'frontline']);
assert.strictEqual(empty.comms.acknowledgement_recorded, false);
assert.strictEqual(empty.comms.mandatory_auto_acked, false);
assert.strictEqual(empty.insights.generated, false);
assert.strictEqual(empty.insights.policy_gaps_counted, null);

const secret = 'cue-token-do-not-echo';
const filled = assessInteractCue({
  answer: secret,
  sources: [{ title: secret, locator: 'policy/leave' }],
  preview: { action_type: 'book leave', destination: 'calendar', summary: secret },
  prior: secret,
  followUp: 'what about next week',
  callerSaidAllowed: true,
  role: 'manager',
});
assert.strictEqual(filled.passed, false);
assert.strictEqual(filled.answer_first_cited_retrieval.shape_complete, true);
assert.strictEqual(filled.answer_first_cited_retrieval.answer_comes_first, false);
assert.strictEqual(filled.answer_first_cited_retrieval.citation_checked, false);
assert.strictEqual(filled.answer_first_cited_retrieval.answer_echoed, false);
assert.strictEqual(filled.system_of_record_task_completion.preview.shape_complete, true);
assert.strictEqual(filled.system_of_record_task_completion.preview.confirm_received, false);
assert.strictEqual(filled.system_of_record_task_completion.action_performed, false);
assert.strictEqual(filled.context.both_named, true);
assert.strictEqual(filled.context.context_retained_verified, false);
assert.strictEqual(filled.permission_aware_governance.caller_said_allowed, true);
assert.strictEqual(filled.permission_aware_governance.caller_claim_accepted, false);
assert.strictEqual(filled.role_named, true);
assert.strictEqual(filled.layout_adapted, false);
const body = JSON.stringify(filled);
assert.ok(!body.includes(secret));
assert.ok(!body.includes('9 days'));
assert.ok(!body.includes('INC-'));
assert.ok(!body.includes('1500'));
assert.ok(!body.includes('Gartner'));

const contactOnly = assessPreview({ action_type: 'contact HR', summary: 'ask them' });
assert.strictEqual(contactOnly.shape_complete, false);
assert.strictEqual(contactOnly.ends_at_contact_someone, true);
assert.strictEqual(contactOnly.action_performed, false);

const bareAnswer = assessAnswer({ answer: 'two weeks notice' });
assert.strictEqual(bareAnswer.shape_complete, false);
assert.strictEqual(bareAnswer.citation_checked, false);

console.log('PASS tests/test-interact-cue-gate.js');
