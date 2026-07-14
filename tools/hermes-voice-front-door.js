#!/usr/bin/env node
'use strict';

/**
 * hermes-voice-front-door.js — high-ROI voice ingress policy for SpaceXAI Voice
 * Agent Builder → Hermes/ThumbGate money path.
 *
 * Does NOT place phone calls, send Stripe links, or mutate HubSpot. It decides:
 *   - which specialized voice agent may speak
 *   - which tools/MCPs that agent may use
 *   - when to transfer (qualify → close → human)
 *   - how HubSpot deal stages map to private pipeline-status.tsv stages
 *   - which published offer (if any) may be quoted
 *
 * Money ladder (from docs/SALES-CLOSE-KIT.md / REVENUE-OPERATING-PLAN.md):
 *   free repo / ThumbGate link | $499 diagnostic | $1,500 sprint | $3,000 pilot
 *
 * Usage:
 *   node tools/hermes-voice-front-door.js --event transfer --signals-json '{...}' --json
 *   node tools/hermes-voice-front-door.js --event map-hubspot --hubspot-stage "proposal sent" --json
 *   node tools/hermes-voice-front-door.js --event demo-pack --json
 *   node tools/hermes-voice-front-door.js --event tool-gate --agent qualify --tool quote_offer --json
 *   node tools/hermes-voice-front-door.js --event receipt --signals-json '{...}' --write
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PIPELINE_STAGES = ['ready', 'sent', 'replied', 'booked', 'proposed', 'paid', 'lost'];

/** Published offer ladder only — voice agents cannot invent prices. */
const OFFERS = Object.freeze({
  free: {
    id: 'free_repo',
    label: 'Free repo + ThumbGate link',
    grossUsd: 0,
    minScore: 0,
    maxScore: 3,
  },
  diagnostic: {
    id: 'diagnostic_499',
    label: 'Agent Reliability Diagnostic ($499)',
    grossUsd: 499,
    minScore: 4,
    maxScore: 5,
  },
  sprint: {
    id: 'hardening_sprint_1500',
    label: 'AI Agent Hardening Sprint ($1,500)',
    grossUsd: 1500,
    minScore: 6,
    maxScore: 8,
  },
  pilot: {
    id: 'partner_pilot_3000',
    label: 'Partner Pilot ($3,000)',
    grossUsd: 3000,
    minScore: 9,
    maxScore: 10,
  },
});

/**
 * HubSpot deal stage labels (and common aliases) → private pipeline stage.
 * Keep aliases lowercase; matching is case-insensitive.
 */
const HUBSPOT_TO_PIPELINE = Object.freeze({
  new: 'ready',
  lead: 'ready',
  'appointmentscheduled': 'ready',
  appointment_scheduled: 'ready',
  qualifiedtobuy: 'ready',
  ready: 'ready',
  contacted: 'sent',
  outreach: 'sent',
  sent: 'sent',
  presentationscheduled: 'replied',
  responded: 'replied',
  replied: 'replied',
  qualified: 'replied',
  decisionmakerboughtin: 'booked',
  'meeting scheduled': 'booked',
  meeting_scheduled: 'booked',
  booked: 'booked',
  'proposal sent': 'proposed',
  proposal_sent: 'proposed',
  contractsent: 'proposed',
  proposed: 'proposed',
  closedwon: 'paid',
  'closed won': 'paid',
  closed_won: 'paid',
  paid: 'paid',
  closedlost: 'lost',
  'closed lost': 'lost',
  closed_lost: 'lost',
  lost: 'lost',
});

const PIPELINE_TO_HUBSPOT = Object.freeze({
  ready: 'new',
  sent: 'contacted',
  replied: 'qualified',
  booked: 'meeting scheduled',
  proposed: 'proposal sent',
  paid: 'closed won',
  lost: 'closed lost',
});

/** Qualification signals — same weights as tools/prospect-score.js. */
const SCORE_SIGNALS = Object.freeze([
  ['agent_stack', 2],
  ['repeated_failure', 2],
  ['business_cost', 2],
  ['budget_owner', 2],
  ['workflow_context', 1],
  ['needs_repeatability', 1],
]);

const AGENTS = Object.freeze({
  qualify: {
    id: 'qualify',
    role: 'Intake / discovery',
    purpose: 'Capture stack, failure pattern, cost, budget owner. Never quote final price or send payment links.',
    voiceHint: 'support',
    allowedTools: [
      'web_search',
      'x_search',
      'hubspot.create_or_update_contact',
      'hubspot.set_deal_stage_ready_or_sent',
      'hubspot.append_call_note',
      'calendar.share_triage_link_only',
    ],
    deniedTools: [
      'quote_offer',
      'send_payment_link',
      'promise_sla',
      'custom_discount',
      'hubspot.set_deal_stage_paid',
    ],
  },
  close: {
    id: 'close',
    role: 'Sales close',
    purpose: 'Quote only the published ladder after score gates pass. Book diagnostic/sprint; never invent enterprise terms.',
    voiceHint: 'sales',
    allowedTools: [
      'web_search',
      'hubspot.create_or_update_contact',
      'hubspot.set_deal_stage_booked_or_proposed',
      'hubspot.append_call_note',
      'quote_offer',
      'calendar.share_triage_link_only',
      'send_proposal_summary',
    ],
    deniedTools: [
      'send_payment_link',
      'promise_sla',
      'custom_discount',
      'hubspot.set_deal_stage_paid',
    ],
  },
  human: {
    id: 'human',
    role: 'Human operator handoff',
    purpose: 'Partner pilot, compliance, custom pricing, payment exceptions, or angry callers. Operator owns Stripe.',
    voiceHint: 'support',
    allowedTools: [
      'hubspot.append_call_note',
      'hubspot.set_deal_stage_any_except_paid_without_ledger',
      'notify_operator',
      // send_payment_link is gated (not free-for-all): needs human_approved_payment + booked/proposed.
      'send_payment_link',
      'quote_offer',
    ],
    deniedTools: [
      'promise_sla',
      'custom_discount',
      'hubspot.set_deal_stage_paid',
    ],
  },
});

const HUMAN_TRIGGERS = Object.freeze([
  { id: 'compliance', pattern: /compliance|soc\s*2|hipaa|gdpr|legal|audit artifact|enterprise guarantee/i },
  { id: 'custom_price', pattern: /discount|cheaper|negotiate|custom price|under \$?\d+|pro bono/i },
  { id: 'angry', pattern: /lawsuit|scam|fraud|refund now|lawyer|attorney/i },
  { id: 'payment_exception', pattern: /invoice po|net\s*30|procurement|wire only|purchase order/i },
  { id: 'partner_pilot', pattern: /agency resell|white.?label|partner pilot|for my clients/i },
]);

const usage = `Usage:
  node tools/hermes-voice-front-door.js --event EVENT [options]

Events:
  transfer       Decide next agent + allowed tools + offer (needs --signals-json)
  tool-gate      Check if an agent may use a tool (--agent, --tool, optional --signals-json)
  map-hubspot    Map HubSpot stage ↔ pipeline (--hubspot-stage or --pipeline-stage)
  score          Score call signals like prospect-score (--signals-json)
  demo-pack      Emit paste-ready SpaceXAI multi-agent pack (no secrets)
  receipt        Full decision receipt; optional --write to private JSONL
  apply-pipeline After-call: dry-run (default) or --apply pipeline-update.js write

Options:
  --signals-json JSON   Call state: agent_stack, repeated_failure, business_cost,
                        budget_owner, workflow_context, needs_repeatability (yes/no),
                        current_agent, utterance, pipeline_stage, human_approved_payment
  --agent NAME          qualify | close | human
  --tool NAME           tool id to gate
  --hubspot-stage TEXT  HubSpot deal stage label
  --pipeline-stage TEXT ready|sent|replied|booked|proposed|paid|lost
  --pipeline PATH       private pipeline-status.tsv for apply-pipeline
  --date YYYY-MM-DD     touch date for apply-pipeline (default: today UTC)
  --apply               actually run pipeline-update.js (default is dry-run)
  --allow-paid          required if suggested stage is paid (voice never auto-pays)
  --json                machine-readable stdout
  --write               append private receipt under ~/.hermes/voice-front-door/
  --help

Private receipts never store full utterance text (hashed length + trigger ids only).
apply-pipeline never marks paid without --allow-paid; Stripe still requires ledger.`;

function parseArgs(argv) {
  const args = {
    json: false,
    write: false,
    help: false,
    apply: false,
    allowPaid: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--event') args.event = argv[++i];
    else if (arg === '--signals-json') args.signalsJson = argv[++i];
    else if (arg === '--agent') args.agent = argv[++i];
    else if (arg === '--tool') args.tool = argv[++i];
    else if (arg === '--hubspot-stage') args.hubspotStage = argv[++i];
    else if (arg === '--pipeline-stage') args.pipelineStage = argv[++i];
    else if (arg === '--pipeline') args.pipeline = argv[++i];
    else if (arg === '--date') args.date = argv[++i];
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--allow-paid') args.allowPaid = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function parseBool(value, field) {
  if (value === true || value === false) return value;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (['yes', 'true', '1', 'y'].includes(normalized)) return true;
  if (['no', 'false', '0', 'n', ''].includes(normalized)) return false;
  throw new Error(`${field} must be yes/no (or boolean); got ${JSON.stringify(value)}`);
}

function normalizeSignals(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const signals = {};
  for (const [key] of SCORE_SIGNALS) {
    signals[key] = parseBool(input[key], key);
  }
  const currentAgent = String(input.current_agent || input.currentAgent || 'qualify').toLowerCase();
  if (!AGENTS[currentAgent]) {
    throw new Error(`current_agent must be one of: ${Object.keys(AGENTS).join(', ')}`);
  }
  let pipelineStage = String(input.pipeline_stage || input.pipelineStage || 'ready').toLowerCase();
  if (!PIPELINE_STAGES.includes(pipelineStage)) {
    throw new Error(`pipeline_stage must be one of: ${PIPELINE_STAGES.join(', ')}`);
  }
  return {
    ...signals,
    current_agent: currentAgent,
    utterance: String(input.utterance || ''),
    pipeline_stage: pipelineStage,
    human_approved_payment: parseBool(
      input.human_approved_payment != null ? input.human_approved_payment : input.humanApprovedPayment,
      'human_approved_payment',
    ),
    prospect_label: String(input.prospect_label || input.prospectLabel || '').trim(),
    segment: String(input.segment || '').trim().toLowerCase(),
  };
}

function scoreSignals(signals) {
  let score = 0;
  const parts = [];
  for (const [key, weight] of SCORE_SIGNALS) {
    if (signals[key]) {
      score += weight;
      parts.push({ key, weight, hit: true });
    } else {
      parts.push({ key, weight, hit: false });
    }
  }
  return { score, maxScore: 10, parts };
}

function routeOffer(score) {
  if (score >= OFFERS.pilot.minScore) return { ...OFFERS.pilot, action: 'offer_partner_pilot_via_human' };
  if (score >= OFFERS.sprint.minScore) return { ...OFFERS.sprint, action: 'offer_hardening_sprint' };
  if (score >= OFFERS.diagnostic.minScore) return { ...OFFERS.diagnostic, action: 'offer_diagnostic' };
  return { ...OFFERS.free, action: 'send_free_repo_only' };
}

function detectHumanTriggers(utterance) {
  const hits = [];
  const text = utterance || '';
  for (const trigger of HUMAN_TRIGGERS) {
    if (trigger.pattern.test(text)) hits.push(trigger.id);
  }
  return hits;
}

function discoveryComplete(signals) {
  // Minimum for transfer to close: stack + repeated failure + business cost named.
  return Boolean(signals.agent_stack && signals.repeated_failure && signals.business_cost);
}

function decideTransfer(rawSignals) {
  const signals = normalizeSignals(rawSignals);
  const scored = scoreSignals(signals);
  const offer = routeOffer(scored.score);
  const humanHits = detectHumanTriggers(signals.utterance);
  const reasons = [];
  let nextAgent = signals.current_agent;
  let transfer = false;

  // Partner pilot always needs a human on the money path (resell/package).
  if (scored.score >= OFFERS.pilot.minScore) {
    humanHits.push('score_partner_pilot');
  }

  if (humanHits.length > 0) {
    nextAgent = 'human';
    transfer = signals.current_agent !== 'human';
    reasons.push(`human_triggers:${humanHits.join(',')}`);
  } else if (signals.current_agent === 'qualify' && discoveryComplete(signals) && scored.score >= 4) {
    nextAgent = 'close';
    transfer = true;
    reasons.push('discovery_complete_paid_route');
  } else if (signals.current_agent === 'qualify' && discoveryComplete(signals) && scored.score <= 3) {
    nextAgent = 'qualify';
    transfer = false;
    reasons.push('discovery_complete_free_route_stay_qualify');
  } else if (signals.current_agent === 'close' && !discoveryComplete(signals)) {
    nextAgent = 'qualify';
    transfer = true;
    reasons.push('incomplete_discovery_return_to_qualify');
  } else {
    reasons.push('hold_current_agent');
  }

  const agent = AGENTS[nextAgent];
  const quoteAllowed = canQuoteOffer(nextAgent, signals, scored.score);
  const paymentLinkAllowed = canSendPaymentLink(nextAgent, signals);

  return {
    ok: true,
    event: 'transfer',
    current_agent: signals.current_agent,
    next_agent: nextAgent,
    transfer,
    reasons,
    human_triggers: [...new Set(humanHits)],
    score: scored.score,
    score_parts: scored.parts,
    offer: {
      id: offer.id,
      label: offer.label,
      gross_usd: offer.grossUsd,
      action: offer.action,
    },
    quote_allowed: quoteAllowed.allowed,
    quote_gate: quoteAllowed,
    payment_link_allowed: paymentLinkAllowed.allowed,
    payment_link_gate: paymentLinkAllowed,
    allowed_tools: agent.allowedTools.slice(),
    denied_tools: agent.deniedTools.slice(),
    agent_role: agent.role,
    voice_hint: agent.voiceHint,
    pipeline_stage: signals.pipeline_stage,
    hubspot_stage: PIPELINE_TO_HUBSPOT[signals.pipeline_stage],
    prospect_label: signals.prospect_label || null,
    context_preserve: true,
    money_note:
      'Stripe/payment is operator-owned. Voice agents never mark paid without a cleared ledger entry.',
  };
}

function canQuoteOffer(agentId, signals, score) {
  if (agentId === 'human') {
    return { allowed: true, reason: 'human_may_discuss_any_published_ladder' };
  }
  if (agentId !== 'close') {
    return { allowed: false, reason: 'only_close_or_human_may_quote' };
  }
  if (!discoveryComplete(signals)) {
    return { allowed: false, reason: 'discovery_incomplete' };
  }
  if (score < 4) {
    return { allowed: false, reason: 'score_below_paid_threshold' };
  }
  if (!signals.budget_owner && signals.segment !== 'founder' && signals.segment !== 'agency') {
    return { allowed: false, reason: 'budget_owner_unknown_non_founder' };
  }
  return { allowed: true, reason: 'published_ladder_only' };
}

function canSendPaymentLink(agentId, signals) {
  if (agentId !== 'human') {
    return { allowed: false, reason: 'payment_links_require_human_operator' };
  }
  if (!signals.human_approved_payment) {
    return { allowed: false, reason: 'human_approved_payment_flag_required' };
  }
  if (!['proposed', 'booked'].includes(signals.pipeline_stage)) {
    return { allowed: false, reason: 'pipeline_must_be_booked_or_proposed' };
  }
  return { allowed: true, reason: 'operator_may_send_stripe_after_proposal' };
}

function gateTool(agentId, toolName, rawSignals) {
  const agentKey = String(agentId || '').toLowerCase();
  const tool = String(toolName || '').trim();
  if (!AGENTS[agentKey]) {
    throw new Error(`Unknown agent: ${agentId}`);
  }
  if (!tool) {
    throw new Error('--tool is required');
  }
  const agent = AGENTS[agentKey];
  const signals = rawSignals ? normalizeSignals(rawSignals) : normalizeSignals({ current_agent: agentKey });
  const scored = scoreSignals(signals);

  if (agent.deniedTools.includes(tool)) {
    return {
      ok: true,
      allowed: false,
      agent: agentKey,
      tool,
      reason: 'explicitly_denied_for_agent',
    };
  }

  if (tool === 'quote_offer') {
    const gate = canQuoteOffer(agentKey, signals, scored.score);
    return { ok: true, allowed: gate.allowed, agent: agentKey, tool, reason: gate.reason, score: scored.score };
  }
  if (tool === 'send_payment_link') {
    const gate = canSendPaymentLink(agentKey, signals);
    return { ok: true, allowed: gate.allowed, agent: agentKey, tool, reason: gate.reason };
  }

  if (agent.allowedTools.includes(tool)) {
    return { ok: true, allowed: true, agent: agentKey, tool, reason: 'in_allowlist' };
  }

  return {
    ok: true,
    allowed: false,
    agent: agentKey,
    tool,
    reason: 'not_in_allowlist',
  };
}

function normalizeHubspotStage(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function mapHubspotToPipeline(hubspotStage) {
  const raw = String(hubspotStage || '').trim();
  if (!raw) throw new Error('--hubspot-stage is required');
  const compact = raw.toLowerCase().replace(/[\s_-]+/g, '');
  const spaced = normalizeHubspotStage(raw);
  const pipeline =
    HUBSPOT_TO_PIPELINE[raw.toLowerCase()] ||
    HUBSPOT_TO_PIPELINE[spaced] ||
    HUBSPOT_TO_PIPELINE[compact] ||
    HUBSPOT_TO_PIPELINE[spaced.replace(/\s/g, '_')];
  if (!pipeline) {
    return {
      ok: false,
      hubspot_stage: raw,
      pipeline_stage: null,
      error: `unmapped HubSpot stage; known: ${Object.keys(HUBSPOT_TO_PIPELINE).join(', ')}`,
    };
  }
  return {
    ok: true,
    hubspot_stage: raw,
    pipeline_stage: pipeline,
    pipeline_next_action: defaultNextAction(pipeline),
    hubspot_canonical: PIPELINE_TO_HUBSPOT[pipeline],
  };
}

function mapPipelineToHubspot(pipelineStage) {
  const stage = String(pipelineStage || '').trim().toLowerCase();
  if (!PIPELINE_STAGES.includes(stage)) {
    throw new Error(`--pipeline-stage must be one of: ${PIPELINE_STAGES.join(', ')}`);
  }
  return {
    ok: true,
    pipeline_stage: stage,
    hubspot_stage: PIPELINE_TO_HUBSPOT[stage],
    pipeline_next_action: defaultNextAction(stage),
  };
}

function defaultNextAction(pipelineStage) {
  switch (pipelineStage) {
    case 'ready':
      return 'send_first_touch_or_voice_demo';
    case 'sent':
      return 'wait_for_reply';
    case 'replied':
      return 'book_triage_call';
    case 'booked':
      return 'hold_call';
    case 'proposed':
      return 'send_stripe_invoice_human_only';
    case 'paid':
      return 'add_to_revenue_ledger';
    case 'lost':
      return 'no_action';
    default:
      return 'review';
  }
}

/**
 * Advance pipeline stage from call outcome (never jumps to paid).
 * Order: ready < sent < replied < booked < proposed < paid; lost is terminal.
 */
function suggestStageFromDecision(decision) {
  const current = decision.pipeline_stage || 'ready';
  const rank = Object.fromEntries(PIPELINE_STAGES.map((s, i) => [s, i]));
  let suggested = current;

  if (decision.offer && decision.offer.id === OFFERS.free.id) {
    // Free path: keep ready (or current if already further).
    suggested = current === 'ready' ? 'ready' : current;
  } else if (decision.next_agent === 'close' && decision.score >= 4 && decision.score <= 8) {
    // Paid diagnostic/sprint: call booked or at least replied.
    suggested = 'booked';
  } else if (decision.next_agent === 'human' || decision.score >= 9) {
    // Partner pilot / compliance handoff: proposal track, not paid.
    suggested = 'proposed';
  } else if (decision.score >= 4) {
    suggested = 'replied';
  }

  // Never regress (except lost stays lost).
  if (current === 'lost') return 'lost';
  if (rank[suggested] == null) suggested = current;
  if (rank[current] != null && rank[suggested] < rank[current] && current !== 'lost') {
    suggested = current;
  }
  // Hard rule: voice path never auto-selects paid.
  if (suggested === 'paid') suggested = 'proposed';
  return suggested;
}

function buildPipelineUpdateCommand(pipelinePath, update, date) {
  const script = path.join(__dirname, 'pipeline-update.js');
  const argv = [
    process.execPath,
    script,
    '--pipeline',
    pipelinePath,
    '--prospect',
    update.prospect,
    '--stage',
    update.stage,
    '--date',
    date,
    '--next-action',
    update.next_action,
    '--note',
    update.note,
  ];
  return {
    argv,
    shell: argv.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' '),
  };
}

function buildPipelineUpdateFromVoice(rawSignals, hubspotStage, opts) {
  opts = opts || {};
  const decision = decideTransfer(rawSignals);
  const advance = opts.advanceStage !== false;
  const currentStage = decision.pipeline_stage;
  const suggestedStage = advance ? suggestStageFromDecision(decision) : currentStage;

  let mapped;
  if (hubspotStage) {
    mapped = mapHubspotToPipeline(hubspotStage);
    if (!mapped.ok) return { ok: false, error: mapped.error, decision };
  } else {
    mapped = mapPipelineToHubspot(suggestedStage);
  }

  const stage = hubspotStage ? mapped.pipeline_stage : suggestedStage;
  const nextAction = defaultNextAction(stage);
  const hubspotStageOut = PIPELINE_TO_HUBSPOT[stage];

  return {
    ok: true,
    // Compatible with tools/pipeline-update.js CLI fields (operator runs update).
    pipeline_update: {
      prospect: decision.prospect_label || 'voice-caller',
      stage,
      previous_stage: currentStage,
      route: decision.offer.label,
      gross_potential_usd: decision.offer.gross_usd,
      next_action: nextAction,
      note: `voice_front_door agent=${decision.next_agent} score=${decision.score} offer=${decision.offer.id}`,
    },
    hubspot: {
      stage: hubspotStageOut,
      properties: {
        dealstage: hubspotStageOut,
        amount: decision.offer.gross_usd,
        pipeline: 'default',
        hermes_score: decision.score,
        hermes_offer_id: decision.offer.id,
        hermes_voice_agent: decision.next_agent,
      },
    },
    decision,
  };
}

/**
 * Dry-run or apply pipeline-update.js after a voice call.
 * Default: dry-run (prints command + payload). --apply writes via pipeline-update.js.
 */
function applyPipelineFromVoice(options) {
  const {
    rawSignals,
    pipelinePath,
    date,
    apply,
    allowPaid,
    hubspotStage,
  } = options;

  if (!pipelinePath) {
    throw new Error('--pipeline is required for apply-pipeline');
  }
  const touchDate = date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(touchDate)) {
    throw new Error('--date must be YYYY-MM-DD');
  }

  const built = buildPipelineUpdateFromVoice(rawSignals, hubspotStage, { advanceStage: true });
  if (!built.ok) return built;

  if (built.pipeline_update.stage === 'paid' && !allowPaid) {
    return {
      ok: false,
      error: 'refusing stage=paid without --allow-paid (and revenue ledger still required)',
      pipeline_update: built.pipeline_update,
      decision: built.decision,
      dry_run: !apply,
    };
  }

  const cmd = buildPipelineUpdateCommand(pipelinePath, built.pipeline_update, touchDate);
  const result = {
    ok: true,
    event: 'apply-pipeline',
    dry_run: !apply,
    pipeline_path: pipelinePath,
    pipeline_update: built.pipeline_update,
    hubspot: built.hubspot,
    decision: {
      next_agent: built.decision.next_agent,
      score: built.decision.score,
      offer: built.decision.offer,
    },
    command: cmd.shell,
    command_argv: cmd.argv,
    applied: false,
    revenue_note:
      'Pipeline stage is not revenue proof. Cleared Stripe + revenue ledger still required for paid.',
  };

  if (!apply) {
    return result;
  }

  // Execute pipeline-update.js as a child (same contract as operators).
  // eslint-disable-next-line global-require
  const { spawnSync } = require('child_process');
  const child = spawnSync(cmd.argv[0], cmd.argv.slice(1), {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
  });
  result.applied = child.status === 0;
  result.exit_code = child.status;
  result.stdout = (child.stdout || '').trim();
  result.stderr = (child.stderr || '').trim();
  if (child.status !== 0) {
    result.ok = false;
    result.error = result.stderr || `pipeline-update.js exited ${child.status}`;
  }
  return result;
}

function buildDemoAgentPack() {
  return {
    ok: true,
    product: 'SpaceXAI Voice Agent Builder',
    version: 'hermes-voice-front-door-v1',
    money_ladder: Object.values(OFFERS).map((o) => ({
      id: o.id,
      label: o.label,
      gross_usd: o.grossUsd,
      min_score: o.minScore,
      max_score: o.maxScore,
    })),
    transfer_policy: {
      preserve_conversation_context: true,
      edges: [
        { from: 'qualify', to: 'close', when: 'agent_stack+repeated_failure+business_cost AND score>=4' },
        { from: 'qualify', to: 'human', when: 'human_triggers OR score>=9' },
        { from: 'close', to: 'human', when: 'human_triggers OR score>=9 OR payment exception' },
        { from: 'close', to: 'qualify', when: 'discovery incomplete' },
      ],
      never: [
        'Voice agent sends Stripe without human_approved_payment',
        'Voice agent invents prices outside published ladder',
        'Voice agent marks HubSpot closed won without revenue ledger proof',
        'Hermes coding gateway re-routed through phone until Telegram reliability is green',
      ],
    },
    agents: Object.values(AGENTS).map((a) => ({
      id: a.id,
      role: a.role,
      purpose: a.purpose,
      voice_hint: a.voiceHint,
      system_prompt: buildAgentSystemPrompt(a.id),
      allowed_tools: a.allowedTools,
      denied_tools: a.deniedTools,
    })),
    mcp_contract: {
      required_connectors: ['HubSpot (or CRM write via custom MCP)'],
      optional_connectors: ['web_search', 'x_search'],
      hermes_async_boundary:
        'After the call, operator uses Hermes async (email/Telegram) + pipeline-update.js. Phone is front door only.',
      thumbgate_boundary:
        'ThumbGate memory/leash is not invoked mid-call in v1. Capture repeated false claims as lessons post-call.',
    },
    hubspot_pipeline_map: PIPELINE_STAGES.map((stage) => ({
      pipeline_stage: stage,
      hubspot_stage: PIPELINE_TO_HUBSPOT[stage],
      next_action: defaultNextAction(stage),
    })),
    demo_script_60s: [
      'Caller: Cursor keeps burning tokens on the same bad fix.',
      'Qualify: Which agents, what failed twice, what it cost, who owns budget?',
      'Transfer → Close (score 6–8): Offer $1,500 hardening sprint only; no custom discount.',
      'HubSpot: deal → meeting scheduled or proposal sent; note score + offer id.',
      'Human: Stripe link after verbal yes; paid only after ledger entry.',
    ],
  };
}

function buildAgentSystemPrompt(agentId) {
  const agent = AGENTS[agentId];
  const ladder = Object.values(OFFERS)
    .map((o) => `- ${o.label} (score ${o.minScore}-${o.maxScore})`)
    .join('\n');
  return [
    `You are the Hermes money-path voice agent "${agent.id}" (${agent.role}).`,
    agent.purpose,
    '',
    'Published offer ladder only — never invent prices or SLAs:',
    ladder,
    '',
    `Allowed tools: ${agent.allowedTools.join(', ')}`,
    `Denied tools: ${agent.deniedTools.join(', ')}`,
    '',
    'Transfer rules:',
    '- Preserve full conversation context on every transfer.',
    '- From qualify → close only after stack, repeated failure, and business cost are clear and score ≥ 4.',
    '- Transfer to human for compliance, custom pricing, partner pilot (score ≥ 9), anger, or payment exceptions.',
    '- Never send payment links unless you are human and human_approved_payment is true.',
    '- Hermes Mobile Leash IAP is a separate product; do not pitch $19/mo as a substitute for $499/$1500 work.',
    '',
    'Honesty: if there is no paid failure pattern, say the free repo is enough.',
  ].join('\n');
}

function receiptPath() {
  return path.join(os.homedir(), '.hermes', 'voice-front-door', 'receipts.jsonl');
}

function writeReceipt(payload) {
  const dir = path.dirname(receiptPath());
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const safe = {
    ts: new Date().toISOString(),
    event: payload.event || 'receipt',
    next_agent: payload.next_agent || null,
    transfer: payload.transfer ?? null,
    score: payload.score ?? null,
    offer_id: payload.offer && payload.offer.id ? payload.offer.id : null,
    gross_usd: payload.offer && payload.offer.gross_usd != null ? payload.offer.gross_usd : null,
    human_triggers: payload.human_triggers || [],
    reasons: payload.reasons || [],
    pipeline_stage: payload.pipeline_stage || null,
    // Never persist raw utterance — length only for audit density.
    utterance_len: typeof payload._utterance_len === 'number' ? payload._utterance_len : 0,
  };
  fs.appendFileSync(receiptPath(), `${JSON.stringify(safe)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(receiptPath(), 0o600);
  } catch (_) {
    /* best effort */
  }
  return receiptPath();
}

function parseSignalsArg(args) {
  if (!args.signalsJson) return null;
  try {
    return JSON.parse(args.signalsJson);
  } catch (err) {
    throw new Error(`--signals-json is not valid JSON: ${err.message}`);
  }
}

function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.event) {
    return { exitCode: args.help ? 0 : 1, stdout: usage, stderr: args.help ? '' : 'Missing --event\n' };
  }

  const event = String(args.event).toLowerCase();
  let result;

  if (event === 'transfer' || event === 'receipt') {
    const raw = parseSignalsArg(args);
    if (!raw) throw new Error('--signals-json is required for transfer/receipt');
    result = decideTransfer(raw);
    result.event = event;
    result._utterance_len = String(raw.utterance || '').length;
    if (args.write) {
      result.receipt_path = writeReceipt(result);
    }
  } else if (event === 'tool-gate') {
    result = gateTool(args.agent, args.tool, parseSignalsArg(args));
  } else if (event === 'map-hubspot') {
    if (args.hubspotStage) result = mapHubspotToPipeline(args.hubspotStage);
    else if (args.pipelineStage) result = mapPipelineToHubspot(args.pipelineStage);
    else throw new Error('map-hubspot requires --hubspot-stage or --pipeline-stage');
  } else if (event === 'score') {
    const raw = parseSignalsArg(args);
    if (!raw) throw new Error('--signals-json is required for score');
    const signals = normalizeSignals(raw);
    const scored = scoreSignals(signals);
    result = {
      ok: true,
      score: scored.score,
      offer: routeOffer(scored.score),
      parts: scored.parts,
      discovery_complete: discoveryComplete(signals),
    };
  } else if (event === 'demo-pack') {
    result = buildDemoAgentPack();
  } else if (event === 'pipeline-from-voice') {
    const raw = parseSignalsArg(args);
    if (!raw) throw new Error('--signals-json is required');
    result = buildPipelineUpdateFromVoice(raw, args.hubspotStage, { advanceStage: true });
  } else if (event === 'apply-pipeline') {
    const raw = parseSignalsArg(args);
    if (!raw) throw new Error('--signals-json is required for apply-pipeline');
    result = applyPipelineFromVoice({
      rawSignals: raw,
      pipelinePath: args.pipeline,
      date: args.date,
      apply: args.apply,
      allowPaid: args.allowPaid,
      hubspotStage: args.hubspotStage,
    });
  } else {
    throw new Error(`Unknown event: ${args.event}`);
  }

  delete result._utterance_len;

  if (args.json) {
    return { exitCode: result.ok === false ? 2 : 0, stdout: `${JSON.stringify(result, null, 2)}\n`, stderr: '' };
  }

  // Human-readable summary
  const lines = [];
  if (result.event === 'transfer' || event === 'transfer' || event === 'receipt') {
    lines.push(`next_agent=${result.next_agent} transfer=${result.transfer} score=${result.score}`);
    lines.push(`offer=${result.offer.label}`);
    lines.push(`quote_allowed=${result.quote_allowed} payment_link_allowed=${result.payment_link_allowed}`);
    lines.push(`reasons=${(result.reasons || []).join('; ')}`);
    lines.push(`allowed_tools=${result.allowed_tools.join(', ')}`);
  } else if (event === 'demo-pack') {
    lines.push(`demo pack v=${result.version} agents=${result.agents.length}`);
    lines.push('Paste system prompts from --json into SpaceXAI Voice Agent Builder.');
  } else if (event === 'apply-pipeline') {
    lines.push(`dry_run=${result.dry_run} applied=${result.applied} stage=${result.pipeline_update && result.pipeline_update.stage}`);
    lines.push(`prospect=${result.pipeline_update && result.pipeline_update.prospect}`);
    lines.push(result.command || '');
    if (result.error) lines.push(`error=${result.error}`);
  } else {
    lines.push(JSON.stringify(result, null, 2));
  }
  return { exitCode: result.ok === false ? 2 : 0, stdout: `${lines.join('\n')}\n`, stderr: '' };
}

function main() {
  try {
    const out = run(process.argv.slice(2));
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr);
    process.exit(out.exitCode);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  PIPELINE_STAGES,
  OFFERS,
  HUBSPOT_TO_PIPELINE,
  PIPELINE_TO_HUBSPOT,
  AGENTS,
  HUMAN_TRIGGERS,
  parseArgs,
  normalizeSignals,
  scoreSignals,
  routeOffer,
  detectHumanTriggers,
  discoveryComplete,
  decideTransfer,
  canQuoteOffer,
  canSendPaymentLink,
  gateTool,
  mapHubspotToPipeline,
  mapPipelineToHubspot,
  defaultNextAction,
  suggestStageFromDecision,
  buildPipelineUpdateCommand,
  buildPipelineUpdateFromVoice,
  applyPipelineFromVoice,
  buildDemoAgentPack,
  buildAgentSystemPrompt,
  writeReceipt,
  run,
};

if (require.main === module) {
  main();
}
