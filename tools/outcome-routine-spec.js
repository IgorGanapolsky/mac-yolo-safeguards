#!/usr/bin/env node
'use strict';

/**
 * outcome-routine-spec — validate Grok-Bot-style skill/routine specs.
 *
 * Steals the high-ROI design rules from https://docs.x.ai/grok-bot/overview
 * and /skills-routines-and-automations so Hermes/Grok fleet automations fail
 * closed before we schedule untrusted work.
 *
 * Usage:
 *   node tools/outcome-routine-spec.js validate path/to/spec.json
 *   node tools/outcome-routine-spec.js example
 *   node tools/outcome-routine-spec.js self-test
 */

const fs = require('fs');
const path = require('path');

const CONSEQUENTIAL = [
  'send',
  'publish',
  'purchase',
  'transfer',
  'delete',
  'force-push',
  'production',
  'billing',
  'enroll',
  'dispatch',
  'sign',
  'accept legal',
];

const SKILL_REQUIRED = [
  'name',
  'when_to_use',
  'required_inputs',
  'access',
  'sequence',
  'validate',
  'return',
  'approval_boundary',
];

const ROUTINE_REQUIRED = [
  'name',
  'owning_bot',
  'schedule_or_event',
  'timezone',
  'input_source',
  'skill_name',
  'expected_result',
  'approval_boundary',
  'missing_source_policy',
  'stale_data_policy',
  'partial_completion_report',
];

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateSkill(skill) {
  const errors = [];
  const warnings = [];
  if (!skill || typeof skill !== 'object') {
    return { ok: false, kind: 'skill', errors: ['skill must be an object'], warnings };
  }
  for (const key of SKILL_REQUIRED) {
    const v = skill[key];
    if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)) {
      errors.push(`skill missing required field: ${key}`);
    }
  }
  const boundary = String(skill.approval_boundary || '').toLowerCase();
  const seq = JSON.stringify(skill.sequence || '').toLowerCase();
  for (const word of CONSEQUENTIAL) {
    if (seq.includes(word) && !boundary.includes(word) && !boundary.includes('approval') && !boundary.includes('draft')) {
      warnings.push(`sequence mentions "${word}" but approval_boundary is weak — prefer explicit stop-before-action`);
    }
  }
  if (!/draft|approv|do not|never|read-only|readonly/i.test(boundary)) {
    warnings.push('approval_boundary should state drafts-first / explicit stop for consequential actions');
  }
  return { ok: errors.length === 0, kind: 'skill', errors, warnings, name: skill.name || null };
}

function validateRoutine(routine) {
  const errors = [];
  const warnings = [];
  if (!routine || typeof routine !== 'object') {
    return { ok: false, kind: 'routine', errors: ['routine must be an object'], warnings };
  }
  for (const key of ROUTINE_REQUIRED) {
    const v = routine[key];
    if (v == null || (typeof v === 'string' && !v.trim())) {
      errors.push(`routine missing required field: ${key}`);
    }
  }
  const missing = String(routine.missing_source_policy || '').toLowerCase();
  if (missing && !/(fail|report|stop|error|no invent|do not invent|refuse)/.test(missing)) {
    errors.push('missing_source_policy must fail/report — never invent or silently use empty sources');
  }
  const stale = String(routine.stale_data_policy || '').toLowerCase();
  if (stale && !/(fail|refetch|refresh|report|stale|max.?age|ttl)/.test(stale)) {
    errors.push('stale_data_policy must refuse or refetch stale data (no silent reuse of old snapshots)');
  }
  const event = String(routine.schedule_or_event || '');
  if (/every (new )?message|all notifications|any slack|all github/i.test(event)) {
    errors.push('event trigger too broad — use a narrow matcher (phrase + ticket link), not every message');
  }
  if (routine.max_routines != null && Number(routine.max_routines) > 50) {
    warnings.push('Grok Bot caps 50 routines per Bot; keep ownership sparse');
  }
  if (routine.test_run_required === false) {
    warnings.push('test_run_required=false — Grok Bot design says Test run before enabling');
  }
  return { ok: errors.length === 0, kind: 'routine', errors, warnings, name: routine.name || null };
}

function validateSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: ['spec must be a JSON object'], skills: [], routines: [] };
  }
  const skills = asArray(spec.skills || (spec.skill ? [spec.skill] : []));
  const routines = asArray(spec.routines || (spec.routine ? [spec.routine] : []));
  if (!skills.length && !routines.length) {
    return { ok: false, errors: ['spec needs skills[] and/or routines[]'], skills: [], routines: [] };
  }
  const skillResults = skills.map(validateSkill);
  const routineResults = routines.map(validateRoutine);
  const errors = [
    ...skillResults.flatMap((r) => r.errors.map((e) => `[skill ${r.name || '?'}] ${e}`)),
    ...routineResults.flatMap((r) => r.errors.map((e) => `[routine ${r.name || '?'}] ${e}`)),
  ];
  const warnings = [
    ...skillResults.flatMap((r) => r.warnings.map((w) => `[skill ${r.name || '?'}] ${w}`)),
    ...routineResults.flatMap((r) => r.warnings.map((w) => `[routine ${r.name || '?'}] ${w}`)),
  ];
  return {
    ok: skillResults.every((r) => r.ok) && routineResults.every((r) => r.ok),
    errors,
    warnings,
    skills: skillResults,
    routines: routineResults,
  };
}

function exampleSpec() {
  return {
    meta: {
      source: 'https://docs.x.ai/grok-bot/overview',
      pattern: 'task → skill → test → routine',
      stolen_for: 'mac-yolo-safeguards / Hermes multi-agent fleet',
    },
    skills: [
      {
        name: 'daily-ops-brief',
        when_to_use: 'Weekday morning ops digest for Igor',
        required_inputs: ['mail access', 'gh auth', 'Linear read'],
        access: ['Gmail connector or IMAP', 'gh CLI', 'Linear API'],
        sequence: [
          'Pull unread + priority mail triage (draft replies only)',
          'List open PRs that are green MERGEABLE vs red/conflict',
          'Linear AGENT issues with agent-locks',
          'Sentry critical if configured',
          'Compose linked watch list',
        ],
        validate: 'Every item has a source URL or command receipt; no invented counts',
        return: 'Watch list in Chief conversation with source links + decisions owed',
        approval_boundary: 'Drafts only for outbound. No send, no CRM edit, no production change.',
      },
    ],
    routines: [
      {
        name: 'weekday-08-ops-brief',
        owning_bot: 'Chief',
        schedule_or_event: 'weekday 08:00',
        timezone: 'America/New_York',
        input_source: 'live mail + gh + Linear (refetch each run)',
        skill_name: 'daily-ops-brief',
        expected_result: 'Source-linked watch list posted in Chief chat',
        approval_boundary: 'Stop before any send/publish/spend',
        missing_source_policy: 'If a source is unavailable, report failure for that source — do not invent',
        stale_data_policy: 'Never reuse yesterday snapshot; refetch every run; mark stale if source age > 24h',
        partial_completion_report: 'List completed sections + failed sources explicitly',
        test_run_required: true,
      },
    ],
  };
}

function selfTest() {
  const good = validateSpec(exampleSpec());
  if (!good.ok) {
    throw new Error(`exampleSpec should pass: ${JSON.stringify(good.errors)}`);
  }
  const broad = validateSpec({
    routines: [{
      name: 'noise',
      owning_bot: 'Chief',
      schedule_or_event: 'every new message in Slack',
      timezone: 'America/New_York',
      input_source: 'slack',
      skill_name: 'x',
      expected_result: 'reply',
      approval_boundary: 'none',
      missing_source_policy: 'use cache',
      stale_data_policy: 'reuse yesterday',
      partial_completion_report: 'n/a',
    }],
  });
  if (broad.ok) throw new Error('broad event + weak stale/missing policies should fail');
  const missingFields = validateSpec({ skills: [{ name: 'x' }] });
  if (missingFields.ok) throw new Error('incomplete skill should fail');
  return { ok: true, cases: 3 };
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'example';
  if (cmd === 'example') {
    console.log(JSON.stringify(exampleSpec(), null, 2));
    return 0;
  }
  if (cmd === 'self-test') {
    const r = selfTest();
    console.log(JSON.stringify(r));
    return 0;
  }
  if (cmd === 'validate') {
    const file = argv[1];
    if (!file) {
      console.error('usage: outcome-routine-spec.js validate <spec.json>');
      return 2;
    }
    const raw = fs.readFileSync(path.resolve(file), 'utf8');
    const spec = JSON.parse(raw);
    const result = validateSpec(spec);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  console.error('usage: outcome-routine-spec.js [example|validate <file>|self-test]');
  return 2;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  CONSEQUENTIAL,
  SKILL_REQUIRED,
  ROUTINE_REQUIRED,
  validateSkill,
  validateRoutine,
  validateSpec,
  exampleSpec,
  selfTest,
  main,
};
