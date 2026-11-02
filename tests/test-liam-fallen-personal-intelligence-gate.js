'use strict';

const assert = require('assert');
const {
  assessLiamFallenPersonalIntelligence,
  assessOpenLoop,
  assessHandoff,
  assessAction,
} = require('../tools/liam-fallen-personal-intelligence-gate');

const empty = assessLiamFallenPersonalIntelligence();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.files_written, false);
assert.strictEqual(empty.directory_created, false);
assert.strictEqual(empty.prompt_catalog_copied, false);
assert.strictEqual(empty.grok_bots_created, false);
assert.strictEqual(empty.bots_created, 0);
assert.strictEqual(empty.five_documents_verified, false);
assert.strictEqual(empty.primary_bot, null);
assert.strictEqual(empty.primary_bot_set, false);
assert.strictEqual(empty.five_bot_roster.length, 5);
assert.deepStrictEqual(empty.start_with_three, [
  'Chief of Staff',
  'Inbox Manager',
  'Calendar Manager',
]);
assert.strictEqual(empty.start_set_created, false);
assert.strictEqual(empty.documents.length, 5);
assert.strictEqual(empty.connections.email_connected, false);
assert.strictEqual(empty.connections.calendar_connected, false);
assert.strictEqual(empty.connections.caller_connection_accepted, false);
assert.strictEqual(empty.security_boundary_upgrade.per_bot_disposable_30m_lease_enforced, false);
assert.strictEqual(empty.security_boundary_upgrade.shared_cloud_browser_session_risk_mitigated, false);
assert.strictEqual(empty.security_boundary_upgrade.separate_bots_are_separate_security_boundaries, false);
assert.strictEqual(empty.security_boundary_upgrade.approval_gate_installed, false);
assert.strictEqual(empty.routines_scheduled, 0);
assert.strictEqual(empty.task_tested_before_schedule, false);
assert.strictEqual(empty.briefing_sent, false);
assert.strictEqual(empty.inbox_review_ran, false);
assert.strictEqual(empty.renewal_example_ran, false);
assert.strictEqual(empty.external_message_sent, false);
assert.strictEqual(empty.purchase_made, false);
assert.strictEqual(empty.group_chat_created, false);
assert.strictEqual(empty.open_loop.shape_complete, false);
assert.strictEqual(empty.open_loop.recorded, false);
assert.strictEqual(empty.handoff.handoff_executed, false);

const secret = 'loop-token-do-not-echo';
const filled = assessLiamFallenPersonalIntelligence({
  openLoop: {
    task: secret,
    original_source: 'fixture',
    next_action: 'read the note',
    due_date: '2026-11-09',
    responsible_bot: 'Inbox Manager',
    current_status: 'open',
  },
  handoff: {
    context: secret,
    original_source: 'fixture',
    deadline: '2026-11-09',
    expected_result: 'a calendar check',
    from_role: 'Inbox Manager',
    to_role: 'Calendar Manager',
  },
  action: 'make_purchase',
  emailConnected: true,
});
assert.strictEqual(filled.passed, false);
assert.strictEqual(filled.open_loop.shape_complete, true);
assert.strictEqual(filled.open_loop.recorded, false);
assert.strictEqual(filled.open_loop.duplicate_checked, false);
assert.strictEqual(filled.open_loop.entry_echoed, false);
assert.strictEqual(filled.handoff.shape_complete, true);
assert.strictEqual(filled.handoff.handoff_executed, false);
assert.strictEqual(filled.handoff.message_sent, false);
assert.strictEqual(filled.handoff.fields_echoed, false);
assert.strictEqual(filled.action.needs_approval, true);
assert.strictEqual(filled.action.approval_granted, false);
assert.strictEqual(filled.action.action_performed, false);
assert.strictEqual(filled.connections.email_connected, false);
assert.strictEqual(filled.purchase_made, false);
assert.ok(!JSON.stringify(filled).includes(secret));
assert.ok(!JSON.stringify(filled).includes('84%'));
assert.ok(!JSON.stringify(filled).includes('64%'));
assert.ok(!JSON.stringify(filled).includes('Beam'));
assert.ok(!JSON.stringify(filled).includes('CleanMyMac'));

const incomplete = assessOpenLoop({
  task: 'renewal',
  original_source: 'fixture',
  next_action: 'compare',
  responsible_bot: 'Researcher',
  current_status: 'open',
});
assert.strictEqual(incomplete.shape_complete, false);
assert.deepStrictEqual(incomplete.missing_fields, ['due_date']);
assert.strictEqual(incomplete.recorded, false);

const unknownBot = assessOpenLoop({
  task: 'renewal',
  original_source: 'fixture',
  next_action: 'compare',
  due_date: '2026-11-09',
  responsible_bot: 'Finance Bot',
  current_status: 'open',
});
assert.strictEqual(unknownBot.responsible_bot_known, false);
assert.strictEqual(unknownBot.shape_complete, false);

const sameRole = assessHandoff({
  context: 'same desk',
  original_source: 'fixture',
  deadline: '2026-11-09',
  expected_result: 'a note',
  from_role: 'Researcher',
  to_role: 'Researcher',
});
assert.strictEqual(sameRole.shape_complete, false);
assert.strictEqual(sameRole.distinct_roles, false);
assert.strictEqual(sameRole.handoff_executed, false);

const unnamed = assessAction('wire_money_anyway');
assert.strictEqual(unnamed.needs_approval, false);
assert.strictEqual(unnamed.action_performed, false);
assert.strictEqual(unnamed.approval_gate_installed, false);

console.log('PASS tests/test-liam-fallen-personal-intelligence-gate.js');
