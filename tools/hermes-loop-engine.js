#!/usr/bin/env node
'use strict';

/**
 * Hermes Loop Engine
 *
 * A small task-graph kernel for Hermes:
 * observe -> choose one ready task -> execute one bounded action -> verify ->
 * append evidence -> schedule the next event.
 *
 * This intentionally stays boring: JSON in, ranked JSON out, no network calls,
 * no hidden side effects unless --state-file is explicitly provided.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.hermes', 'loop-state.json');

const RESPONSIBILITY_REGISTRY = [
  {
    key: 'revenue-orchestrator',
    label: 'Hermes Revenue Orchestrator',
    owns: ['buyer_signal', 'qualification', 'followup', 'checkout_scope', 'delivery_packaging'],
    forbidden: ['modify_client_code', 'merge_pr', 'deploy_production', 'set_price_without_policy'],
    verifier: 'external_truth_required',
  },
  {
    key: 'codex-fulfillment-worker',
    label: 'Codex Technical Fulfillment Worker',
    owns: ['repo_exploration', 'failure_reproduction', 'tests', 'patches', 'technical_report'],
    forbidden: ['contact_customer', 'send_checkout', 'access_stripe', 'broaden_scope'],
    verifier: 'tests_or_trace_evidence',
  },
  {
    key: 'thumbgate-boundary',
    label: 'ThumbGate Side-Effect Boundary',
    owns: ['approvals', 'denials', 'remembered_blocks', 'risk_feedback'],
    forbidden: ['reason_in_place_of_operator', 'approve_without_action_id'],
    verifier: 'signed_or_logged_decision',
  },
  {
    key: 'verifier',
    label: 'Verifier Truth Source',
    owns: ['ci_status', 'payment_truth', 'gateway_health', 'delivery_evidence'],
    forbidden: ['self_report_success_without_evidence'],
    verifier: 'command_or_provider_result',
  },
];

const LANE_PRIORITY = {
  paid_fulfillment: 100,
  buyer_reply: 90,
  assets_received: 84,
  payment_request: 78,
  warm_followup: 70,
  public_problem_reply: 62,
  buyer_signal_scan: 50,
  infrastructure: 25,
};

const EVENT_TO_LANE = {
  PAYMENT_SUCCEEDED: 'paid_fulfillment',
  CODEX_JOB_COMPLETED: 'paid_fulfillment',
  NEW_REPLY: 'buyer_reply',
  ASSETS_RECEIVED: 'assets_received',
  DELIVERY_DUE: 'paid_fulfillment',
  FOLLOWUP_DUE: 'warm_followup',
  NEW_BUYER_SIGNAL: 'buyer_signal_scan',
  THUMBGATE_BLOCKED: 'infrastructure',
  CI_FAILED: 'infrastructure',
  DAILY_RECONCILIATION: 'payment_request',
};

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultState() {
  return {
    version: 1,
    generated_at: nowIso(),
    offer: {
      key: 'ai_workflow_reliability_diagnostic',
      label: 'AI Automation Workflow Reliability Diagnostic',
      price_usd: 499,
    },
    responsibilities: clone(RESPONSIBILITY_REGISTRY),
    tasks: [
      {
        id: 'fulfill_paid_work',
        lane: 'paid_fulfillment',
        title: 'Fulfill paid diagnostic or repair work first',
        status: 'ready',
        owner: 'codex-fulfillment-worker',
        priority: 100,
        revenue_impact: 10,
        urgency: 10,
        confidence: 8,
        cost_risk: 2,
        retry_count: 0,
        retry_limit: 2,
        cost_cap_usd: 20,
        approval_required: false,
        next_action: 'Check paid-job queue, dispatch the oldest verified paid scope, and produce evidence.',
        verifier: {
          type: 'command',
          command: 'node tools/revenue-command-center.js --json',
        },
        evidence: [],
      },
      {
        id: 'answer_interested_buyer',
        lane: 'buyer_reply',
        title: 'Answer interested buyer with one useful scoped observation',
        status: 'ready',
        owner: 'revenue-orchestrator',
        priority: 90,
        revenue_impact: 9,
        urgency: 8,
        confidence: 7,
        cost_risk: 1,
        retry_count: 0,
        retry_limit: 3,
        cost_cap_usd: 2,
        approval_required: true,
        next_action: 'Draft one buyer-specific reply and request diagnostic assets only when offer fit is explicit.',
        verifier: {
          type: 'ledger',
          command: 'node tools/send-next.js',
        },
        evidence: [],
      },
      {
        id: 'request_assets_for_diagnostic',
        lane: 'assets_received',
        title: 'Convert supplied problem into diagnostic scope',
        status: 'ready',
        owner: 'revenue-orchestrator',
        priority: 82,
        revenue_impact: 8,
        urgency: 7,
        confidence: 8,
        cost_risk: 1,
        retry_count: 0,
        retry_limit: 2,
        cost_cap_usd: 2,
        approval_required: true,
        next_action: 'Ask for logs, repo/error trace, observed behavior, and expected behavior.',
        verifier: {
          type: 'artifact',
          command: 'node tools/payment-request-execution-packet.js --help',
        },
        evidence: [],
      },
      {
        id: 'send_matched_payment_request',
        lane: 'payment_request',
        title: 'Send correctly scoped $499 payment ask',
        status: 'blocked',
        blocker: 'requires qualified conversation and exact scope evidence',
        owner: 'revenue-orchestrator',
        priority: 76,
        revenue_impact: 10,
        urgency: 7,
        confidence: 6,
        cost_risk: 2,
        retry_count: 0,
        retry_limit: 1,
        cost_cap_usd: 0,
        approval_required: true,
        next_action: 'Create payment request only after scope and offer fit are proven.',
        verifier: {
          type: 'provider_truth',
          command: 'node tools/payment-readiness.js',
        },
        evidence: [],
      },
      {
        id: 'repair_active_operator_blocker',
        lane: 'infrastructure',
        title: 'Repair only reproducible blocker that prevents revenue loop',
        status: 'ready',
        owner: 'verifier',
        priority: 35,
        revenue_impact: 4,
        urgency: 6,
        confidence: 7,
        cost_risk: 3,
        retry_count: 0,
        retry_limit: 1,
        cost_cap_usd: 0,
        approval_required: false,
        next_action: 'Run gateway/Telegram/productivity audit and repair the highest-severity reproducible blocker.',
        verifier: {
          type: 'command',
          command: 'node tools/hermes-decision-loop.js --json',
        },
        evidence: [],
      },
    ],
    events: [],
  };
}

function loadState(filePath = DEFAULT_STATE_PATH) {
  if (!fs.existsSync(filePath)) return defaultState();
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveState(state, filePath = DEFAULT_STATE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function dependenciesSatisfied(task, tasks) {
  const deps = task.depends_on || task.dependencies || [];
  return deps.every((id) => tasks.find((candidate) => candidate.id === id)?.status === 'done');
}

function isReady(task, tasks) {
  return task.status === 'ready'
    && dependenciesSatisfied(task, tasks)
    && Number(task.retry_count || 0) <= Number(task.retry_limit ?? 3);
}

function scoreTask(task, context = {}) {
  const lane = LANE_PRIORITY[task.lane] ?? 10;
  const eventBoost = context.eventType && EVENT_TO_LANE[context.eventType] === task.lane ? 20 : 0;
  const paidBoost = task.lane === 'paid_fulfillment' && context.paidCustomerWaiting ? 35 : 0;
  const buyerBoost = task.lane === 'buyer_reply' && context.interestedBuyerWaiting ? 25 : 0;
  const blockerPenalty = task.status === 'blocked' ? 100 : 0;
  const retryPenalty = Number(task.retry_count || 0) * 8;
  const costPenalty = Number(task.cost_risk || 0) * 3;
  const infraPenalty = task.lane === 'infrastructure' && !context.reproducibleBlocker ? 18 : 0;
  return lane
    + Number(task.priority || 0)
    + Number(task.revenue_impact || 0) * 5
    + Number(task.urgency || 0) * 3
    + Number(task.confidence || 0) * 2
    + eventBoost
    + paidBoost
    + buyerBoost
    - blockerPenalty
    - retryPenalty
    - costPenalty
    - infraPenalty;
}

function rankedTasks(state, context = {}) {
  return clone(state.tasks || [])
    .map((task) => ({
      ...task,
      ready: isReady(task, state.tasks || []),
      score: scoreTask(task, context),
    }))
    .filter((task) => task.ready)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function executableActions(state, context = {}, limit = 5) {
  return rankedTasks(state, context).slice(0, limit).map((task) => ({
    task_id: task.id,
    lane: task.lane,
    owner: task.owner,
    score: task.score,
    action: task.next_action,
    approval_required: Boolean(task.approval_required),
    verifier: task.verifier,
    cost_cap_usd: task.cost_cap_usd ?? 0,
  }));
}

function nextAction(state, context = {}) {
  const actions = executableActions(state, context, 5);
  return {
    checked_at: nowIso(),
    event_type: context.eventType || null,
    selected: actions[0] || null,
    actions,
    stop_reason: actions.length ? null : 'no_ready_tasks',
  };
}

function appendEvent(state, event) {
  const next = clone(state);
  next.events = next.events || [];
  next.events.push({
    id: event.id || `evt_${Date.now()}`,
    type: event.type,
    task_id: event.task_id || event.taskId || null,
    ts: event.ts || nowIso(),
    evidence: event.evidence || null,
    result: event.result || null,
  });
  const taskId = event.task_id || event.taskId;
  const task = next.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return next;
  if (event.type === 'VERIFY_PASS') {
    task.status = 'done';
    task.completed_at = event.ts || nowIso();
    task.evidence = task.evidence || [];
    task.evidence.push(event.evidence || 'verification_passed');
  } else if (event.type === 'VERIFY_FAIL') {
    task.retry_count = Number(task.retry_count || 0) + 1;
    task.status = task.retry_count > Number(task.retry_limit ?? 3) ? 'blocked' : 'ready';
    task.blocker = event.evidence || 'verification_failed';
  } else if (event.type === 'BLOCK') {
    task.status = 'blocked';
    task.blocker = event.evidence || 'blocked';
  } else if (event.type === 'UNBLOCK') {
    task.status = 'ready';
    delete task.blocker;
  } else if (event.type === 'CLAIM') {
    task.status = 'in_progress';
    task.owner = event.owner || task.owner;
  }
  return next;
}

function validateState(state) {
  const findings = [];
  const ids = new Set();
  for (const task of state.tasks || []) {
    if (!task.id) findings.push({ severity: 'critical', task_id: null, title: 'Task missing id' });
    if (ids.has(task.id)) findings.push({ severity: 'critical', task_id: task.id, title: 'Duplicate task id' });
    ids.add(task.id);
    if (!task.owner) findings.push({ severity: 'high', task_id: task.id, title: 'Task missing owner' });
    if (!task.verifier?.type) findings.push({ severity: 'high', task_id: task.id, title: 'Task missing verifier type' });
    if (!task.next_action) findings.push({ severity: 'medium', task_id: task.id, title: 'Task missing next_action' });
    for (const dep of task.depends_on || task.dependencies || []) {
      if (!ids.has(dep) && !(state.tasks || []).some((candidate) => candidate.id === dep)) {
        findings.push({ severity: 'high', task_id: task.id, title: `Missing dependency ${dep}` });
      }
    }
  }
  return {
    ok: !findings.some((finding) => finding.severity === 'critical' || finding.severity === 'high'),
    findings,
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (key === 'json') {
      args.json = true;
      continue;
    }
    if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = argv[index + 1];
    index += 1;
  }
  return args;
}

function print(value, json = false) {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (value.selected !== undefined) {
    if (!value.selected) {
      console.log(`No ready tasks: ${value.stop_reason}`);
      return;
    }
    console.log(`${value.selected.score} ${value.selected.task_id}: ${value.selected.action}`);
    console.log(`Verifier: ${value.selected.verifier?.command || value.selected.verifier?.type}`);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function loadCliState(args) {
  if (args.file) return JSON.parse(fs.readFileSync(args.file, 'utf8'));
  if (args.stateFile) return loadState(args.stateFile);
  return defaultState();
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0] || 'next';
  if (command === 'init') {
    const state = defaultState();
    if (args.out || args.stateFile) saveState(state, args.out || args.stateFile);
    print(state, args.json);
    return state;
  }
  const state = loadCliState(args);
  const context = {
    eventType: args.event || args.eventType,
    paidCustomerWaiting: args.paidCustomerWaiting === 'true' || args.paid === true,
    interestedBuyerWaiting: args.interestedBuyerWaiting === 'true' || args.buyer === true,
    reproducibleBlocker: args.reproducibleBlocker === 'true' || args.blocker === true,
  };
  if (command === 'next') {
    const result = nextAction(state, context);
    print(result, args.json);
    return result;
  }
  if (command === 'ready') {
    const result = executableActions(state, context, Number(args.limit || 5));
    print(result, args.json);
    return result;
  }
  if (command === 'validate') {
    const result = validateState(state);
    print(result, args.json);
    if (!result.ok) process.exitCode = 1;
    return result;
  }
  if (command === 'event') {
    const next = appendEvent(state, {
      type: args.type,
      task_id: args.task || args.taskId,
      evidence: args.evidence,
      result: args.result,
      owner: args.owner,
    });
    if (args.stateFile || args.out) saveState(next, args.out || args.stateFile);
    print(next, args.json);
    return next;
  }
  throw new Error(`Unknown command: ${command}`);
}

module.exports = {
  DEFAULT_STATE_PATH,
  EVENT_TO_LANE,
  LANE_PRIORITY,
  RESPONSIBILITY_REGISTRY,
  appendEvent,
  defaultState,
  executableActions,
  isReady,
  nextAction,
  parseArgs,
  rankedTasks,
  saveState,
  scoreTask,
  validateState,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
