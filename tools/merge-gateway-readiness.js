#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REPO = path.join(os.homedir(), 'workspace/git/igor/mac-yolo-safeguards');
const DEFAULT_HERMES_CONFIG = path.join(os.homedir(), '.hermes/config.yaml');
const DEFAULT_ERRORS_LOG = path.join(os.homedir(), '.hermes/logs/errors.log');

const CAPABILITIES = [
  {
    key: 'customer_cost_attribution',
    weight: 22,
    title: 'Customer-level AI cost attribution',
    mergeValue: 'Track spend by customer, project, team, or feature and protect margins.',
    openRouterGap: 'OpenRouter helps with model access, but customer-level SaaS economics still need custom telemetry.',
  },
  {
    key: 'budget_controls',
    weight: 18,
    title: 'Real-time budget controls',
    mergeValue: 'Set customer/team/feature budgets and enforce routing/caps before provider spend happens.',
    openRouterGap: 'Provider caps do not replace per-offer/per-customer revenue controls.',
  },
  {
    key: 'request_observability',
    weight: 18,
    title: 'Request-level observability',
    mergeValue: 'Log customer, model, provider, cost, latency, and routing path for each request.',
    openRouterGap: 'OpenRouter request logging is not enough for Hermes revenue-job accountability.',
  },
  {
    key: 'dlp_prompt_injection',
    weight: 16,
    title: 'DLP and prompt-injection guard',
    mergeValue: 'Block or redact sensitive data and injection attempts before model-provider calls.',
    openRouterGap: 'Hermes currently relies on local prompts/gates for many sensitive-action boundaries.',
  },
  {
    key: 'policy_routing',
    weight: 14,
    title: 'Policy-aware routing',
    mergeValue: 'Route by customer, feature, region, compliance requirement, or capability.',
    openRouterGap: 'Model/provider failover alone does not express customer policy.',
  },
  {
    key: 'multi_provider_failover',
    weight: 12,
    title: 'Production multi-provider failover',
    mergeValue: 'Centralize routing/failover under production governance rather than ad hoc fallback chains.',
    openRouterGap: 'OpenRouter is good for broad access, but exhausted keys and context limits still need operational policy.',
  },
];

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    hermesConfig: DEFAULT_HERMES_CONFIG,
    errorsLog: DEFAULT_ERRORS_LOG,
    json: false,
    failOnHigh: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--hermes-config') args.hermesConfig = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--errors-log') args.errorsLog = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--fail-on-high') args.failOnHigh = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readText(filePath, maxBytes = 600000) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  } catch (_) {
    return '';
  }
}

function exists(repo, relativePath) {
  return fs.existsSync(path.join(repo, relativePath));
}

function collect(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const hermesConfig = readText(options.hermesConfig || DEFAULT_HERMES_CONFIG);
  const errorsLog = readText(options.errorsLog || DEFAULT_ERRORS_LOG);
  const revenueControls = readText(path.join(repo, 'tools/revenue-control-checks.js'));
  const selfHarness = readText(path.join(repo, 'tools/hermes-self-harness.js'));
  const yoloWrapper = readText(path.join(repo, 'hermes-yolo-wrapper.js'));
  const ci = readText(path.join(repo, 'scripts/ci-verify.sh'));

  const evidence = {
    repo,
    hasLocalDefault: /provider:\s*custom:ollama-local-64k/.test(hermesConfig),
    hasOpenRouterConfigured: /openrouter/i.test(hermesConfig),
    hasOpenRouterFailures: /HTTP 402|Prompt tokens limit exceeded|requires more credits|can only afford/i.test(errorsLog),
    hasSelfHarness: /Hermes Self-Harness|self-harness-inspired|criticalOpenCount/.test(selfHarness),
    hasRevenueControls: /captured_cents|stripe|customer|checkout|payment/i.test(revenueControls),
    hasSlimYoloWrapper: /DEFAULT_TOOLSETS.*terminal,file,web,code_execution,memory,clarify/.test(yoloWrapper),
    ciCoversSelfHarness: /test-hermes-self-harness/.test(ci),
    hasMergeGatewayProvider: /merge/i.test(hermesConfig),
    hasGatewayDocs: exists(repo, 'docs/MERGE-GATEWAY-READINESS.md'),
  };

  return evidence;
}

function capabilityStatus(capability, evidence) {
  const mitigatedByCurrent = {
    customer_cost_attribution: evidence.hasRevenueControls,
    budget_controls: evidence.hasRevenueControls && evidence.hasSelfHarness,
    request_observability: evidence.hasSelfHarness,
    dlp_prompt_injection: evidence.hasSelfHarness,
    policy_routing: evidence.hasLocalDefault && evidence.hasSlimYoloWrapper,
    multi_provider_failover: evidence.hasLocalDefault && evidence.hasOpenRouterConfigured,
  }[capability.key];
  const productionGap = !mitigatedByCurrent || (evidence.hasOpenRouterFailures && ['budget_controls', 'multi_provider_failover', 'request_observability'].includes(capability.key));
  return {
    ...capability,
    currentMitigation: Boolean(mitigatedByCurrent),
    productionGap,
    priority: productionGap ? capability.weight : Math.round(capability.weight * 0.35),
  };
}

function buildPlan(options = {}) {
  const evidence = options.evidence || collect(options);
  const capabilities = CAPABILITIES.map((capability) => capabilityStatus(capability, evidence));
  const score = capabilities.reduce((sum, item) => sum + item.priority, 0);
  const maxScore = CAPABILITIES.reduce((sum, item) => sum + item.weight, 0);
  const readiness = Math.max(0, 100 - Math.round((score / maxScore) * 100));
  const highNeed = score >= 45;
  const recommendation = highNeed
    ? 'Evaluate Merge Gateway or an equivalent internal gateway before making Hermes customer-facing at scale.'
    : 'Stay local/OpenRouter for now; keep the Merge-style controls as acceptance criteria before scaling customer-facing AI.';
  const blockers = [];
  if (!evidence.hasSelfHarness) blockers.push('Self-harness evidence miner is not installed.');
  if (!evidence.hasRevenueControls) blockers.push('Revenue/customer attribution controls are not visible in this repo.');
  if (evidence.hasOpenRouterFailures) blockers.push('OpenRouter credit/context failures are present in Hermes logs.');
  if (!evidence.hasMergeGatewayProvider) blockers.push('No Merge Gateway provider route is configured; this is a readiness plan, not a migration.');

  return {
    checkedAt: new Date().toISOString(),
    source: 'Merge Gateway vs OpenRouter production-governance comparison',
    readiness,
    migrationNeedScore: score,
    recommendation,
    evidence,
    capabilities,
    blockers,
    nextActions: [
      'Keep routine Hermes CLI/yolo on local Ollama until paid-provider credits and request budgets are healthy.',
      'Add customer/job/offer attribution to every model call before customer-facing usage scales.',
      'Use Merge Gateway, or implement equivalent controls, only when Hermes needs per-customer budgets, DLP, prompt-injection scanning, and request-level cost/latency reporting.',
      'Do not replace OpenRouter for experimentation; reserve production gateway routing for revenue/customer-facing paths.',
    ],
  };
}

function render(plan) {
  const lines = [
    '# Merge Gateway Readiness',
    '',
    `Readiness: ${plan.readiness}/100`,
    `Migration need score: ${plan.migrationNeedScore}`,
    `Recommendation: ${plan.recommendation}`,
    '',
    '## Capability Gaps',
    '',
  ];
  for (const item of plan.capabilities) {
    lines.push(`- ${item.productionGap ? 'GAP' : 'OK'} ${item.title} (${item.priority})`);
    lines.push(`  Merge value: ${item.mergeValue}`);
    lines.push(`  Current mitigation: ${item.currentMitigation ? 'yes' : 'no'}`);
  }
  if (plan.blockers.length) {
    lines.push('', '## Blockers', '');
    for (const blocker of plan.blockers) lines.push(`- ${blocker}`);
  }
  lines.push('', '## Next Actions', '');
  for (const action of plan.nextActions) lines.push(`- ${action}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/merge-gateway-readiness.js [--json] [--fail-on-high]');
    return;
  }
  const plan = buildPlan(args);
  if (args.json) console.log(JSON.stringify(plan, null, 2));
  else process.stdout.write(render(plan));
  if (args.failOnHigh && plan.migrationNeedScore >= 45) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  CAPABILITIES,
  buildPlan,
  collect,
  parseArgs,
  render,
};
