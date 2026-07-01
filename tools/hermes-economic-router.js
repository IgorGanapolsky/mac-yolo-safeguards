#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RECEIPT_PATH = path.join(os.homedir(), '.hermes/economic-router-receipts.jsonl');

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

const ROUTES = [
  {
    id: 'local_fast',
    label: 'Local fast Hermes route',
    agent: 'local-executor',
    provider: 'custom:ollama-local-64k',
    model: 'qwen2.5:3b-64k',
    costUsd: 0,
    latencyMs: 5000,
    reliability: 0.82,
    riskCeiling: 'medium',
    strengths: ['routine', 'smoke', 'small-code', 'local', 'no-spend'],
    commandEnv: {
      HERMES_YOLO_PROVIDER: 'custom:ollama-local-64k',
      HERMES_YOLO_MODEL: 'qwen2.5:3b-64k',
    },
    proofGates: ['exact-marker-smoke', 'local-provider-config-present'],
  },
  {
    id: 'local_coder_candidate',
    label: 'Measured local coding candidate',
    agent: 'coding-specialist',
    provider: 'custom:ollama-local-64k',
    model: 'ornith-or-local-coder-candidate',
    costUsd: 0,
    latencyMs: 18000,
    reliability: 0.58,
    riskCeiling: 'medium',
    strengths: ['ornith', 'coding-model', 'benchmark', 'local', 'candidate'],
    commandEnv: {
      HERMES_YOLO_PROVIDER: 'custom:ollama-local-64k',
      HERMES_YOLO_MODEL: 'ornith-or-local-coder-candidate',
    },
    proofGates: ['benchmark-before-default', 'exact-marker-smoke', 'unit-test-pass'],
    candidateOnly: true,
  },
  {
    id: 'glm52_reasoning',
    label: 'GLM 5.2 reasoning route',
    agent: 'reasoning-specialist',
    provider: 'custom:zai-coding-glm',
    fallbackProvider: 'custom:openrouter-glm52',
    model: 'glm-5.2',
    costUsd: 0.035,
    latencyMs: 15000,
    reliability: 0.76,
    riskCeiling: 'critical',
    strengths: ['glm', 'glm-5.2', 'architecture', 'debugging', 'cross-file', 'are-you-sure', 'planning'],
    commandEnv: {
      HERMES_YOLO_PROVIDER: 'custom:zai-coding-glm',
      HERMES_YOLO_MODEL: 'glm-5.2',
    },
    proofGates: ['provider-key-present', 'endpoint-smoke-pass', 'receipt-written'],
  },
  {
    id: 'fugu_escalation',
    label: 'Sakana Fugu Ultra escalation',
    agent: 'multi-agent-escalation',
    provider: 'openrouter',
    model: 'sakana/fugu-ultra',
    costUsd: 0.25,
    latencyMs: 45000,
    reliability: 0.64,
    riskCeiling: 'critical',
    strengths: ['fugu', 'multi-agent', 'escalation', 'research', 'hard-review'],
    commandEnv: {
      HERMES_OPENROUTER_MODEL: 'sakana/fugu-ultra',
    },
    proofGates: ['explicit-approval', 'cost-cap', 'provider-smoke-pass', 'receipt-written'],
    requiresApproval: true,
  },
  {
    id: 'mobile_e2e_gate',
    label: 'Hermes Mobile E2E verifier',
    agent: 'verifier',
    provider: 'local-tools',
    model: 'maestro+junit',
    costUsd: 0,
    latencyMs: 120000,
    reliability: 0.72,
    riskCeiling: 'critical',
    strengths: ['mobile', 'e2e', 'maestro', 'release', 'real-user', 'verification'],
    command: 'cd hermes-mobile && npm test && npm run e2e:continuous:once',
    proofGates: ['plan-file-ownership', 'unit-tests-pass', 'latest-json-e2e-pass'],
  },
];

function usage() {
  return `Usage:
  node tools/hermes-economic-router.js --task TEXT [--risk low|medium|high|critical] [--max-cost-usd N] [--latency-ms N] [--paid-ok] [--execute-plan] [--write] [--json]

Routes Hermes work through a multi-agent economic pipeline. It emits receipts
and budget gates; it does not call paid providers by itself.

Use --execute-plan to emit a dry-run execution plan with bounded steps, caps,
and blocked approval surfaces. It still performs no provider calls.`;
}

function parseArgs(argv) {
  const args = {
    task: '',
    risk: 'medium',
    maxCostUsd: 0,
    latencyMs: 30000,
    paidOk: false,
    executePlan: false,
    write: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--task') args.task = requireValue(argv, ++i, arg);
    else if (arg === '--risk') args.risk = normalizeRisk(requireValue(argv, ++i, arg));
    else if (arg === '--max-cost-usd') args.maxCostUsd = parseNonNegativeNumber(requireValue(argv, ++i, arg), arg);
    else if (arg === '--latency-ms') args.latencyMs = parseNonNegativeNumber(requireValue(argv, ++i, arg), arg);
    else if (arg === '--paid-ok') args.paidOk = true;
    else if (arg === '--execute-plan') args.executePlan = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.task.trim()) throw new Error('--task is required');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseNonNegativeNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number`);
  return parsed;
}

function normalizeRisk(risk) {
  const value = String(risk || '').toLowerCase();
  if (!RISK_LEVELS.includes(value)) throw new Error(`Unsupported risk: ${risk}`);
  return value;
}

function riskValue(risk) {
  return RISK_LEVELS.indexOf(normalizeRisk(risk));
}

function taskSignals(task) {
  const text = String(task || '').toLowerCase();
  return {
    asksForGlm: /\bglm\b|glm[- ]?5\.?2|z\.?ai|zai/.test(text),
    asksForFugu: /\bfugu\b|sakana/.test(text),
    asksForOrnith: /\bornith\b|coding model|open[- ]source coding/.test(text),
    mobile: /\bmobile\b|android|ios|maestro|release|fresh user|phone/.test(text),
    userDoubt: /are you sure|verify|proof|evidence|regression|root cause/.test(text),
    architecture: /architecture|cross[- ]file|multi[- ]agent|pipeline|router|design|strategy/.test(text),
    exactContract: /exact answer|strict format|output contract|json schema|answer:\s*[a-z0-9]|sentinel|marker|multiple[- ]choice/.test(text),
    highVarianceReasoning: /hidden[- ]test|livecodebench|gpqa|hle|formal reasoning|hard reasoning|reasoning variance|quorum|synthesis/.test(text),
    paidOrExternal: /payment|wallet|stablecoin|on[- ]chain|post|send|publish|charge|stripe/.test(text),
    routine: /smoke|small|quick|lint|unit test|local/.test(text),
  };
}

function routeAllowed(route, args) {
  const reasons = [];
  if (route.costUsd > 0 && !args.paidOk) reasons.push('paid route requires --paid-ok');
  if (route.costUsd > args.maxCostUsd) reasons.push(`estimated cost ${route.costUsd} exceeds cap ${args.maxCostUsd}`);
  if (route.latencyMs > args.latencyMs) reasons.push(`estimated latency ${route.latencyMs}ms exceeds cap ${args.latencyMs}ms`);
  if (riskValue(args.risk) > riskValue(route.riskCeiling)) reasons.push(`risk ${args.risk} exceeds route ceiling ${route.riskCeiling}`);
  return { allowed: reasons.length === 0, reasons };
}

function scoreRoute(route, args, signals) {
  let score = route.reliability * 100;
  score -= route.costUsd * 120;
  score -= Math.min(25, route.latencyMs / 5000);

  if (route.id === 'local_fast') {
    if (signals.routine) score += 25;
    if (args.maxCostUsd === 0) score += 18;
    if (riskValue(args.risk) <= riskValue('medium')) score += 12;
  }
  if (route.id === 'glm52_reasoning') {
    if (signals.asksForGlm) score += 45;
    if (signals.userDoubt || signals.architecture) score += 22;
    if (riskValue(args.risk) >= riskValue('high')) score += 18;
  }
  if (route.id === 'fugu_escalation') {
    if (signals.asksForFugu) score += 90;
    if (signals.architecture && riskValue(args.risk) === riskValue('critical')) score += 20;
  }
  if (route.id === 'local_coder_candidate') {
    if (signals.asksForOrnith) score += 80;
    if (!signals.asksForOrnith) score -= 15;
    if (route.candidateOnly) score -= 12;
  }
  if (route.id === 'mobile_e2e_gate') {
    if (signals.mobile) score += 55;
    if (!signals.mobile) score -= 30;
  }
  return Number(score.toFixed(2));
}

function buildPipeline(selected, args, signals) {
  const stages = [
    {
      id: 'intake-router',
      agent: 'router',
      action: 'Classify risk, budget, latency, and approval requirements.',
      gate: 'task-has-explicit-objective',
    },
    {
      id: 'specialist',
      agent: selected.agent,
      action: `Use ${selected.provider}/${selected.model} for the bounded task.`,
      gate: selected.proofGates[0],
    },
    {
      id: 'verifier',
      agent: signals.mobile ? 'mobile-verifier' : 'evidence-verifier',
      action: signals.mobile ? 'Run mobile release/E2E proof gates.' : 'Run focused tests or exact-marker smoke.',
      gate: signals.mobile ? 'latest-json-e2e-pass' : 'test-or-smoke-pass',
    },
    {
      id: 'treasurer',
      agent: 'budget-ledger',
      action: 'Write route receipt with cost, latency, fallback, and proof evidence.',
      gate: 'receipt-emitted',
    },
  ];
  if (signals.paidOrExternal || selected.requiresApproval) {
    stages.splice(1, 0, {
      id: 'approval-gate',
      agent: 'human-approval',
      action: 'Block external spend, wallet/payment, send, post, publish, or paid escalation until approved.',
      gate: 'explicit-approval-present',
    });
  }
  return stages;
}

function compactRoute(route, role = route.agent) {
  return {
    id: route.id,
    role,
    provider: route.provider,
    fallbackProvider: route.fallbackProvider || '',
    model: route.model,
    estimatedCostUsd: route.costUsd,
    estimatedLatencyMs: route.latencyMs,
    proofGates: route.proofGates,
  };
}

function allowedRoute(evaluated, id) {
  return evaluated.find((item) => item.route.id === id && item.allowed)?.route || null;
}

function firstAllowed(evaluated, ids) {
  for (const id of ids) {
    const route = allowedRoute(evaluated, id);
    if (route) return route;
  }
  return null;
}

function buildMicroAgentRecipe(selected, args, signals, evaluated) {
  const localFast = allowedRoute(evaluated, 'local_fast') || ROUTES.find((route) => route.id === 'local_fast');
  const glm52 = allowedRoute(evaluated, 'glm52_reasoning');
  const coderCandidate = allowedRoute(evaluated, 'local_coder_candidate');
  const fugu = allowedRoute(evaluated, 'fugu_escalation');
  const primaryReasoner = firstAllowed(evaluated, ['glm52_reasoning', 'local_fast']) || selected;

  const base = {
    schema: 'hermes-micro-agent-recipe/v1',
    modelAlias: 'hermes/auto',
    selectedBy: 'hermes-economic-router',
    hardCaps: {
      maxCostUsd: args.maxCostUsd,
      maxLatencyMs: args.latencyMs,
      paidOk: args.paidOk,
      maxConcurrent: 1,
      maxSteps: 3,
    },
    outputContract: {
      preserveClientSurface: true,
      responseShape: 'normal Hermes response plus private receipt trace',
      receiptRequired: true,
      preserveExactAnswer: false,
    },
    traceLabels: ['hermes-auto', selected.id, args.risk],
    failurePolicy: {
      partialFailure: 'return best valid evidence or fallback route, never hide missing proof',
      timeout: 'stop at cap and write skipped/failed receipt',
      budgetExceeded: 'do not escalate',
    },
  };

  if (signals.mobile) {
    return {
      ...base,
      id: 'mobile_release_workflow',
      pattern: 'workflow',
      reason: 'Mobile/release work needs planner, verifier, runtime lock, and latest-json proof rather than model fan-out.',
      hardCaps: {
        ...base.hardCaps,
        maxConcurrent: 1,
        maxSteps: 5,
      },
      roles: [
        { id: 'planner', route: compactRoute(localFast, 'planner'), gate: 'plan-file-ownership' },
        { id: 'unit-verifier', route: compactRoute(selected, 'unit-verifier'), gate: 'unit-tests-pass' },
        { id: 'device-verifier', route: compactRoute(selected, 'device-verifier'), gate: 'hermes-mobile-runtime-lock-held' },
        { id: 'finalizer', route: compactRoute(localFast, 'finalizer'), gate: 'latest-json-proof-read' },
      ],
      runtimeGuards: ['hermes-mobile-runtime lock', 'load ceiling', 'swap ceiling', 'simruntime ceiling'],
    };
  }

  if (signals.paidOrExternal) {
    return {
      ...base,
      id: 'approval_first_workflow',
      pattern: 'workflow',
      reason: 'External money/send/publish surfaces require approval before any model escalation or side effect.',
      roles: [
        { id: 'classifier', route: compactRoute(localFast, 'classifier'), gate: 'external-surface-detected' },
        { id: 'approval-boundary', route: compactRoute(selected, 'approval-boundary'), gate: 'explicit-approval-present' },
        { id: 'finalizer', route: compactRoute(primaryReasoner, 'finalizer'), gate: 'approval-decision-recorded' },
      ],
      failurePolicy: {
        ...base.failurePolicy,
        approvalMissing: 'return blocked receipt only',
      },
    };
  }

  if (signals.asksForOrnith && coderCandidate) {
    return {
      ...base,
      id: 'coding_candidate_ratings',
      pattern: 'ratings',
      reason: 'New coding models should compete under a hard cap before becoming defaults.',
      hardCaps: {
        ...base.hardCaps,
        maxConcurrent: 2,
        maxSteps: 2,
      },
      candidates: [
        compactRoute(localFast, 'baseline'),
        compactRoute(coderCandidate, 'candidate'),
      ],
      aggregation: {
        method: 'benchmark-and-proof-weighted',
        promoteOnlyIf: ['unit-test-pass', 'benchmark-before-default', 'receipt-written'],
      },
    };
  }

  if (signals.asksForFugu && fugu) {
    return {
      ...base,
      id: 'rare_research_fusion',
      pattern: 'fusion',
      reason: 'Fugu/Sakana-style work is rare, paid, and useful only when disagreement is evidence.',
      hardCaps: {
        ...base.hardCaps,
        maxConcurrent: 2,
        maxSteps: 3,
      },
      panel: [
        compactRoute(primaryReasoner, 'reasoner'),
        compactRoute(fugu, 'multi-agent-escalation'),
      ],
      judge: compactRoute(primaryReasoner, 'judge'),
      finalizer: compactRoute(localFast, 'contract-finalizer'),
    };
  }

  if ((signals.exactContract || signals.highVarianceReasoning) && glm52) {
    return {
      ...base,
      id: 'strict_contract_remom',
      pattern: 'remom',
      reason: 'High-variance or exact-format work needs multiple bounded attempts, quorum, synthesis, and a fallback that preserves the output contract.',
      hardCaps: {
        ...base.hardCaps,
        maxConcurrent: 2,
        maxSteps: 4,
      },
      breadth: {
        minSuccessfulResponses: 2,
        attempts: [
          compactRoute(localFast, 'cheap-evidence-sample'),
          compactRoute(glm52, 'deep-evidence-sample'),
        ],
      },
      synthesis: {
        route: compactRoute(glm52, 'synthesizer'),
        contractRepair: true,
        preserveExactAnswer: true,
      },
      quorum: {
        minSuccessfulResponses: 2,
        acceptBestValidEvidenceWhenSynthesisFails: true,
      },
      outputContract: {
        ...base.outputContract,
        preserveExactAnswer: true,
      },
      fallback: {
        route: compactRoute(localFast, 'best-valid-evidence'),
        condition: 'synthesis-timeout-or-contract-repair-failed',
      },
    };
  }

  if ((signals.userDoubt || signals.architecture) && glm52) {
    return {
      ...base,
      id: 'architecture_fusion',
      pattern: 'fusion',
      reason: 'Architecture and "are you sure?" tasks benefit from explicit disagreement review, not blind escalation.',
      hardCaps: {
        ...base.hardCaps,
        maxConcurrent: 2,
        maxSteps: 3,
      },
      panel: [
        compactRoute(localFast, 'cheap-first-pass'),
        compactRoute(glm52, 'deep-reviewer'),
      ],
      judge: compactRoute(glm52, 'judge'),
      finalizer: compactRoute(localFast, 'contract-finalizer'),
      disagreementPolicy: 'surface contradictions as evidence before final answer',
    };
  }

  return {
    ...base,
    id: 'local_confidence_escalation',
    pattern: 'confidence',
    reason: 'Routine work should stop on cheap local proof and escalate only when confidence/proof is insufficient.',
    sequence: [
      compactRoute(localFast, 'cheap-candidate'),
      ...(glm52 ? [compactRoute(glm52, 'paid-escalation-candidate')] : []),
    ],
    stopPolicy: {
      passSignals: ['exact-marker-smoke', 'focused-test-pass', 'low-risk-local-task'],
      escalateSignals: ['missing-proof', 'contradiction', 'high-risk-user-doubt'],
    },
  };
}

function decision(args) {
  const normalizedArgs = {
    ...args,
    risk: normalizeRisk(args.risk || 'medium'),
    maxCostUsd: Number(args.maxCostUsd || 0),
    latencyMs: Number(args.latencyMs || 30000),
    paidOk: Boolean(args.paidOk),
  };
  const signals = taskSignals(normalizedArgs.task);
  const evaluated = ROUTES.map((route) => {
    const allowed = routeAllowed(route, normalizedArgs);
    return {
      route,
      allowed: allowed.allowed,
      rejectionReasons: allowed.reasons,
      score: allowed.allowed ? scoreRoute(route, normalizedArgs, signals) : -Infinity,
    };
  }).sort((a, b) => b.score - a.score || a.route.costUsd - b.route.costUsd || a.route.id.localeCompare(b.route.id));

  const winner = evaluated.find((item) => item.allowed) || evaluated.find((item) => item.route.id === 'local_fast');
  const selected = winner.route;
  const receipt = {
    schema: 'hermes-economic-router/receipt-v1',
    id: receiptId(normalizedArgs, selected),
    createdAt: new Date().toISOString(),
    task: normalizedArgs.task,
    risk: normalizedArgs.risk,
    budget: {
      maxCostUsd: normalizedArgs.maxCostUsd,
      latencyMs: normalizedArgs.latencyMs,
      paidOk: normalizedArgs.paidOk,
    },
    selectedRoute: publicRoute(selected),
    estimatedCostUsd: selected.costUsd,
    estimatedLatencyMs: selected.latencyMs,
    requiresApproval: Boolean(selected.requiresApproval || signals.paidOrExternal),
    approvalReason: signals.paidOrExternal
      ? 'task mentions external money/payment/wallet/send/publish surface'
      : selected.requiresApproval ? 'route requires explicit approval' : '',
    signals,
    microAgentRecipe: buildMicroAgentRecipe(selected, normalizedArgs, signals, evaluated),
    pipeline: buildPipeline(selected, normalizedArgs, signals),
    rejectedRoutes: evaluated
      .filter((item) => item.route.id !== selected.id)
      .map((item) => ({
        id: item.route.id,
        label: item.route.label,
        score: Number.isFinite(item.score) ? item.score : null,
        reasons: item.rejectionReasons,
      })),
    policy: {
      defaultRule: 'Use local qwen2.5 for routine low/medium-risk work; use GLM 5.2 only when risk, ROI, and budget justify paid reasoning.',
      autoRecipeRule: 'Expose one hermes/auto model alias while the router selects bounded confidence, ratings, ReMoM, fusion, or workflow recipes.',
      ornithRule: 'Treat Ornith and other new coding models as measured candidates until benchmark receipts promote them.',
      paymentRule: 'Never execute wallet, stablecoin, Stripe, send, post, or publish actions from this router; emit an approval gate only.',
    },
  };
  return receipt;
}

function publicRoute(route) {
  return {
    id: route.id,
    label: route.label,
    agent: route.agent,
    provider: route.provider,
    fallbackProvider: route.fallbackProvider || '',
    model: route.model,
    command: route.command || '',
    commandEnv: route.commandEnv || {},
    proofGates: route.proofGates,
    candidateOnly: Boolean(route.candidateOnly),
  };
}

function receiptId(args, route) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({
    task: args.task,
    risk: args.risk,
    maxCostUsd: args.maxCostUsd,
    latencyMs: args.latencyMs,
    paidOk: args.paidOk,
    route: route.id,
  }));
  return `hermes-route-${hash.digest('hex').slice(0, 16)}`;
}

function writeReceipt(receipt, target = RECEIPT_PATH) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.appendFileSync(target, `${JSON.stringify(receipt)}\n`);
  return target;
}

function render(receipt) {
  const lines = [
    '# Hermes Economic Router',
    '',
    `Task: ${receipt.task}`,
    `Risk: ${receipt.risk}`,
    `Selected: ${receipt.selectedRoute.id} (${receipt.selectedRoute.provider}/${receipt.selectedRoute.model})`,
    `Estimated cost: $${receipt.estimatedCostUsd}`,
    `Estimated latency: ${receipt.estimatedLatencyMs}ms`,
    `Approval required: ${receipt.requiresApproval ? 'yes' : 'no'}`,
    `Micro-agent recipe: ${receipt.microAgentRecipe.id} (${receipt.microAgentRecipe.pattern})`,
    '',
    'Pipeline:',
    ...receipt.pipeline.map((stage, index) => `${index + 1}. ${stage.id} -> ${stage.agent} (${stage.gate})`),
    '',
    'Rejected routes:',
    ...receipt.rejectedRoutes.map((route) => `- ${route.id}: ${route.reasons.length ? route.reasons.join('; ') : `score ${route.score}`}`),
  ];
  return lines.join('\n');
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const receipt = decision(args);
    if (args.write) {
      receipt.receiptPath = writeReceipt(receipt);
    }
    console.log(args.json ? JSON.stringify(receipt, null, 2) : render(receipt));
  } catch (error) {
    console.error(`hermes-economic-router: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  RECEIPT_PATH,
  ROUTES,
  buildPipeline,
  decision,
  parseArgs,
  receiptId,
  render,
  routeAllowed,
  scoreRoute,
  taskSignals,
  writeReceipt,
};

if (require.main === module) {
  main();
}
