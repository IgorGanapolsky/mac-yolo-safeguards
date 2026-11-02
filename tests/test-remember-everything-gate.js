'use strict';

const assert = require('assert');
const {
  assessRememberEverything,
  assessNorthStar,
  assessWeeklyCadence,
} = require('../tools/remember-everything-gate');

const empty = assessRememberEverything();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.ledger_written, false);
assert.strictEqual(empty.product_validation_framework.single_sentence, false);
assert.strictEqual(empty.product_validation_framework.niche_verified, false);
assert.strictEqual(empty.product_validation_framework.waitlist_before_heavy_build_gate.waitlist_created, false);
assert.strictEqual(empty.product_validation_framework.waitlist_before_heavy_build_gate.landing_page_published, false);
assert.strictEqual(empty.product_validation_framework.three_line_weekly_cadence.number_measured, false);
assert.strictEqual(empty.product_validation_framework.three_line_weekly_cadence.the_number, null);
assert.strictEqual(empty.product_validation_framework.three_line_weekly_cadence.ledger_written, false);
assert.strictEqual(empty.sales_and_meeting_workflows.skeptical_buyer_objection_roleplay.roleplay_ran, false);
assert.strictEqual(empty.sales_and_meeting_workflows.skeptical_buyer_objection_roleplay.llm_called, false);
assert.strictEqual(empty.sales_and_meeting_workflows.discovery_transcript_to_proposal_pipe.followup_sent, false);
assert.strictEqual(empty.sales_and_meeting_workflows.weekly_call_coaching.max_weekly_coaching_insights, 1);
assert.strictEqual(empty.sales_and_meeting_workflows.weekly_call_coaching.coaching_insight, null);
assert.strictEqual(empty.sales_and_meeting_workflows.weekly_call_coaching.scorecard_emitted, false);
assert.strictEqual(empty.personal_productivity_and_harness.blind_spot_custom_instructions.custom_instructions_installed, false);
assert.strictEqual(empty.personal_productivity_and_harness.proactive_no_blinking_cursor_harness.blinking_cursor_eliminated, false);
assert.strictEqual(empty.personal_productivity_and_harness.proactive_no_blinking_cursor_harness.message_sent, false);
assert.strictEqual(
  empty.personal_productivity_and_harness.human_written_origin_story_guard.origin_story_generated_by_this_module,
  false,
);
assert.strictEqual(
  empty.personal_productivity_and_harness.human_written_origin_story_guard.ai_ghostwriting_blocked_on_personal_origin_story,
  false,
);
assert.strictEqual(empty.personal_productivity_and_harness.fifteen_minutes_a_day_focus_rule.daily_practice_minutes_measured, false);

const shaped = assessNorthStar({
  oneLiner: 'ThumbGate approvals for a hosted Hermes desk.',
  niche: 'people who already pay for a hosted agent desk',
});
assert.strictEqual(shaped.single_sentence, true);
assert.strictEqual(shaped.single_sentence_verified, false);
assert.strictEqual(shaped.niche_named, true);
assert.strictEqual(shaped.niche_verified, false);
assert.strictEqual(shaped.market_validated, false);

const twoSentences = assessNorthStar({
  oneLiner: 'ThumbGate is a desk. It also does everything.',
});
assert.strictEqual(twoSentences.single_sentence, false);

const cadence = assessWeeklyCadence({
  whatShipped: 'a local routing check',
  theNumber: '16 audited production sessions (84% local)',
  whatsNext: 'keep the clerk local',
});
assert.strictEqual(cadence.number_measured, false);
assert.strictEqual(cadence.caller_number_accepted, false);
assert.strictEqual(cadence.the_number, null);
assert.strictEqual(cadence.subscribers_counted, false);
assert.strictEqual(cadence.ledger_written, false);

const filled = assessRememberEverything({
  oneLiner: 'ThumbGate approvals for a hosted Hermes desk.',
  niche: 'hosted-agent buyers',
  whatShipped: 'a check',
  theNumber: 12,
  whatsNext: 'leave the waitlist unpublished',
  prospect: 'a budget-conscious buyer',
  price: '$10 per month',
  anxiety: 'they already have a chat box',
  transcript: 'they asked about approvals',
  blindSpot: 'taking the task instead of delegating it',
  workflowName: 'read one meeting note',
});
assert.strictEqual(filled.passed, false);
assert.strictEqual(filled.sales_and_meeting_workflows.skeptical_buyer_objection_roleplay.roleplay_ran, false);
assert.strictEqual(filled.sales_and_meeting_workflows.discovery_transcript_to_proposal_pipe.transcript_present, true);
assert.strictEqual(filled.sales_and_meeting_workflows.discovery_transcript_to_proposal_pipe.transcript_echoed, false);
assert.strictEqual(filled.sales_and_meeting_workflows.discovery_transcript_to_proposal_pipe.followup_draft_ready, false);
assert.strictEqual(filled.personal_productivity_and_harness.blind_spot_custom_instructions.blind_spot_named, true);
assert.strictEqual(filled.personal_productivity_and_harness.blind_spot_custom_instructions.pushback_active, false);
assert.strictEqual(filled.personal_productivity_and_harness.fifteen_minutes_a_day_focus_rule.workflows_prescribed, 1);
assert.strictEqual(filled.personal_productivity_and_harness.fifteen_minutes_a_day_focus_rule.daily_practice_minutes, null);
assert.ok(!JSON.stringify(filled).includes('90.8'));
assert.ok(!JSON.stringify(filled).includes('84%'));

console.log('PASS tests/test-remember-everything-gate.js');
