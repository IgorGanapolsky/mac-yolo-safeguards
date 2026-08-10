/*!
 * linear-lock-hygiene.js — shared Linear agent-lock utilities (used by
 * .cursor/skills/linear-agent-* autonomy workflows).
 *
 * Encodes the verified fix for the "stale agent-lock ghost" regression:
 *   findIssueByIdentifier used labels { nodes { name } } (no id), so
 *   removedLabelIds received "undefined" strings and Linear rejected the
 *   updateIssue mutation -> issues stayed locked while In Progress.
 *
 * Truth: resolve lock label IDs via the UUID-scoped query:
 *   query($id: String!) { issue(id: $id) { labels { nodes { id name } } } }
 * and require every lock-family id to match /^[0-9a-f-]{36}$/i.
 *
 * NOTE on schema quirks (verified on this Linear workspace):
 *   - `team(key: ...)` is NOT supported; the schema exposes `team(id: String!)`.
 *     The bridge resolves teams via root `teams(first:50)` + client-side key match.
 *   - Root `issues(filter: { team: { key: { eq: $k } } })` IS supported and is the
 *     cheapest way to enumerate a team's issues.
 */
'use strict';

const path = require('path');
const BRIDGE = path.join(__dirname, 'linear-agent-bridge.js');
const requireBridge = () => require(BRIDGE);

/** Lock-label family matcher. Matches every variant the bridge applies. */
function isLockFamilyLabel(name) {
  const x = String(name || '').toLowerCase();
  return (
    x === 'agent-lock' ||
    x === 'agent:lock' ||
    x === 'lock:claimed' ||
    /^agent[-:]/.test(x) || // agent:codex, agent:grok, agent-lock
    /^status:agent-/.test(x) // status:agent-working
  );
}

/** True when a set of label nodes has at least one lock-family label. */
function hasLockFamily(labels) {
  return Array.from(labels || []).some((l) => isLockFamilyLabel(l.name));
}

/** All lock-family label names from a label nodes array. */
function lockFamilyNames(labels) {
  return Array.from(labels || [])
    .filter((l) => isLockFamilyLabel(l.name))
    .map((l) => l.name);
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Regression guard for the label-stripping path.
 * Given label nodes (each { id, name }), asserts:
 *   - every lock-family label has an `id`
 *   - every lock-family `id` matches /^[0-9a-f-]{36}$/i (never "undefined")
 * Returns { ok: boolean, bad: [{name, id, reason}] }.
 */
function labelIdIsUuid(labels) {
  const bad = [];
  for (const l of labels || []) {
    if (!isLockFamilyLabel(l.name)) continue;
    if (String(l.id) === 'undefined' || l.id == null) {
      bad.push({ name: l.name, id: l.id, reason: 'missing/undefined id (root cause of lost strip)' });
      continue;
    }
    if (!UUID.test(String(l.id))) {
      bad.push({ name: l.name, id: l.id, reason: 'id not a UUID' });
    }
  }
  return { ok: bad.length === 0, bad };
}

/**
 * Fetch a single issue by Linear UUID using the WORKING query shape, returning
 * labels WITH ids. This is the exact query the patched release handler relies on.
 */
async function fetchIssueLabelsById(issueUuid) {
  const bridge = requireBridge();
  const q = bridge.queryLinear;
  const res = await q(
    `query($id: String!) { issue(id: $id) { id identifier state { name } labels { nodes { id name } } } }`,
    { id: String(issueUuid) },
  );
  if (res.error) return { error: true, message: res.message || JSON.stringify(res.errors) };
  if (!res.data?.issue) return { error: true, message: `issue ${issueUuid} not found` };
  return { issue: res.data.issue };
}

/**
 * Fetch all issues for a team key using the supported root-filter shape.
 * Returns nodes with { identifier, id, state{name}, labels{nodes:{id,name}} }.
 */
async function fetchTeamIssues(teamKey, opts = {}) {
  const bridge = requireBridge();
  const q = bridge.queryLinear;
  const first = opts.first || 100;
  const res = await q(
    `query($k: String!) { issues(first: ${first}, filter: { team: { key: { eq: $k } } }) { nodes { identifier id state { name } labels { nodes { id name } } } } }`,
    { k: String(teamKey) },
  );
  if (res.error) return { error: true, message: res.message || JSON.stringify(res.errors) };
  return { issues: res.data?.issues?.nodes || [] };
}

module.exports = {
  isLockFamilyLabel,
  hasLockFamily,
  lockFamilyNames,
  labelIdIsUuid,
  fetchIssueLabelsById,
  fetchTeamIssues,
  BRIDGE,
};
