'use strict';

/**
 * Checks from Interact Cue.
 * Source: https://www.interactsoftware.com/clp/cue-ai-intranet/
 *
 * A cited answer, a Confirm/Edit preview, two lanes, and a permission
 * boundary are shapes. This module does not install Cue, connect a system
 * of record, change a homepage, or perform the action.
 */

const SOURCE = 'https://www.interactsoftware.com/clp/cue-ai-intranet/';
const PREVIEW_CONTROLS = ['Confirm', 'Edit'];
const PREVIEW_FIELDS = ['action_type', 'destination', 'summary'];
const LENSES = ['new starter', 'manager', 'frontline'];

function filled(value) {
  return String(value == null ? '' : value).trim().length > 0;
}

function assessAnswer({ answer, sources } = {}) {
  const list = Array.isArray(sources) ? sources : [];
  const incomplete = list.some((source) => !source || !filled(source.title) || !filled(source.locator));
  return {
    shape_complete: filled(answer) && list.length > 0 && !incomplete,
    answer_comes_first: false,
    citation_and_workings_attached: false,
    citation_checked: false,
    search_to_conversation_shared_context: false,
    permission_checked: false,
    answer_echoed: false,
    source_count_accepted: false,
    rule: 'An answer you cannot check is worse than a list of links',
  };
}

function assessPreview(card) {
  const source = card && typeof card === 'object' ? card : {};
  const missing = PREVIEW_FIELDS.filter((key) => !filled(source[key]));
  const contactOnly = /contact/i.test(String(source.action_type || '')) && !filled(source.destination);
  return {
    shape_complete: missing.length === 0 && !contactOnly,
    missing_fields: missing,
    ends_at_contact_someone: contactOnly,
    controls: PREVIEW_CONTROLS,
    controls_enabled: false,
    confirm_received: false,
    action_performed: false,
    fields_echoed: false,
  };
}

function assessContext({ prior, followUp } = {}) {
  return {
    both_named: filled(prior) && filled(followUp),
    shared_context_installed: false,
    context_retained_verified: false,
    fields_echoed: false,
  };
}

function assessInteractCue({
  answer,
  sources,
  preview,
  prior,
  followUp,
  callerSaidAllowed,
  role,
} = {}) {
  const answerCheck = assessAnswer({ answer, sources });
  const previewCheck = assessPreview(preview);
  const contextCheck = assessContext({ prior, followUp });
  return {
    source: SOURCE,
    passed: false,
    cue_installed: false,
    intranet_shipped: false,
    workday_connected: false,
    servicenow_connected: false,
    awards_claimed: false,
    answer_first_cited_retrieval: answerCheck,
    context: contextCheck,
    system_of_record_task_completion: {
      stops_at_contact_support_blocked: false,
      action_preview_card_contract: {
        fields: PREVIEW_FIELDS,
        controls: PREVIEW_CONTROLS,
        controls_enabled: false,
      },
      preview: previewCheck,
      action_performed: false,
      connected_systems: [],
    },
    two_lane_priority_feed: {
      needs_you_split: false,
      needs_you_count: null,
      caller_count_accepted: false,
      inline_one_click_actions_enabled: false,
      activity_lane_rendered: false,
    },
    permission_aware_governance: {
      enforces_caller_lease_permissions: false,
      cross_scope_quote_leak_blocked: false,
      permission_check_ran: false,
      caller_said_allowed: callerSaidAllowed === true,
      caller_claim_accepted: false,
      quote_echoed: false,
    },
    lenses_planned: LENSES,
    role_named: LENSES.includes(String(role || '').trim()),
    layout_adapted: false,
    directory_read: false,
    comms: {
      acknowledgement_recorded: false,
      mandatory_auto_acked: false,
      audiences_set_by_us: false,
    },
    insights: {
      generated: false,
      policy_gaps_counted: null,
      generated_by_survey: false,
    },
  };
}

module.exports = {
  PREVIEW_CONTROLS,
  PREVIEW_FIELDS,
  LENSES,
  assessAnswer,
  assessPreview,
  assessContext,
  assessInteractCue,
};
