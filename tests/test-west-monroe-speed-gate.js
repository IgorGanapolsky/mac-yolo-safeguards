'use strict';

const assert = require('assert');
const {
  assessWestMonroeSpeed,
  assessDecision,
  assessOnePager,
  assessDecisionLog,
} = require('../tools/west-monroe-speed-gate');

const empty = assessWestMonroeSpeed();
assert.strictEqual(empty.passed, false);
assert.strictEqual(empty.files_written, false);
assert.strictEqual(empty.cadence_written, false);
assert.strictEqual(empty.survey_copied_as_our_result, false);
assert.strictEqual(empty.revenue_loss_measured, false);
assert.strictEqual(empty.revenue_loss_pct, null);
assert.strictEqual(empty.weekly_rework_pct, null);
assert.strictEqual(empty.levers_happening, 0);
assert.strictEqual(empty.seven_speed_levers.length, 7);
assert.ok(empty.seven_speed_levers.every((lever) => lever.happening === false && lever.enforced === false));
assert.strictEqual(empty.ai_handoff_friction_guard.slowness_tax_eliminated, false);
assert.strictEqual(empty.ai_handoff_friction_guard.ai_alone_makes_the_organization_faster, false);
assert.strictEqual(empty.ai_handoff_friction_guard.estimated_weekly_time_saved_from_zero_rework_pct, null);
assert.strictEqual(empty.ai_handoff_friction_guard.reversible_agent_decision_latency_ms, null);
assert.deepStrictEqual(empty.ai_handoff_friction_guard.decision_states, ['approve', 'revise', 'escalate']);
assert.strictEqual(empty.caller_hq_claim_accepted, false);
assert.strictEqual(empty.visibility.hud_updated, false);
assert.strictEqual(empty.single_source.shadow_tracking_blocked, false);
assert.strictEqual(empty.short_cycle.cycle_minutes_measured, null);

const secret = 'speed-token-do-not-echo';
const filled = assessWestMonroeSpeed({
  personalHqVerified: true,
  systemName: secret,
  decision: { owner: secret, state: 'approve' },
  onePager: { outcomes: secret, successMetrics: secret, dependencies: secret },
  decisionLog: { owner: secret, context: secret, date: '2026-11-02' },
  increment: { name: secret, impact: 18 },
});
assert.strictEqual(filled.passed, false);
assert.strictEqual(filled.caller_hq_claim_accepted, false);
assert.strictEqual(filled.caller_said_hq_verified, true);
assert.strictEqual(filled.decision.shape_complete, true);
assert.strictEqual(filled.decision.decision_recorded, false);
assert.strictEqual(filled.decision.decision_rights_verified, false);
assert.strictEqual(filled.decision.response_window_enforced, false);
assert.strictEqual(filled.decision.owner_echoed, false);
assert.strictEqual(filled.one_pager.shape_complete, true);
assert.strictEqual(filled.one_pager.agreement_recorded, false);
assert.strictEqual(filled.decision_log.shape_complete, true);
assert.strictEqual(filled.decision_log.logged, false);
assert.strictEqual(filled.decision_log.ai_capture_ran, false);
assert.strictEqual(filled.increment.increment_named, true);
assert.strictEqual(filled.increment.impact_measured, false);
assert.strictEqual(filled.increment.impact_value, null);
assert.strictEqual(filled.increment.caller_impact_accepted, false);
assert.strictEqual(filled.single_source.system_named, true);
assert.strictEqual(filled.single_source.shadow_tracking_blocked, false);
assert.strictEqual(filled.levers_happening, 0);
const body = JSON.stringify(filled);
assert.ok(!body.includes(secret));
assert.ok(!body.includes('73'));
assert.ok(!body.includes('56'));
assert.ok(!body.includes('"18"') && filled.increment.impact_value !== 18);

const badState = assessDecision({ owner: 'Ada', state: 'ship' });
assert.strictEqual(badState.shape_complete, false);
assert.strictEqual(badState.decision_recorded, false);

const partialPage = assessOnePager({ outcomes: 'a result' });
assert.deepStrictEqual(partialPage.missing_fields, ['success_metrics', 'dependencies']);
assert.strictEqual(partialPage.agreement_recorded, false);

const partialLog = assessDecisionLog({ owner: 'Ada', context: 'why' });
assert.deepStrictEqual(partialLog.missing_fields, ['date']);
assert.strictEqual(partialLog.logged, false);
assert.strictEqual(partialLog.ai_capture_ran, false);

console.log('PASS tests/test-west-monroe-speed-gate.js');
