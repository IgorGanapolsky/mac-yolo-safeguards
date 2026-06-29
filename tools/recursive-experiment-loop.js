#!/usr/bin/env node
'use strict';

/**
 * Recursive experiment loop evaluator
 *
 * Converts public automated-research patterns into a local Hermes gate:
 * propose -> implement -> experiment -> validate -> learn -> choose next.
 *
 * This tool does not run external mutations. It ranks bounded experiments and
 * rejects loops that lack metrics, provenance, reward-hack checks, or variance
 * checks.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_LEDGER = path.join(os.homedir(), '.hermes', 'recursive-experiment-ledger.jsonl');

const RECURSIVE_PUBLIC_PATTERNS = [
  {
    key: 'closed-research-loop',
    label: 'Closed research loop',
    requirement: 'proposal, implementation, experiment, validation, and learned context must all be explicit',
    weight: 5,
  },
  {
    key: 'many-bounded-threads',
    label: 'Many bounded research threads',
    requirement: 'parallel ideas are allowed only when each thread has a budget and stop condition',
    weight: 3,
  },
  {
    key: 'context-retention',
    label: 'Context retention',
    requirement: 'useful lessons from prior experiments must be written into a resumable state artifact',
    weight: 4,
  },
  {
    key: 'branch-combination',
    label: 'Branch combination',
    requirement: 'promising branches need an explicit combine test before being adopted together',
    weight: 3,
  },
  {
    key: 'reward-hack-validation',
    label: 'Reward-hack validation',
    requirement: 'metrics must be audited for shortcuts that improve the score without improving the system',
    weight: 5,
  },
  {
    key: 'variance-validation',
    label: 'Variance validation',
    requirement: 'results need repeat runs, seed spread, or before/after windows when the metric is noisy',
    weight: 4,
  },
  {
    key: 'tight-feedback-benchmark',
    label: 'Tight feedback benchmark',
    requirement: 'prefer experiments with cheap, clear, repeatable evaluators',
    weight: 4,
  },
];

const DEFAULT_EXPERIMENTS = [
  {
    id: 'cross_agent_sync_packet',
    title: 'Keep every AI agent synchronized through source-backed sync packets',
    objective: 'Reduce agent divergence and stale-context edits across Codex, Claude, Cursor, Gemini, Hermes, and Obsidian AI Agent.',
    targetMetric: 'sync_packet_generated=true, redaction_tests_pass=true, active_locks_visible=true',
    implementation: 'Generate Markdown+JSON from plan.md, git status, E2E proof, LaunchAgent state, and source mtimes.',
    evaluator: 'node tests/test-agent-sync-brief.js && node tools/agent-sync-brief.js --no-write --stdout',
    existingArtifacts: ['tools/agent-sync-brief.js', 'tests/test-agent-sync-brief.js', 'docs/AGENT-SYNC-BRIEF.md'],
    rewardHackChecks: ['Do not count a sync packet as proof that external work was sent, paid, merged, or shipped.'],
    varianceChecks: ['Compare packet output before and after dirty-worktree changes; ensure active locks remain visible.'],
    retainedContext: 'artifacts/agent-sync/Hermes-Agent-Sync.json',
    branchCombinePlan: 'Combine with RAG lessons only after both packet and RAG retrieval agree on active blockers.',
    roi: 10,
    cost: 1,
    risk: 1,
    sideEffect: 'local_files_only',
    approvalRequired: false,
  },
  {
    id: 'provider_routing_benchmark',
    title: 'Benchmark provider routing before changing Hermes defaults',
    objective: 'Route long-code, fast-local, and reasoning-heavy work to measured providers instead of vibes.',
    targetMetric: 'latency_ms, cost_usd, context_tokens, smoke_pass, quality_score',
    implementation: 'Run provider candidates through existing OpenRouter/Kimi/GLM/local readiness tests and update routing only after evidence wins.',
    evaluator: 'node tests/test-openrouter-graphify-tools.js && node tests/test-kimi-model-upgrade-audit.js && node tests/test-glm52-hermes-config.js',
    existingArtifacts: ['tools/openrouter-reasoning-plan.js', 'tools/kimi-model-upgrade-audit.js', 'tools/glm52-hermes-config.js'],
    rewardHackChecks: ['Do not optimize only latency if answer quality or cost regresses.', 'Do not promote a model without a smoke test.'],
    varianceChecks: ['Repeat on at least two task types: short action and long code reasoning.'],
    retainedContext: 'ThumbGate lesson plus provider benchmark JSON',
    branchCombinePlan: 'Combine cheapest-fast and strongest-reasoner routes only with explicit routing conditions.',
    roi: 9,
    cost: 3,
    risk: 2,
    sideEffect: 'read_only_until_config_patch',
    approvalRequired: false,
  },
  {
    id: 'arena_token_efficiency_benchmark',
    title: 'Arena-style token efficiency benchmark for Hermes model routing',
    objective: 'Route cheap agent work away from expensive frontier models unless a run proves higher task improvement per output token.',
    targetMetric: 'task_improvement_per_1k_output_tokens, tool_hallucinations, bash_recovery_failures, evaluator_pass',
    implementation: 'Score candidate model/tool runs by verified task improvement per 1k output tokens and subtract penalties for tool hallucination, bash recovery failures, slow runtime, and evaluator failure.',
    evaluator: 'node tests/test-recursive-experiment-loop.js && node tools/recursive-experiment-loop.js efficiency --before 40 --after 64 --output-tokens 800 --tool-hallucinations 0 --bash-recovery-failures 0 --evaluator pass --json',
    existingArtifacts: ['tools/recursive-experiment-loop.js', 'tests/test-recursive-experiment-loop.js', 'docs/RECURSIVE-EXPERIMENT-LOOP.md'],
    rewardHackChecks: ['Do not choose a model from output-token efficiency alone if the evaluator failed or tool calls were hallucinated.'],
    varianceChecks: ['Compare at least two task classes: cheap local work and high-context repair work.'],
    retainedContext: 'recursive experiment ledger plus provider benchmark JSON',
    branchCombinePlan: 'Combine with provider_routing_benchmark only after both routing quality and token efficiency agree.',
    roi: 9,
    cost: 1,
    risk: 1,
    sideEffect: 'read_only',
    approvalRequired: false,
  },
  {
    id: 'rag_source_grounding_eval',
    title: 'Harden RAG and source-pack grounding before architecture claims',
    objective: 'Prevent stale or hallucinated architecture decisions by requiring graph/source evidence.',
    targetMetric: 'source_pack_present=true, graph_query_success=true, cited_files_count>=2',
    implementation: 'Run Graphify/source-pack evidence before broad Hermes or mobile architecture changes.',
    evaluator: 'node tests/test-hermes-source-packs.js && node tests/test-openrouter-graphify-tools.js',
    existingArtifacts: ['tools/hermes-source-packs.js', 'tools/graphify-readiness.js', 'graphify-out/graph.json'],
    rewardHackChecks: ['Do not count generated summaries as source proof unless source paths are present.'],
    varianceChecks: ['Check at least one current repo query and one historical lesson query.'],
    retainedContext: 'ThumbGate/RAG memory capture with concrete file paths',
    branchCombinePlan: 'Combine graph evidence with plan.md locks before editing shared files.',
    roi: 9,
    cost: 2,
    risk: 1,
    sideEffect: 'read_only',
    approvalRequired: false,
  },
  {
    id: 'freeze_guard_feedback_loop',
    title: 'Turn Mac freeze incidents into guard experiments',
    objective: 'Improve responsiveness without killing user-facing work or masking unsafe process classes.',
    targetMetric: 'load_avg_delta, swap_delta_gb, simruntime_count, known_safe_kills, false_positive_count',
    implementation: 'Capture incident snapshots, classify process family, and only promote auto-remediation after repeated safe evidence.',
    evaluator: 'bash scripts/verify-agent-automations.sh && node tools/agent-sync-brief.js --json',
    existingArtifacts: ['sim-runaway-guard.sh', 'scripts/verify-agent-automations.sh', 'tools/agent-automation-status.js'],
    rewardHackChecks: ['Do not call the guard fixed just because load dropped after killing unknown GUI apps.', 'Do not hide user-work loss.'],
    varianceChecks: ['Compare at least two snapshots five minutes apart, or before/after the same known-safe process class.'],
    retainedContext: 'ThumbGate mac-freeze lesson with PIDs, load, and process class',
    branchCombinePlan: 'Combine only repeated same-class incidents into guard policy; keep Cursor/Comet/manual-kill classes separate.',
    roi: 8,
    cost: 2,
    risk: 4,
    sideEffect: 'process_control_requires_known_safe_class',
    approvalRequired: true,
  },
  {
    id: 'checkout_recovery_experiment',
    title: 'Recover abandoned checkout sessions with a measurable no-spam loop',
    objective: 'Turn checkout intent into paid work without claiming revenue before Stripe proves payment.',
    targetMetric: 'qualified_followups_sent, checkout_reopened, payment_succeeded_count, complaint_count',
    implementation: 'Segment abandoned sessions, draft buyer-specific recovery, require approval for sends, and reconcile against Stripe truth.',
    evaluator: 'node tools/payment-waiting-audit.js && node tools/revenue-control-checks.js',
    existingArtifacts: ['tools/payment-waiting-audit.js', 'tools/revenue-control-checks.js', 'tools/record-cleared-payment.js'],
    rewardHackChecks: ['Do not count abandoned checkout value as revenue.', 'Do not optimize sent count over paid outcomes or user consent.'],
    varianceChecks: ['Compare recovery by cohort and wait for Stripe payment_succeeded events.'],
    retainedContext: 'business_os payment ledger and Stripe provider evidence',
    branchCombinePlan: 'Combine only messages that preserve buyer context and approval state.',
    roi: 10,
    cost: 2,
    risk: 5,
    sideEffect: 'external_send_requires_approval',
    approvalRequired: true,
  },
  {
    id: 'mobile_e2e_portability',
    title: 'Make Hermes Mobile E2E portable across machines',
    objective: 'Avoid single-phone/single-Mac proof by making release-user paths reproducible.',
    targetMetric: 'unit_pass=true, e2e_pass=true, artifact_uploaded=true, device_path_realistic=true',
    implementation: 'Promote container/remote-device lanes only after local Maestro selectors and proof JSON are stable.',
    evaluator: 'cd hermes-mobile && npm test && npm run e2e:continuous:once',
    existingArtifacts: ['hermes-mobile/scripts/run-continuous-e2e.sh', 'hermes-mobile/docs/proofs/continuous/latest.json'],
    rewardHackChecks: ['Do not use adb reverse or dev backdoors as real-user proof.', 'Do not call emulator-only proof external-user ready.'],
    varianceChecks: ['Run on at least release build plus one realistic network path.'],
    retainedContext: 'hermes-mobile/docs/proofs/continuous/latest.json',
    branchCombinePlan: 'Combine local release proof with remote lane only when both write comparable artifacts.',
    roi: 8,
    cost: 5,
    risk: 4,
    sideEffect: 'mobile_files_need_plan_ownership',
    approvalRequired: false,
  },
];

function usage() {
  return `Usage:
  node tools/recursive-experiment-loop.js plan [--json] [--task TEXT] [--repo PATH]
  node tools/recursive-experiment-loop.js validate [--json] [--file experiments.json]
  node tools/recursive-experiment-loop.js record --experiment ID --before N --after N --evaluator pass --reward-hack pass --variance pass [--ledger PATH] [--json]
  node tools/recursive-experiment-loop.js ledger [--ledger PATH] [--json]
  node tools/recursive-experiment-loop.js efficiency --before N --after N --output-tokens N [--input-tokens N] [--tool-hallucinations N] [--bash-recovery-failures N] [--evaluator pass] [--json]

Ranks Hermes improvements using public Recursive-style automated research gates:
clear objective, tight evaluator, retained context, branch combination,
reward-hack checks, and variance checks.`;
}

function parseArgs(argv) {
  const args = {
    _: [],
    repo: DEFAULT_REPO,
    task: '',
    json: false,
    file: null,
    limit: 5,
    help: false,
    ledger: DEFAULT_LEDGER,
    experiment: '',
    before: null,
    after: null,
    direction: 'higher',
    minDelta: 0,
    evaluator: null,
    rewardHack: null,
    variance: null,
    evidence: '',
    inputTokens: 0,
    outputTokens: 0,
    toolHallucinations: 0,
    bashRecoveryFailures: 0,
    latencyMs: 0,
    costUsd: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--task') args.task = requireValue(argv, ++i, arg);
    else if (arg === '--file') args.file = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--limit') args.limit = Number(requireValue(argv, ++i, arg));
    else if (arg === '--ledger') args.ledger = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--experiment') args.experiment = requireValue(argv, ++i, arg);
    else if (arg === '--before') args.before = Number(requireValue(argv, ++i, arg));
    else if (arg === '--after') args.after = Number(requireValue(argv, ++i, arg));
    else if (arg === '--direction') args.direction = requireValue(argv, ++i, arg);
    else if (arg === '--min-delta') args.minDelta = Number(requireValue(argv, ++i, arg));
    else if (arg === '--evaluator') args.evaluator = requireValue(argv, ++i, arg);
    else if (arg === '--reward-hack') args.rewardHack = requireValue(argv, ++i, arg);
    else if (arg === '--variance') args.variance = requireValue(argv, ++i, arg);
    else if (arg === '--evidence') args.evidence = requireValue(argv, ++i, arg);
    else if (arg === '--input-tokens') args.inputTokens = Number(requireValue(argv, ++i, arg));
    else if (arg === '--output-tokens') args.outputTokens = Number(requireValue(argv, ++i, arg));
    else if (arg === '--tool-hallucinations') args.toolHallucinations = Number(requireValue(argv, ++i, arg));
    else if (arg === '--bash-recovery-failures') args.bashRecoveryFailures = Number(requireValue(argv, ++i, arg));
    else if (arg === '--latency-ms') args.latencyMs = Number(requireValue(argv, ++i, arg));
    else if (arg === '--cost-usd') args.costUsd = Number(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else args._.push(arg);
  }
  if (args._.length === 0) args._.push('plan');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function exists(repo, relativePath) {
  return fs.existsSync(path.join(repo, relativePath));
}

function artifactCoverage(experiment, repo) {
  const artifacts = experiment.existingArtifacts || [];
  const present = artifacts.filter((artifact) => exists(repo, artifact));
  return {
    present,
    missing: artifacts.filter((artifact) => !present.includes(artifact)),
    ratio: artifacts.length === 0 ? 0 : present.length / artifacts.length,
  };
}

function keywordMatch(experiment, taskText) {
  if (!taskText) return 0;
  const haystack = `${experiment.id} ${experiment.title} ${experiment.objective} ${experiment.implementation}`.toLowerCase();
  const tokens = taskText.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0);
}

function validateExperiment(experiment, repo = DEFAULT_REPO) {
  const issues = [];
  if (!experiment.id) issues.push('missing id');
  if (!experiment.objective) issues.push('missing objective');
  if (!experiment.targetMetric) issues.push('missing targetMetric');
  if (!experiment.implementation) issues.push('missing implementation');
  if (!experiment.evaluator) issues.push('missing evaluator');
  if (!experiment.retainedContext) issues.push('missing retainedContext');
  if (!experiment.branchCombinePlan) issues.push('missing branchCombinePlan');
  if (!Array.isArray(experiment.rewardHackChecks) || experiment.rewardHackChecks.length === 0) issues.push('missing rewardHackChecks');
  if (!Array.isArray(experiment.varianceChecks) || experiment.varianceChecks.length === 0) issues.push('missing varianceChecks');
  if (experiment.sideEffect && /external|send|process_control/i.test(experiment.sideEffect) && !experiment.approvalRequired) {
    issues.push('risky sideEffect requires approvalRequired=true');
  }
  const coverage = artifactCoverage(experiment, repo);
  if (coverage.ratio === 0) issues.push('no existing artifacts found');

  return {
    ok: issues.length === 0,
    issues,
    coverage,
  };
}

function scoreExperiment(experiment, context = {}) {
  const validation = validateExperiment(experiment, context.repo || DEFAULT_REPO);
  const roi = Number(experiment.roi || 0) * 8;
  const feedback = experiment.evaluator ? 18 : 0;
  const metric = experiment.targetMetric ? 12 : 0;
  const rewardHack = (experiment.rewardHackChecks || []).length * 7;
  const variance = (experiment.varianceChecks || []).length * 6;
  const retained = experiment.retainedContext ? 10 : 0;
  const combine = experiment.branchCombinePlan ? 8 : 0;
  const coverage = Math.round(validation.coverage.ratio * 15);
  const keyword = keywordMatch(experiment, context.task || '');
  const costPenalty = Number(experiment.cost || 0) * 4;
  const riskPenalty = Number(experiment.risk || 0) * 3;
  const issuePenalty = validation.issues.length * 15;
  return roi + feedback + metric + rewardHack + variance + retained + combine + coverage + keyword - costPenalty - riskPenalty - issuePenalty;
}

function loadExperiments(filePath) {
  if (!filePath) return DEFAULT_EXPERIMENTS;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.experiments;
}

function planExperiments(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const task = options.task || '';
  const experiments = loadExperiments(options.file);
  const ranked = experiments
    .map((experiment) => {
      const validation = validateExperiment(experiment, repo);
      return {
        ...experiment,
        score: scoreExperiment(experiment, { repo, task }),
        validation,
        nextAction: validation.ok
          ? `Run evaluator: ${experiment.evaluator}`
          : `Fix experiment spec first: ${validation.issues.join('; ')}`,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  return {
    schema: 'hermes-recursive-experiment-loop/v1',
    generatedAt: new Date().toISOString(),
    sourcePattern: 'Recursive public automated-research loop: propose -> implement -> experiment -> validate -> learn -> choose next.',
    repo,
    task,
    publicPatterns: RECURSIVE_PUBLIC_PATTERNS,
    selected: ranked.slice(0, Number(options.limit || 5)),
    rejected: ranked.filter((experiment) => !experiment.validation.ok),
    guardrails: [
      'No self-improvement becomes default without evaluator evidence.',
      'No noisy metric is accepted without variance checks.',
      'No score-only win is accepted without reward-hack checks.',
      'No external sends, payments, process kills, merges, or deploys without the existing approval boundary.',
    ],
  };
}

function validateExperiments(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const experiments = loadExperiments(options.file);
  const results = experiments.map((experiment) => ({
    id: experiment.id,
    ...validateExperiment(experiment, repo),
  }));
  return {
    ok: results.every((result) => result.ok),
    results,
  };
}

function statusPass(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (['pass', 'passed', 'ok', 'true', 'yes', 'green', 'success'].includes(normalized)) return true;
  if (['fail', 'failed', 'false', 'no', 'red', 'error'].includes(normalized)) return false;
  return null;
}

function metricDelta(before, after, direction = 'higher') {
  if (!Number.isFinite(Number(before)) || !Number.isFinite(Number(after))) {
    return { ok: false, delta: null, improved: false, reason: 'before and after must be finite numbers' };
  }
  const rawDelta = Number(after) - Number(before);
  const lowerIsBetter = String(direction || 'higher').toLowerCase().startsWith('low');
  const delta = lowerIsBetter ? -rawDelta : rawDelta;
  return {
    ok: true,
    delta,
    rawDelta,
    improved: delta > 0,
    direction: lowerIsBetter ? 'lower' : 'higher',
  };
}

function evaluateOutcome(outcome = {}) {
  const evaluatorPassed = statusPass(outcome.evaluator ?? outcome.evaluatorStatus);
  const rewardHackPassed = statusPass(outcome.rewardHack ?? outcome.rewardHackStatus);
  const variancePassed = statusPass(outcome.variance ?? outcome.varianceStatus);
  const metric = metricDelta(outcome.before, outcome.after, outcome.direction);
  const minDelta = Number(outcome.minDelta ?? outcome.minimumDelta ?? 0);
  const issues = [];

  if (!metric.ok) issues.push(metric.reason);
  if (evaluatorPassed !== true) issues.push(evaluatorPassed === false ? 'evaluator failed' : 'evaluator evidence missing');
  if (rewardHackPassed !== true) issues.push(rewardHackPassed === false ? 'reward-hack check failed' : 'reward-hack check missing');
  if (variancePassed !== true) issues.push(variancePassed === false ? 'variance check failed' : 'variance check missing');
  if (metric.ok && metric.delta <= minDelta) {
    issues.push(`metric did not improve by more than ${minDelta}`);
  }

  let decision = 'adopt';
  if (issues.some((issue) => /failed|did not improve/.test(issue))) {
    decision = 'reject';
  } else if (issues.length > 0) {
    decision = 'retry';
  }

  return {
    decision,
    okToAdopt: decision === 'adopt',
    issues,
    metric: {
      before: Number(outcome.before),
      after: Number(outcome.after),
      direction: metric.direction,
      delta: metric.delta,
      rawDelta: metric.rawDelta,
      minDelta,
    },
    gates: {
      evaluatorPassed,
      rewardHackPassed,
      variancePassed,
    },
  };
}

function scoreEfficiencyRun(run = {}) {
  const before = Number(run.before);
  const after = Number(run.after);
  const outputTokens = Number(run.outputTokens ?? run.output_tokens ?? 0);
  const inputTokens = Number(run.inputTokens ?? run.input_tokens ?? 0);
  const evaluatorPassed = statusPass(run.evaluator ?? run.evaluatorStatus);
  const metric = metricDelta(before, after, run.direction || 'higher');
  const toolHallucinations = Math.max(0, Number(run.toolHallucinations ?? run.tool_hallucinations ?? 0));
  const bashRecoveryFailures = Math.max(0, Number(run.bashRecoveryFailures ?? run.bash_recovery_failures ?? 0));
  const latencyMs = Math.max(0, Number(run.latencyMs ?? run.latency_ms ?? 0));
  const costUsd = Math.max(0, Number(run.costUsd ?? run.cost_usd ?? 0));
  const issues = [];

  if (!metric.ok) issues.push(metric.reason);
  if (!Number.isFinite(outputTokens) || outputTokens <= 0) issues.push('outputTokens must be a positive number');
  if (evaluatorPassed !== true) issues.push(evaluatorPassed === false ? 'evaluator failed' : 'evaluator evidence missing');
  if (toolHallucinations > 0) issues.push('tool hallucination penalty applied');
  if (bashRecoveryFailures > 0) issues.push('bash recovery failure penalty applied');

  const per1kOutputTokens = metric.ok && outputTokens > 0 ? metric.delta / (outputTokens / 1000) : 0;
  const hallucinationPenalty = toolHallucinations * 25;
  const bashPenalty = bashRecoveryFailures * 20;
  const latencyPenalty = latencyMs > 0 ? Math.min(20, latencyMs / 15000) : 0;
  const costPenalty = costUsd > 0 ? Math.min(25, costUsd * 10) : 0;
  const evaluatorPenalty = evaluatorPassed === true ? 0 : 100;
  const score = Number((per1kOutputTokens - hallucinationPenalty - bashPenalty - latencyPenalty - costPenalty - evaluatorPenalty).toFixed(3));

  let route = 'expensive_model_allowed';
  if (score >= 20 && toolHallucinations === 0 && bashRecoveryFailures === 0 && evaluatorPassed === true) {
    route = 'cheap_or_local_candidate';
  } else if (score < 0 || evaluatorPassed !== true) {
    route = 'do_not_promote';
  }

  return {
    schema: 'hermes-agent-arena-efficiency/v1',
    score,
    route,
    inputTokens,
    outputTokens,
    taskImprovement: metric.delta,
    per1kOutputTokens: Number(per1kOutputTokens.toFixed(3)),
    penalties: {
      toolHallucinations: hallucinationPenalty,
      bashRecoveryFailures: bashPenalty,
      latency: Number(latencyPenalty.toFixed(3)),
      cost: Number(costPenalty.toFixed(3)),
      evaluator: evaluatorPenalty,
    },
    gates: {
      evaluatorPassed,
      toolHallucinations,
      bashRecoveryFailures,
    },
    issues,
  };
}

function recordOutcome(options = {}) {
  const experiments = loadExperiments(options.file);
  const experimentId = options.experiment || options.experimentId || options.experiment_id;
  const experiment = experiments.find((candidate) => candidate.id === experimentId);
  if (!experiment) throw new Error(`Unknown experiment: ${experimentId || '(missing)'}`);
  const outcome = {
    experimentId,
    before: options.before,
    after: options.after,
    direction: options.direction || 'higher',
    minDelta: Number(options.minDelta ?? 0),
    evaluator: options.evaluator,
    rewardHack: options.rewardHack,
    variance: options.variance,
    evidence: options.evidence || '',
  };
  const evaluation = evaluateOutcome(outcome);
  const record = {
    schema: 'hermes-recursive-experiment-outcome/v1',
    recordedAt: new Date().toISOString(),
    experimentId,
    title: experiment.title,
    objective: experiment.objective,
    targetMetric: experiment.targetMetric,
    evaluator: experiment.evaluator,
    retainedContext: experiment.retainedContext,
    outcome,
    evaluation,
  };
  const ledgerPath = path.resolve(options.ledger || DEFAULT_LEDGER);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  return { ledger: ledgerPath, record };
}

function readLedger(filePath = DEFAULT_LEDGER) {
  const ledgerPath = path.resolve(filePath);
  if (!fs.existsSync(ledgerPath)) {
    return {
      schema: 'hermes-recursive-experiment-ledger/v1',
      ledger: ledgerPath,
      total: 0,
      adopt: 0,
      retry: 0,
      reject: 0,
      latest: [],
    };
  }
  const records = fs.readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const counts = records.reduce((acc, record) => {
    const decision = record.evaluation?.decision || 'unknown';
    acc[decision] = (acc[decision] || 0) + 1;
    return acc;
  }, {});
  return {
    schema: 'hermes-recursive-experiment-ledger/v1',
    ledger: ledgerPath,
    total: records.length,
    adopt: counts.adopt || 0,
    retry: counts.retry || 0,
    reject: counts.reject || 0,
    latest: records.slice(-5).reverse().map((record) => ({
      recordedAt: record.recordedAt,
      experimentId: record.experimentId,
      decision: record.evaluation?.decision,
      issues: record.evaluation?.issues || [],
      delta: record.evaluation?.metric?.delta,
    })),
  };
}

function render(plan) {
  const lines = [
    '# Recursive Experiment Loop',
    '',
    `Generated: ${plan.generatedAt}`,
    `Task: ${plan.task || 'general Hermes improvement ranking'}`,
    '',
    '## Guardrails',
    ...plan.guardrails.map((guardrail) => `- ${guardrail}`),
    '',
    '## Selected Experiments',
  ];

  for (const experiment of plan.selected) {
    lines.push(
      '',
      `### ${experiment.id} (${experiment.score})`,
      `- Objective: ${experiment.objective}`,
      `- Metric: ${experiment.targetMetric}`,
      `- Evaluator: \`${experiment.evaluator}\``,
      `- Reward-hack checks: ${experiment.rewardHackChecks.join(' ')}`,
      `- Variance checks: ${experiment.varianceChecks.join(' ')}`,
      `- Retained context: ${experiment.retainedContext}`,
      `- Next action: ${experiment.nextAction}`,
    );
  }

  if (plan.rejected.length > 0) {
    lines.push('', '## Rejected Or Incomplete');
    for (const experiment of plan.rejected) {
      lines.push(`- ${experiment.id}: ${experiment.validation.issues.join('; ')}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const command = args._[0];
  if (command === 'validate') {
    const result = validateExperiments(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : render({
      generatedAt: new Date().toISOString(),
      task: 'validation',
      guardrails: result.ok ? ['All experiments validate.'] : ['One or more experiments need repair.'],
      selected: result.results.map((resultItem) => ({
        id: resultItem.id,
        score: resultItem.ok ? 1 : 0,
        objective: resultItem.ok ? 'valid' : resultItem.issues.join('; '),
        targetMetric: 'spec validation',
        evaluator: 'validate',
        rewardHackChecks: [],
        varianceChecks: [],
        retainedContext: 'n/a',
        nextAction: resultItem.ok ? 'ready' : 'fix issues',
      })),
      rejected: [],
    }));
    process.exit(result.ok ? 0 : 1);
  }

  if (command === 'record') {
    const result = recordOutcome(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : `Recorded ${result.record.experimentId}: ${result.record.evaluation.decision}\nLedger: ${result.ledger}`);
    process.exit(result.record.evaluation.decision === 'reject' ? 1 : 0);
  }

  if (command === 'ledger') {
    const result = readLedger(args.ledger);
    console.log(args.json ? JSON.stringify(result, null, 2) : JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'efficiency') {
    const result = scoreEfficiencyRun(args);
    console.log(args.json ? JSON.stringify(result, null, 2) : JSON.stringify(result, null, 2));
    process.exit(result.route === 'do_not_promote' ? 1 : 0);
  }

  if (command !== 'plan') throw new Error(`Unknown command: ${command}`);
  const plan = planExperiments(args);
  console.log(args.json ? JSON.stringify(plan, null, 2) : render(plan));
}

module.exports = {
  DEFAULT_EXPERIMENTS,
  DEFAULT_LEDGER,
  RECURSIVE_PUBLIC_PATTERNS,
  artifactCoverage,
  evaluateOutcome,
  metricDelta,
  parseArgs,
  planExperiments,
  readLedger,
  recordOutcome,
  scoreEfficiencyRun,
  scoreExperiment,
  statusPass,
  validateExperiment,
  validateExperiments,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
