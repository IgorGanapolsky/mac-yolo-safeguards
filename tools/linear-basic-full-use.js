#!/usr/bin/env node
'use strict';

/**
 * Linear Basic full-use doctor + prune classifier.
 * Live org (2026-08-26): subscription.type=basic_monthly_12, 1 seat, monthly $12.
 * Complementary to Codex PR #2121 (read-only hygiene planner).
 * This file has no mutation path and never prints a PAT.
 * Do not edit tools/linear-workspace-hygiene.js or tools/linear-agent-skill-exporter.js.
 */

const TEL_RE = /^(pr_merge_time:|duration:|pr_open_to_green:)/;
const SESSION_SUFFIX_RE =
  /^agent-(codex|hermes|cursor|grok|claude-code|antigravity|jcode)-.+/i;
const CANONICAL_LOCK = new Set([
  'agent-lock',
  'agent-grok',
  'agent-codex',
  'agent-claude-code',
  'agent-cursor',
  'agent-antigravity',
  'agent-hermes',
  'agent-Hermes',
  'agent-jcode',
  'agents-multi',
  'status:agent-working',
  'agent:lock',
  'agent:grok',
  'agent:codex',
  'agent:claude',
  'agent:claude-code',
  'agent:hermes',
  'agent:antigravity',
]);

const SCHEMA = 'linear-basic-full-use/v2';
const CYCLE1_START = '2026-08-31';
const REQUIRED_TEMPLATES = ['Fleet claim', 'Bug', 'Agency cash'];

function honesty() {
  return {
    schema: SCHEMA,
    plan: 'basic_monthly_12',
    seats: 1,
    billing: 'monthly',
    dualEditCodexHygiene2121: false,
    clonedLinearAiMeter: false,
    autoBuyAiCredits: false,
    steal: [
      'use every Basic control: unlimited issues/uploads, 5 teams, cycles+triage on AGENT, gitBranchFormat, customers, pulse, MCP, Linear Agent skills',
      'prune session-suffix agent-* labels only after the issue is completed/canceled',
      'fail closed on Business: Loops, SLAs, Insights, Dashboards, Code Intelligence, triageResponsibilityCreate',
      'coding sessions exist on Basic but draw AI credits — do not auto-top-up',
    ],
  };
}

function planWalls() {
  return [
    { feature: 'issue SLAs', code: 'FEATURE_NOT_ACCESSIBLE' },
    { feature: 'triageResponsibilityCreate', code: 'FORBIDDEN' },
    { feature: 'Loops', code: 'Business' },
    { feature: 'Code Intelligence', code: 'Business' },
    { feature: 'Triage Intelligence', code: 'Business' },
    { feature: 'Insights / Dashboards', code: 'Business' },
    { feature: 'Linear Asks', code: 'Business' },
    { feature: 'SAML/SCIM', code: 'Enterprise' },
    { feature: 'private teams / guests', code: 'Business' },
    { feature: 'sub-initiatives', code: 'Business' },
    { feature: 'Releases pipelines', code: 'Business' },
    { feature: 'app user revoke', code: 'settings-UI only' },
    { feature: 'AI credit auto-top-up', code: 'Igor-only spend' },
  ];
}

function mustUseCapabilities() {
  return [
    { id: 'unlimited_issues', on: 'Basic', rule: 'Stop treating the old 250-issue Free cap as a reason to close work' },
    { id: 'five_teams', on: 'Basic', rule: 'AGENT = fleet locks. IGO = personal slot even at 0 open. Do not mint empty teams' },
    { id: 'unlimited_uploads', on: 'Basic', rule: 'attachmentCreate PR/CI/screenshot URLs on the issue, not a vault dump' },
    { id: 'admin_roles', on: 'Basic', rule: 'Viewer is admin — prune, enable cycles/triage, set gitBranchFormat' },
    { id: 'cycles', on: 'Basic', rule: 'AGENT weekly cycles, cooldown 0. Do not start Cycle 1 before 2026-08-31' },
    { id: 'triage', on: 'Basic', rule: 'AGENT triageEnabled. New AGENT issues land in Triage, then agent-lock on claim' },
    { id: 'initiatives_roadmap', on: 'Basic', rule: 'One active initiative: First Real Agency Cash. roadmapEnabled=true' },
    { id: 'customers', on: 'Basic', rule: 'customersEnabled. Named buyers/shops only — never mint fake customers' },
    { id: 'pulse', on: 'Basic', rule: 'feedEnabled. Use Pulse for daily summary, not a dashboard clone' },
    { id: 'git_branch_format', on: 'Basic', rule: 'gitBranchFormat={issueIdentifier}. Public PR comments OFF' },
    { id: 'issue_sync_github_slack', on: 'Basic', rule: 'GitHub + Slack live. Guided reviews via Linear PR attachments' },
    { id: 'linear_agent', on: 'Basic', rule: 'Linear Agent chat + @Linear comments. Skills included. Loops stay Business' },
    { id: 'mcp', on: 'Basic', rule: 'https://mcp.linear.app/mcp via linear_mcp.sh. GraphQL PAT remains lock source of truth' },
    { id: 'agent_skills', on: 'Basic', rule: 'Personal + AGENT team-shared skills. Complementary to Codex exporter, do not dual-edit it' },
    { id: 'coding_sessions', on: 'Basic+credits', rule: 'Supported on Basic; draws AI credits. Fail closed at $0 remaining. Do not auto-buy' },
    { id: 'templates', on: 'Basic', rule: 'Fleet claim / Bug / Agency cash. Do not add lock-taxonomy templates' },
    { id: 'api_webhooks', on: 'Basic', rule: 'Zero webhooks is correct until a durable receiver URL exists' },
    { id: 'google_sso', on: 'Basic', rule: 'iganapolsky@gmail.com' },
  ];
}

function linearAgentNativeSkills() {
  return [
    {
      name: 'Fleet lock — never steal',
      description: 'Refuse to claim or relabel an issue that already has agent-codex or agent-claude-code.',
      prompt:
        'Before claiming or adding agent-lock, read the issue labels. If agent-codex, agent-claude-code, or agent-lock from another agent is present, do not claim. Comment a complement note with the PR URL only. Canonical new labels use dash form (agent-grok), never a unique per-issue suffix like agent-codex-slug-20260826.',
    },
    {
      name: 'AGENT cycle rollup',
      description: 'Summarize the current or upcoming AGENT weekly cycle without starting it early.',
      prompt:
        'AGENT cycles are weekly, cooldown 0, America/New_York. Cycle 1 starts 2026-08-31. Do not call cycleStartUpcomingCycleToday before that date. Summarize completed vs started vs at-risk issues for the active cycle. Keep telemetry in a comment, never as a pr_merge_time:Nm label.',
    },
    {
      name: 'Triage then claim',
      description: 'Park new AGENT issues in Triage, then apply agent-lock only on a real claim.',
      prompt:
        'AGENT triageEnabled=true. New AGENT work lands in Triage. Do not invent triageResponsibilityCreate (Business). After a grok claim, set In Progress and add agent-lock + agent-grok. Use templates Fleet claim / Bug / Agency cash when creating issues.',
    },
    {
      name: 'Attach evidence (unlimited uploads)',
      description: 'Attach the GitHub PR or CI URL on the Linear issue instead of dumping files into the vault.',
      prompt:
        'Basic removes the 10MB upload cap. When a PR exists, attachmentCreate the GitHub URL on the issue. Prefer a link attachment over copying the patch into a comment. Do not treat a vault markdown dump as the evidence surface.',
    },
    {
      name: 'Named customer only',
      description: 'Create Linear customers only for real named buyers or shops.',
      prompt:
        'customersEnabled=true. Add a Customer only for a named HVAC/plumbing shop, Jeff/Hilltown, or a verified cash buyer. Never mint agent-lock noise, fake personas, or test customers. Link the customer request to the existing issue. Pulse (feedEnabled) is the daily summary, not Insights.',
    },
    {
      name: 'Fail closed on Business',
      description: 'Refuse Loops, SLAs, Insights, Dashboards, Code Intelligence, and AI-credit auto-top-up.',
      prompt:
        'This workspace is Basic (basic_monthly_12, 1 seat). If a request needs Loops, issue SLAs, Insights, Dashboards, Linear Asks, Code Intelligence, Triage Intelligence, private teams, or SAML, record PLAN_WALL and continue on Basic rails. Coding sessions are allowed on Basic only when AI credits remain; never auto-buy credits.',
    },
  ];
}

function isCanonicalLockLabel(name) {
  return CANONICAL_LOCK.has(String(name || ''));
}

function isSessionSuffixLabel(name) {
  return SESSION_SUFFIX_RE.test(String(name || ''));
}

function isTelemetryLabel(name) {
  return TEL_RE.test(String(name || ''));
}

function issueIsClosed(issue) {
  const type = String((issue && issue.state && issue.state.type) || (issue && issue.stateType) || '').toLowerCase();
  return type === 'completed' || type === 'canceled';
}

function canDeleteLabel(input = {}) {
  const name = String(input.name || '');
  const team = String(input.team || input.teamKey || '');
  const issues = Array.isArray(input.issues) ? input.issues : [];
  if (isCanonicalLockLabel(name)) {
    return { delete: false, reason: 'canonical_lock' };
  }
  if (isTelemetryLabel(name)) {
    return { delete: true, reason: 'telemetry_label' };
  }
  if (isSessionSuffixLabel(name)) {
    if (issues.length === 0) return { delete: true, reason: 'session_suffix_empty' };
    if (issues.every(issueIsClosed)) return { delete: true, reason: 'session_suffix_closed' };
    return { delete: false, reason: 'session_suffix_open' };
  }
  if (team === 'AGENT' && /^(agent-|agent:|status:|agents-)/.test(name)) {
    return { delete: false, reason: 'agent_lock_family' };
  }
  if (issues.length === 0) return { delete: true, reason: 'empty' };
  return { delete: false, reason: 'in_use' };
}

function canDeleteProject(input = {}) {
  const trashed = input.trashed === true;
  const archived = Boolean(input.archivedAt);
  const count = Number(input.issueCountIncludingArchived || 0);
  const open = Number(input.openIssueCount || 0);
  if (open > 0) return { delete: false, reason: 'has_open_issues' };
  if (count > 0) return { delete: false, reason: 'has_archived_issues' };
  if (trashed || archived) return { delete: true, reason: 'empty_trashed_or_archived' };
  return { delete: false, reason: 'live_empty_needs_human' };
}

function canRemoveAppUser(input = {}) {
  const name = String(input.name || '');
  if (name === 'Linear' || /linear agent/i.test(name)) {
    return { delete: false, reason: 'linear_agent' };
  }
  if (/cursor/i.test(name)) return { delete: false, reason: 'cursor_fleet_oauth' };
  if (/devin/i.test(name)) return { delete: false, reason: 'app_user_settings_ui_only' };
  return { delete: false, reason: 'app_user_settings_ui_only' };
}

function classifyInventory(inv = {}) {
  const labels = Array.isArray(inv.labels) ? inv.labels : [];
  const projects = Array.isArray(inv.projects) ? inv.projects : [];
  const users = Array.isArray(inv.users) ? inv.users : [];
  const labelPlan = labels.map((lab) => ({ name: lab.name, ...canDeleteLabel(lab) }));
  const projectPlan = projects.map((proj) => ({ name: proj.name, ...canDeleteProject(proj) }));
  const userPlan = users.map((user) => ({ name: user.name, ...canRemoveAppUser(user) }));
  return {
    schema: SCHEMA,
    labelsToDelete: labelPlan.filter((row) => row.delete),
    labelsKept: labelPlan.filter((row) => !row.delete),
    projectsToDelete: projectPlan.filter((row) => row.delete),
    projectsKept: projectPlan.filter((row) => !row.delete),
    appUsers: userPlan,
    planWalls: planWalls(),
  };
}

function gradeCapabilities(obs = {}) {
  const findings = [];
  const pass = (id, ok, detail) => {
    findings.push({ id, ok: Boolean(ok), detail: String(detail || '') });
  };
  pass('plan', obs.plan === 'basic_monthly_12', `plan=${obs.plan || 'unknown'}`);
  pass('git_branch_format', obs.gitBranchFormat === '{issueIdentifier}', `gitBranchFormat=${obs.gitBranchFormat || ''}`);
  pass('customers', obs.customersEnabled === true, 'customersEnabled');
  pass('pulse', obs.feedEnabled === true, 'feedEnabled');
  pass('linear_agent', obs.linearAgentEnabled === true, 'linearAgentEnabled');
  pass('coding_agent_flag', obs.codingAgentEnabled === true, 'codingAgentEnabled (sessions still need AI credits)');
  pass('code_intel_off', obs.codeIntelligenceEnabled !== true, 'codeIntelligence stays false on Basic');
  pass('releases_off', obs.releasesEnabled !== true, 'releases stay false on Basic');
  pass('public_linkback_off', obs.gitPublicLinkbackMessagesEnabled === false, 'public PR comments off');
  pass(
    'agent_cycles',
    obs.agentCyclesEnabled === true && Number(obs.agentCycleCooldown) === 0,
    `cycles=${obs.agentCyclesEnabled} cooldown=${obs.agentCycleCooldown}`,
  );
  pass('agent_triage', obs.agentTriageEnabled === true, 'AGENT triageEnabled');
  pass(
    'cycle1_not_early',
    obs.activeCycleName == null || obs.activeCycleName === 'AGENT Cycle 1',
    `activeCycle=${obs.activeCycleName || 'none'}; Cycle 1 starts ${CYCLE1_START}`,
  );
  const templates = Array.isArray(obs.templates) ? obs.templates : [];
  pass(
    'templates',
    REQUIRED_TEMPLATES.every((name) => templates.includes(name)),
    `templates=${templates.join(',')}`,
  );
  pass('empty_labels', Number(obs.emptyLabelCount || 0) === 0, `emptyLabelCount=${obs.emptyLabelCount || 0}`);
  pass('webhooks_parked', Number(obs.webhookCount || 0) === 0, 'zero webhooks until durable URL');
  pass('igo_kept', obs.igoPresent === true, 'IGO personal slot kept even at 0 issues');
  const failed = findings.filter((row) => !row.ok);
  return {
    schema: SCHEMA,
    ok: failed.length === 0,
    failed: failed.map((row) => row.id),
    findings,
    cycle1Starts: CYCLE1_START,
    mustUse: mustUseCapabilities(),
    planWalls: planWalls(),
  };
}

function runDemo() {
  return {
    prune: classifyInventory({
      labels: [
        { name: 'agent-lock', team: 'AGENT', issues: [] },
        { name: 'agent-codex-six-block-context-20260826', team: 'AGENT', issues: [{ state: { type: 'canceled' } }] },
        { name: 'agent-codex-linear-basic-2111', team: 'AGENT', issues: [{ state: { type: 'started' } }] },
        { name: 'pr_merge_time:12m', team: 'AGENT', issues: [{ state: { type: 'completed' } }] },
        { name: 'stale-empty', team: 'IGO', issues: [] },
      ],
      projects: [
        { name: 'Interview empty trash', trashed: true, archivedAt: '2026-08-01', issueCountIncludingArchived: 0, openIssueCount: 0 },
        { name: 'MoodTracker Launch', trashed: true, archivedAt: '2026-08-01', issueCountIncludingArchived: 5, openIssueCount: 5 },
        { name: 'mac-yolo-safeguards', trashed: false, issueCountIncludingArchived: 5, openIssueCount: 5 },
      ],
      users: [
        { name: 'Linear', app: true, active: true },
        { name: 'Cursor', app: true, active: false },
        { name: 'Devin', app: true, active: false },
      ],
    }),
    grade: gradeCapabilities({
      plan: 'basic_monthly_12',
      gitBranchFormat: '{issueIdentifier}',
      customersEnabled: true,
      feedEnabled: true,
      linearAgentEnabled: true,
      codingAgentEnabled: true,
      codeIntelligenceEnabled: false,
      releasesEnabled: false,
      gitPublicLinkbackMessagesEnabled: false,
      agentCyclesEnabled: true,
      agentCycleCooldown: 0,
      agentTriageEnabled: true,
      activeCycleName: null,
      templates: REQUIRED_TEMPLATES,
      emptyLabelCount: 0,
      webhookCount: 0,
      igoPresent: true,
    }),
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const pretty = json ? 2 : 0;
  const payload = { ...honesty() };
  if (argv.includes('--demo')) payload.demo = runDemo();
  if (argv.includes('--grade') || argv.includes('--demo')) {
    payload.grade = (payload.demo && payload.demo.grade) || gradeCapabilities();
  }
  if (argv.includes('--export-agent-skills')) {
    payload.linearAgentNativeSkills = linearAgentNativeSkills();
  }
  if (argv.includes('--caps')) payload.mustUse = mustUseCapabilities();
  if (!argv.includes('--demo') && !argv.includes('--grade') && !argv.includes('--export-agent-skills') && !argv.includes('--caps')) {
    payload.planWalls = planWalls();
    payload.mustUse = mustUseCapabilities();
  }
  process.stdout.write(`${JSON.stringify(payload, null, pretty)}\n`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  SCHEMA,
  CYCLE1_START,
  REQUIRED_TEMPLATES,
  honesty,
  planWalls,
  mustUseCapabilities,
  linearAgentNativeSkills,
  isCanonicalLockLabel,
  isSessionSuffixLabel,
  isTelemetryLabel,
  canDeleteLabel,
  canDeleteProject,
  canRemoveAppUser,
  classifyInventory,
  gradeCapabilities,
  runDemo,
  main,
};
