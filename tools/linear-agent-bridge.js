#!/usr/bin/env node
'use strict';

/**
 * linear-agent-bridge.js — Multi-agent task bus via Linear API + Obsidian vault claims.
 *
 * Linear = issue ownership (who works which ticket)
 * AI-Agent-Sync vault = file/WIP claims (who is mid-flight on which files)
 *
 * Usage:
 *   node tools/linear-agent-bridge.js --list
 *   node tools/linear-agent-bridge.js --list --json
 *   node tools/linear-agent-bridge.js --teams
 *   node tools/linear-agent-bridge.js --claim AGENT-12 --agent grok
 *   node tools/linear-agent-bridge.js --update AGENT-12 --state "In Progress" --comment "proof"
 *   node tools/linear-agent-bridge.js --create --title "Ship P2P API" --agent grok --project hermes-mobile
 *   node tools/linear-agent-bridge.js --done AGENT-12 --agent grok --comment "merged"
 *   node tools/linear-agent-bridge.js --release AGENT-12 --agent grok
 *
 * Auth (first match wins):
 *   1. LINEAR_API_KEY env
 *   2. macOS Keychain service LINEAR_API_KEY
 *   3. ~/.config/linear/api_key (chmod 600)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const https = require('https');

const VAULT_ROOT =
  process.env.AI_AGENT_SYNC_VAULT ||
  path.join(os.homedir(), 'Documents', 'AI-Agent-Sync');
const CLAIMS_DIR = path.join(VAULT_ROOT, 'Handoffs', 'linear-claims');
// Fleet default: AGENT (Agent Operations). Fallbacks resolve via resolveTeam.
// Override with LINEAR_TEAM_KEY or --team.
const DEFAULT_TEAM_KEY = process.env.LINEAR_TEAM_KEY || 'AGENT';

const AGENT_ALIASES = {
  grok: 'grok',
  'grok-build': 'grok',
  claude: 'claude-code',
  'claude-code': 'claude-code',
  codex: 'codex',
  cursor: 'cursor',
  hermes: 'Hermes',
  antigravity: 'antigravity',
  gemini: 'gemini',
  herdr: 'herdr',
};

function normalizeAgent(name) {
  const key = String(name || 'grok').trim().toLowerCase();
  return AGENT_ALIASES[key] || key;
}

/**
 * Collect candidate PATs. Order: env → file → keychain.
 * On this Mac (2026-08-02): Keychain LINEAR_API_KEY was a narrow PAT that only
 * saw empty team AGENT; ~/.config/linear/api_key sees IGO+AGENT. Probe picks
 * the key with the most teams.
 */
function collectLinearApiKeyCandidates() {
  const out = [];
  const push = (source, key) => {
    const k = String(key || '').trim();
    if (!k) return;
    if (out.some((c) => c.key === k)) return;
    out.push({ source, key: k });
  };
  push('env', process.env.LINEAR_API_KEY);
  try {
    const p = path.join(os.homedir(), '.config', 'linear', 'api_key');
    if (fs.existsSync(p)) push('file', fs.readFileSync(p, 'utf8'));
  } catch {
    /* ignore */
  }
  try {
    const key = execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'LINEAR_API_KEY', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    push('keychain', key);
  } catch {
    /* ignore */
  }
  return out;
}

let _resolvedKey = null; // { source, key } | null | false (none)

/** Test helper — clear cached PAT selection. */
function resetLinearApiKeyCache() {
  _resolvedKey = null;
}

/**
 * Score a teams probe result (pure). Higher = broader workspace access.
 * IGO presence heavily weighted — narrow AGENT-only PATs score low.
 */
function scoreTeamsProbe(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const n = list.length;
  const keys = list.map((t) => String(t.key || '').toUpperCase());
  const hasIgo = keys.includes('IGO');
  const hasAgent = keys.includes('AGENT');
  return n * 10 + (hasIgo ? 100 : 0) + (hasAgent ? 5 : 0);
}

function getLinearApiKey() {
  if (_resolvedKey && _resolvedKey.key) return _resolvedKey.key;
  if (_resolvedKey === false) return null;
  const c = collectLinearApiKeyCandidates();
  // Sync fallback: env → file → first (skip keychain-first; full PAT usually in file).
  if (!c.length) return null;
  const preferred =
    c.find((x) => x.source === 'env') ||
    c.find((x) => x.source === 'file') ||
    c[0];
  _resolvedKey = preferred;
  return preferred.key;
}

function queryLinearWithKey(apiKey, query, variables = {}) {
  const payload = JSON.stringify({ query, variables });
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.linear.app/graphql',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            if (parsed.errors?.length) {
              resolve({
                error: true,
                code: 'GRAPHQL',
                message: parsed.errors.map((e) => e.message).join('; '),
                errors: parsed.errors,
              });
              return;
            }
            resolve(parsed);
          } catch (e) {
            resolve({ error: true, code: 'PARSE', message: e.message, body });
          }
        });
      },
    );
    req.on('error', (err) => resolve({ error: true, code: 'NETWORK', message: err.message }));
    req.write(payload);
    req.end();
  });
}

async function ensureLinearApiKey() {
  if (_resolvedKey && _resolvedKey.probed) return _resolvedKey.key || null;
  const candidates = collectLinearApiKeyCandidates();
  if (!candidates.length) {
    _resolvedKey = false;
    return null;
  }
  if (candidates.length === 1) {
    _resolvedKey = { ...candidates[0], probed: true };
    return candidates[0].key;
  }
  // Prefer env/file without waiting on slow keychain when probe is skipped.
  const probeQ = `query { teams(first: 50) { nodes { id key } } }`;
  let best = null;
  let bestScore = -1;
  // Probe env + file first (fast, full-access PATs).
  const ordered = [
    ...candidates.filter((c) => c.source === 'env' || c.source === 'file'),
    ...candidates.filter((c) => c.source === 'keychain'),
  ];
  for (const c of ordered) {
    const res = await queryLinearWithKey(c.key, probeQ);
    if (res.error) continue;
    const score = scoreTeamsProbe(res.data?.teams?.nodes || []);
    if (score > bestScore) {
      bestScore = score;
      best = c;
      // Good enough: full workspace with IGO — stop probing keychain.
      if (score >= 100) break;
    }
  }
  if (!best) {
    const fallback =
      candidates.find((x) => x.source === 'file') ||
      candidates.find((x) => x.source === 'env') ||
      candidates[0];
    _resolvedKey = { ...fallback, probed: true };
    return fallback.key;
  }
  _resolvedKey = { ...best, probed: true, score: bestScore };
  return best.key;
}

/**
 * Offline-safe doctor: auth sources present + optional live fleet probe.
 */
async function doctorLinearFleet() {
  const candidates = collectLinearApiKeyCandidates();
  const sources = candidates.map((c) => c.source);
  const report = {
    ok: false,
    sources,
    keySource: null,
    teamCount: 0,
    teamKeys: [],
    openIssueCount: null,
    hasIgo: false,
    message: '',
  };
  if (!candidates.length) {
    report.message =
      'No LINEAR PAT (env LINEAR_API_KEY, ~/.config/linear/api_key, Keychain LINEAR_API_KEY)';
    return report;
  }
  resetLinearApiKeyCache();
  const key = await ensureLinearApiKey();
  if (!key) {
    report.message = 'PAT candidates present but none usable';
    return report;
  }
  report.keySource = _resolvedKey?.source || 'unknown';
  const teams = await listTeams();
  if (teams.error) {
    report.message = teams.message || 'teams query failed';
    return report;
  }
  const nodes = teams.data?.teams?.nodes || [];
  report.teamCount = nodes.length;
  report.teamKeys = nodes.map((t) => t.key);
  report.hasIgo = report.teamKeys.includes('IGO');
  const fleet = await listIssues({ fleet: true, first: 50, openOnly: true });
  if (!fleet.error) {
    report.openIssueCount = (fleet.issues || []).length;
  }
  report.ok = report.teamCount > 0;
  report.message = report.ok
    ? `Linear OK source=${report.keySource} teams=${report.teamKeys.join(',')} open=${report.openIssueCount}`
    : 'Linear reachable but zero teams';
  return report;
}

function queryLinear(query, variables = {}) {
  return ensureLinearApiKey().then((apiKey) => {
    if (!apiKey) {
      return {
        error: true,
        code: 'NO_API_KEY',
        message:
          'LINEAR_API_KEY not found (env, ~/.config/linear/api_key, or Keychain service LINEAR_API_KEY).',
      };
    }
    return queryLinearWithKey(apiKey, query, variables);
  });
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1 || i + 1 >= args.length) return null;
  return args[i + 1];
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

async function listTeams() {
  // Linear paginates; without first:, clients often only see one team (e.g. AGENT not IGO).
  return queryLinear(`
    query {
      teams(first: 50) {
        nodes { id key name }
      }
    }
  `);
}

async function resolveTeam(teamKey = DEFAULT_TEAM_KEY) {
  const res = await listTeams();
  if (res.error) return res;
  const teams = res.data?.teams?.nodes || [];
  if (!teams.length) {
    return { error: true, code: 'NO_TEAMS', message: 'No Linear teams in workspace.' };
  }
  const byKey = teams.find((t) => t.key?.toUpperCase() === String(teamKey).toUpperCase());
  if (byKey) return { team: byKey, teams };
  // Prefer a team named Agent / Agents, else first team
  const byName = teams.find((t) => /agent/i.test(t.name || ''));
  return { team: byName || teams[0], teams, fallback: true };
}

/** Latest vault claim note per linear_id (Handoffs/linear-claims). */
function loadVaultClaimsIndex() {
  const index = {};
  try {
    if (!fs.existsSync(CLAIMS_DIR)) return index;
    const files = fs
      .readdirSync(CLAIMS_DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(CLAIMS_DIR, f));
    for (const file of files) {
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const idM = text.match(/^linear_id:\s*(.+)$/m);
      const agentM = text.match(/^agent:\s*(.+)$/m);
      const actionM = text.match(/^action:\s*(.+)$/m);
      const statusM = text.match(/^status:\s*(.+)$/m);
      const updatedM = text.match(/^updated_at:\s*(.+)$/m);
      if (!idM) continue;
      const id = idM[1].trim().toUpperCase();
      const updated = updatedM ? updatedM[1].trim() : '';
      const prev = index[id];
      if (prev && prev.updated && updated && prev.updated > updated) continue;
      index[id] = {
        id,
        agent: agentM ? agentM[1].trim() : null,
        action: actionM ? actionM[1].trim() : null,
        status: statusM ? statusM[1].trim() : null,
        updated,
        file,
      };
    }
  } catch {
    /* non-fatal */
  }
  return index;
}

function issueListFields() {
  return `
    id
    identifier
    title
    description
    url
    state { id name type }
    assignee { id name email }
    labels { nodes { name } }
    team { id key name }
    updatedAt
    createdAt
  `;
}

/**
 * Fleet list: open issues across all teams (default).
 * Single-team: pass teamKey and fleet:false.
 */
async function listIssues({
  teamKey = null,
  first = 50,
  fleet = true,
  openOnly = true,
} = {}) {
  if (!fleet && teamKey) {
    const teamRes = await resolveTeam(teamKey);
    if (teamRes.error) return teamRes;
    const teamId = teamRes.team.id;
    const filter = openOnly
      ? `{
          team: { id: { eq: $teamId } }
          state: { type: { nin: ["completed", "canceled"] } }
        }`
      : `{ team: { id: { eq: $teamId } } }`;
    const res = await queryLinear(
      `
      query($teamId: ID!, $first: Int!) {
        issues(
          first: $first
          filter: ${filter}
          orderBy: updatedAt
        ) {
          nodes { ${issueListFields()} }
        }
      }
    `,
      { teamId: String(teamId), first },
    );
    if (res.error) return res;
    return {
      mode: 'team',
      team: teamRes.team,
      fallback: teamRes.fallback || false,
      openOnly,
      issues: res.data?.issues?.nodes || [],
      vaultClaims: loadVaultClaimsIndex(),
    };
  }

  // Default: workspace fleet (all teams, open issues)
  const filter = openOnly
    ? `{ state: { type: { nin: ["completed", "canceled"] } } }`
    : `{}`;
  const res = await queryLinear(
    `
    query($first: Int!) {
      issues(
        first: $first
        filter: ${filter}
        orderBy: updatedAt
      ) {
        nodes { ${issueListFields()} }
      }
    }
  `,
    { first },
  );
  if (res.error) return res;
  const teamsRes = await listTeams();
  return {
    mode: 'fleet',
    teams: teamsRes.data?.teams?.nodes || [],
    openOnly,
    issues: res.data?.issues?.nodes || [],
    vaultClaims: loadVaultClaimsIndex(),
  };
}

async function findIssueByIdentifier(identifier) {
  const raw = String(identifier || '').trim();
  if (!raw) return { error: true, message: 'Issue identifier required (e.g. IGO-34)' };
  const id = raw.toUpperCase();

  // Human identifiers: TEAM-123 → filter by team key + number (issueSearch is deprecated)
  const m = id.match(/^([A-Z][A-Z0-9]+)-(\d+)$/);
  if (m) {
    const teamKey = m[1];
    const number = parseInt(m[2], 10);
    const res = await queryLinear(
      `
      query($teamKey: String!, $number: Float!) {
        issues(
          first: 5
          filter: {
            team: { key: { eq: $teamKey } }
            number: { eq: $number }
          }
        ) {
          nodes {
            id
            identifier
            title
            description
            url
            team { id key name }
            state { id name type }
            assignee { id name email }
            labels { nodes { name } }
          }
        }
      }
    `,
      { teamKey, number },
    );
    if (res.error) return res;
    const nodes = res.data?.issues?.nodes || [];
    const exact = nodes.find((n) => n.identifier?.toUpperCase() === id) || nodes[0];
    if (exact) return { issue: exact };
  }

  // UUID direct lookup
  if (/^[0-9a-f-]{36}$/i.test(raw)) {
    const res = await queryLinear(
      `
      query($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          description
          url
          team { id key name }
          state { id name type }
          assignee { id name email }
          labels { nodes { name } }
        }
      }
    `,
      { id: raw },
    );
    if (res.error) return res;
    if (res.data?.issue) return { issue: res.data.issue };
  }

  // Fallback: scan fleet (all teams, include closed)
  const listed = await listIssues({ first: 100, fleet: true, openOnly: false });
  if (listed.error) return listed;
  const found = (listed.issues || []).find((n) => n.identifier?.toUpperCase() === id);
  if (found) {
    return { issue: found };
  }
  return {
    error: true,
    code: 'NOT_FOUND',
    message: `Issue ${id} not found`,
  };
}

async function teamStates(teamId) {
  const res = await queryLinear(
    `
    query($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes { id name type position }
        }
      }
    }
  `,
    { teamId: String(teamId) },
  );
  if (res.error) return res;
  return { states: res.data?.team?.states?.nodes || [] };
}

function pickState(states, wanted) {
  if (!wanted) return null;
  const w = String(wanted).toLowerCase();
  // exact name
  let hit = states.find((s) => s.name.toLowerCase() === w);
  if (hit) return hit;
  // common aliases
  const aliases = {
    todo: ['todo', 'backlog', 'triage', 'unstarted'],
    backlog: ['backlog', 'todo', 'triage'],
    'in progress': ['in progress', 'started', 'doing', 'active'],
    started: ['in progress', 'started'],
    claimed: ['in progress', 'started'],
    blocked: ['blocked', 'hold', 'waiting'],
    done: ['done', 'completed', 'closed'],
    completed: ['done', 'completed'],
    canceled: ['canceled', 'cancelled'],
  };
  const keys = aliases[w] || [w];
  for (const k of keys) {
    hit = states.find((s) => s.name.toLowerCase() === k);
    if (hit) return hit;
  }
  // type-based
  if (w.includes('progress') || w === 'claimed' || w === 'started') {
    hit = states.find((s) => s.type === 'started');
    if (hit) return hit;
  }
  if (w === 'done' || w === 'completed') {
    hit = states.find((s) => s.type === 'completed');
    if (hit) return hit;
  }
  if (w === 'backlog' || w === 'todo') {
    hit = states.find((s) => s.type === 'unstarted' || s.type === 'backlog');
    if (hit) return hit;
  }
  return null;
}

async function addComment(issueId, body) {
  return queryLinear(
    `
    mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
        comment { id url }
      }
    }
  `,
    { issueId, body },
  );
}

async function getViewer() {
  const res = await queryLinear(`query { viewer { id name email } }`);
  if (res.error) return res;
  return { viewer: res.data?.viewer };
}

/**
 * Ensure team has agent-lock + agent-<name> labels. Returns label IDs to attach.
 */
async function ensureAgentLabels(teamId, agent) {
  const agentName = normalizeAgent(agent);
  const needed = ['agent-lock', `agent-${agentName}`];
  const res = await queryLinear(
    `
    query($teamId: String!) {
      team(id: $teamId) {
        labels { nodes { id name } }
      }
    }
  `,
    { teamId: String(teamId) },
  );
  if (res.error) return res;
  const existing = res.data?.team?.labels?.nodes || [];
  const byName = Object.fromEntries(existing.map((l) => [l.name.toLowerCase(), l]));
  const ids = [];
  for (const name of needed) {
    const hit = byName[name.toLowerCase()];
    if (hit) {
      ids.push(hit.id);
      continue;
    }
    const created = await queryLinear(
      `
      mutation($input: IssueLabelCreateInput!) {
        issueLabelCreate(input: $input) {
          success
          issueLabel { id name }
        }
      }
    `,
      {
        input: {
          name,
          teamId: String(teamId),
          color: name === 'agent-lock' ? '#F2994A' : '#5E6AD2',
        },
      },
    );
    if (created.error) {
      // non-fatal: continue without this label
      continue;
    }
    const lab = created.data?.issueLabelCreate?.issueLabel;
    if (lab?.id) ids.push(lab.id);
  }
  return { labelIds: ids };
}

async function updateIssueFields(issueId, input) {
  return queryLinear(
    `
    mutation($issueId: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $issueId, input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          state { id name type }
          assignee { id name email }
          labels { nodes { id name } }
          team { id key name }
        }
      }
    }
  `,
    { issueId: String(issueId), input },
  );
}

async function setIssueState(issueId, stateId) {
  return updateIssueFields(issueId, { stateId: String(stateId) });
}

function ensureClaimsDir() {
  fs.mkdirSync(CLAIMS_DIR, { recursive: true });
}

function writeVaultClaim({ issue, agent, action, comment, files }) {
  ensureClaimsDir();
  const id = issue.identifier || issue.id;
  const stamp = new Date().toISOString();
  const day = stamp.slice(0, 10);
  const file = path.join(CLAIMS_DIR, `${day}_${id}_${normalizeAgent(agent)}.md`);
  const body = `---
linear_id: ${id}
linear_uuid: ${issue.id}
linear_url: ${issue.url || ''}
status: ${issue.state?.name || ''}
agent: ${normalizeAgent(agent)}
action: ${action}
updated_at: ${stamp}
claimed_files:
${(files || []).map((f) => `  - ${f}`).join('\n') || '  []'}
---

# Linear claim ${id}

- **Title:** ${issue.title || ''}
- **Agent:** ${normalizeAgent(agent)}
- **Action:** ${action}
- **State:** ${issue.state?.name || ''}
- **When:** ${stamp}

${comment ? `## Note\n\n${comment}\n` : ''}

## Protocol

1. Linear owns **issue** assignment (this file mirrors it).
2. AI-Agent-Sync \`Agent-State/<agent>.md\` owns **file** claims for mid-flight edits.
3. Do not edit code files another agent has claimed in vault without a handoff.

## Links

- Issue: ${issue.url || id}
`;
  fs.writeFileSync(file, body, 'utf8');

  // Also append a one-liner to current-handoff if present
  try {
    const handoff = path.join(VAULT_ROOT, 'Agent-State', 'current-handoff.md');
    if (fs.existsSync(handoff)) {
      const line = `\n- ${stamp.slice(0, 16)} **${normalizeAgent(agent)}** ${action} \`${id}\` — ${issue.title || ''}\n`;
      fs.appendFileSync(handoff, line, 'utf8');
    }
  } catch {
    /* ignore */
  }

  // Update agent state file lightly
  try {
    const agentFile = path.join(VAULT_ROOT, 'Agent-State', `${normalizeAgent(agent)}.md`);
    const snippet = `\n## Linear (${stamp.slice(0, 16)})\n- ${action}: **${id}** ${issue.title || ''} → ${issue.state?.name || ''}\n- Claim note: \`${path.relative(VAULT_ROOT, file)}\`\n`;
    if (fs.existsSync(agentFile)) {
      fs.appendFileSync(agentFile, snippet, 'utf8');
    } else {
      fs.writeFileSync(
        agentFile,
        `# ${normalizeAgent(agent)}\n\nLive agent state.\n${snippet}`,
        'utf8',
      );
    }
  } catch {
    /* ignore */
  }

  return file;
}

async function claimIssue({ identifier, agent, comment, files }) {
  const found = await findIssueByIdentifier(identifier);
  if (found.error) return found;
  let issue = found.issue;
  const teamId = issue.team?.id;
  if (!teamId) {
    return { error: true, message: 'Issue has no team id' };
  }
  const st = await teamStates(teamId);
  if (st.error) return st;
  const started = pickState(st.states, 'In Progress') || pickState(st.states, 'started');
  if (!started) {
    return {
      error: true,
      message: 'No In Progress/started state on team',
      states: st.states.map((s) => s.name),
    };
  }

  // Human remains Linear assignee (owner); agent name is in labels + comment + vault.
  const viewerRes = await getViewer();
  const assigneeId = viewerRes.viewer?.id || null;
  const labelsRes = await ensureAgentLabels(teamId, agent);
  const labelIds = labelsRes.labelIds || [];

  const input = { stateId: String(started.id) };
  if (assigneeId) input.assigneeId = String(assigneeId);
  if (labelIds.length) input.addedLabelIds = labelIds.map(String);

  const upd = await updateIssueFields(issue.id, input);
  if (upd.error) return upd;
  issue = upd.data?.issueUpdate?.issue || issue;

  const claimBody = [
    `🔒 Claimed by agent \`${normalizeAgent(agent)}\``,
    assigneeId ? `Human owner (Linear assignee): viewer / Igor` : null,
    comment ? `Note: ${comment}` : null,
    files?.length ? `Files: ${files.join(', ')}` : null,
    `Labels: agent-lock, agent-${normalizeAgent(agent)}`,
    `Vault claim: Handoffs/linear-claims/`,
  ]
    .filter(Boolean)
    .join('\n');
  await addComment(issue.id, claimBody);

  // refresh
  const again = await findIssueByIdentifier(issue.identifier || identifier);
  if (!again.error) issue = again.issue;

  const claimPath = writeVaultClaim({
    issue,
    agent,
    action: 'claim',
    comment,
    files,
  });

  return {
    success: true,
    issue,
    claimPath,
    state: issue.state?.name,
    assignee: issue.assignee?.name || issue.assignee?.email || null,
    labels: (issue.labels?.nodes || []).map((l) => l.name),
  };
}

async function updateIssue({ identifier, state, comment, agent }) {
  const found = await findIssueByIdentifier(identifier);
  if (found.error) return found;
  let issue = found.issue;
  let newStateName = issue.state?.name;

  if (state) {
    const teamId = issue.team?.id;
    if (!teamId) return { error: true, message: 'Issue has no team id' };
    const st = await teamStates(teamId);
    if (st.error) return st;
    const picked = pickState(st.states, state);
    if (!picked) {
      return {
        error: true,
        message: `State "${state}" not found`,
        states: st.states.map((s) => `${s.name} (${s.type})`),
      };
    }
    const upd = await setIssueState(issue.id, picked.id);
    if (upd.error) return upd;
    issue = upd.data?.issueUpdate?.issue || issue;
    newStateName = picked.name;
  }

  if (comment) {
    const who = agent ? `[\`${normalizeAgent(agent)}\`] ` : '';
    await addComment(issue.id, `${who}${comment}`);
  }

  const claimPath = writeVaultClaim({
    issue: { ...issue, state: { name: newStateName } },
    agent: agent || 'grok',
    action: 'update',
    comment: comment || `state → ${newStateName}`,
  });

  return { success: true, issue, state: newStateName, claimPath };
}

async function createIssue({ title, description, agent, teamKey, project }) {
  if (!title) return { error: true, message: '--title required' };
  const teamRes = await resolveTeam(teamKey || DEFAULT_TEAM_KEY);
  if (teamRes.error) return teamRes;
  const teamId = teamRes.team.id;
  const st = await teamStates(teamId);
  if (st.error) return st;
  const backlog = pickState(st.states, 'Backlog') || pickState(st.states, 'Todo') || st.states[0];

  const descParts = [
    description || '',
    agent ? `\n\n**Preferred agent:** \`${normalizeAgent(agent)}\`` : '',
    project ? `\n**Project/repo:** \`${project}\`` : '',
    '\n\n_Created by linear-agent-bridge_',
  ];

  const res = await queryLinear(
    `
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
          state { id name type }
          team { id key name }
        }
      }
    }
  `,
    {
      input: {
        teamId: String(teamId),
        title,
        description: descParts.join(''),
        ...(backlog?.id ? { stateId: String(backlog.id) } : {}),
      },
    },
  );
  if (res.error) return res;
  const issue = res.data?.issueCreate?.issue;
  if (!issue) return { error: true, message: 'issueCreate returned no issue', res };

  let claimPath = null;
  if (agent) {
    const claimed = await claimIssue({
      identifier: issue.identifier,
      agent,
      comment: `auto-claim on create for ${normalizeAgent(agent)}`,
      files: project ? [project] : [],
    });
    if (!claimed.error) {
      return {
        success: true,
        created: issue,
        claimed: claimed.issue,
        claimPath: claimed.claimPath,
        team: teamRes.team,
        fallback: teamRes.fallback,
      };
    }
  }

  claimPath = writeVaultClaim({
    issue,
    agent: agent || 'unassigned',
    action: 'create',
    comment: description || '',
    files: project ? [project] : [],
  });

  return {
    success: true,
    created: issue,
    claimPath,
    team: teamRes.team,
    fallback: teamRes.fallback,
  };
}

function printHelp() {
  console.log(`linear-agent-bridge — Linear + vault multi-agent coordination

Usage:
  --list [--json]                  Fleet: open issues across ALL teams (default)
  --list --team KEY [--all]        Single team (KEY=IGO|AGENT); --all includes done
  --teams [--json]                 List teams
  --doctor [--json]                Auth sources + team/open-issue health
  --claim ID --agent NAME          Claim issue (In Progress + comment + vault note)
  --update ID --state NAME         Update state; optional --comment --agent
  --done ID --agent NAME           Shortcut: state Done + comment
  --release ID --agent NAME        Comment release + vault note (state unchanged)
  --create --title "..."           Create issue; optional --agent --project --description
  --help

Auth: env / ~/.config/linear/api_key / Keychain — probes for broadest workspace (IGO+AGENT).
Workspace: https://linear.app/igorganapolsky/agent
Vault claims: ${CLAIMS_DIR}

Layers: Linear = issue ownership; AI-Agent-Sync vault = file/WIP claims.
Obsidian community Linear plugin = human display only (not a lock).
Ship claims: node tools/ship-claim-gate.js --claim "..." --results-json …
`);
}

function out(isJson, obj) {
  if (isJson) {
    console.log(JSON.stringify(obj, null, 2));
  } else if (obj.error) {
    console.error('Error:', obj.message || obj.code || JSON.stringify(obj));
    process.exitCode = 1;
  } else {
    console.log(obj);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isJson = hasFlag(args, '--json');
  const agent = argValue(args, '--agent') || 'grok';
  const teamKey = argValue(args, '--team') || DEFAULT_TEAM_KEY;

  if (hasFlag(args, '--help') || args.length === 0) {
    printHelp();
    return;
  }

  if (hasFlag(args, '--teams')) {
    const res = await listTeams();
    if (res.error) return out(isJson, res);
    const teams = res.data?.teams?.nodes || [];
    if (isJson) return out(true, teams);
    console.log(`Linear teams (${teams.length}):`);
    for (const t of teams) console.log(`  ${t.key}\t${t.name}\t${t.id}`);
    return;
  }

  if (hasFlag(args, '--doctor')) {
    const report = await doctorLinearFleet();
    if (isJson) return out(true, report);
    console.log(report.message);
    console.log(`  sources: ${report.sources.join(', ') || '(none)'}`);
    console.log(`  keySource: ${report.keySource || 'n/a'}`);
    console.log(`  teams: ${report.teamKeys.join(', ') || '(none)'}`);
    console.log(`  openIssues: ${report.openIssueCount ?? 'n/a'}`);
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (hasFlag(args, '--list')) {
    const wantTeam = hasFlag(args, '--team');
    const openOnly = !hasFlag(args, '--all');
    const res = await listIssues({
      teamKey: wantTeam ? teamKey : null,
      fleet: !wantTeam,
      first: 50,
      openOnly,
    });
    if (res.error) return out(isJson, res);
    if (isJson) return out(true, res);
    const claims = res.vaultClaims || {};
    if (res.mode === 'fleet') {
      const teamKeys = (res.teams || []).map((t) => t.key).join(', ') || '?';
      console.log(
        `\nLinear fleet · open issues · ${res.issues.length} shown · teams: ${teamKeys}`,
      );
    } else {
      const label = res.fallback
        ? `${res.team.key} (fallback — no ${teamKey} team)`
        : res.team.key;
      console.log(
        `\nLinear issues · team ${label} · ${res.issues.length} shown${openOnly ? ' (open)' : ' (all)'}`,
      );
    }
    console.log('──────────────────────────────────────────────────────');
    if (!res.issues.length) {
      console.log('(none)');
      return;
    }
    for (const issue of res.issues) {
      const asg = issue.assignee?.name || 'unassigned';
      const team = issue.team?.key || res.team?.key || '?';
      const vc = claims[String(issue.identifier || '').toUpperCase()];
      const vaultBit = vc?.agent
        ? ` · vault:${vc.agent}/${vc.action || '?'}`
        : '';
      console.log(
        `[${issue.identifier}] ${issue.title} · ${team} · ${issue.state?.name || '?'} · ${asg}${vaultBit}`,
      );
    }
    return;
  }

  if (hasFlag(args, '--claim')) {
    const identifier = argValue(args, '--claim');
    const comment = argValue(args, '--comment');
    const filesRaw = argValue(args, '--files');
    const files = filesRaw ? filesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const res = await claimIssue({ identifier, agent, comment, files });
    if (res.error) return out(isJson, res);
    if (isJson) return out(true, res);
    console.log(`Claimed ${res.issue.identifier} → ${res.state}`);
    console.log(`Vault: ${res.claimPath}`);
    console.log(res.issue.url || '');
    return;
  }

  if (hasFlag(args, '--done')) {
    const identifier = argValue(args, '--done');
    const comment = argValue(args, '--comment') || 'Done';
    const res = await updateIssue({
      identifier,
      state: 'Done',
      comment,
      agent,
    });
    if (res.error) return out(isJson, res);
    if (isJson) return out(true, res);
    console.log(`Done ${res.issue.identifier || identifier} → ${res.state}`);
    console.log(`Vault: ${res.claimPath}`);
    return;
  }

  if (hasFlag(args, '--release')) {
    const identifier = argValue(args, '--release');
    const comment =
      argValue(args, '--comment') ||
      `Released by \`${normalizeAgent(agent)}\` — issue free for reassignment`;
    const res = await updateIssue({ identifier, comment, agent });
    if (res.error) return out(isJson, res);
    if (isJson) return out(true, res);
    console.log(`Release note on ${identifier}`);
    console.log(`Vault: ${res.claimPath}`);
    return;
  }

  if (hasFlag(args, '--update')) {
    const identifier = argValue(args, '--update');
    const state = argValue(args, '--state');
    const comment = argValue(args, '--comment');
    if (!state && !comment) {
      return out(isJson, {
        error: true,
        message: '--update requires --state and/or --comment',
      });
    }
    const res = await updateIssue({ identifier, state, comment, agent });
    if (res.error) return out(isJson, res);
    if (isJson) return out(true, res);
    console.log(`Updated ${res.issue.identifier || identifier} → ${res.state || 'comment only'}`);
    console.log(`Vault: ${res.claimPath}`);
    return;
  }

  if (hasFlag(args, '--create')) {
    const title = argValue(args, '--title');
    const description = argValue(args, '--description') || '';
    const project = argValue(args, '--project');
    const res = await createIssue({
      title,
      description,
      agent: hasFlag(args, '--agent') ? agent : null,
      teamKey,
      project,
    });
    if (res.error) return out(isJson, res);
    if (isJson) return out(true, res);
    const issue = res.claimed || res.created;
    console.log(`Created ${issue.identifier}: ${issue.title}`);
    console.log(issue.url || '');
    if (res.claimPath) console.log(`Vault: ${res.claimPath}`);
    if (res.fallback) console.log(`(team fallback → ${res.team.key})`);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Linear bridge error:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  getLinearApiKey,
  resetLinearApiKeyCache,
  collectLinearApiKeyCandidates,
  scoreTeamsProbe,
  queryLinear,
  listIssues,
  listTeams,
  claimIssue,
  updateIssue,
  createIssue,
  findIssueByIdentifier,
  writeVaultClaim,
  loadVaultClaimsIndex,
  doctorLinearFleet,
  normalizeAgent,
  DEFAULT_TEAM_KEY,
};
