#!/usr/bin/env node
'use strict';

/**
 * Active-flag gate adapted from Spotify Confidence's public flag model.
 *
 * The ACTIVE list is a filter, not a default catalog.
 * An archived flag resolves to the caller-supplied default.
 * A client that is not associated cannot receive a variant.
 * New rules start disabled. The first enabled rule in priority order wins.
 * A failed guardrail moves rollout reach back to the previous reach.
 *
 *   node tools/confidence-active-flags-gate.js --json
 */

const KEY_TYPES = new Set(['string', 'integer', 'double', 'boolean', 'struct']);

function keyError(key) {
  const value = String(key || '');
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(value)) return 'invalid_key';
  if (value.includes('enabled') || value.includes('disabled')) return 'key_encodes_config';
  return null;
}

function typeOf(value) {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  if (typeof value === 'number' && Number.isFinite(value)) return 'double';
  if (value && typeof value === 'object' && !Array.isArray(value)) return 'struct';
  return 'invalid';
}

function schemaError(schema, value) {
  const fields = Array.isArray(schema) ? schema : [];
  const allowed = new Set();
  for (const field of fields) {
    if (!field || !KEY_TYPES.has(field.type) || !field.name) return 'invalid_schema';
    allowed.add(field.name);
    if (!Object.prototype.hasOwnProperty.call(value, field.name)) continue;
    const actual = typeOf(value[field.name]);
    if (field.type === 'double' && (actual === 'double' || actual === 'integer')) continue;
    if (actual !== field.type) return 'schema_type';
  }
  for (const name of Object.keys(value || {})) {
    if (!allowed.has(name)) return 'schema_extra';
  }
  return null;
}

function createFlag(input = {}) {
  const error = keyError(input.key);
  if (error) throw new Error(error);
  const creator = String(input.creator || '').trim();
  if (!creator) throw new Error('creator_required');
  const schema = Array.isArray(input.schema) ? input.schema : [];
  const variants = Array.isArray(input.variants) ? input.variants : [];
  for (const variant of variants) {
    const problem = schemaError(schema, variant.value || {});
    if (problem) throw new Error(problem);
  }
  return {
    key: input.key,
    state: 'ACTIVE',
    creator,
    owner: String(input.owner || '').trim() || creator,
    clients: Array.isArray(input.clients) ? input.clients.slice() : [],
    schema,
    variants: variants.map((variant) => ({ name: variant.name, value: variant.value || {} })),
    rules: [],
    lastApplyAt: null,
    archiveTime: null,
  };
}

function withKey(flag, key) {
  if (key !== flag.key) throw new Error('key_immutable');
  return flag;
}

function addRule(flag, rule = {}) {
  if (!rule.name || !rule.variant) throw new Error('invalid_rule');
  if (flag.rules.some((row) => row.name === rule.name)) throw new Error('rule_exists');
  if (!flag.variants.some((row) => row.name === rule.variant)) throw new Error('variant_missing');
  const priority = rule.priority == null
    ? flag.rules.reduce((max, row) => Math.max(max, Number(row.priority) || 0), 0) + 1
    : Number(rule.priority);
  return {
    ...flag,
    rules: [...flag.rules, {
      name: String(rule.name),
      variant: rule.variant,
      enabled: false,
      priority,
      segment: rule.segment || null,
      entities: Array.isArray(rule.entities) ? rule.entities.slice() : null,
    }],
  };
}

function enableRule(flag, name, enabled = true) {
  if (!flag.rules.some((rule) => rule.name === name)) throw new Error('rule_missing');
  return {
    ...flag,
    rules: flag.rules.map((rule) => (rule.name === name ? { ...rule, enabled: Boolean(enabled) } : rule)),
  };
}

function pinIndividualsFirst(flag) {
  const individual = flag.rules.filter((rule) => Array.isArray(rule.entities));
  const broad = flag.rules.filter((rule) => !Array.isArray(rule.entities));
  const renumber = (rows, start) => rows
    .slice()
    .sort((left, right) => left.priority - right.priority || String(left.name).localeCompare(String(right.name)))
    .map((rule, index) => ({ ...rule, priority: start + index }));
  return { ...flag, rules: renumber(individual, 1).concat(renumber(broad, individual.length + 1)) };
}

function ruleMatches(rule, entity) {
  if (Array.isArray(rule.entities)) return rule.entities.includes(entity);
  return rule.segment === 'all';
}

function assignedValue(flag, variantName, defaultValue) {
  const variant = flag.variants.find((row) => row.name === variantName);
  const value = variant ? variant.value : undefined;
  if (value && typeof value === 'object' && defaultValue && typeof defaultValue === 'object' && !Array.isArray(value)) {
    return { ...defaultValue, ...value };
  }
  return value === undefined ? defaultValue : value;
}

function resolveFlag(flag, request = {}) {
  const fallback = {
    assigned: false,
    variant: null,
    value: request.defaultValue,
    reason: 'flag_missing',
    rule: null,
  };
  if (!flag) return fallback;
  if (flag.state !== 'ACTIVE') {
    return { ...fallback, reason: 'flag_archived' };
  }
  if (!flag.clients.includes(request.client)) {
    return { ...fallback, reason: 'client_not_associated' };
  }
  const rules = flag.rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((left, right) => left.priority - right.priority || String(left.name).localeCompare(String(right.name)));
  for (const rule of rules) {
    if (ruleMatches(rule, request.entity)) {
      return {
        assigned: true,
        variant: rule.variant,
        value: assignedValue(flag, rule.variant, request.defaultValue),
        reason: 'rule_match',
        rule: rule.name,
      };
    }
  }
  return { ...fallback, reason: 'no_matching_rule' };
}

function variantUse(flag, name) {
  return flag.rules.some((rule) => rule.variant === name) ? 'in_use' : 'unused';
}

function archiveFlag(flag, archiveTime) {
  if (flag.state === 'ARCHIVED') return { ok: true, flag, reason: 'already_archived' };
  if (flag.rules.some((rule) => rule.enabled)) return { ok: false, flag, reason: 'enabled_rules_remain' };
  return {
    ok: true,
    reason: 'archived',
    flag: { ...flag, state: 'ARCHIVED', archiveTime: archiveTime || null },
  };
}

function listActive(flags = []) {
  return flags.filter((flag) => flag && flag.state === 'ACTIVE');
}

function staleCandidates(flags = [], nowMs = Date.now(), staleAfterMs = 0) {
  return flags.filter((flag) => {
    if (!flag || flag.state !== 'ACTIVE') return false;
    if (flag.rules.every((rule) => !rule.enabled)) return true;
    if (!flag.lastApplyAt) return true;
    const applied = Date.parse(flag.lastApplyAt);
    return !Number.isFinite(applied) || applied + staleAfterMs <= nowMs;
  });
}

function recordApply(flag, resolution, appliedAt) {
  if (!resolution || resolution.assigned !== true) {
    return { ok: false, flag, reason: resolution ? resolution.reason : 'not_assigned' };
  }
  return { ok: true, reason: 'applied', flag: { ...flag, lastApplyAt: appliedAt } };
}

function stepRollout({ reach, proposedReach, previousReach, guardrailsPass }) {
  if (guardrailsPass !== true) {
    return { reach: previousReach, rolledBack: true, reason: 'guardrail_failed' };
  }
  if (!(Number(proposedReach) > Number(reach))) {
    return { reach, rolledBack: false, reason: 'no_increase' };
  }
  return { reach: proposedReach, rolledBack: false, reason: 'guardrails_held' };
}

function fixtureReport() {
  const empty = listActive();
  let flag = createFlag({
    key: 'new-navbar',
    creator: 'igor',
    clients: ['hermes-mobile'],
    schema: [{ name: 'color', type: 'string' }],
    variants: [
      { name: 'control', value: {} },
      { name: 'treatment', value: { color: 'red' } },
    ],
  });
  flag = addRule(flag, { name: 'employees', entities: ['igor'], variant: 'treatment' });
  flag = addRule(flag, { name: 'everyone', segment: 'all', variant: 'control' });
  const held = resolveFlag(flag, { client: 'hermes-mobile', entity: 'igor', defaultValue: { color: 'blue' } });
  const live = enableRule(flag, 'everyone');
  const blocked = archiveFlag(live);
  const archived = archiveFlag(flag, '2026-10-29T16:20:00Z');
  const archivedResolve = resolveFlag(archived.flag, {
    client: 'hermes-mobile',
    entity: 'igor',
    defaultValue: { color: 'blue' },
  });
  const stranger = resolveFlag(flag, { client: 'web', entity: 'igor', defaultValue: { color: 'blue' } });
  const rolled = stepRollout({ reach: 10, proposedReach: 20, previousReach: 0, guardrailsPass: false });
  let encoded = false;
  try {
    createFlag({ key: 'new-navbar-enabled', creator: 'igor' });
  } catch (error) {
    encoded = error.message === 'key_encodes_config';
  }
  const active = listActive([archived.flag, flag]);
  return {
    ok: empty.length === 0
      && flag.owner === 'igor'
      && flag.rules.every((rule) => rule.enabled === false)
      && held.reason === 'no_matching_rule'
      && held.variant === null
      && blocked.ok === false
      && archived.ok === true
      && archivedResolve.reason === 'flag_archived'
      && archivedResolve.variant === null
      && archivedResolve.value.color === 'blue'
      && stranger.reason === 'client_not_associated'
      && rolled.rolledBack === true
      && rolled.reach === 0
      && encoded === true
      && active.length === 1
      && active[0].key === 'new-navbar'
      && variantUse(flag, 'treatment') === 'in_use'
      && variantUse(flag, 'missing') === 'unused',
    fixtures: true,
    emptyCount: empty.length,
    held,
    archived: archivedResolve,
    stranger,
    rolled,
    activeCount: active.length,
  };
}

function main(argv) {
  if (argv[0] !== '--json') {
    process.stdout.write(`${JSON.stringify({ ok: false, error: 'usage: --json' })}\n`);
    process.exitCode = 2;
    return;
  }
  const report = fixtureReport();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

module.exports = {
  createFlag,
  withKey,
  addRule,
  enableRule,
  pinIndividualsFirst,
  resolveFlag,
  variantUse,
  archiveFlag,
  listActive,
  staleCandidates,
  recordApply,
  stepRollout,
  fixtureReport,
};

if (require.main === module) main(process.argv.slice(2));
