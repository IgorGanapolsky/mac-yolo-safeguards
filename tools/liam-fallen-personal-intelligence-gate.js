'use strict';

/**
 * Checks from Liam Fallen's personal-intelligence setup.
 * Source: https://x.com/liam_fallen/status/2116881320282386726
 *
 * Five roles, five notes, a six-field open loop, and a handoff are shapes.
 * This module does not create Grok Bots, connect accounts, write Personal HQ,
 * copy his prompts, send mail, or buy anything.
 */

const SOURCE = 'https://x.com/liam_fallen/status/2116881320282386726';
const ARTICLE_ID = '2116875498273775616';

const ROSTER = [
  { id: 'chief_of_staff', name: 'Chief of Staff', start_set: true, human_facing: true },
  { id: 'inbox_manager', name: 'Inbox Manager', start_set: true, human_facing: false },
  { id: 'calendar_manager', name: 'Calendar Manager', start_set: true, human_facing: false },
  { id: 'researcher', name: 'Researcher', start_set: false, human_facing: false },
  { id: 'life_admin_manager', name: 'Life Admin Manager', start_set: false, human_facing: false },
];

const DOCUMENTS = ['ABOUT ME', 'CURRENT PRIORITIES', 'OPEN LOOPS', 'LIFE ADMIN', 'DECISIONS'];

const OPEN_LOOP_FIELDS = [
  'task',
  'original_source',
  'next_action',
  'due_date',
  'responsible_bot',
  'current_status',
];

const HANDOFF_FIELDS = [
  'context',
  'original_source',
  'deadline',
  'expected_result',
  'from_role',
  'to_role',
];

const APPROVAL_ACTIONS = [
  'send_message',
  'make_purchase',
  'cancel_service',
  'change_booking',
  'modify_account',
];

const ROUTINES = [
  { role: 'Inbox Manager', cadence: 'weekday' },
  { role: 'Calendar Manager', cadence: 'daily' },
  { role: 'Life Admin Manager', cadence: 'weekly' },
  { role: 'Chief of Staff', cadence: 'daily_after_the_others' },
  { role: 'Researcher', cadence: 'when_asked' },
];

function roleKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

const ROLE_KEYS = new Set(ROSTER.map((role) => roleKey(role.name)));

function assessOpenLoop(entry) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const missing = OPEN_LOOP_FIELDS.filter((key) => !String(source[key] == null ? '' : source[key]).trim());
  const known = ROLE_KEYS.has(roleKey(source.responsible_bot));
  return {
    shape_complete: missing.length === 0 && known,
    missing_fields: missing,
    responsible_bot_known: known,
    recorded: false,
    duplicate_checked: false,
    entry_echoed: false,
  };
}

function assessHandoff(handoff) {
  const source = handoff && typeof handoff === 'object' ? handoff : {};
  const missing = HANDOFF_FIELDS.filter((key) => !String(source[key] == null ? '' : source[key]).trim());
  const fromKnown = ROLE_KEYS.has(roleKey(source.from_role));
  const toKnown = ROLE_KEYS.has(roleKey(source.to_role));
  const distinct = roleKey(source.from_role) !== roleKey(source.to_role);
  return {
    shape_complete: missing.length === 0 && fromKnown && toKnown && distinct,
    missing_fields: missing,
    from_role_known: fromKnown,
    to_role_known: toKnown,
    distinct_roles: fromKnown && toKnown && distinct,
    handoff_executed: false,
    open_loop_updated: false,
    message_sent: false,
    fields_echoed: false,
  };
}

function assessAction(action) {
  const named = APPROVAL_ACTIONS.includes(action);
  return {
    action: named ? action : null,
    needs_approval: named,
    approval_granted: false,
    approval_gate_installed: false,
    action_performed: false,
  };
}

function assessLiamFallenPersonalIntelligence({ openLoop, handoff, action } = {}) {
  const loop = assessOpenLoop(openLoop);
  const hand = assessHandoff(handoff);
  const act = assessAction(action);
  return {
    source: SOURCE,
    article_id: ARTICLE_ID,
    passed: false,
    files_written: false,
    directory_created: false,
    prompt_catalog_copied: false,
    grok_bots_created: false,
    bots_created: 0,
    five_documents_verified: false,
    primary_bot: null,
    primary_bot_set: false,
    planned_primary: 'Chief of Staff',
    five_bot_roster: ROSTER,
    start_with_three: ROSTER.filter((role) => role.start_set).map((role) => role.name),
    start_set_created: false,
    personal_hq_dir: null,
    documents: DOCUMENTS,
    open_loops_six_field_schema: OPEN_LOOP_FIELDS,
    open_loop: loop,
    handoff: hand,
    connections: {
      email_connected: false,
      calendar_connected: false,
      personal_hq_store_connected: false,
      browser_connected: false,
      documents_connected: false,
      caller_connection_accepted: false,
    },
    security_boundary_upgrade: {
      shared_cloud_browser_session_risk_mitigated: false,
      per_bot_disposable_30m_lease_enforced: false,
      separate_bots_are_separate_security_boundaries: false,
      approval_gate_installed: false,
      hard_human_approval_required_for: APPROVAL_ACTIONS,
    },
    action: act,
    routines_planned: ROUTINES,
    routines_scheduled: 0,
    task_tested_before_schedule: false,
    skill_saved: false,
    briefing_sent: false,
    inbox_review_ran: false,
    calendar_review_ran: false,
    renewal_example_ran: false,
    external_message_sent: false,
    purchase_made: false,
    account_modified: false,
    group_chat_created: false,
  };
}

module.exports = {
  ROSTER,
  DOCUMENTS,
  OPEN_LOOP_FIELDS,
  APPROVAL_ACTIONS,
  assessOpenLoop,
  assessHandoff,
  assessAction,
  assessLiamFallenPersonalIntelligence,
};
