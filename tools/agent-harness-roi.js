#!/usr/bin/env node
'use strict';

/**
 * agent-harness-roi.js — High-ROI harness upgrades (2026-07-28)
 *
 * NVIDIA open-stack signal (2026-07-28): accuracy and cost improve via
 * harness profiles + verified skill packs, not fine-tuning first.
 *
 * This module is pure policy + pure functions. CLI surface lives in
 * tools/agent-swarm-harness.js so session-start keeps one entrypoint.
 *
 * Surfaces:
 *   1. Named harness profiles per model/task class
 *   2. Skill packs bound to toolbox entrypoints + gates
 *   3. Claim hygiene (contention summary, not 700 pair dump)
 *   4. Eval research loop receipts (mine → propose → artifacts only)
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');
const EVAL_RESEARCH_DIR = path.join(REPO, 'artifacts/eval-research');
const EVAL_RESEARCH_LATEST = path.join(EVAL_RESEARCH_DIR, 'latest.json');

const HARNESS_ROI_SOURCE = Object.freeze({
  label: 'NVIDIA open-stack agents / harness profile over fine-tune (2026-07-28)',
  url: 'https://blogs.nvidia.com/',
  principle:
    'Specialize agents with harness profiles + verified skill packs + eval loops; fine-tune/LoRA only after evals plateau.',
});

/**
 * Named harness profiles: versioned packs of effort, toolbox allowlist,
 * skill packs, turn/tool budgets, and eval bars. Not weight updates.
 */
const HARNESS_PROFILES = Object.freeze([
  {
    id: 'frontier_planner',
    modelClass: 'frontier',
    routeHint: 'claude / gpt / glm52_reasoning / openrouter frontier',
    hosts: ['mac_pro', 'mac_mini'],
    roles: ['planner'],
    effort: 'high',
    maxTurns: 40,
    maxTools: 80,
    toolboxAllow: ['repo_coord', 'memory_rag', 'fleet_inference', 'device_mobile'],
    skillPacks: ['coord_claim', 'sdd_gap', 'ship_evidence', 'memory_recall'],
    evalBar: ['ship_claim_honesty', 'megafile_claim_discipline'],
    writeAllow: ['plan.md', 'docs/', 'evals/', 'artifacts/'],
    noMegafileDesign: false,
    notes: 'Frontier plans AC + claims; do not implement worker leaves in same context.',
  },
  {
    id: 'local_worker_leaf',
    modelClass: 'open_local',
    routeHint: 'tinker-yolo q4 / hermes-local / ollama Composer-class',
    hosts: ['mac_pro', 'mac_mini'],
    roles: ['worker'],
    effort: 'medium',
    maxTurns: 25,
    maxTools: 40,
    toolboxAllow: ['repo_coord', 'memory_rag', 'fleet_inference', 'device_mobile'],
    skillPacks: ['coord_claim', 'ship_evidence', 'memory_recall'],
    evalBar: ['ship_claim_honesty'],
    writeAllow: ['claimed leaf files only', 'tests/', 'evals/'],
    noMegafileDesign: true,
    notes: 'Cheap/local executes explicit AcceptanceCheck leaves only.',
  },
  {
    id: 'nemotron_worker',
    modelClass: 'open_cloud',
    routeHint: 'openrouter-nemotron / nim-nemotron candidate (gated)',
    hosts: ['mac_pro', 'mac_mini'],
    roles: ['worker'],
    effort: 'medium',
    maxTurns: 30,
    maxTools: 50,
    toolboxAllow: ['repo_coord', 'memory_rag', 'fleet_inference'],
    skillPacks: ['coord_claim', 'ship_evidence', 'memory_recall'],
    evalBar: ['ship_claim_honesty', 'megafile_claim_discipline'],
    writeAllow: ['claimed leaf files only', 'tests/'],
    noMegafileDesign: true,
    notes:
      'Open-weights cloud worker profile — accuracy from harness + tools, not fine-tune. Respect approval-gated routes.',
  },
  {
    id: 'device_mobile',
    modelClass: 'mixed',
    routeHint: 'frontier for pair design; local for focused Jest/Maestro script leaves',
    hosts: ['mac_pro', 'mac_mini'],
    roles: ['worker', 'planner'],
    effort: 'high',
    maxTurns: 35,
    maxTools: 60,
    toolboxAllow: ['device_mobile', 'repo_coord', 'memory_rag'],
    skillPacks: ['device_pair', 'ship_evidence', 'coord_claim'],
    evalBar: ['fresh_user_tailscale_pair', 'empty_stream_hard_stop', 'ship_claim_honesty'],
    writeAllow: ['hermes-mobile/ claimed files', 'tests/', 'hermes-mobile/docs/proofs/'],
    noMegafileDesign: true,
    notes: 'Real-user paths only; never demo=1 false green.',
  },
  {
    id: 'revenue_cash_pro',
    modelClass: 'frontier',
    routeHint: 'frontier for close; open-weights draft only via revenue-local-draft',
    hosts: ['mac_pro'],
    roles: ['worker', 'planner'],
    effort: 'medium',
    maxTurns: 30,
    maxTools: 40,
    toolboxAllow: ['revenue_cash', 'memory_rag', 'repo_coord'],
    skillPacks: ['revenue_cash', 'ship_evidence'],
    evalBar: ['revenue_followup_draft', 'ship_claim_honesty'],
    writeAllow: ['pipeline TSVs (gitignored)', 'tools/revenue-*', 'artifacts/'],
    noMegafileDesign: true,
    notes: 'Mac Pro only. CLI/Stripe first; no Chrome unless explicit ask + env gate.',
  },
  {
    id: 'social_promo_pro',
    modelClass: 'frontier',
    routeHint: 'frontier for draft quality; never invent LIVE',
    hosts: ['mac_pro'],
    roles: ['worker', 'planner'],
    effort: 'medium',
    maxTurns: 25,
    maxTools: 30,
    toolboxAllow: ['social_promo', 'memory_rag', 'repo_coord'],
    skillPacks: ['social_live', 'ship_evidence'],
    evalBar: ['social_live_matrix', 'ship_claim_honesty'],
    writeAllow: ['docs/social/', 'content-engine/', 'artifacts/'],
    noMegafileDesign: true,
    notes: 'Mac Pro only. PUBLISH_APPROVED + LIVE matrix; Hashnode frozen; no Zernio.',
  },
  {
    id: 'eval_research_loop',
    modelClass: 'open_local',
    routeHint: 'tinker-yolo / hermes-local overnight',
    hosts: ['mac_pro', 'mac_mini'],
    roles: ['worker'],
    effort: 'low',
    maxTurns: 15,
    maxTools: 20,
    toolboxAllow: ['repo_coord', 'memory_rag'],
    skillPacks: ['eval_research', 'coord_claim'],
    evalBar: ['megafile_claim_discipline', 'ship_claim_honesty'],
    writeAllow: ['evals/', 'artifacts/eval-research/', 'docs/agent-field-guide/index.md'],
    noMegafileDesign: true,
    notes:
      'Agents farm failures → eval stubs; human steers strategy. Never edit megafiles or product source.',
  },
  {
    id: 'optics_status',
    modelClass: 'open_local',
    routeHint: 'local status scripts only',
    hosts: ['mac_pro', 'mac_mini'],
    roles: ['worker'],
    effort: 'low',
    maxTurns: 8,
    maxTools: 15,
    toolboxAllow: ['repo_coord', 'fleet_inference', 'memory_rag'],
    skillPacks: ['coord_claim'],
    evalBar: ['ship_claim_honesty'],
    writeAllow: ['artifacts/'],
    noMegafileDesign: true,
    notes: 'Status matrices and CI glances — never max effort.',
  },
]);

/**
 * Verified skill packs: portable entrypoints + gates bound to a toolbox.
 * Agents invoke packs; they do not reload the full skill catalog.
 */
const SKILL_PACKS = Object.freeze([
  {
    id: 'coord_claim',
    toolbox: 'repo_coord',
    hosts: ['mac_pro', 'mac_mini'],
    entrypoints: [
      'node tools/agent-swarm-harness.js',
      'node tools/agent-swarm-harness.js claim-hygiene',
      'node tools/plan-coordination-snapshot.js',
      'git worktree + sequential merge',
    ],
    gates: [],
    verifyCommand: 'node tools/agent-swarm-harness.js claim-hygiene --json',
    description: 'Claim free files, detect contention, stay under concurrency cap',
  },
  {
    id: 'sdd_gap',
    toolbox: 'repo_coord',
    hosts: ['mac_pro', 'mac_mini'],
    entrypoints: [
      'node tools/agent-swarm-harness.js sdd',
      'plan.md §3 Decisions Log',
    ],
    gates: [],
    verifyCommand: 'node tools/agent-swarm-harness.js sdd --json',
    description: 'Update AC/claim before code when gaps appear mid-build',
  },
  {
    id: 'ship_evidence',
    toolbox: 'repo_coord',
    hosts: ['mac_pro', 'mac_mini'],
    entrypoints: [
      'node tools/agent-swarm-harness.js session-contract',
      'stacked unit + typecheck + E2E or honest skip',
    ],
    gates: [],
    verifyCommand: null,
    description: 'Ship claims need machine evidence, not adjectives',
  },
  {
    id: 'memory_recall',
    toolbox: 'memory_rag',
    hosts: ['mac_pro', 'mac_mini'],
    entrypoints: [
      'mcp__thumbgate__recall / capture',
      'grepai search (local MCP)',
      'docs/agent-field-guide/index.md',
    ],
    gates: [],
    verifyCommand: null,
    description: 'RAG + Field Guide; never invent lessons',
  },
  {
    id: 'device_pair',
    toolbox: 'device_mobile',
    hosts: ['mac_pro', 'mac_mini'],
    entrypoints: [
      'node tools/hermes-mobile-pair.js',
      'npm test under hermes-mobile/',
      'continuous E2E latest.json',
    ],
    gates: [],
    verifyCommand: null,
    description: 'Real-user pair + mobile verification',
  },
  {
    id: 'revenue_cash',
    toolbox: 'revenue_cash',
    hosts: ['mac_pro'],
    entrypoints: [
      'node tools/revenue-autonomous-loop.js',
      'node tools/revenue-local-draft.js --template',
      'Stripe CLI/API first',
    ],
    gates: ['prefer_cli_over_chrome'],
    verifyCommand: null,
    description: 'Cash path drafts/sends on Pro only',
  },
  {
    id: 'social_live',
    toolbox: 'social_promo',
    hosts: ['mac_pro'],
    entrypoints: [
      'node tools/social-publish-gate.js --platform … --campaign …',
      'node tools/verify-public-post.js --url …',
      'docs/social/hermes-mobile-content-log.tsv',
    ],
    gates: ['PUBLISH_APPROVED', 'HERMES_ALLOW_INTERACTIVE_CHROME'],
    verifyCommand: null,
    description: 'Pre-post gate + LIVE proof; no double-post; Hashnode frozen',
  },
  {
    id: 'eval_research',
    toolbox: 'repo_coord',
    hosts: ['mac_pro', 'mac_mini'],
    entrypoints: [
      'node tools/agent-swarm-harness.js eval-mine',
      'node tools/agent-swarm-harness.js eval-research',
      'node tools/agent-swarm-harness.js propose-eval --task "…"',
    ],
    gates: [],
    verifyCommand: 'node tools/agent-swarm-harness.js eval-research --json',
    description: 'Overnight mine failures → eval stubs under evals/ only',
  },
]);

function harnessProfilePolicy() {
  return {
    principle: HARNESS_ROI_SOURCE.principle,
    source: HARNESS_ROI_SOURCE,
    profiles: HARNESS_PROFILES.map((p) => ({ ...p })),
    antiPatterns: [
      'One giant prompt for every model class',
      'Fine-tune before harness profile + eval bar are green',
      'Running social/revenue profiles on mac_mini',
      'eval_research_loop editing product megafiles',
      'Worker leaf with frontier max effort by default',
    ],
  };
}

function skillPackPolicy() {
  return {
    principle:
      'Reusable verified skill packs give agents portable capabilities teams can audit and govern — invoke entrypoints, never dump the full skill catalog.',
    source: HARNESS_ROI_SOURCE,
    packs: SKILL_PACKS.map((p) => ({ ...p })),
    antiPatterns: [
      'Paste entire SKILL.md into every worker prompt',
      'Skill without toolbox binding',
      'Social pack on mini or without PUBLISH_APPROVED',
      'Claim pack success without verifyCommand when one exists',
    ],
  };
}

/**
 * Classify task text → harness profile id.
 * @param {string} taskText
 * @param {{ role?: string, hostRole?: string }} [opts]
 */
function classifyHarnessProfile(taskText, { role = 'worker', hostRole = 'unknown' } = {}) {
  const text = String(taskText || '').toLowerCase();
  const reasons = [];

  if (/\b(eval.?research|eval-mine|propose-eval|overnight eval|farm failures)\b/.test(text)) {
    reasons.push('eval research language');
    return { profileId: 'eval_research_loop', reasons };
  }
  if (/\b(linkedin|medium|bluesky|threads|reddit|promo|post everywhere|social|publish)\b/.test(text)) {
    reasons.push('social/promo language');
    return { profileId: 'social_promo_pro', reasons };
  }
  if (/\b(revenue|stripe|apollo|pipeline|cash|outreach|buyer|partner pilot)\b/.test(text)) {
    reasons.push('cash path language');
    return { profileId: 'revenue_cash_pro', reasons };
  }
  if (
    /\b(adb|maestro|e2e|pair|phone|hermes-mobile|ota|leash|gatewaycontext|chatscreen|tailscale)\b/.test(
      text,
    )
  ) {
    reasons.push('device/mobile language');
    return { profileId: 'device_mobile', reasons };
  }
  if (/\b(nemotron|open.?weight.?cloud|nim.?nemotron)\b/.test(text)) {
    reasons.push('nemotron/open-cloud language');
    return { profileId: 'nemotron_worker', reasons };
  }
  if (/\b(status|ci glance|optics|LIVE matrix|pipeline counts)\b/.test(text)) {
    reasons.push('optics/status language');
    return { profileId: 'optics_status', reasons };
  }
  if (role === 'planner' || /\b(plan|design|decompose|acceptancecheck|blueprint)\b/.test(text)) {
    if (role === 'planner' || /\b(planner|decompose|design decision|blueprint)\b/.test(text)) {
      reasons.push(role === 'planner' ? 'role=planner' : 'planning language');
      return { profileId: 'frontier_planner', reasons };
    }
  }
  if (/\b(tinker|local.?worker|cheap.?local|hermes-local|ollama leaf)\b/.test(text)) {
    reasons.push('local worker language');
    return { profileId: 'local_worker_leaf', reasons };
  }

  // Default by role
  if (role === 'planner') {
    reasons.push('default planner');
    return { profileId: 'frontier_planner', reasons };
  }
  reasons.push('default worker leaf');
  return { profileId: 'local_worker_leaf', reasons };
}

/**
 * Resolve a harness profile for task + host + env gates.
 */
function resolveHarnessProfile(
  taskText,
  { role = 'worker', host = null, env = process.env } = {},
) {
  const hostRole =
    (host && host.role) ||
    String(env.HERMES_FLEET_HOST_ROLE || '').toLowerCase().replace(/-/g, '_') ||
    'unknown';
  const normalizedHost =
    hostRole === 'pro' || hostRole === 'macbook_pro' || hostRole === 'macpro'
      ? 'mac_pro'
      : hostRole === 'mini' || hostRole === 'macmini'
        ? 'mac_mini'
        : hostRole === 'mac_pro' || hostRole === 'mac_mini'
          ? hostRole
          : 'unknown';

  const classified = classifyHarnessProfile(taskText, {
    role,
    hostRole: normalizedHost,
  });
  let profile = HARNESS_PROFILES.find((p) => p.id === classified.profileId);
  if (!profile) {
    profile = HARNESS_PROFILES.find((p) => p.id === 'local_worker_leaf');
  }

  const reasons = [...classified.reasons];
  let ok = true;
  let status = 'allowed';

  if (normalizedHost === 'mac_mini' && !profile.hosts.includes('mac_mini')) {
    ok = false;
    status = 'host_blocked';
    reasons.push(`Profile ${profile.id} not allowed on mac_mini`);
  } else if (normalizedHost === 'mac_pro' && !profile.hosts.includes('mac_pro')) {
    ok = false;
    status = 'host_blocked';
    reasons.push(`Profile ${profile.id} not allowed on mac_pro`);
  }

  // Skill packs available on this host under profile
  const packs = resolveSkillPacksForProfile(profile, {
    hostRole: normalizedHost,
    env,
  });

  return {
    ok,
    status,
    profileId: profile.id,
    profile: { ...profile },
    hostRole: normalizedHost,
    role,
    skillPacks: packs.packs,
    skillPackAccess: packs,
    reasons,
    prompt: formatProfilePrompt(profile, packs, {
      ok,
      status,
      hostRole: normalizedHost,
      role,
      taskText,
      reasons,
    }),
    source: HARNESS_ROI_SOURCE,
    checkedAt: new Date().toISOString(),
  };
}

function formatProfilePrompt(profile, packs, ctx) {
  const lines = [
    `harness_profile: ${profile.id}`,
    `model_class: ${profile.modelClass}`,
    `route_hint: ${profile.routeHint}`,
    `role: ${ctx.role}`,
    `host: ${ctx.hostRole}`,
    `access: ${ctx.status}`,
    `effort: ${profile.effort}`,
    `budgets: maxTurns=${profile.maxTurns} maxTools=${profile.maxTools}`,
    `toolbox_allow: ${profile.toolboxAllow.join(', ')}`,
    `eval_bar: ${profile.evalBar.join(', ')}`,
    `write_allow: ${profile.writeAllow.join('; ')}`,
    `no_megafile_design: ${profile.noMegafileDesign}`,
    `task: ${String(ctx.taskText || '').trim() || '(unspecified)'}`,
    'skill_packs (entrypoints only):',
  ];
  for (const pack of packs.packs) {
    lines.push(`  [${pack.id}] toolbox=${pack.toolbox} status=${pack.accessStatus}`);
    for (const ep of pack.entrypoints.slice(0, 4)) {
      lines.push(`    - ${ep}`);
    }
  }
  if (!ctx.ok) {
    lines.push('BLOCKED:');
    for (const r of ctx.reasons) lines.push(`  - ${r}`);
    lines.push('Action: use an allowed host or a different profile — do not workaround.');
  } else {
    lines.push(`notes: ${profile.notes}`);
  }
  return lines.join('\n');
}

/**
 * Resolve skill packs for a profile on a host (gates applied).
 */
function resolveSkillPacksForProfile(profile, { hostRole = 'unknown', env = process.env } = {}) {
  const packIds = profile.skillPacks || [];
  const packs = [];
  const blocked = [];
  for (const id of packIds) {
    const access = resolveSkillPackAccess(id, { hostRole, env });
    if (access.ok || access.status === 'chrome_gated') {
      packs.push({
        id: access.pack.id,
        toolbox: access.pack.toolbox,
        entrypoints: access.pack.entrypoints,
        gates: access.pack.gates,
        verifyCommand: access.pack.verifyCommand,
        description: access.pack.description,
        accessStatus: access.status,
        reasons: access.reasons,
      });
    } else {
      blocked.push({ id, status: access.status, reasons: access.reasons });
    }
  }
  return {
    ok: blocked.length === 0 || packs.length > 0,
    packs,
    blocked,
    hostRole,
  };
}

/**
 * Resolve a single skill pack against host + env gates.
 */
function resolveSkillPackAccess(packId, { hostRole = 'unknown', env = process.env } = {}) {
  const pack = SKILL_PACKS.find((p) => p.id === packId);
  if (!pack) {
    return {
      ok: false,
      status: 'unknown_pack',
      pack: null,
      reasons: [`Unknown skill pack: ${packId}`],
    };
  }
  const reasons = [];
  let ok = true;
  let status = 'allowed';

  if (hostRole === 'mac_mini' && !pack.hosts.includes('mac_mini')) {
    ok = false;
    status = 'host_blocked';
    reasons.push(`Skill pack ${packId} not allowed on mac_mini`);
  } else if (hostRole === 'mac_pro' && !pack.hosts.includes('mac_pro')) {
    ok = false;
    status = 'host_blocked';
    reasons.push(`Skill pack ${packId} not allowed on mac_pro`);
  }

  const publish = String(env.HERMES_SESSION_PUBLISH || '').toUpperCase();
  const publishApproved =
    publish === 'PUBLISH_APPROVED' ||
    publish === '1' ||
    publish === 'TRUE' ||
    String(env.PUBLISH_APPROVED || '').toLowerCase() === '1' ||
    String(env.PUBLISH_APPROVED || '').toLowerCase() === 'true';

  if (pack.gates.includes('PUBLISH_APPROVED') && !publishApproved) {
    ok = false;
    status = status === 'host_blocked' ? status : 'gate_blocked';
    reasons.push('Requires PUBLISH_APPROVED');
  }

  if (pack.gates.includes('HERMES_ALLOW_INTERACTIVE_CHROME')) {
    if (String(env.HERMES_ALLOW_INTERACTIVE_CHROME || '') !== '1') {
      reasons.push('Interactive Chrome requires HERMES_ALLOW_INTERACTIVE_CHROME=1 + explicit ask');
      if (status === 'allowed') status = 'chrome_gated';
    }
  }

  if (ok && reasons.length === 0) {
    reasons.push(`Skill pack ${packId} allowed on ${hostRole}`);
  }

  return {
    ok,
    status,
    pack: { ...pack },
    reasons,
  };
}

/**
 * List skill packs for a toolbox (optional filter).
 */
function listSkillPacks({ toolboxId = null, hostRole = null } = {}) {
  let packs = SKILL_PACKS.map((p) => ({ ...p }));
  if (toolboxId) packs = packs.filter((p) => p.toolbox === toolboxId);
  if (hostRole === 'mac_pro' || hostRole === 'mac_mini') {
    packs = packs.filter((p) => p.hosts.includes(hostRole));
  }
  return {
    principle: skillPackPolicy().principle,
    source: HARNESS_ROI_SOURCE,
    toolboxId,
    hostRole,
    packs,
  };
}

/**
 * Claim hygiene: compress multi-owner thrash into actionable summary.
 * Pairwise contention can be hundreds of hits; operators need path+owner sets.
 *
 * @param {{ activeTasks?: Array, contention?: Array, megafileHits?: Array, concurrencyCap?: number }} opts
 */
function claimHygieneReport({
  activeTasks = [],
  contention = [],
  megafileHits = [],
  concurrencyCap = 3,
} = {}) {
  const byPath = new Map();
  for (const hit of contention) {
    const p = hit.path;
    if (!byPath.has(p)) {
      byPath.set(p, {
        path: p,
        owners: new Set(),
        taskIds: new Set(),
        pairCount: 0,
      });
    }
    const row = byPath.get(p);
    row.pairCount += 1;
    if (hit.left) {
      row.owners.add(hit.left.owner);
      row.taskIds.add(hit.left.id);
    }
    if (hit.right) {
      row.owners.add(hit.right.owner);
      row.taskIds.add(hit.right.id);
    }
  }

  const pathSummaries = [...byPath.values()]
    .map((row) => ({
      path: row.path,
      owners: [...row.owners].sort(),
      taskIds: [...row.taskIds].sort(),
      ownerCount: row.owners.size,
      pairCount: row.pairCount,
      megafile: Boolean(
        megafileHits.some((m) => m.path === row.path) ||
          /GatewayContext|ChatScreen|gatewayDiscovery|gatewayProfiles|ConnectMacGate|hermes-cloud-connector|DashboardClient/.test(
            row.path,
          ),
      ),
    }))
    .sort((a, b) => b.ownerCount - a.ownerCount || b.pairCount - a.pairCount);

  const hotMega = megafileHits.filter((m) => m.multiOwner);
  const owners = new Set(
    activeTasks
      .filter((t) => /in_progress|active|claimed/i.test(String(t.status || '')))
      .map((t) => t.owner)
      .filter(Boolean),
  );
  // Fallback: any non-done task counts as active if status missing
  if (owners.size === 0) {
    for (const t of activeTasks) {
      if (!/done|cancelled|merged/i.test(String(t.status || ''))) {
        if (t.owner) owners.add(t.owner);
      }
    }
  }

  const ownerLoad = {};
  for (const t of activeTasks) {
    if (!t.owner) continue;
    if (/done|cancelled|merged/i.test(String(t.status || ''))) continue;
    ownerLoad[t.owner] = (ownerLoad[t.owner] || 0) + 1;
  }

  const overCap = owners.size > concurrencyCap;
  const actions = [];
  if (overCap) {
    actions.push(
      `Concurrency ${owners.size} > cap ${concurrencyCap}: finish or block before new claims`,
    );
  }
  if (hotMega.length > 0) {
    actions.push(
      `HOT megafile multi-owner (${hotMega.length}): mark blocked + STOP — serialize or split`,
    );
  }
  if (pathSummaries.length > 0) {
    actions.push(
      `Contention compressed: ${contention.length} pairs → ${pathSummaries.length} paths; work only free files`,
    );
  }
  if (actions.length === 0) {
    actions.push('Claim hygiene clear: no multi-owner paths; under concurrency cap');
  }

  const ok = !overCap && hotMega.length === 0;

  return {
    ok,
    principle:
      'Measure finished AcceptanceChecks and multi-owner thrash — not commit rate. Compress pairwise contention into path+owner sets.',
    source: HARNESS_ROI_SOURCE,
    concurrency: {
      activeOwners: owners.size,
      cap: concurrencyCap,
      overCap,
      ownerLoad,
    },
    pairHitCount: contention.length,
    uniquePathCount: pathSummaries.length,
    pathSummaries: pathSummaries.slice(0, 40),
    hotMegafiles: hotMega.map((m) => ({
      path: m.path,
      owners: [...new Set((m.claimants || []).map((c) => c.owner))],
      taskIds: (m.claimants || []).map((c) => c.id),
    })),
    actions,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Overnight / on-demand eval research loop.
 * Mines failures, proposes evals, writes ONLY under evals/ + artifacts/eval-research/.
 *
 * @param {{
 *   mineFn: Function,
 *   repo?: string,
 *   write?: boolean,
 *   maxProposals?: number,
 *   planPath?: string,
 *   hostRole?: string,
 * }} opts
 */
function runEvalResearchLoop({
  mineFn,
  repo = REPO,
  write = false,
  maxProposals = 5,
  planPath = DEFAULT_PLAN,
  hostRole = 'unknown',
} = {}) {
  if (typeof mineFn !== 'function') {
    throw new Error('runEvalResearchLoop requires mineFn (mineEvalFailures)');
  }

  const profile = resolveHarnessProfile('eval research overnight farm failures', {
    role: 'worker',
    host: { role: hostRole },
  });

  const mined = mineFn({
    repo,
    write: false,
    planPath,
    maxProposals,
  });

  const written = [];
  let writeError = null;
  if (write) {
    try {
      // Overnight research writes ONLY under artifacts/eval-research/ (gitignored).
      // Human-approved durable evals still use propose-eval --write → evals/.
      const dir = path.join(repo, 'artifacts/eval-research');
      const proposalsDir = path.join(dir, 'proposals');
      fs.mkdirSync(proposalsDir, { recursive: true });

      const proposalRows = [];
      for (const p of mined.proposals || []) {
        const stub = p.proposal?.stub;
        if (!stub) continue;
        const id = stub.id || `proposal-${Date.now()}`;
        const destDir = path.join(proposalsDir, id);
        fs.mkdirSync(destDir, { recursive: true });
        const instructionPath = path.join(destDir, 'instruction.md');
        const md = [
          `# Eval research proposal: ${id}`,
          '',
          `## Ability`,
          stub.abilityId || '',
          '',
          `## Instruction`,
          stub.instruction || '',
          '',
          `## Environment`,
          stub.env || '',
          '',
          `## Verifier`,
          stub.verifier || '',
          '',
          `## Source failure`,
          stub.sourceFailure || p.signal?.text || '',
          '',
          `## Status`,
          'proposed (eval-research loop — promote to evals/ after human approve)',
          '',
        ].join('\n');
        fs.writeFileSync(instructionPath, md);
        fs.writeFileSync(
          path.join(destDir, 'meta.json'),
          JSON.stringify(
            {
              id,
              abilityId: stub.abilityId,
              source: p.signal?.source,
              severity: p.signal?.severity,
              status: 'proposed',
              hostRole,
              checkedAt: new Date().toISOString(),
            },
            null,
            2,
          ),
        );
        written.push(instructionPath);
        proposalRows.push({
          abilityId: stub.abilityId,
          source: p.signal?.source,
          severity: p.signal?.severity,
          writtenPath: instructionPath,
          id,
        });
      }

      const receipt = {
        ok: true,
        hostRole,
        profileId: profile.profileId,
        writeAllow: profile.profile.writeAllow,
        signalCount: mined.signalCount,
        proposalCount: proposalRows.length,
        writtenPaths: [...written],
        signals: (mined.signals || []).slice(0, 20),
        proposals: proposalRows,
        noMegafile: true,
        writeRoot: 'artifacts/eval-research/',
        checkedAt: new Date().toISOString(),
        source: HARNESS_ROI_SOURCE,
      };
      const latestPath = path.join(dir, 'latest.json');
      fs.writeFileSync(latestPath, JSON.stringify(receipt, null, 2));
      written.push(latestPath);
      const day = new Date().toISOString().slice(0, 10);
      const dated = path.join(dir, `receipt-${day}.json`);
      fs.writeFileSync(dated, JSON.stringify(receipt, null, 2));
      written.push(dated);

      return {
        ok: true,
        dryRun: false,
        profile,
        mined,
        written,
        receipt,
        checkedAt: receipt.checkedAt,
      };
    } catch (error) {
      writeError = error.message;
    }
  }

  const receipt = {
    ok: writeError ? false : true,
    dryRun: !write,
    hostRole,
    profileId: profile.profileId,
    signalCount: mined.signalCount,
    proposalCount: (mined.proposals || []).length,
    signals: (mined.signals || []).slice(0, 20),
    proposals: (mined.proposals || []).map((p) => ({
      abilityId: p.proposal?.stub?.abilityId,
      source: p.signal?.source,
      severity: p.signal?.severity,
      id: p.proposal?.stub?.id,
    })),
    writtenPaths: written,
    writeError,
    noMegafile: true,
    checkedAt: new Date().toISOString(),
    source: HARNESS_ROI_SOURCE,
  };

  return {
    ok: receipt.ok,
    dryRun: !write,
    profile,
    mined,
    written,
    receipt,
    checkedAt: receipt.checkedAt,
  };
}

function formatClaimHygieneHuman(report) {
  const lines = [
    '=== Claim hygiene (compressed thrash) ===',
    report.principle,
    `overall: ${report.ok ? 'ok' : 'WARN'}`,
    `concurrency: ${report.concurrency.activeOwners}/${report.concurrency.cap}${report.concurrency.overCap ? ' OVER-CAP' : ''}`,
    `contention: ${report.pairHitCount} pairs → ${report.uniquePathCount} unique paths`,
  ];
  if (report.hotMegafiles.length) {
    lines.push(`HOT megafiles (${report.hotMegafiles.length}):`);
    for (const m of report.hotMegafiles.slice(0, 8)) {
      lines.push(`  ${m.path} → ${m.owners.join(', ')}`);
    }
  }
  if (report.pathSummaries.length) {
    lines.push('Top contended paths:');
    for (const p of report.pathSummaries.slice(0, 10)) {
      lines.push(
        `  ${p.megafile ? 'HOT' : 'path'} ${p.path} owners=${p.owners.join(',')} pairs=${p.pairCount}`,
      );
    }
  }
  lines.push('Actions:');
  for (const a of report.actions) lines.push(`  → ${a}`);
  return lines.join('\n');
}

function formatProfileHuman(resolved) {
  const lines = [
    '=== Harness profile resolve ===',
    HARNESS_ROI_SOURCE.principle,
    `profile: ${resolved.profileId}`,
    `status: ${resolved.status}`,
    `host: ${resolved.hostRole} | role: ${resolved.role}`,
    `model_class: ${resolved.profile.modelClass}`,
    `route: ${resolved.profile.routeHint}`,
    `effort: ${resolved.profile.effort} | turns≤${resolved.profile.maxTurns} tools≤${resolved.profile.maxTools}`,
    `toolbox_allow: ${resolved.profile.toolboxAllow.join(', ')}`,
    `eval_bar: ${resolved.profile.evalBar.join(', ')}`,
    `skill_packs: ${resolved.skillPacks.map((p) => p.id).join(', ') || '(none)'}`,
  ];
  if (!resolved.ok) {
    lines.push('BLOCKED:');
    for (const r of resolved.reasons) lines.push(`  - ${r}`);
  } else {
    lines.push(`notes: ${resolved.profile.notes}`);
  }
  lines.push('');
  lines.push('--- thin prompt ---');
  lines.push(resolved.prompt);
  return lines.join('\n');
}

module.exports = {
  HARNESS_ROI_SOURCE,
  HARNESS_PROFILES,
  SKILL_PACKS,
  EVAL_RESEARCH_DIR,
  EVAL_RESEARCH_LATEST,
  harnessProfilePolicy,
  skillPackPolicy,
  classifyHarnessProfile,
  resolveHarnessProfile,
  resolveSkillPackAccess,
  resolveSkillPacksForProfile,
  listSkillPacks,
  claimHygieneReport,
  runEvalResearchLoop,
  formatClaimHygieneHuman,
  formatProfileHuman,
};
