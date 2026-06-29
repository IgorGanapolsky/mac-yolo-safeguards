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
const path = require('path');

const DEFAULT_REPO = path.resolve(__dirname, '..');

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

Ranks Hermes improvements using public Recursive-style automated research gates:
clear objective, tight evaluator, retained context, branch combination,
reward-hack checks, and variance checks.`;
}

function parseArgs(argv) {
  const args = { _: [], repo: DEFAULT_REPO, task: '', json: false, file: null, limit: 5, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--task') args.task = requireValue(argv, ++i, arg);
    else if (arg === '--file') args.file = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--limit') args.limit = Number(requireValue(argv, ++i, arg));
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

  if (command !== 'plan') throw new Error(`Unknown command: ${command}`);
  const plan = planExperiments(args);
  console.log(args.json ? JSON.stringify(plan, null, 2) : render(plan));
}

module.exports = {
  DEFAULT_EXPERIMENTS,
  RECURSIVE_PUBLIC_PATTERNS,
  artifactCoverage,
  parseArgs,
  planExperiments,
  scoreExperiment,
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
