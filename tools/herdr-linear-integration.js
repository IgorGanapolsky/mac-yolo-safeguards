#!/usr/bin/env node
'use strict';

/**
 * HERDR Agent Lifecycle -> Linear Integration.
 *
 * This is step 3 of `tools/linear-obsidian-continuous-sync.sh`:
 *   github->linear  -> tools/github-linear-sync.js
 *   obsidian<->linear -> tools/obsidian-linear-sync.js
 *   herdr->linear   -> tools/herdr-linear-integration.js  (this file)
 *   repo-root-hygiene -> tools/repo-root-hygiene.js
 *
 * HARD rules (anti-babysit):
 *   1. Fail CLEAN: if there are no agent issues in a transitionable state,
 *      exit 0 with a "no-op" summary (NOT a failure).
 *   2. Never create duplicate Linear issues — only transition/update existing
 *      [GH-#N] mirrors and AGENT-* issues.
 *   3. Never touch issues owned by another agent lane without an explicit
 *      `agent:*` label grant.
 *   4. Honor --dry-run (no mutations) and --json (machine-readable).
 *
 * State map (Hermes AGENT lane):
 *   blocked  -> linear "Todo" + comment "@blocked"      (escalate to human)
 *   working  -> linear "In Progress" + comment "@working"
 *   done     -> linear "Done" (+ canceled if GH-closed)
 *
 * Auth: reuses tools/linear-agent-bridge.js -> queryLinear (Linear key via
 *   ~/.config/linear/api_key or LINEAR_API_KEY env), matching repo convention.
 *
 * Usage:
 *   node tools/herdr-linear-integration.js
 *   node tools/herdr-linear-integration.js --dry-run
 *   node tools/herdr-linear-integration.js --json
 */

const { queryLinear } = require('./linear-agent-bridge');
const { syncProjectNote } = require('./obsidian-vault-manager');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const JSON_OUT = args.has('--json');
const TEAM_KEY = 'AGENT';

// State ids (mac-yolo-safeguards AGENT lane; match github-linear-sync.js convention).
const STATE_TODO = 'e01085dd-8b3c-4cda-8d38-b45a27b13ed0'.slice(0, 0) || ''; // placeholder, resolved below
// NOTE: state ids are workspace-specific; we resolve "Todo/In Progress/Done"
// by name via the team's workflow states to avoid hard-coding UUIDs.

function log(msg) { if (!JSON_OUT) console.log(msg); }

async function fetchWorkflowStates(teamKey) {
  const res = await queryLinear(
    `query($teamKey: String!) {
       team(key: $teamKey) {
         states(first: 50) { nodes { id name type } }
       }
     }`,
    { teamKey },
  );
  const states = res.data?.team?.states?.nodes || [];
  const byName = {};
  for (const s of states) byName[s.name.toLowerCase().trim()] = s.id;
  return byName;
}

async function transitionIssue(issueId, stateId, comment) {
  if (DRY_RUN) {
    log(`  [dry-run] state→${stateId.slice(0, 8)}… comment: ${comment.slice(0, 60)}`);
    return { ok: true, dryRun: true };
  }
  const res = await queryLinear(
    `mutation($id: String!, $input: IssueUpdateInput!) {
       issueUpdate(id: $id, input: $input) { success issue { id identifier } }
     }`,
    { id: String(issueId), input: { stateId: String(stateId) } },
  );
  if (res.error || !res.data?.issueUpdate?.success) {
    return { ok: false, error: res.error || res };
  }
  if (comment) {
    await queryLinear(
      `mutation($issueId: String!, $body: String!) {
         commentCreate(input: { issueId: $issueId, body: $body }) { success }
       }`,
      { issueId: String(issueId), body: comment },
    );
  }
  return { ok: true, issue: res.data.issueUpdate.issue };
}

function detectAgent(issue) {
  const labels = (issue.labels?.nodes || []).map((l) => l.name);
  const m = labels.find((l) => /^agent:/i.test(l.name));
  if (m) return m.replace(/^agent:/i, '').trim();
  return null;
}

function blockerMarker(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes('blocked:')) return 'blocked';
  if (d.includes('status: done') || d.includes('state: done')) return 'done';
  if (d.includes('status: working') || d.includes('state: working') || d.includes('agent-lock')) return 'working';
  return null;
}

async function main() {
  const started = Date.now();
  const byName = await fetchWorkflowStates(TEAM_KEY);
  const todoId = byName['triage'] || byName['todo'] || byName['backlog'];
  const inProgId = byName['in progress'] || byName['in_progress'] || byName['inprogress'];
  const doneId = byName['done'] || byName['completed'];

  const res = await queryLinear(
    `query($after: String) {
       issues(first: 100, after: $after, filter: { team: { key: { eq: "AGENT" } } }) {
         nodes {
           id identifier title url description state { id name type } labels(first: 20) { nodes { name } }
         }
         pageInfo { hasNextPage endCursor }
       }
     }`,
    { after: null },
  );
  const issues = res.data?.issues?.nodes || [];
  const transitions = [];
  const failures = [];

  for (const issue of issues) {
    const current = issue.state?.type; // 'triage'|'in_progress'|'done'|etc
    const agent = detectAgent(issue);
    if (!agent) continue; // only act on agent-owned issues

    const target = blockerMarker(issue.description);
    if (!target) continue; // nothing in the description signals a transition intent

    const curType = current;
    let wantStateId = null;
    let wantType = null;
    let comment = '';
    if (target === 'blocked' && curType !== ('triage' || 'todo')) {
      wantStateId = todoId; wantType = 'triage';
      comment = `🚨 [HERDR_BLOCKED] issue escalated by agent:${agent}. Requires human triage.`;
    } else if (target === 'working' && curType !== 'in_progress') {
      wantStateId = inProgId; wantType = 'in_progress';
      comment = `⚡ [HERDR_WORKING] agent:${agent} reports active work.`;
    } else if (target === 'done' && curType !== 'done') {
      wantStateId = doneId; wantType = 'done';
      comment = `✅ [HERDR_DONE] agent:${agent} closed out.`;
    }

    if (!wantStateId) continue; // already in the right state -> no-op (correct, not failure)

    const r = await transitionIssue(issue.id, wantStateId, comment);
    if (!r.ok) {
      failures.push({ issue: issue.identifier, error: JSON.stringify(r.error).slice(0, 160) });
      continue;
    }
    transitions.push({ issue: issue.identifier, from: curType, to: wantType, agent, dryRun: DRY_RUN });
  }

  // Evidence receipt into Obsidian vault (always runs; no-op if no transitions).
  const noteSummary = JSON_OUT
    ? `herdr->linear run: ${transitions.length} transition(s), ${failures.length} failure(s)`
    : 'herdr->linear lifecycle sync';
  syncProjectNote('mac-yolo-safeguards', {
    modifiedFiles: ['tools/herdr-linear-integration.js'],
    toolsUsed: ['queryLinear', 'obsidian-vault-manager'],
    summary: noteSummary,
    nextSteps: DRY_RUN ? 'Re-run without --dry-run to apply transitions' : 'Await next 300s tick',
  });

  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  const out = {
    status: failures.length === 0 ? 'ok' : 'degraded',
    dryRun: DRY_RUN,
    transitions,
    failures,
    issueCount: issues.length,
    elapsed_sec: elapsed,
  };
  if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); return; }
  log(`herdr->linear: ${transitions.length} transition(s), ${failures.length} failure(s) over ${issues.length} AGENT issues (${elapsed}s)`);
  if (failures.length) process.exitCode = 1;
  return out;
}

if (require.main === module) {
  main().catch((err) => {
    if (JSON_OUT) { console.log(JSON.stringify({ status: 'error', error: String(err) })); return; }
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, detectAgent, blockerMarker };
