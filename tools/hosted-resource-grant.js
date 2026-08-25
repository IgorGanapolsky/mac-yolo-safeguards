#!/usr/bin/env node
'use strict';

/**
 * Hosted resource grants for thumbgate.app (fenced VPS $10/mo).
 *
 * InfoQ 2026-08-23 / Cloudflare OS: MCP ambient access is not enough.
 * Agents start with zero grants. Reads are recorded. Sharing an artifact
 * fails unless the recipient already has those resource grants. Sensitive
 * fields are masked. Destructive actions need human approval.
 *
 * Mechanic steal only. Not Cloudflare OS, not workerd Dynamic Workers,
 * not Gadgets, not AI Gateway, not Oak & Sparrow Gatekeeper.
 *
 * Complementary to OPEN #2033 (persona entitlements) and #2020 (SSRF).
 * Do not dual-edit cloud-tool-policy or hosted-tool-approvals.
 */

const SCHEMA = 'hosted-resource-grant/v1';
const COUNSEL_CLEARANCE = false;
const HOSTED_PRICE_USD = 10;
const DESTRUCTIVE = Object.freeze([
  'write',
  'merge',
  'push',
  'delete',
  'send',
  'deploy',
  'charge',
  'drop',
]);
const DEFAULT_MASK = /^(ssn|secret|token|password|api[_-]?key|authorization)$/i;

function honesty() {
  return {
    schema: SCHEMA,
    clonedCloudflareOs: false,
    clonedWorkerdGadgets: false,
    clonedAiGateway: false,
    notOakSparrowGatekeeper: true,
    notMcpAmbient: true,
    hostedHermesPriceUsd: HOSTED_PRICE_USD,
    counselClearance: COUNSEL_CLEARANCE,
    clonedContinuityPicker: false,
  };
}

function deny(code, extra = {}) {
  return { ok: false, decision: 'deny', deny: code, ...honesty(), ...extra };
}

function confirm(code, extra = {}) {
  return { ok: false, decision: 'confirm', deny: code, ...honesty(), ...extra };
}

function allow(extra = {}) {
  return { ok: true, decision: 'allow', deny: null, ...honesty(), ...extra };
}

function normalizeGrant(grant) {
  if (!grant || typeof grant !== 'object') return null;
  const resourceId = String(grant.resourceId || '').trim();
  if (!resourceId) return null;
  const actions = Array.isArray(grant.actions)
    ? grant.actions.map((action) => String(action || '').toLowerCase()).filter(Boolean)
    : ['read'];
  const mask = Array.isArray(grant.mask) ? grant.mask.map((field) => String(field)) : [];
  return { resourceId, actions: actions.length ? actions : ['read'], mask };
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (Array.isArray(value) || (typeof value === 'object' && value)) return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function findGrant(grants, resourceId) {
  return grants.find((grant) => grant && grant.resourceId === resourceId) || null;
}

function actionAllowed(grant, action) {
  if (!grant) return false;
  return grant.actions.includes('*') || grant.actions.includes(action);
}

function maskRecord(record, extraMask = []) {
  const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const blocked = new Set(extraMask.map((field) => String(field).toLowerCase()));
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (blocked.has(key.toLowerCase()) || DEFAULT_MASK.test(key)) continue;
    out[key] = value;
  }
  return out;
}

function createLedger(seed = {}) {
  const grants = (Array.isArray(seed.grants) ? seed.grants : [])
    .map(normalizeGrant)
    .filter(Boolean);
  const observations = Array.isArray(seed.observations) ? seed.observations.slice() : [];
  return { grants, observations };
}

function evaluate(input = {}) {
  const resourceId = String(input.resourceId || '').trim();
  const action = String(input.action || 'read').toLowerCase() || 'read';
  const grants = (Array.isArray(input.grants) ? input.grants : [])
    .map(normalizeGrant)
    .filter(Boolean);

  if (!resourceId) return deny('missing_resource');
  if (grants.length === 0) return deny('zero_ambient');

  const grant = findGrant(grants, resourceId);
  if (!grant) return deny('not_granted', { resourceId, action });
  if (!actionAllowed(grant, action)) return deny('action_not_granted', { resourceId, action });
  if (DESTRUCTIVE.includes(action) && input.approved !== true) {
    return confirm('needs_approval', { resourceId, action, surface: 'thumbgate.app' });
  }
  return allow({ resourceId, action });
}

function observe(input = {}) {
  const read = evaluate({ ...input, action: 'read' });
  if (read.decision !== 'allow') return read;
  const grants = (Array.isArray(input.grants) ? input.grants : [])
    .map(normalizeGrant)
    .filter(Boolean);
  const grant = findGrant(grants, String(input.resourceId || '').trim());
  const record = maskRecord(input.record, grant ? grant.mask : []);
  const observation = {
    resourceId: String(input.resourceId || '').trim(),
    fields: Object.keys(record),
    at: Number.isFinite(input.at) ? input.at : Date.now(),
  };
  return allow({ observation, record });
}

function shareCheck(input = {}) {
  const observations = Array.isArray(input.observations) ? input.observations : [];
  const recipientGrants = Array.isArray(input.recipientGrants) ? input.recipientGrants : [];
  if (observations.length === 0) return allow({ shared: true, checked: 0 });
  for (const row of observations) {
    const resourceId = String(row?.resourceId || '').trim();
    const verdict = evaluate({
      grants: recipientGrants,
      resourceId,
      action: 'read',
    });
    if (verdict.decision !== 'allow') {
      return deny('share_recipient_missing_grant', { resourceId });
    }
  }
  return allow({ shared: true, checked: observations.length });
}

function catalog() {
  return {
    ...honesty(),
    product: 'hosted-resource-grant',
    zeroAmbient: true,
    mcpAmbientIsNotAGrant: true,
    complementary: ['#2033 mcp-persona-entitlements', '#2020 obscura-ssrf-guard'],
  };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const args = argv.slice();
  const json = args.includes('--json');
  const flag = (name) => {
    const index = args.indexOf(name);
    if (index === -1) return null;
    return args[index + 1] ?? '';
  };

  if (args.includes('--honesty') || args.includes('--catalog')) {
    printJson(catalog());
    return 0;
  }

  const grants = parseJson(flag('--grants'), []);
  const resourceId = flag('--resource') || '';
  const action = flag('--action') || 'read';
  const approved = args.includes('--approved');

  if (args.includes('--evaluate')) {
    printJson(evaluate({ grants, resourceId, action, approved }));
    return 0;
  }

  if (args.includes('--observe')) {
    printJson(observe({
      grants,
      resourceId,
      record: parseJson(flag('--record'), {}),
    }));
    return 0;
  }

  if (args.includes('--share')) {
    printJson(shareCheck({
      observations: parseJson(flag('--observed'), []),
      recipientGrants: parseJson(flag('--recipient-grants'), []),
    }));
    return 0;
  }

  const help = [
    'hosted-resource-grant — zero-ambient grants + share-time check (not Cloudflare OS)',
    '  --honesty | --catalog --json',
    '  --evaluate --resource ID --action read --grants \'[]\' --json',
    '  --observe --resource ID --record \'{}\' --grants \'[...]\' --json',
    '  --share --observed \'[{"resourceId":"x"}]\' --recipient-grants \'[]\' --json',
  ].join('\n');
  if (!json) process.stderr.write(`${help}\n`);
  else printJson({ ok: false, deny: 'missing_command', ...honesty(), help });
  return 2;
}

module.exports = {
  SCHEMA,
  COUNSEL_CLEARANCE,
  HOSTED_PRICE_USD,
  DESTRUCTIVE,
  honesty,
  createLedger,
  evaluate,
  observe,
  shareCheck,
  maskRecord,
  catalog,
  main,
};

if (require.main === module) {
  process.exit(main() ?? 0);
}
