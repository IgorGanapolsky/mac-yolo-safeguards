'use strict';

/**
 * Checks from "This AI Assistant REMEMBERS Everything You Won't".
 * Source: https://www.youtube.com/watch?v=tSBx5l9VFwE
 *
 * A one-sentence pitch, a weekly trio, and a coaching cap are shape checks.
 * They do not count users, publish a waitlist, call a model, send mail, or
 * install custom instructions.
 */

const SOURCE = 'https://www.youtube.com/watch?v=tSBx5l9VFwE';

function sentenceCount(text) {
  return String(text || '')
    .trim()
    .split(/[.!?]+(?:\s|$)/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function assessNorthStar({ oneLiner = '', niche = '' } = {}) {
  const line = String(oneLiner || '').trim();
  const nicheText = String(niche || '').trim();
  return {
    one_liner: line || null,
    single_sentence: line.length > 0 && sentenceCount(line) === 1,
    single_sentence_verified: false,
    niche_named: nicheText.length > 0,
    niche: nicheText || null,
    niche_verified: false,
    market_validated: false,
  };
}

function assessWeeklyCadence({ whatShipped = '', theNumber = null, whatsNext = '' } = {}) {
  const shipped = String(whatShipped || '').trim();
  const next = String(whatsNext || '').trim();
  const callerNumber = theNumber == null ? null : String(theNumber);
  return {
    what_shipped: shipped || null,
    the_number: null,
    caller_said_number: callerNumber,
    caller_number_accepted: false,
    number_measured: false,
    subscribers_counted: false,
    whats_next: next || null,
    three_lines_present: false,
    ledger_written: false,
  };
}

function assessWaitlist() {
  return {
    waitlist_created: false,
    landing_page_published: false,
    heavy_build_validated: false,
  };
}

function assessSalesRoleplay({ prospect = '', price = '', anxiety = '' } = {}) {
  return {
    prospect_named: String(prospect || '').trim().length > 0,
    price_named: String(price || '').trim().length > 0,
    anxiety_named: String(anxiety || '').trim().length > 0,
    roleplay_ran: false,
    llm_called: false,
    objections_rehearsed: false,
  };
}

function assessDiscoveryFollowup({ transcript = '' } = {}) {
  return {
    transcript_present: String(transcript || '').trim().length > 0,
    transcript_echoed: false,
    captures_missed_details: false,
    followup_draft_ready: false,
    followup_sent: false,
    proposal_sent: false,
  };
}

function assessWeeklyCoaching() {
  return {
    max_weekly_coaching_insights: 1,
    scorecard_emitted: false,
    insight_from_transcripts: false,
    coaching_insight: null,
  };
}

function assessBlindSpot({ blindSpot = '' } = {}) {
  const named = String(blindSpot || '').trim();
  return {
    blind_spot_named: named.length > 0,
    blind_spot: named || null,
    custom_instructions_installed: false,
    pushback_active: false,
  };
}

function assessProactiveHarness() {
  return {
    crm_monitored: false,
    followup_drafted: false,
    followup_sent: false,
    message_sent: false,
    blinking_cursor_eliminated: false,
  };
}

function assessOriginStory() {
  return {
    origin_story_generated_by_this_module: false,
    ai_ghostwriting_blocked_on_personal_origin_story: false,
    human_written_claim_accepted: false,
  };
}

function assessDailyPractice({ workflowName = '' } = {}) {
  const name = String(workflowName || '').trim();
  return {
    workflow_named: name.length > 0,
    workflow: name || null,
    workflows_prescribed: name ? 1 : 0,
    daily_practice_minutes: null,
    daily_practice_minutes_measured: false,
  };
}

function assessRememberEverything({
  oneLiner = '',
  niche = '',
  whatShipped = '',
  theNumber = null,
  whatsNext = '',
  prospect = '',
  price = '',
  anxiety = '',
  transcript = '',
  blindSpot = '',
  workflowName = '',
} = {}) {
  const north = assessNorthStar({ oneLiner, niche });
  const cadence = assessWeeklyCadence({ whatShipped, theNumber, whatsNext });
  const roleplay = assessSalesRoleplay({ prospect, price, anxiety });
  const discovery = assessDiscoveryFollowup({ transcript });
  const coaching = assessWeeklyCoaching();
  const blindSpotCheck = assessBlindSpot({ blindSpot });
  const harness = assessProactiveHarness();
  const origin = assessOriginStory();
  const practice = assessDailyPractice({ workflowName });
  return {
    source: SOURCE,
    passed: false,
    ledger_written: false,
    product_validation_framework: {
      hyper_specific_north_star_one_liner: north.one_liner,
      single_sentence: north.single_sentence,
      single_sentence_verified: false,
      specific_niche_target: north.niche,
      niche_verified: false,
      three_line_weekly_cadence: cadence,
      waitlist_before_heavy_build_gate: assessWaitlist(),
    },
    sales_and_meeting_workflows: {
      skeptical_buyer_objection_roleplay: roleplay,
      discovery_transcript_to_proposal_pipe: discovery,
      weekly_call_coaching: coaching,
    },
    personal_productivity_and_harness: {
      blind_spot_custom_instructions: blindSpotCheck,
      proactive_no_blinking_cursor_harness: harness,
      human_written_origin_story_guard: origin,
      fifteen_minutes_a_day_focus_rule: practice,
    },
  };
}

module.exports = {
  assessNorthStar,
  assessWeeklyCadence,
  assessWaitlist,
  assessSalesRoleplay,
  assessDiscoveryFollowup,
  assessWeeklyCoaching,
  assessBlindSpot,
  assessProactiveHarness,
  assessOriginStory,
  assessDailyPractice,
  assessRememberEverything,
};
