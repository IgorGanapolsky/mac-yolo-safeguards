#!/usr/bin/env node
'use strict';

/**
 * agent-swarm-harness.js — High-ROI multi-agent swarm economics for this repo.
 *
 * Encodes the durable lessons from Cursor's agent-swarm model economics at
 * human-tempo scale (2–3 agents, not 1000 commits/sec):
 *   - planner vs worker role split (context efficiency)
 *   - thrash detection (multi-claimer / megafile contention)
 *   - Field Guide injection (stigmergy / shared successor context)
 *   - model economics defaults (frontier plans; cheap/local executes leaves)
 *   - stacked verification lenses + decision-id gate for hot files
 *   - Specification-Driven Design loop (modular specs → gap analysis → verify)
 *   - frontier-model session contract + effort step-down (Fable/GPT-5.6 Sol patterns, 2026-07)
 *   - state-layer policy + where-is-state checks (stateless vs shared-stateful vs session-stateful, 2026-07)
 *   - toolbox policy + where-is-auth (auth on pack not agent; Foundry toolbox pattern, 2026-07)
 *
 * Usage:
 *   node tools/agent-swarm-harness.js [--json] [--plan path] [--role planner|worker]
 *   node tools/agent-swarm-harness.js check-hot-files --stdin [--body-file path]
 *   node tools/agent-swarm-harness.js field-guide
 *   node tools/agent-swarm-harness.js sdd
 *   node tools/agent-swarm-harness.js session-contract [--role planner|worker] [--json]
 *   node tools/agent-swarm-harness.js effort-policy [--json]
 *   node tools/agent-swarm-harness.js state-layers [--json]
 *   node tools/agent-swarm-harness.js where-is-state [--json] [--plan path]
 *   node tools/agent-swarm-harness.js toolboxes [--json]
 *   node tools/agent-swarm-harness.js where-is-auth [--json] [--task "..."]
 *   node tools/agent-swarm-harness.js worker-toolbox [--json] [--task "..."]
 */

const fs = require('fs');
const path = require('path');

const {
  snapshotPlan,
  parseActiveTasks,
  parseClaimedFiles,
  isClaimedPath,
} = require('./plan-coordination-snapshot');

const { routeAllowed, riskValue, RISK_LEVELS, ROUTES, taskSignals } = require('./hermes-economic-router');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');
const FIELD_GUIDE = path.join(REPO, 'docs/agent-field-guide/index.md');
const FIELD_GUIDE_LINE_BUDGET = 80;
const CONCURRENCY_CAP = 3;
const LOOP_STATE_LATEST = path.join(REPO, 'artifacts/hermes-loop-state/latest.json');
const CONTINUOUS_E2E_LATEST = path.join(
  REPO,
  'hermes-mobile/docs/proofs/continuous/latest.json',
);
const STATE_LAYER_SOURCE = Object.freeze({
  label: 'Stateful vs Stateless Agent Design (MLM, 2026-07)',
  url: 'https://machinelearningmastery.com/stateful-vs-stateless-agent-design-tradeoffs-for-scalable-agentic-systems/',
});
const TOOLBOX_SOURCE = Object.freeze({
  label: 'Toolboxes in Microsoft Foundry (auth on toolbox, not agent, 2026-07)',
  url: 'https://devblogs.microsoft.com/foundry/building-agents-that-act-on-your-behalf-with-toolboxes-in-foundry/',
});

/** Trace file for execution tracing (MonitoredAgent pattern). */
const TRACE_FILE = path.join(REPO, '.harness-trace.jsonl');

/** Files that historically thrash under multi-agent edits (megafile choke points). */
const MEGAFILES = Object.freeze([
  'hermes-mobile/src/context/GatewayContext.tsx',
  'hermes-mobile/src/screens/ChatScreen.tsx',
  'hermes-mobile/src/services/gatewayDiscovery.ts',
  'hermes-mobile/src/services/gatewayProfiles.ts',
  'hermes-mobile/src/services/tailscaleDiscovery.ts',
  'hermes-mobile/src/utils/gatewayProfilePicker.ts',
  'hermes-mobile/src/components/ConnectMacGate.tsx',
  'tools/hermes-cloud-connector.js',
  'apps/hermes-control-plane/app/dashboard/DashboardClient.tsx',
]);

const ROLE_GUIDANCE = Object.freeze({
  planner: [
    'Collapse ambiguity into leaf tasks + machine-checkable AcceptanceCheck + file claims before any implementation.',
    'Make design decisions yourself; never delegate the same design question to two subtrees.',
    'Record non-obvious decisions in plan.md §3 (Decisions Log) with a durable D- id when useful.',
    'Prefer frontier models for planning; do not implement worker leaves in the same context.',
    'State SessionContract once (write scope, publish/send mode, effort, stop_when) — do not re-paste the full Never-list into every subagent.',
    'On unfamiliar domains: list 3 unknowns before locking AC (blind-spot pass).',
    'Cap concurrent active owners at 2–3 on this mobile codebase.',
    'When a gap appears mid-build: update the modular claim/AC (spec) first, then the code.',
    'Answer where-is-state before locking design: chat→session store, ownership→plan.md, resume→loop-state/E2E/Field Guide — never process RAM on either Mac.',
    'Pick task class → toolbox id (auth lives on the pack); do not hand workers the full skill catalog.',
  ],
  worker: [
    'Implement only claimed free leaves; stop if a file is owned by another agent.',
    'Do not invent design decisions — escalate or append plan.md §3 and re-plan.',
    'Prefer cheap/local models (tinker-yolo / Composer-class) and medium-or-lower effort once AC is explicit.',
    'Prompt for this leaf = AC + claimed files + verification commands + allowed toolbox entrypoints only (no giant rule dump).',
    'Never self-merge megafile conflicts; use a neutral rebase onto main + sequential merge.',
    'Ship only after stacked verification (unit + typecheck + E2E or honest skip + Greptile if sensitive).',
    'If requirements are missing, stop and escalate gap analysis — do not vibe-code past the AC.',
    'Worker leaves are stateless payloads; multi-agent truth is plan.md + loop-state, not Ollama/chat on this Mac.',
    'Act via named toolbox entrypoints; never invent OAuth/token exchange or Chrome on mini.',
  ],
});

/**
 * Session contract for tenacious frontier models (Fable 5 / GPT 5.6 Sol patterns).
 * Explicit boundaries > giant style guides; state each constraint once.
 *
 * Env overrides (optional):
 *   HERMES_SESSION_WRITE_SCOPE, HERMES_SESSION_PUBLISH, HERMES_SESSION_SEND,
 *   HERMES_REASONING_EFFORT, HERMES_SESSION_STOP_WHEN
 */
function sessionContract(role = 'worker', env = process.env) {
  const resolved = resolveRole(role);
  const effort = String(env.HERMES_REASONING_EFFORT || effortDefaultForRole(resolved)).toLowerCase();
  return {
    role: resolved,
    write: env.HERMES_SESSION_WRITE_SCOPE || 'claimed files only (plan.md §2)',
    publish: env.HERMES_SESSION_PUBLISH || 'DRAFT_ONLY unless operator said PUBLISH_APPROVED / post everywhere',
    send: env.HERMES_SESSION_SEND || 'no cold bulk; gmail/gh only when cash-path or explicit',
    effort,
    effortHint: effortPolicy().classes.find((c) => c.defaultEffort === effort)?.id || 'role-default',
    stopWhen:
      env.HERMES_SESSION_STOP_WHEN ||
      (resolved === 'planner'
        ? 'leaf AC + free claims recorded; design decisions in §3'
        : 'AcceptanceCheck green (machine-checkable) or blocked+logged'),
    keep: [
      'claim id / D- id',
      'verification command + exit code',
      'live URL / SHA when claiming shipped',
      'honest skip reason for E2E',
      'state-layer answer (session store vs plan.md vs loop-state)',
      'toolbox id + allowed entrypoints (auth on pack, not agent)',
    ],
    drop: [
      'restate full AGENTS.md Never-list',
      '"I am in agent mode" lectures',
      'global "keep it brief" without a keep/drop list',
      'adjective-only done bars ("high quality")',
      'chat transcript as multi-agent coordination bus',
      'pin multi-agent truth to Ollama process RAM or one Mac chat window',
      'token exchange / consent / secret materialization in agent code',
      'full skill catalog dump when one toolbox applies',
    ],
    source: {
      label: 'How to Get the Most Out of Fable 5 and GPT 5.6 Sol (tenacious-model ops)',
      url: 'https://www.youtube.com/watch?v=69JMFDFuI3A',
    },
  };
}

/**
 * Explicit state-layer policy for the Hermes fleet (Mac Pro + mini).
 * Inference scales stateless; product chat is session-stateful; multi-agent work
 * is shared-board-stateful. Never treat process RAM as multi-agent truth.
 *
 * Source: Machine Learning Mastery stateful vs stateless agent design (2026-07)
 * mapped onto this repo's harness artifacts.
 */
function stateLayerPolicy() {
  return {
    principle:
      'Scale inference as stateless. Product chat as session-stateful. Multi-agent work as shared-board-stateful. Never put multi-agent truth in process RAM on either Mac — especially not the mini.',
    source: STATE_LAYER_SOURCE,
    layers: [
      {
        id: 'inference',
        design: 'stateless',
        surfaces: ['LiteLLM :4010', 'hermes-local', 'Ollama generate/chat', 'cheap leaf model calls'],
        macPro: 'LiteLLM front door + traffic.jsonl proof; no conversation ownership',
        macMini: 'Ollama worker only; unloadable; never sticky multi-agent memory',
      },
      {
        id: 'worker_leaf',
        design: 'stateless_payload',
        surfaces: ['worker implement leaf', 'tinker-yolo / Composer-class AC leaves'],
        macPro: 'AC + claimed files + verify only (SessionContract keep/drop)',
        macMini: 'Prefer leaves here when free; small payload protects 24GB RAM',
        artifacts: ['AcceptanceCheck', 'plan.md claim', 'verification command'],
      },
      {
        id: 'coordination',
        design: 'shared_stateful',
        surfaces: ['multi-agent claims', 'megafile thrash', 'planner design'],
        macPro: 'Claim + §3 decisions; frontier planning OK',
        macMini: 'Read/write same git board; escalate design off-box under pressure',
        artifacts: ['plan.md §1–§3', 'docs/agent-field-guide/index.md'],
      },
      {
        id: 'product_chat',
        design: 'session_stateful',
        surfaces: ['Hermes Mobile chat', 'web dashboard threads', 'session gateway :8642'],
        macPro: 'Preferred always-on gateway host when available',
        macMini: 'OK only if sessions rehydrate from store — not Ollama KV',
        artifacts: [
          'session_id',
          'gateway /api/sessions',
          'tools/hermes-cloud-connector.js',
          'control-plane D1 sessions',
        ],
      },
      {
        id: 'resume',
        design: 'shared_stateful',
        surfaces: ['crash resume', 'agent handoff', 'next bounded action'],
        macPro: 'Write loop-state after material progress',
        macMini: 'Read loop-state on session start; do not re-diagnose cold from chat',
        artifacts: [
          'artifacts/hermes-loop-state/latest.json',
          'hermes-mobile/docs/proofs/continuous/latest.json',
        ],
      },
      {
        id: 'lessons',
        design: 'shared_curated',
        surfaces: ['cross-session surprises', 'RAG lessons', 'vault handoffs'],
        macPro: 'Same as mini — curated, not raw chat dump',
        macMini: 'Same — Field Guide ≤80 lines + ThumbGate capture',
        artifacts: ['docs/agent-field-guide/index.md', 'ThumbGate RAG', 'AI-Agent-Sync vault'],
      },
    ],
    antiPatterns: [
      'Chat history as the coordination bus between Mac Pro and Mac mini',
      'Sticky Ollama/model process sessions for multi-agent WIP',
      'Resending full AGENTS.md / giant rule dumps every worker turn (token snowball)',
      'Assuming the Mac Pro chat window is source of truth when work continues on mini',
      'Treating LiteLLM uptime as conversation or claim memory',
      'Putting full transcripts in mini process RAM + large num_ctx under 24GB pressure',
    ],
    fleetRule:
      'Any instance may serve a stateless inference call. Only shared stores (plan.md, session store, loop-state, Field Guide/RAG) carry continuity across Pro ↔ mini.',
  };
}

/**
 * Classify which state design a task text should use (routing hint for planners).
 * @param {string} taskText
 * @returns {{ design: string, layerId: string, reason: string }}
 */
function classifyTaskStateDesign(taskText) {
  const text = String(taskText || '').toLowerCase();
  if (
    /\b(chat|session|gateway|pair|continuity|thread|message history)\b/.test(text) &&
    !/\b(plan\.md|claim|swarm|harness)\b/.test(text)
  ) {
    return {
      design: 'session_stateful',
      layerId: 'product_chat',
      reason: 'product multi-turn chat / session continuity',
    };
  }
  if (/\b(litellm|ollama|hermes-local|model route|inference|proxy)\b/.test(text)) {
    return {
      design: 'stateless',
      layerId: 'inference',
      reason: 'model/inference path — no conversation ownership',
    };
  }
  if (/\b(claim|plan\.md|megafile|swarm|thrash|ownership|worktree)\b/.test(text)) {
    return {
      design: 'shared_stateful',
      layerId: 'coordination',
      reason: 'multi-agent coordination must use shared board',
    };
  }
  if (/\b(resume|loop-state|handoff|crash|next action)\b/.test(text)) {
    return {
      design: 'shared_stateful',
      layerId: 'resume',
      reason: 'resume from durable packet, not chat window',
    };
  }
  if (/\b(acceptancecheck|leaf|unit test|implement)\b/.test(text)) {
    return {
      design: 'stateless_payload',
      layerId: 'worker_leaf',
      reason: 'explicit leaf — inject AC + files + verify only',
    };
  }
  return {
    design: 'shared_stateful',
    layerId: 'coordination',
    reason: 'default: shared board until surface is classified',
  };
}

/**
 * Detect coarse fleet host role for mini-vs-pro guidance (hostname / env).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ role: 'mac_pro'|'mac_mini'|'unknown', hostname: string }}
 */
function detectFleetHostRole(env = process.env) {
  const forced = String(env.HERMES_FLEET_HOST_ROLE || '').toLowerCase();
  if (forced === 'mac_pro' || forced === 'pro') return { role: 'mac_pro', hostname: forced };
  if (forced === 'mac_mini' || forced === 'mini') return { role: 'mac_mini', hostname: forced };
  let hostname = '';
  try {
    hostname = require('os').hostname().toLowerCase();
  } catch {
    hostname = '';
  }
  if (/mac-?pro|igors-mac-pro|macpro/.test(hostname)) {
    return { role: 'mac_pro', hostname };
  }
  if (/mac-?mini|igors-mac-mini|macmini/.test(hostname)) {
    return { role: 'mac_mini', hostname };
  }
  return { role: 'unknown', hostname: hostname || 'unknown' };
}

/**
 * Three high-ROI "where is state?" checks for session start on either Mac.
 * Machine-readable evidence for chat continuity, ownership, and resume — not chat folklore.
 *
 * @param {{ planPath?: string, repo?: string, env?: NodeJS.ProcessEnv, nowMs?: number }} [opts]
 */
function whereIsStateCheck({
  planPath = DEFAULT_PLAN,
  repo = REPO,
  env = process.env,
  nowMs = Date.now(),
} = {}) {
  const policy = stateLayerPolicy();
  const host = detectFleetHostRole(env);
  const questions = [];

  // 1) Product chat / conversation continuity
  const chatPrefer =
    'session_id + gateway/session store (Hermes sessions API / control-plane) — rehydrate across hosts';
  questions.push({
    id: 'chat_session',
    question: 'Where is conversation/chat state?',
    prefer: chatPrefer,
    never: 'Ollama process RAM, single-Mac IDE chat window, sticky model runner',
    design: 'session_stateful',
    ok: true,
    status: 'policy',
    evidence: 'Product chat must use session_id; inference remains stateless.',
  });

  // 2) Multi-agent ownership board
  let ownershipOk = false;
  let ownershipStatus = 'missing_plan';
  let ownershipEvidence = `plan.md missing at ${planPath}`;
  let contentionCount = 0;
  let activeTaskCount = 0;
  if (fs.existsSync(planPath)) {
    try {
      const planText = fs.readFileSync(planPath, 'utf8');
      const activeTasks = parseActiveTasks(planText);
      activeTaskCount = activeTasks.length;
      const contention = findFileContention(activeTasks);
      contentionCount = contention.length;
      ownershipOk = contentionCount === 0;
      ownershipStatus = ownershipOk ? 'clear' : 'contention';
      ownershipEvidence = ownershipOk
        ? `plan.md readable; ${activeTaskCount} active task(s); no multi-owner file contention`
        : `plan.md readable; ${activeTaskCount} active task(s); ${contentionCount} multi-owner contention hit(s) — STOP, do not edit overlapping claims`;
    } catch (error) {
      ownershipEvidence = `plan.md unreadable: ${error.message}`;
      ownershipStatus = 'error';
    }
  }
  questions.push({
    id: 'repo_ownership',
    question: 'Where is multi-agent work ownership?',
    prefer: 'plan.md §1–§2 claims (shared-stateful board across Pro + mini)',
    never: 'Local chat memory or uncommitted "I thought I owned it"',
    design: 'shared_stateful',
    ok: ownershipOk,
    status: ownershipStatus,
    evidence: ownershipEvidence,
    activeTaskCount,
    contentionCount,
  });

  // 3) Resume / ship evidence (loop-state + continuous E2E + Field Guide)
  const loopPath = path.join(repo, 'artifacts/hermes-loop-state/latest.json');
  const e2ePath = path.join(repo, 'hermes-mobile/docs/proofs/continuous/latest.json');
  const guidePath = path.join(repo, 'docs/agent-field-guide/index.md');
  const loopExists = fs.existsSync(loopPath);
  const e2eExists = fs.existsSync(e2ePath);
  const guideExists = fs.existsSync(guidePath);
  let e2eStatus = 'missing';
  let e2ePass = null;
  let e2eAgeMin = null;
  if (e2eExists) {
    try {
      const e2e = JSON.parse(fs.readFileSync(e2ePath, 'utf8'));
      e2ePass = e2e.e2e === 'pass' || e2e.status === 'pass' || e2e?.results?.e2e === 'pass';
      const ts = e2e.generatedAt || e2e.finishedAt || e2e.timestamp || e2e.checkedAt;
      if (ts) {
        const ageMs = nowMs - new Date(ts).getTime();
        if (Number.isFinite(ageMs) && ageMs >= 0) e2eAgeMin = Math.round(ageMs / 60000);
      }
      e2eStatus = e2ePass ? 'pass' : 'fail_or_unknown';
    } catch {
      e2eStatus = 'parse_error';
    }
  }
  const resumeOk = guideExists; // Field Guide is the minimum cross-Mac resume contract
  const resumeBits = [
    guideExists ? 'field-guide:ok' : 'field-guide:missing',
    loopExists ? 'loop-state:present' : 'loop-state:absent',
    e2eExists ? `e2e:${e2eStatus}` : 'e2e:missing',
  ];
  if (e2eAgeMin != null) resumeBits.push(`e2e_age_min:${e2eAgeMin}`);
  questions.push({
    id: 'resume_evidence',
    question: 'Where is resume / ship evidence?',
    prefer:
      'hermes-loop-state packet + continuous E2E latest.json + Field Guide — not the other Mac chat window',
    never: 'Re-derive from Pro chat when starting on mini (or reverse)',
    design: 'shared_stateful',
    ok: resumeOk,
    status: resumeOk ? (loopExists || e2eExists ? 'partial_or_full' : 'field_guide_only') : 'missing',
    evidence: resumeBits.join('; '),
    artifacts: {
      fieldGuide: guideExists,
      loopState: loopExists,
      continuousE2e: e2eExists,
      e2eStatus,
    },
  });

  const ok = questions.every((q) => q.ok);
  const hostGuidance =
    host.role === 'mac_mini'
      ? 'Mac mini: run stateless cheap leaves; read shared board; do not own fleet memory in Ollama RAM.'
      : host.role === 'mac_pro'
        ? 'Mac Pro: LiteLLM front door + gateway candidate; still use plan.md/session store for continuity — not chat window alone.'
        : 'Host role unknown: apply the same three-layer rule on either Mac.';

  return {
    ok,
    principle: policy.principle,
    source: policy.source,
    host,
    hostGuidance,
    questions,
    actions: buildWhereIsStateActions(questions, host),
    checkedAt: new Date(nowMs).toISOString(),
  };
}

function buildWhereIsStateActions(questions, host) {
  const actions = [];
  const ownership = questions.find((q) => q.id === 'repo_ownership');
  if (ownership && !ownership.ok) {
    actions.push(
      ownership.status === 'contention'
        ? 'Ownership contention: mark blocked + STOP; do not edit overlapping claims.'
        : 'plan.md missing/unreadable: restore shared board before multi-agent edits.',
    );
  }
  const resume = questions.find((q) => q.id === 'resume_evidence');
  if (resume && !resume.artifacts?.fieldGuide) {
    actions.push('Field Guide missing: restore docs/agent-field-guide/index.md (cross-Mac successor memory).');
  }
  if (resume && !resume.artifacts?.loopState) {
    actions.push(
      'Optional: write loop-state after material progress (`node tools/hermes-loop-state.js`) so the other Mac can resume.',
    );
  }
  actions.push(
    host?.role === 'mac_mini'
      ? 'Mini default: stateless leaf payloads; shared plan/session/loop for truth.'
      : 'Pro default: stateless inference routing; shared plan/session/loop for truth.',
  );
  actions.push('Run `node tools/agent-swarm-harness.js where-is-state` after host or claim changes.');
  return actions;
}

/**
 * Domain toolboxes: auth + policy bind to the pack (Foundry pattern), not agent prompts.
 * Agent receives toolbox id + entrypoints only; credentials stay in Keychain/Chrome/env at the boundary.
 *
 * Source: Microsoft Foundry Toolboxes (2026-07) mapped onto Hermes skills/MCP/CLIs.
 */
function toolboxPolicy() {
  return {
    principle:
      'Bind identity and policy to the tool pack. Give the agent one clean action surface. Govern tool calls at the boundary — never invent OAuth or dump the full skill catalog.',
    source: TOOLBOX_SOURCE,
    authTypes: [
      {
        id: 'agentic_identity',
        whose: 'agent / machine (gh keyring, local CLI, fleet LaunchAgent)',
        useFor: 'repo ops, local inference, adb, plan board',
      },
      {
        id: 'user_delegation',
        whose: 'signed-in end user (Chrome session, Gmail MCP as Igor, LinkedIn account lock)',
        useFor: 'social publish, some Stripe/Play surfaces when CLI insufficient',
      },
      {
        id: 'project_keys',
        whose: 'project secret at boundary (Keychain/env); agent never sees the secret',
        useFor: 'Stripe CLI, EAS, provider API keys via existing tooling',
      },
      {
        id: 'none',
        whose: 'anonymous / public',
        useFor: 'public docs MCP, unauthenticated status reads',
      },
    ],
    packs: [
      {
        id: 'fleet_inference',
        auth: 'agentic_identity',
        hosts: ['mac_pro', 'mac_mini'],
        entrypoints: [
          'LiteLLM :4010 (traffic.jsonl proof)',
          'hermes-local / Ollama (unloadable on mini)',
          'node tools/openrouter-reasoning-plan.js --effort',
        ],
        gates: [],
        macPro: 'front door + routing proof',
        macMini: 'Ollama worker only; no sticky multi-agent memory',
      },
      {
        id: 'repo_coord',
        auth: 'agentic_identity',
        hosts: ['mac_pro', 'mac_mini'],
        entrypoints: [
          'node tools/agent-swarm-harness.js',
          'node tools/plan-coordination-snapshot.js',
          'gh (keyring only — never chat PAT)',
          'git worktree + sequential merge',
        ],
        gates: [],
        macPro: 'claim + ship PRs',
        macMini: 'same shared board; escalate megafile design off-box under pressure',
      },
      {
        id: 'device_mobile',
        auth: 'agentic_identity',
        hosts: ['mac_pro', 'mac_mini'],
        entrypoints: [
          'node tools/hermes-mobile-pair.js',
          'adb + continuous E2E proofs',
          'npm test / typecheck under hermes-mobile/',
        ],
        gates: [],
        macPro: 'primary USB/pair host when phone present',
        macMini: 'pair OK; no fake Connected without latest.json / health proof',
      },
      {
        id: 'revenue_cash',
        auth: 'project_keys',
        hosts: ['mac_pro'],
        entrypoints: [
          'node tools/revenue-autonomous-loop.js',
          'Apollo CLI / pipeline TSVs (gitignored)',
          'Stripe CLI/API first (not Chrome by default)',
        ],
        gates: ['prefer_cli_over_chrome'],
        macPro: 'Keychain + optional Chrome only when HERMES_ALLOW_INTERACTIVE_CHROME=1 + explicit ask',
        macMini: 'BLOCKED — no user-delegation cash close on mini',
      },
      {
        id: 'social_promo',
        auth: 'user_delegation',
        hosts: ['mac_pro'],
        entrypoints: [
          'Chrome promo fan-out (opt-in interactive only)',
          'content log + LIVE matrix (never double-post)',
          'UTM buy links; Hashnode FROZEN',
        ],
        gates: ['PUBLISH_APPROVED', 'HERMES_ALLOW_INTERACTIVE_CHROME'],
        macPro: 'only host with Igor Chrome sessions for publish',
        macMini: 'BLOCKED — no interactive Chrome / social publish',
      },
      {
        id: 'memory_rag',
        auth: 'project_keys',
        hosts: ['mac_pro', 'mac_mini'],
        entrypoints: [
          'mcp__thumbgate__recall / capture',
          'grepai search (local MCP)',
          'docs/agent-field-guide/index.md',
        ],
        gates: [],
        macPro: 'capture after incidents',
        macMini: 'recall + Field Guide; same curated memory',
      },
    ],
    antiPatterns: [
      'Auth / token exchange / consent plumbing inside agent prompts or leaf code',
      'Dumping the full skill catalog when one toolbox applies',
      'User-delegation tools (Chrome social/Stripe UI) on Mac mini',
      'Inventing "missing credentials" when Keychain/Chrome session already holds them',
      'Social publish without PUBLISH_APPROVED / LIVE matrix proof',
      'Interactive Chrome without explicit user ask + HERMES_ALLOW_INTERACTIVE_CHROME=1',
    ],
    fleetRule:
      'Pro hosts user-delegation toolboxes; both Macs may run agentic/repo/inference/memory packs. Auth stays on the pack boundary.',
  };
}

/**
 * Classify which domain toolbox a task text should use.
 * @param {string} taskText
 * @returns {{ toolboxId: string, auth: string, reason: string }}
 */
function classifyTaskToolbox(taskText) {
  const text = String(taskText || '').toLowerCase();
  if (
    /\b(linkedin|medium|bluesky|threads|reddit|dev\.to|hacker news|promo|post everywhere|social|publish)\b/.test(
      text,
    )
  ) {
    return {
      toolboxId: 'social_promo',
      auth: 'user_delegation',
      reason: 'public social / promo publish surface',
    };
  }
  if (
    /\b(revenue|stripe|apollo|pipeline|cash|outreach|buyer|diagnostic \$|partner pilot)\b/.test(text)
  ) {
    return {
      toolboxId: 'revenue_cash',
      auth: 'project_keys',
      reason: 'cash path / sales tooling',
    };
  }
  if (
    /\b(adb|maestro|e2e|pair|phone|hermes-mobile|ota|leash|gatewaycontext|chatscreen)\b/.test(text)
  ) {
    return {
      toolboxId: 'device_mobile',
      auth: 'agentic_identity',
      reason: 'mobile device / pairing / E2E',
    };
  }
  if (/\b(litellm|ollama|hermes-local|model route|inference|glm-coding)\b/.test(text)) {
    return {
      toolboxId: 'fleet_inference',
      auth: 'agentic_identity',
      reason: 'fleet model routing / inference',
    };
  }
  if (/\b(thumbgate|recall|field guide|grepai|rag|lesson|capture_memory)\b/.test(text)) {
    return {
      toolboxId: 'memory_rag',
      auth: 'project_keys',
      reason: 'memory / RAG / Field Guide',
    };
  }
  if (
    /\b(plan\.md|claim|swarm|harness|worktree|pr |pull request|merge|ci)\b/.test(text) ||
    !text.trim()
  ) {
    return {
      toolboxId: 'repo_coord',
      auth: 'agentic_identity',
      reason: text.trim() ? 'repo coordination / git / CI' : 'default repo toolbox',
    };
  }
  return {
    toolboxId: 'repo_coord',
    auth: 'agentic_identity',
    reason: 'default: repo coordination until surface is classified',
  };
}

/**
 * Resolve whether a toolbox may run on this host with current env gates.
 * @param {string} toolboxId
 * @param {{ role?: string }} host
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveToolboxAccess(toolboxId, host = {}, env = process.env) {
  const policy = toolboxPolicy();
  const pack = policy.packs.find((p) => p.id === toolboxId);
  if (!pack) {
    return {
      ok: false,
      toolboxId,
      status: 'unknown_toolbox',
      reasons: [`Unknown toolbox id: ${toolboxId}`],
      pack: null,
    };
  }
  const hostRole = host.role || 'unknown';
  const reasons = [];
  let ok = true;
  let status = 'allowed';

  if (hostRole === 'mac_mini' && !pack.hosts.includes('mac_mini')) {
    ok = false;
    status = 'host_blocked';
    reasons.push(`Toolbox ${toolboxId} is not allowed on mac_mini (needs ${pack.hosts.join('|')})`);
  } else if (hostRole === 'mac_pro' && !pack.hosts.includes('mac_pro')) {
    ok = false;
    status = 'host_blocked';
    reasons.push(`Toolbox ${toolboxId} is not allowed on mac_pro`);
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
    reasons.push('Requires PUBLISH_APPROVED / HERMES_SESSION_PUBLISH=PUBLISH_APPROVED');
  }

  if (pack.gates.includes('HERMES_ALLOW_INTERACTIVE_CHROME')) {
    const chromeOk = String(env.HERMES_ALLOW_INTERACTIVE_CHROME || '') === '1';
    if (!chromeOk) {
      // Soft block for interactive path: toolbox may still plan drafts without Chrome.
      reasons.push(
        'Interactive Chrome path requires HERMES_ALLOW_INTERACTIVE_CHROME=1 + explicit user ask (draft/LIVE matrix still OK without it)',
      );
      if (status === 'allowed') status = 'chrome_gated';
      // Do not hard-fail ok for chrome alone when publish not approved already failed;
      // chrome is required only when actually driving interactive publish.
    }
  }

  if (ok && reasons.length === 0) {
    reasons.push(`Toolbox ${toolboxId} allowed on ${hostRole} with auth=${pack.auth}`);
  }

  return {
    ok,
    toolboxId,
    status,
    reasons,
    pack,
    auth: pack.auth,
    entrypoints: pack.entrypoints,
    hosts: pack.hosts,
  };
}

/**
 * Thin worker prompt: AC-style task + toolbox entrypoints only (no skill soup).
 * @param {string} taskText
 * @param {{ env?: NodeJS.ProcessEnv, host?: { role?: string }, role?: string }} [opts]
 */
function workerToolboxPrompt(taskText, { env = process.env, host = null, role = 'worker' } = {}) {
  const resolvedHost = host || detectFleetHostRole(env);
  const classified = classifyTaskToolbox(taskText);
  const access = resolveToolboxAccess(classified.toolboxId, resolvedHost, env);
  const pack = access.pack;
  const lines = [
    `role: ${resolveRole(role)}`,
    `toolbox: ${classified.toolboxId} (auth=${classified.auth})`,
    `host: ${resolvedHost.role}`,
    `access: ${access.status}`,
    `task: ${String(taskText || '').trim() || '(unspecified — default repo_coord)'}`,
    'entrypoints (only — do not invent auth):',
  ];
  for (const ep of access.entrypoints || pack?.entrypoints || []) {
    lines.push(`  - ${ep}`);
  }
  if (!access.ok) {
    lines.push('BLOCKED:');
    for (const r of access.reasons) lines.push(`  - ${r}`);
    lines.push('Action: escalate / move to allowed host or satisfy gates — do not workaround.');
  } else {
    lines.push('Also required: plan.md claim free; AC + verification command; SessionContract keep/drop.');
    for (const r of access.reasons) {
      if (/chrome|PUBLISH/i.test(r)) lines.push(`Note: ${r}`);
    }
  }
  return {
    ok: access.ok,
    toolboxId: classified.toolboxId,
    auth: classified.auth,
    reason: classified.reason,
    host: resolvedHost,
    access,
    entrypoints: access.entrypoints || [],
    prompt: lines.join('\n'),
    maxEntrypoints: (access.entrypoints || []).length,
  };
}

/**
 * Where-is-auth session gate: which toolbox, whose identity, which Mac, which gates.
 * @param {{ taskText?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function whereIsAuthCheck({ taskText = '', env = process.env } = {}) {
  const host = detectFleetHostRole(env);
  const classified = classifyTaskToolbox(taskText);
  const access = resolveToolboxAccess(classified.toolboxId, host, env);
  const policy = toolboxPolicy();
  const questions = [
    {
      id: 'toolbox',
      question: 'Which domain toolbox applies?',
      prefer: 'One named pack (fleet_inference|repo_coord|device_mobile|revenue_cash|social_promo|memory_rag)',
      never: 'Full skill catalog / invent ad-hoc tools',
      ok: Boolean(access.pack),
      status: access.pack ? 'classified' : 'unknown',
      evidence: `${classified.toolboxId} — ${classified.reason}`,
    },
    {
      id: 'identity',
      question: 'Whose identity reaches the tools?',
      prefer: 'Auth type bound on the toolbox (agentic | user_delegation | project_keys | none)',
      never: 'Agent-held secrets, chat-pasted tokens, wrong-user LinkedIn/Gmail',
      ok: true,
      status: classified.auth,
      evidence: `auth=${classified.auth}; pack.auth=${access.auth || 'n/a'}`,
    },
    {
      id: 'host_gate',
      question: 'May this host run the toolbox under current gates?',
      prefer: 'Pro for user_delegation; either Mac for agentic/repo/inference/memory',
      never: 'Chrome social/cash UI on mini; publish without PUBLISH_APPROVED',
      ok: access.ok || access.status === 'chrome_gated',
      status: access.status,
      evidence: access.reasons.join('; '),
    },
  ];
  // chrome_gated alone is soft OK for drafting; hard fail host_blocked/gate_blocked
  const hardFail = !access.ok && access.status !== 'chrome_gated';
  const ok = !hardFail;
  const hostGuidance =
    host.role === 'mac_mini'
      ? 'Mac mini: agentic/repo/inference/memory/device only — no social_promo or revenue Chrome paths.'
      : host.role === 'mac_pro'
        ? 'Mac Pro: may host user_delegation packs when gates satisfied; still bind auth on toolbox not agent.'
        : 'Host unknown: assume mini-safe packs only until HERMES_FLEET_HOST_ROLE is set.';

  return {
    ok: !hardFail,
    principle: policy.principle,
    source: policy.source,
    host,
    hostGuidance,
    classified,
    access,
    questions,
    workerPrompt: workerToolboxPrompt(taskText, { env, host }),
    actions: buildWhereIsAuthActions(access, host, classified),
    checkedAt: new Date().toISOString(),
  };
}

function buildWhereIsAuthActions(access, host, classified) {
  const actions = [];
  if (access.status === 'host_blocked') {
    actions.push(
      `Move ${classified.toolboxId} work to allowed host (${(access.hosts || []).join('|')}) — do not improvise on ${host.role}.`,
    );
  }
  if (access.status === 'gate_blocked') {
    actions.push('Satisfy SessionContract gates (e.g. PUBLISH_APPROVED) before acting — draft only until then.');
  }
  if (access.status === 'chrome_gated') {
    actions.push(
      'Draft/LIVE matrix OK; interactive Chrome only with HERMES_ALLOW_INTERACTIVE_CHROME=1 + explicit user ask.',
    );
  }
  actions.push(
    `Worker prompt: node tools/agent-swarm-harness.js worker-toolbox --task "${classified.toolboxId}" (or full task text)`,
  );
  actions.push('Auth on toolbox boundary: Keychain/Chrome/env — never materialize secrets in the agent.');
  return actions;
}

/**
 * Effort step-down policy: start lower; reserve max for high-stakes only.
 * Aligns with openrouter-reasoning-plan.js dial + hermes-economic-router routes.
 */
function effortPolicy() {
  return {
    principle:
      'Do not max thinking for every task. Step down from the previous baseline; reserve high/xhigh for hard, high-stakes work.',
    dial: 'HERMES_REASONING_EFFORT | node tools/openrouter-reasoning-plan.js --effort <level>',
    levels: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
    classes: [
      {
        id: 'optics_status',
        match: 'status matrix, CI glance, promo LIVE table, pipeline counts',
        defaultEffort: 'low',
        routeHint: 'local_fast',
      },
      {
        id: 'ac_leaf_impl',
        match: 'explicit AcceptanceCheck leaf + unit tests',
        defaultEffort: 'medium',
        routeHint: 'local_fast or cheap cloud',
      },
      {
        id: 'pairing_megafile_design',
        match: 'GatewayContext / ChatScreen design, Tailscale/pairing architecture',
        defaultEffort: 'high',
        routeHint: 'frontier / glm52_reasoning',
      },
      {
        id: 'ship_claim',
        match: 'are you sure / shipped / works on device / production OTA',
        defaultEffort: 'high',
        routeHint: 'decision-stack + continuous E2E proof',
      },
      {
        id: 'cash_close',
        match: 'buyer reply, scope, live Stripe close',
        defaultEffort: 'medium',
        routeHint: 'frontier only if negotiation ambiguous',
      },
    ],
    antiPattern: 'xhigh/max effort on smokes, status, or already-specified worker leaves',
  };
}

function effortDefaultForRole(role) {
  return resolveRole(role) === 'planner' ? 'high' : 'medium';
}

/**
 * Hard bar for "done" — objective checks, not adjectives.
 * Loops: build → evaluate bar → gap → refine until stop_when or blocked.
 */
function hardBarForDone() {
  return {
    principle: 'Done is a check the agent can run, not "high quality" or "looks good".',
    examples: [
      'node tests/test-….js exits 0',
      'npx tsc --noEmit (when TS touched) exits 0',
      'curl live URL contains unique phrase OR continuous latest.json e2e=pass',
      'social LIVE only with verified permalink + CTA presence',
      'revenue paid only with Stripe charge / ledger proof',
    ],
    loop: 'build → run bar → record gaps → refine → stop when bar green or mark blocked (no invent green)',
    maxBlindIterations: 3,
  };
}

/**
 * Frontier-model interaction patterns mapped onto this repo's harness.
 */
function frontierModelPlaybook() {
  return {
    source: {
      label: 'How to Get the Most Out of Fable 5 and GPT 5.6 Sol',
      url: 'https://www.youtube.com/watch?v=69JMFDFuI3A',
    },
    patterns: [
      {
        id: 'explicit_boundaries',
        video: 'Set operational limits so tenacious models do not rabbit-hole',
        ours: 'sessionContract() + AGENTS Never-list + plan claims + PUBLISH/send modes',
      },
      {
        id: 'one_copy_rules',
        video: 'State each instruction once; delete redundant giant rule lists',
        ours: 'AGENTS.md is canonical; worker prompts = AC + files + verify only',
      },
      {
        id: 'keep_drop_not_brevity',
        video: 'Avoid blanket "be brief"; name what to keep vs drop',
        ours: 'sessionContract.keep / sessionContract.drop',
      },
      {
        id: 'concrete_behavior',
        video: 'Replace abstract tone with behavioral steps',
        ours: 'AcceptanceCheck + status matrix format, not "be thorough/friendly"',
      },
      {
        id: 'effort_step_down',
        video: 'Test lower effort; reserve max for hard problems',
        ours: 'effortPolicy() + openrouter-reasoning-plan.js + economic router',
      },
      {
        id: 'voice_as_planner_input',
        video: 'Unstructured voice dumps are rich context',
        ours: 'Voice/context dump → planner extracts AC/claims; workers get leaves only',
      },
      {
        id: 'optics_vs_impact',
        video: 'Automate status optics; spend human+frontier time on impact decisions',
        ours: 'Harness matrix / revenue matrix / CI; not essay status updates',
      },
      {
        id: 'unknowns_and_prototypes',
        video: 'Blind-spot pass; diverse prototypes when criteria weak',
        ours: 'Planner unknowns:3 before AC; UI: two divergent sketches max, never five megafile thrashers',
      },
      {
        id: 'hard_bar_loops',
        video: 'Objective done bar + iterate until stop',
        ours: 'hardBarForDone() + stacked verification + thrash STOP',
      },
      {
        id: 'state_layer_split',
        video: 'Where memory lives shapes scale (stateless vs stateful agents)',
        ours: 'stateLayerPolicy() + whereIsStateCheck() — inference stateless; chat session_id; multi-agent plan.md',
      },
      {
        id: 'toolbox_auth_boundary',
        video: 'Auth lives on the toolbox; agent stays auth-free; govern tool I/O at boundary',
        ours: 'toolboxPolicy() + whereIsAuthCheck() + workerToolboxPrompt() — packs × auth × host × gates',
      },
    ],
  };
}

/**
 * Specification-Driven Design loop (production mapping of SDD / AI Storming).
 * Specs live as durable repo artifacts, not chat history.
 * Source framing: ozkary.com SDD / AI Storming (2026-07) + this repo's plan.md protocol.
 */
function specificationDrivenDesign() {
  return {
    principle:
      'Treat agents as peer programmers governed by modular specs + guardrails, not vibe-coding chat.',
    source: {
      label: 'Specification-Driven Design / AI Storming (Ozkary, 2026-07)',
      url: 'https://www.ozkary.com/2026/07/beyond-the-prompt-building-enterprise-solutions-with-ai-specification-driven-design.html',
    },
    steps: [
      {
        id: 'discover',
        name: 'Discovery & system decomposition',
        ourArtifact: 'plan.md leaf tasks + modular file claims (not big-bang prompts)',
      },
      {
        id: 'blueprint',
        name: 'Governance & guardrails blueprint',
        ourArtifact: 'AGENTS.md Never-list, megafile serialization, ROLE_GUIDANCE',
      },
      {
        id: 'modular-specs',
        name: 'Modular markdown specifications',
        ourArtifact: 'AcceptanceCheck per leaf + docs/agent-field-guide + plan.md §3 decisions',
      },
      {
        id: 'execute',
        name: 'Bounded execution (peer programmer)',
        ourArtifact: 'One claimed free leaf per worker; worktree isolation',
      },
      {
        id: 'gap-analysis',
        name: 'Continuous gap analysis',
        ourArtifact: 'Update AC/claim/§3 first when a missing requirement surfaces; then re-implement',
      },
      {
        id: 'traceability',
        name: 'Traceability & verification',
        ourArtifact: 'Stacked lenses (unit/typecheck/E2E/Greptile) + thrash metrics (not commit rate)',
      },
    ],
    antiPatterns: [
      'Planless terminal thrash (monolithic files, bypassed architecture)',
      'Chat-window-only context (no permanent specs)',
      'Unit-green = shipped',
      'Commit rate as productivity',
      'Localized amnesia: history stuck on one Mac while work continues on the other',
    ],
  };
}

function parseArgs(argv) {
  const args = {
    command: 'brief',
    json: false,
    planPath: DEFAULT_PLAN,
    role: process.env.AGENT_ROLE || process.env.SWARM_ROLE || null,
    bodyFile: null,
    stdin: false,
    help: false,
    trace: process.env.HARNESS_TRACE !== '0',
    limit: 0,
    task: process.env.HERMES_TASK_TEXT || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (
      arg === 'check-hot-files' ||
      arg === 'field-guide' ||
      arg === 'brief' ||
      arg === 'sdd' ||
      arg === 'trace' ||
      arg === 'session-contract' ||
      arg === 'effort-policy' ||
      arg === 'state-layers' ||
      arg === 'where-is-state' ||
      arg === 'toolboxes' ||
      arg === 'where-is-auth' ||
      arg === 'worker-toolbox'
    ) {
      args.command = arg;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--stdin') {
      args.stdin = true;
    } else if (arg === '--plan') {
      args.planPath = path.resolve(argv[++i] || '');
    } else if (arg === '--role') {
      args.role = String(argv[++i] || '').trim() || null;
    } else if (arg === '--body-file') {
      args.bodyFile = path.resolve(argv[++i] || '');
    } else if (arg === '--task') {
      args.task = String(argv[++i] || '');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--trace') {
      args.trace = true;
    } else if (arg === '--no-trace') {
      args.trace = false;
    } else if (arg === '--limit') {
      args.limit = parseInt(argv[++i] || '0', 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

/**
 * Emit a trace entry for the harness execution (MonitoredAgent pattern).
 * Appends JSONL to the trace file with topology + timing info.
 * @param {object} report - harness report
 * @param {string|null} role - agent role
 * @param {boolean} traceEnabled - whether tracing is enabled
 * @param {string} [traceFilePath] - explicit trace file path (defaults to TRACE_FILE)
 */
function emitTrace(report, role, traceEnabled, traceFilePath) {
  if (!traceEnabled) return;
  const dest = traceFilePath || TRACE_FILE;
  const entry = {
    ts: new Date().toISOString(),
    role,
    action: 'harness-check',
    durationMs: 0, // synchronous, negligible
    taskId: report.activeTasks?.[0]?.id || 'none',
    contention: report.contention?.length || 0,
    megafileHits: report.megafileHits?.length || 0,
    multiOwnerMega: (report.megafileHits || []).some((h) => h.multiOwner),
    activeOwners: report.concurrency?.activeOwners || 0,
    concurrencyOverCap: report.concurrency?.overCap || false,
    ok: report.ok || false,
  };
  try {
    fs.appendFileSync(dest, JSON.stringify(entry) + '\n');
  } catch {
    // Non-blocking - tracing must never break the harness
  }
}

function normalizeClaim(claim) {
  return String(claim || '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\/\*\*$/, '')
    .replace(/\/\*$/, '')
    .replace(/\/+$/, '');
}

function claimsOverlap(a, b) {
  const left = normalizeClaim(a);
  const right = normalizeClaim(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return isClaimedPath(left, right) || isClaimedPath(right, left);
}

function findFileContention(activeTasks) {
  const hits = [];
  for (let i = 0; i < activeTasks.length; i += 1) {
    for (let j = i + 1; j < activeTasks.length; j += 1) {
      const left = activeTasks[i];
      const right = activeTasks[j];
      if (!left.owner || !right.owner || left.owner === right.owner) continue;
      const leftFiles = left.claimedFiles || parseClaimedFiles(left.files);
      const rightFiles = right.claimedFiles || parseClaimedFiles(right.files);
      for (const lf of leftFiles) {
        if (lf === 'plan.md') continue;
        for (const rf of rightFiles) {
          if (rf === 'plan.md') continue;
          if (!claimsOverlap(lf, rf)) continue;
          hits.push({
            path: normalizeClaim(lf) === normalizeClaim(rf) ? normalizeClaim(lf) : `${normalizeClaim(lf)} ↔ ${normalizeClaim(rf)}`,
            left: { id: left.id, owner: left.owner, claim: lf },
            right: { id: right.id, owner: right.owner, claim: rf },
            severity: 'contention',
          });
        }
      }
    }
  }
  return hits;
}

function findMegafileHits(activeTasks) {
  const hits = [];
  for (const mega of MEGAFILES) {
    const claimants = [];
    for (const task of activeTasks) {
      const files = task.claimedFiles || parseClaimedFiles(task.files);
      if (files.some((claim) => claimsOverlap(claim, mega))) {
        claimants.push({ id: task.id, owner: task.owner, status: task.status });
      }
    }
    if (claimants.length > 0) {
      hits.push({
        path: mega,
        claimants,
        multiOwner: new Set(claimants.map((c) => c.owner)).size > 1,
        severity: claimants.length > 1 ? 'hot' : 'watch',
      });
    }
  }
  return hits;
}

function activeOwnerCount(activeTasks) {
  return new Set(
    activeTasks
      .filter((t) => t.status === 'in_progress')
      .map((t) => t.owner)
      .filter(Boolean),
  ).size;
}

function loadFieldGuide(guidePath = FIELD_GUIDE) {
  if (!fs.existsSync(guidePath)) {
    return {
      ok: false,
      path: guidePath,
      lineCount: 0,
      overBudget: false,
      budget: FIELD_GUIDE_LINE_BUDGET,
      body: '',
      error: 'field guide missing',
    };
  }
  const body = fs.readFileSync(guidePath, 'utf8');
  const lineCount = body.split('\n').length;
  return {
    ok: true,
    path: guidePath,
    lineCount,
    overBudget: lineCount > FIELD_GUIDE_LINE_BUDGET,
    budget: FIELD_GUIDE_LINE_BUDGET,
    body,
  };
}

function resolveRole(requested) {
  const role = String(requested || 'worker').toLowerCase();
  if (role === 'planner' || role === 'worker') return role;
  return 'worker';
}

function modelEconomics() {
  return {
    principle: 'Harness quality beats model mix; thrash is not productivity.',
    planner: 'Frontier judgment for decomposition, design decisions, and AcceptanceCheck quality.',
    worker: 'Cheap/local execution (tinker-yolo q4, Composer-class) once leaves are explicit.',
    antiPattern: 'Five frontier agents re-deriving the same design on a megafile.',
    measure: 'Finished AC per $, multi-claimer count, megafile contention — not commit count.',
    effort: effortPolicy(),
  };
}

function verificationStack() {
  return [
    'unit/focused tests for claimed surface',
    'typecheck when TS/mobile touched',
    'continuous E2E proof or honest skip reason (phone lease / no device)',
    'Greptile on onboarding/auth/OTA/pairing PRs',
    'sequential merge onto main only when required checks green',
  ];
}

function buildActions(report) {
  const actions = [];
  if (report.concurrency.overCap) {
    actions.push(
      `Concurrency ${report.concurrency.activeOwners} > cap ${report.concurrency.cap}: finish or block before starting another in_progress owner.`,
    );
  }
  if (report.contention.length > 0) {
    actions.push(
      `File contention detected (${report.contention.length}): mark blocked + STOP rather than editing overlapping claims.`,
    );
  }
  const multiMega = report.megafileHits.filter((h) => h.multiOwner);
  if (multiMega.length > 0) {
    actions.push(
      `Megafile multi-owner: ${multiMega.map((h) => h.path).join(', ')} — split work or serialize; no parallel design.`,
    );
  }
  if (report.fieldGuide.overBudget) {
    actions.push(
      `Field Guide over line budget (${report.fieldGuide.lineCount}/${report.fieldGuide.budget}): prune stale lines before adding surprises.`,
    );
  }
  if (report.fieldGuide.ok) {
    actions.push('Read docs/agent-field-guide/index.md (injected below) before expanding scope.');
  }
  actions.push(
    report.role === 'planner'
      ? 'Planner mode: write leaf AC + claims first; do not implement.'
      : 'Worker mode: implement only free claimed leaves; escalate design questions.',
  );
  if (report.sessionContract) {
    actions.push(
      `SessionContract: write=${report.sessionContract.write}; publish=${report.sessionContract.publish}; effort=${report.sessionContract.effort}; stop_when=${report.sessionContract.stopWhen}`,
    );
  }
  if (report.effortPolicy) {
    actions.push(
      `Effort: default ${report.sessionContract?.effort || effortDefaultForRole(report.role)}; step down for optics/AC leaves; reserve high for megafile design + ship claims.`,
    );
  }
  if (report.whereIsState) {
    const bad = (report.whereIsState.questions || []).filter((q) => !q.ok);
    if (bad.length > 0) {
      actions.push(
        `Where-is-state FAIL (${bad.map((q) => q.id).join(', ')}): fix shared board / Field Guide before multi-agent edits.`,
      );
    } else {
      actions.push(
        `Where-is-state: chat→session store; ownership→plan.md (${report.whereIsState.questions?.find((q) => q.id === 'repo_ownership')?.status || 'ok'}); resume→loop/E2E/Field Guide.`,
      );
    }
    if (report.whereIsState.hostGuidance) {
      actions.push(report.whereIsState.hostGuidance);
    }
  }
  if (report.stateLayers?.fleetRule) {
    actions.push(`State layers: ${report.stateLayers.fleetRule}`);
  }
  if (report.toolboxes?.fleetRule) {
    actions.push(`Toolboxes: ${report.toolboxes.fleetRule}`);
  }
  if (report.whereIsAuth) {
    const wia = report.whereIsAuth;
    if (!wia.ok) {
      actions.push(
        `Where-is-auth BLOCKED: ${wia.classified?.toolboxId || '?'} status=${wia.access?.status} — ${
          (wia.access?.reasons || []).slice(0, 2).join('; ') || 'see where-is-auth'
        }`,
      );
    } else {
      actions.push(
        `Where-is-auth: toolbox=${wia.classified?.toolboxId} auth=${wia.classified?.auth} host=${wia.host?.role} (${wia.access?.status})`,
      );
    }
  }
  if (report.workerToolbox?.prompt) {
    actions.push(
      `Worker toolbox: ${report.workerToolbox.toolboxId} (${report.workerToolbox.entrypoints?.length || 0} entrypoints) — inject entrypoints only, not skill soup`,
    );
  }
  return actions;
}

/**
 * Parse risk level from plan.md task rows that have a Risk column.
 * The snapshot parser doesn't handle extra columns, so we augment here.
 */
function augmentTaskRisk(activeTasks, planText) {
  const riskMap = {};
  for (const line of planText.split('\n')) {
    const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (cells.length < 6) continue;
    const id = cells[0];
    // Look for a cell matching known risk levels
    const knownRisks = ['low', 'medium', 'high', 'critical'];
    for (const cell of cells) {
      if (knownRisks.includes(cell.toLowerCase())) {
        riskMap[id] = cell.toLowerCase();
        break;
      }
    }
  }
  for (const task of activeTasks) {
    if (!task.risk && riskMap[task.id]) {
      task.risk = riskMap[task.id];
    }
  }
  return activeTasks;
}

function checkModelRiskGate(activeTasks) {
  const defaultRoute = ROUTES.find((r) => r.id === 'local_fast') || ROUTES[0];
  const results = [];
  for (const task of activeTasks) {
    if (!task.risk) continue;
    const signals = taskSignals(task.title || task.id || '');
    const allowed = routeAllowed(defaultRoute, { risk: task.risk, maxCostUsd: 1e9, latencyMs: 1e9, paidOk: true }, signals);
    results.push({
      taskId: task.id,
      taskTitle: task.title || task.task,
      taskRisk: task.risk,
      routeId: defaultRoute.id,
      routeRiskCeiling: defaultRoute.riskCeiling,
      routeReliability: defaultRoute.reliability,
      routeAllowed: allowed.allowed,
      reasons: allowed.reasons,
    });
  }
  return results;
}

function buildHarnessReport({ planPath = DEFAULT_PLAN, role = null, trace = false } = {}) {
  const snapshot = snapshotPlan(planPath);
  if (!snapshot.ok) {
    return {
      ok: false,
      error: snapshot.error,
      planPath,
      checkedAt: new Date().toISOString(),
    };
  }

  // Re-parse with claimedFiles (snapshot may be from older callers without the field).
  const planText = fs.readFileSync(planPath, 'utf8');
  const activeTasks = augmentTaskRisk(parseActiveTasks(planText), planText);
  const resolvedRole = resolveRole(role);
  const contention = findFileContention(activeTasks);
  const megafileHits = findMegafileHits(activeTasks);
  const owners = activeOwnerCount(activeTasks);
  const modelRiskGate = checkModelRiskGate(activeTasks);
  const fieldGuide = loadFieldGuide();
  const contract = sessionContract(resolvedRole);
  const effort = effortPolicy();
  const stateLayers = stateLayerPolicy();
  // Prefer plan parent as repo root when it has a Field Guide (isolated fixtures);
  // otherwise fall back to the real REPO so session-start still sees shared artifacts.
  const planParent = path.dirname(planPath);
  const stateRepo = fs.existsSync(path.join(planParent, 'docs/agent-field-guide/index.md'))
    ? planParent
    : REPO;
  const whereIsState = whereIsStateCheck({ planPath, repo: stateRepo });
  const taskHint =
    process.env.HERMES_TASK_TEXT ||
    activeTasks[0]?.title ||
    activeTasks[0]?.task ||
    '';
  const toolboxes = toolboxPolicy();
  const whereIsAuth = whereIsAuthCheck({ taskText: taskHint });
  const workerToolbox = workerToolboxPrompt(taskHint, { role: resolvedRole });
  const report = {
    ok: true,
    planPath,
    checkedAt: new Date().toISOString(),
    role: resolvedRole,
    roleGuidance: ROLE_GUIDANCE[resolvedRole],
    sessionContract: contract,
    effortPolicy: effort,
    hardBarForDone: hardBarForDone(),
    frontierPlaybook: frontierModelPlaybook(),
    stateLayers,
    whereIsState,
    toolboxes,
    whereIsAuth,
    workerToolbox,
    activeTasks,
    activeTaskCount: activeTasks.length,
    concurrency: {
      activeOwners: owners,
      cap: CONCURRENCY_CAP,
      overCap: owners > CONCURRENCY_CAP,
    },
    contention,
    megafileHits,
    megafiles: MEGAFILES,
    modelRiskGate,
    modelEconomics: modelEconomics(),
    verificationStack: verificationStack(),
    sdd: specificationDrivenDesign(),
    fieldGuide: {
      ok: fieldGuide.ok,
      path: fieldGuide.path,
      lineCount: fieldGuide.lineCount,
      budget: fieldGuide.budget,
      overBudget: fieldGuide.overBudget,
      error: fieldGuide.error || null,
    },
    docs: [
      'AGENTS.md (planner/worker + multi-agent Never list)',
      'docs/agent-field-guide/index.md',
      'docs/AGENT-SWARM-HARNESS.md',
      'docs/SDD-SPECIFICATION-DRIVEN-DESIGN.md',
      'docs/FRONTIER-MODEL-HARNESS.md',
      'plan.md',
    ],
  };
  report.actions = buildActions(report);
  report.fieldGuideBody = fieldGuide.ok ? fieldGuide.body : '';

  // Emit trace (MonitoredAgent pattern) — trace file lives next to the plan
  const traceFilePath = path.join(path.dirname(planPath), '.harness-trace.jsonl');
  emitTrace(report, resolvedRole, trace, traceFilePath);

  return report;
}

function formatHuman(report) {
  if (!report.ok) {
    return `=== Agent swarm harness ===\nERROR: ${report.error}`;
  }
  const lines = [
    '=== Agent swarm harness (planner/worker economics) ===',
    `Role: ${report.role} | active tasks: ${report.activeTaskCount} | owners in_progress: ${report.concurrency.activeOwners}/${report.concurrency.cap}`,
  ];
  if (report.concurrency.overCap) {
    lines.push('WARN: concurrency over cap — serialize before claiming more work.');
  }
  if (report.contention.length === 0) {
    lines.push('Contention: none detected across distinct owners');
  } else {
    lines.push(`Contention (${report.contention.length}):`);
    for (const hit of report.contention.slice(0, 8)) {
      lines.push(
        `  ${hit.path}: ${hit.left.owner}(${hit.left.id}) vs ${hit.right.owner}(${hit.right.id})`,
      );
    }
    if (report.contention.length > 8) {
      lines.push(`  … +${report.contention.length - 8} more`);
    }
  }
  if (report.megafileHits.length === 0) {
    lines.push('Megafiles: no active claims on known choke points');
  } else {
    lines.push('Megafile watch:');
    for (const hit of report.megafileHits.slice(0, 8)) {
      const owners = [...new Set(hit.claimants.map((c) => c.owner))].join(', ');
      lines.push(
        `  ${hit.multiOwner ? 'HOT' : 'watch'} ${hit.path} → ${owners} (${hit.claimants.map((c) => c.id).join(', ')})`,
      );
    }
  }
  lines.push('Model economics: frontier plans; cheap/local executes explicit leaves.');
  if (report.sessionContract) {
    const sc = report.sessionContract;
    lines.push('SessionContract (state once — tenacious frontier models):');
    lines.push(`  write: ${sc.write}`);
    lines.push(`  publish: ${sc.publish}`);
    lines.push(`  send: ${sc.send}`);
    lines.push(`  effort: ${sc.effort}`);
    lines.push(`  stop_when: ${sc.stopWhen}`);
    lines.push(`  keep: ${sc.keep.join('; ')}`);
    lines.push(`  drop: ${sc.drop.join('; ')}`);
  }
  if (report.effortPolicy) {
    lines.push('Effort step-down (do not max by default):');
    for (const c of report.effortPolicy.classes.slice(0, 5)) {
      lines.push(`  ${c.id}: effort=${c.defaultEffort} — ${c.match}`);
    }
  }
  if (report.hardBarForDone) {
    lines.push(`Done bar: ${report.hardBarForDone.principle}`);
    lines.push(`  loop: ${report.hardBarForDone.loop}`);
  }
  if (report.stateLayers) {
    lines.push(`State layers: ${report.stateLayers.principle}`);
    lines.push(
      `  designs: ${report.stateLayers.layers.map((l) => `${l.id}=${l.design}`).join('; ')}`,
    );
    lines.push(`  fleet: ${report.stateLayers.fleetRule}`);
  }
  if (report.whereIsState) {
    const wis = report.whereIsState;
    lines.push(
      `Where-is-state (${wis.ok ? 'ok' : 'WARN'} | host=${wis.host?.role || 'unknown'}):`,
    );
    for (const q of wis.questions || []) {
      lines.push(
        `  ${q.ok ? 'ok' : 'FAIL'} ${q.id}: ${q.evidence || q.prefer}`,
      );
    }
    if (wis.hostGuidance) lines.push(`  ${wis.hostGuidance}`);
  }
  if (report.toolboxes) {
    lines.push(`Toolboxes: ${report.toolboxes.principle}`);
    lines.push(
      `  packs: ${report.toolboxes.packs.map((p) => `${p.id}(${p.auth})`).join('; ')}`,
    );
  }
  if (report.whereIsAuth) {
    const wia = report.whereIsAuth;
    lines.push(
      `Where-is-auth (${wia.ok ? 'ok' : 'BLOCKED'} | host=${wia.host?.role || 'unknown'}): toolbox=${wia.classified?.toolboxId} auth=${wia.classified?.auth} status=${wia.access?.status}`,
    );
    if (wia.hostGuidance) lines.push(`  ${wia.hostGuidance}`);
  }
  if (report.workerToolbox?.prompt) {
    lines.push('Worker toolbox prompt (entrypoints only):');
    for (const line of report.workerToolbox.prompt.split('\n').slice(0, 12)) {
      lines.push(`  ${line}`);
    }
  }
  if (report.modelRiskGate && report.modelRiskGate.length > 0) {
    const blocked = report.modelRiskGate.filter((r) => !r.routeAllowed);
    if (blocked.length > 0) {
      lines.push('');
      lines.push('Model-risk gate (BLOCKED by route ceiling):');
      for (const risk of blocked.slice(0, 8)) {
        lines.push(
          `  BLOCKED: ${risk.taskId} (risk: ${risk.taskRisk}) → ${risk.routeId} ceiling ${risk.routeRiskCeiling}`,
        );
      }
      if (blocked.length > 8) {
        lines.push(`  … +${blocked.length - 8} more`);
      }
    }
  }
  if (report.sdd) {
    lines.push(`SDD: ${report.sdd.principle}`);
    lines.push(
      `  loop: ${report.sdd.steps.map((s) => s.id).join(' → ')} (gap → update AC/claim first)`,
    );
  }
  lines.push('Role guidance:');
  for (const tip of report.roleGuidance) {
    lines.push(`  - ${tip}`);
  }
  lines.push('Actions:');
  for (const action of report.actions) {
    lines.push(`  → ${action}`);
  }
  if (report.fieldGuideBody) {
    lines.push('');
    lines.push('--- Field Guide (docs/agent-field-guide/index.md) ---');
    lines.push(report.fieldGuideBody.trimEnd());
    if (report.fieldGuide.overBudget) {
      lines.push(`(over budget: ${report.fieldGuide.lineCount}/${report.fieldGuide.budget} lines)`);
    }
  }
  return lines.join('\n');
}

function extractDecisionRefs(body) {
  if (!body) return [];
  const refs = new Set();
  for (const match of body.matchAll(/\bD-\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]+\b/g)) {
    refs.add(match[0]);
  }
  for (const match of body.matchAll(/\bDecision(?:s)?\s*(?:Log\s*)?(?:#|id[:\s]+)?([A-Za-z0-9._-]+)/gi)) {
    if (match[1]) refs.add(match[1]);
  }
  if (/plan\.md\s*§\s*3|Decisions Log/i.test(body)) {
    refs.add('plan.md§3');
  }
  return [...refs];
}

function checkHotFiles({ files, body }) {
  const hot = files
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((file) => MEGAFILES.some((mega) => claimsOverlap(file, mega)));
  const decisionRefs = extractDecisionRefs(body || '');
  const ok = hot.length === 0 || decisionRefs.length > 0;
  return {
    ok,
    hotFiles: hot,
    decisionRefs,
    message: ok
      ? hot.length === 0
        ? 'No megafiles in change set.'
        : `Megafiles present with decision refs: ${decisionRefs.join(', ')}`
      : `Megafile edit without decision ref: ${hot.join(', ')}. Add a plan.md §3 Decision id (D-YYYY-MM-DD-…) or "Decisions Log" pointer in the PR body.`,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/agent-swarm-harness.js [--json] [--plan path] [--role planner|worker] [--trace|--no-trace]
  node tools/agent-swarm-harness.js check-hot-files --stdin [--body-file path]
  node tools/agent-swarm-harness.js trace [--json] [--limit N]
  node tools/agent-swarm-harness.js field-guide
  node tools/agent-swarm-harness.js sdd [--json]
  node tools/agent-swarm-harness.js session-contract [--role planner|worker] [--json]
  node tools/agent-swarm-harness.js effort-policy [--json]
  node tools/agent-swarm-harness.js state-layers [--json]
  node tools/agent-swarm-harness.js where-is-state [--json] [--plan path]
  node tools/agent-swarm-harness.js toolboxes [--json]
  node tools/agent-swarm-harness.js where-is-auth [--json] [--task "..."]
  node tools/agent-swarm-harness.js worker-toolbox [--json] [--task "..."]`);
    process.exit(0);
  }

  if (args.command === 'sdd') {
    const sdd = specificationDrivenDesign();
    if (args.json) {
      console.log(JSON.stringify(sdd, null, 2));
    } else {
      const lines = [
        '=== Specification-Driven Design (swarm harness) ===',
        sdd.principle,
        `Source: ${sdd.source.label}`,
        `  ${sdd.source.url}`,
        '',
        'Loop (update specs before code when gaps appear):',
      ];
      for (const step of sdd.steps) {
        lines.push(`  ${step.id.padEnd(14)} ${step.name}`);
        lines.push(`                 → ${step.ourArtifact}`);
      }
      lines.push('');
      lines.push('Anti-patterns:');
      for (const ap of sdd.antiPatterns) {
        lines.push(`  - ${ap}`);
      }
      lines.push('');
      lines.push('See docs/SDD-SPECIFICATION-DRIVEN-DESIGN.md');
      console.log(lines.join('\n'));
    }
    process.exit(0);
  }

  if (args.command === 'session-contract') {
    const contract = sessionContract(args.role || 'worker');
    if (args.json) {
      console.log(JSON.stringify(contract, null, 2));
    } else {
      console.log('=== SessionContract (tenacious frontier models) ===');
      console.log(`role: ${contract.role}`);
      console.log(`write: ${contract.write}`);
      console.log(`publish: ${contract.publish}`);
      console.log(`send: ${contract.send}`);
      console.log(`effort: ${contract.effort}`);
      console.log(`stop_when: ${contract.stopWhen}`);
      console.log(`keep: ${contract.keep.join('; ')}`);
      console.log(`drop: ${contract.drop.join('; ')}`);
      console.log(`source: ${contract.source.url}`);
    }
    process.exit(0);
  }

  if (args.command === 'effort-policy') {
    const policy = effortPolicy();
    if (args.json) {
      console.log(JSON.stringify(policy, null, 2));
    } else {
      console.log('=== Effort step-down policy ===');
      console.log(policy.principle);
      console.log(`dial: ${policy.dial}`);
      for (const c of policy.classes) {
        console.log(`  ${c.id}: effort=${c.defaultEffort} (${c.routeHint}) — ${c.match}`);
      }
      console.log(`anti-pattern: ${policy.antiPattern}`);
    }
    process.exit(0);
  }

  if (args.command === 'state-layers') {
    const policy = stateLayerPolicy();
    if (args.json) {
      console.log(JSON.stringify(policy, null, 2));
    } else {
      console.log('=== Hermes state-layer policy (Pro + mini) ===');
      console.log(policy.principle);
      console.log(`Source: ${policy.source.url}`);
      console.log('');
      for (const layer of policy.layers) {
        console.log(`  ${layer.id.padEnd(14)} design=${layer.design}`);
        console.log(`                 Pro:  ${layer.macPro}`);
        console.log(`                 mini: ${layer.macMini}`);
      }
      console.log('');
      console.log(`Fleet rule: ${policy.fleetRule}`);
      console.log('Anti-patterns:');
      for (const ap of policy.antiPatterns) {
        console.log(`  - ${ap}`);
      }
    }
    process.exit(0);
  }

  if (args.command === 'where-is-state') {
    const check = whereIsStateCheck({ planPath: args.planPath });
    if (args.json) {
      console.log(JSON.stringify(check, null, 2));
    } else {
      console.log('=== Where is state? (session-start gate) ===');
      console.log(check.principle);
      console.log(`host: ${check.host.role} (${check.host.hostname})`);
      console.log(`overall: ${check.ok ? 'ok' : 'WARN'}`);
      console.log('');
      for (const q of check.questions) {
        console.log(`[${q.ok ? 'ok' : 'FAIL'}] ${q.id} — ${q.question}`);
        console.log(`  prefer: ${q.prefer}`);
        console.log(`  never:  ${q.never}`);
        console.log(`  evidence: ${q.evidence}`);
      }
      console.log('');
      console.log(check.hostGuidance);
      console.log('Actions:');
      for (const a of check.actions) {
        console.log(`  → ${a}`);
      }
    }
    // Non-zero only when shared board / Field Guide hard-fail (not optional loop-state absence).
    process.exit(check.ok ? 0 : 2);
  }

  if (args.command === 'toolboxes') {
    const policy = toolboxPolicy();
    if (args.json) {
      console.log(JSON.stringify(policy, null, 2));
    } else {
      console.log('=== Hermes toolbox policy (auth on pack, not agent) ===');
      console.log(policy.principle);
      console.log(`Source: ${policy.source.url}`);
      console.log('');
      for (const pack of policy.packs) {
        console.log(
          `  ${pack.id.padEnd(16)} auth=${pack.auth} hosts=${pack.hosts.join(',')}`,
        );
        console.log(`                 Pro:  ${pack.macPro}`);
        console.log(`                 mini: ${pack.macMini}`);
        if (pack.gates.length) console.log(`                 gates: ${pack.gates.join(', ')}`);
      }
      console.log('');
      console.log(`Fleet rule: ${policy.fleetRule}`);
      console.log('Anti-patterns:');
      for (const ap of policy.antiPatterns) {
        console.log(`  - ${ap}`);
      }
    }
    process.exit(0);
  }

  if (args.command === 'where-is-auth') {
    const check = whereIsAuthCheck({ taskText: args.task });
    if (args.json) {
      console.log(JSON.stringify(check, null, 2));
    } else {
      console.log('=== Where is auth? (toolbox identity gate) ===');
      console.log(check.principle);
      console.log(`host: ${check.host.role} (${check.host.hostname})`);
      console.log(
        `toolbox: ${check.classified.toolboxId} auth=${check.classified.auth} overall=${check.ok ? 'ok' : 'BLOCKED'}`,
      );
      console.log('');
      for (const q of check.questions) {
        console.log(`[${q.ok ? 'ok' : 'FAIL'}] ${q.id} — ${q.question}`);
        console.log(`  prefer: ${q.prefer}`);
        console.log(`  never:  ${q.never}`);
        console.log(`  evidence: ${q.evidence}`);
      }
      console.log('');
      console.log(check.hostGuidance);
      console.log('Actions:');
      for (const a of check.actions) {
        console.log(`  → ${a}`);
      }
    }
    process.exit(check.ok ? 0 : 2);
  }

  if (args.command === 'worker-toolbox') {
    const bundle = workerToolboxPrompt(args.task, { role: args.role || 'worker' });
    if (args.json) {
      console.log(JSON.stringify(bundle, null, 2));
    } else {
      console.log('=== Worker toolbox prompt (entrypoints only) ===');
      console.log(bundle.prompt);
    }
    process.exit(bundle.ok ? 0 : 2);
  }

  if (args.command === 'field-guide') {
    const guide = loadFieldGuide();
    if (!guide.ok) {
      console.error(guide.error);
      process.exit(1);
    }
    process.stdout.write(guide.body);
    if (!guide.body.endsWith('\n')) process.stdout.write('\n');
    process.exit(guide.overBudget ? 2 : 0);
  }

  if (args.command === 'check-hot-files') {
    const files = args.stdin
      ? fs.readFileSync(0, 'utf8').split('\n').map((f) => f.trim()).filter(Boolean)
      : [];
    const body = args.bodyFile && fs.existsSync(args.bodyFile)
      ? fs.readFileSync(args.bodyFile, 'utf8')
      : '';
    const result = checkHotFiles({ files, body });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`✗ ${result.message}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  if (args.command === 'trace') {
    // Read trace from cwd so it works with test sandboxes and per-repo instances
    const traceFile = path.join(process.cwd(), '.harness-trace.jsonl');
    if (!fs.existsSync(traceFile)) {
      if (args.json) {
        console.log(JSON.stringify([]));
      } else {
        console.log('No trace file found. Run the harness to start tracing.');
      }
      process.exit(0);
    }
    let lines = fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean);
    if (args.limit > 0) {
      lines = lines.slice(-args.limit);
    }
    const entries = lines.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    if (args.json) {
      console.log(JSON.stringify(entries, null, 2));
    } else {
      console.log(`=== Harness Trace (${entries.length} entries) ===`);
      for (const e of entries) {
        const flags = [];
        if (e.concurrencyOverCap) flags.push('OVER-CAP');
        if (e.multiOwnerMega) flags.push('MULTI-OWNER-MEGA');
        if (!e.ok) flags.push('FAIL');
        const flagStr = flags.length ? ` [${flags.join(',')}]` : '';
        console.log(`  ${e.ts}  role=${e.role}  action=${e.action}${flagStr}`);
        console.log(`    contention=${e.contention}  megafileHits=${e.megafileHits}  owners=${e.activeOwners}`);
      }
    }
    process.exit(0);
  }

  const report = buildHarnessReport({ planPath: args.planPath, role: args.role, trace: args.trace });
  if (args.json) {
    const jsonSafe = { ...report };
    // Keep JSON payloads bounded for session tooling.
    if (jsonSafe.fieldGuideBody && jsonSafe.fieldGuideBody.length > 4000) {
      jsonSafe.fieldGuideBody = `${jsonSafe.fieldGuideBody.slice(0, 4000)}\n…`;
    }
    console.log(JSON.stringify(jsonSafe, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
  console.log(formatHuman(report));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  MEGAFILES,
  FIELD_GUIDE_LINE_BUDGET,
  CONCURRENCY_CAP,
  ROLE_GUIDANCE,
  LOOP_STATE_LATEST,
  CONTINUOUS_E2E_LATEST,
  STATE_LAYER_SOURCE,
  TOOLBOX_SOURCE,
  normalizeClaim,
  claimsOverlap,
  findFileContention,
  findMegafileHits,
  loadFieldGuide,
  buildHarnessReport,
  formatHuman,
  checkHotFiles,
  extractDecisionRefs,
  modelEconomics,
  sessionContract,
  effortPolicy,
  effortDefaultForRole,
  hardBarForDone,
  frontierModelPlaybook,
  specificationDrivenDesign,
  stateLayerPolicy,
  classifyTaskStateDesign,
  detectFleetHostRole,
  whereIsStateCheck,
  toolboxPolicy,
  classifyTaskToolbox,
  resolveToolboxAccess,
  workerToolboxPrompt,
  whereIsAuthCheck,
  parseArgs,
  emitTrace,
  checkModelRiskGate,
  TRACE_FILE,
};

if (require.main === module) {
  main();
}
