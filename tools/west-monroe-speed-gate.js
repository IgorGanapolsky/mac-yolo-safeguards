'use strict';

/**
 * Checks from West Monroe, "Why Speed Matters" and "7 Ways to Increase Business Speed".
 * Sources:
 *   https://www.westmonroe.com/insights/why-speed-matters
 *   https://www.westmonroe.com/insights/7-ways-to-increase-business-speed
 *
 * Their survey figures stay theirs. A named owner, a one-page plan, and a
 * decision-log shape do not measure revenue, rework, or a response time.
 * This module does not write a ledger.
 */

const SOURCE = 'https://www.westmonroe.com/insights/why-speed-matters';
const PLAYBOOK = 'https://www.westmonroe.com/insights/7-ways-to-increase-business-speed';

const DECISION_STATES = ['approve', 'revise', 'escalate'];

const LEVERS = [
  { id: 1, habit: 'One named owner, then approve, revise, or escalate.' },
  { id: 2, habit: 'One page: outcomes, success metrics, and dependencies, agreed before work.' },
  { id: 3, habit: 'Priorities, dependencies, and blockers are visible.' },
  { id: 4, habit: 'One shared system for priorities and progress.' },
  { id: 5, habit: 'Short cycles. Progress before perfection.' },
  { id: 6, habit: 'A decision log with owner, context, and date.' },
  { id: 7, habit: 'Smaller increments whose impact is measured.' },
].map((lever) => ({ ...lever, happening: false, enforced: false }));

function filled(value) {
  return String(value == null ? '' : value).trim().length > 0;
}

function assessDecision({ owner, state } = {}) {
  const ownerNamed = filled(owner);
  const stateKnown = DECISION_STATES.includes(state);
  return {
    owner_named: ownerNamed,
    state_known: stateKnown,
    shape_complete: ownerNamed && stateKnown,
    decision_rights_verified: false,
    response_window_enforced: false,
    response_window_hours: null,
    decision_recorded: false,
    owner_echoed: false,
  };
}

function assessOnePager({ outcomes, successMetrics, dependencies } = {}) {
  const present = {
    outcomes: filled(outcomes),
    success_metrics: filled(successMetrics),
    dependencies: filled(dependencies),
  };
  const missing = Object.keys(present).filter((key) => !present[key]);
  return {
    shape_complete: missing.length === 0,
    missing_fields: missing,
    agreement_recorded: false,
    fields_echoed: false,
  };
}

function assessDecisionLog({ owner, context, date } = {}) {
  const present = {
    owner: filled(owner),
    context: filled(context),
    date: filled(date),
  };
  const missing = Object.keys(present).filter((key) => !present[key]);
  return {
    shape_complete: missing.length === 0,
    missing_fields: missing,
    logged: false,
    ai_capture_ran: false,
    fields_echoed: false,
  };
}

function assessIncrement({ name } = {}) {
  return {
    increment_named: filled(name),
    impact_measured: false,
    impact_value: null,
    caller_impact_accepted: false,
  };
}

function assessWestMonroeSpeed({
  personalHqVerified,
  decision,
  onePager,
  decisionLog,
  increment,
  systemName,
} = {}) {
  const decisionCheck = assessDecision(decision);
  const onePagerCheck = assessOnePager(onePager);
  const logCheck = assessDecisionLog(decisionLog);
  const incrementCheck = assessIncrement(increment);
  return {
    source: SOURCE,
    companion_playbook: PLAYBOOK,
    passed: false,
    files_written: false,
    cadence_written: false,
    survey_copied_as_our_result: false,
    revenue_loss_measured: false,
    revenue_loss_pct: null,
    weekly_rework_pct: null,
    levers_happening: 0,
    caller_hq_claim_accepted: false,
    caller_said_hq_verified: personalHqVerified === true,
    decision: decisionCheck,
    one_pager: onePagerCheck,
    decision_log: logCheck,
    increment: incrementCheck,
    single_source: {
      system_named: filled(systemName),
      shadow_tracking_blocked: false,
      shadow_systems_counted: null,
      two_teams_gave_the_same_answer: null,
    },
    visibility: {
      priorities_visible_measured: false,
      blockers_visible_measured: false,
      hud_updated: false,
    },
    short_cycle: {
      cycle_minutes_measured: null,
      progress_over_perfection_observed: false,
      check_in_ran: false,
    },
    ai_handoff_friction_guard: {
      decision_states: DECISION_STATES,
      slowness_tax_eliminated: false,
      individual_ai_gains_protected_from_handoff_friction: false,
      single_owner_decision_rights_assigned: false,
      ai_alone_makes_the_organization_faster: false,
      max_human_decision_window_hours: null,
      reversible_agent_decision_latency_ms: null,
      estimated_weekly_time_saved_from_zero_rework_pct: null,
    },
    seven_speed_levers: LEVERS,
  };
}

module.exports = {
  DECISION_STATES,
  LEVERS,
  assessDecision,
  assessOnePager,
  assessDecisionLog,
  assessIncrement,
  assessWestMonroeSpeed,
};
