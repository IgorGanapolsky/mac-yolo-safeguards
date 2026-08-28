#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

const INFRASTRUCTURE_PILLARS = [
  ['dataInventory', 'data_inventory'],
  ['identityAccess', 'identity_access'],
  ['deterministicWorkflow', 'deterministic_workflow'],
  ['retryIdempotency', 'retry_idempotency'],
  ['evaluationCases', 'evaluation_cases'],
  ['observability', 'observability'],
  ['humanApproval', 'human_approval'],
];

const SOURCES = [
  {
    id: 'ai-agents-summit-orchestration',
    url: 'https://events.aiunleashedglobalsummit.com/aias-registration-yt',
    title: 'AI Agents Summit',
  },
  {
    id: 'startup-hakk-ia-before-ai',
    url: 'https://music.youtube.com/watch?v=LQXFpzoP8es',
    title: 'The Trillion-Dollar AI Opportunity Nobody Is Talking About',
  },
  {
    id: 'advanced-selling-identity',
    url: 'https://music.youtube.com/watch?v=lOjC4o02bT0',
    title: "It's Not a Skill Problem, It's an Identity Problem",
  },
];

const ROUTES = {
  free_or_disqualify: { offer: 'free_or_disqualify', priceUsd: 0 },
  diagnostic: { offer: 'diagnostic', priceUsd: 499 },
  hardening_sprint: { offer: 'hardening_sprint', priceUsd: 1500 },
  partner_pilot: { offer: 'partner_pilot', priceUsd: 3000 },
};

const OPPORTUNITY_FIELDS = new Set([
  'company', 'executiveRole', 'businessPriority', 'repeatedFailure', 'businessCostUsd',
  'usesAgentsWeekly', 'budgetOwner', 'canShareEvidence', 'needsRepeatability',
  'liveWorkflow', 'infrastructure',
]);
const TEXT_FIELDS = ['company', 'executiveRole', 'businessPriority', 'repeatedFailure'];
const BOOLEAN_FIELDS = [
  'usesAgentsWeekly', 'budgetOwner', 'canShareEvidence', 'needsRepeatability', 'liveWorkflow',
];
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;
const CRITICAL_INFRASTRUCTURE = new Set([
  'data_inventory', 'identity_access', 'deterministic_workflow', 'retry_idempotency', 'human_approval',
]);

function cleanText(value, fallback = '') {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : fallback;
}

function bool(value) {
  return value === true;
}

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function rejectUnknownFields(value, allowed, label) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unknown fields: ${JSON.stringify(unknown)}`);
}

function safeErrorMessage(value) {
  return String(value).replace(
    /[\u0000-\u001f\u007f-\u009f]/gu,
    character => `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`
  );
}

function validateOpportunity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('input must be one JSON object');
  }
  rejectUnknownFields(value, OPPORTUNITY_FIELDS, 'input');
  for (const field of OPPORTUNITY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`input is missing required field: ${field}`);
    }
  }
  for (const field of TEXT_FIELDS) {
    if (typeof value[field] !== 'string') throw new Error(`${field} must be a string`);
    if (value[field].length > 1_000) throw new Error(`${field} exceeds 1000 characters`);
    if (CONTROL_CHARACTERS.test(value[field])) throw new Error(`${field} contains control characters`);
  }
  for (const field of ['company', 'executiveRole', 'businessPriority']) {
    if (!value[field].trim()) throw new Error(`${field} must not be empty`);
  }
  if (typeof value.businessCostUsd !== 'number' || !Number.isFinite(value.businessCostUsd) || value.businessCostUsd < 0) {
    throw new Error('businessCostUsd must be a finite non-negative number');
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof value[field] !== 'boolean') throw new Error(`${field} must be a boolean`);
  }
  if (!value.infrastructure || typeof value.infrastructure !== 'object' || Array.isArray(value.infrastructure)) {
    throw new Error('infrastructure must be an object');
  }
  const infrastructureFields = new Set(INFRASTRUCTURE_PILLARS.map(([field]) => field));
  rejectUnknownFields(value.infrastructure, infrastructureFields, 'infrastructure');
  for (const field of infrastructureFields) {
    if (!Object.prototype.hasOwnProperty.call(value.infrastructure, field)) {
      throw new Error(`infrastructure is missing required field: ${field}`);
    }
    if (typeof value.infrastructure[field] !== 'boolean') {
      throw new Error(`infrastructure.${field} must be a boolean`);
    }
  }
  return value;
}

function formatUsd(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function infrastructureReadiness(infrastructure = {}) {
  const ready = [];
  const missing = [];

  for (const [field, label] of INFRASTRUCTURE_PILLARS) {
    (bool(infrastructure[field]) ? ready : missing).push(label);
  }

  return {
    ready,
    missing,
    readyCount: ready.length,
    totalCount: INFRASTRUCTURE_PILLARS.length,
    percent: Math.round((ready.length / INFRASTRUCTURE_PILLARS.length) * 100),
  };
}

function qualificationScore(opportunity) {
  let score = 0;
  if (bool(opportunity.usesAgentsWeekly)) score += 2;
  if (cleanText(opportunity.repeatedFailure)) score += 2;
  if (finiteNonNegative(opportunity.businessCostUsd) > 0) score += 2;
  if (bool(opportunity.budgetOwner)) score += 2;
  if (bool(opportunity.canShareEvidence)) score += 1;
  if (bool(opportunity.needsRepeatability)) score += 1;
  return score;
}

function routeOffer(score, readiness) {
  const hasCriticalGap = readiness.missing.some(field => CRITICAL_INFRASTRUCTURE.has(field));
  if (score >= 9 && readiness.readyCount === readiness.totalCount) return ROUTES.partner_pilot;
  if (score >= 6 && readiness.readyCount >= 4 && !hasCriticalGap) return ROUTES.hardening_sprint;
  if (score >= 4) return ROUTES.diagnostic;
  return ROUTES.free_or_disqualify;
}

function paidAskFor(route) {
  if (route.offer === 'diagnostic') {
    return 'The right first step is a $499 IA-before-AI diagnostic for one live workflow: map the infrastructure gaps, evidence, and smallest repair plan before adding another agent.';
  }
  if (route.offer === 'hardening_sprint') {
    return 'The right next step is a $1,500 hardening sprint for one live workflow: close the highest-risk infrastructure gaps, add tests and approval controls, and leave before/after evidence.';
  }
  if (route.offer === 'partner_pilot') {
    return 'The right next step is a $3,000 partner pilot: harden one live workflow and package the readiness gate, evidence checklist, and rollout path for repeat client use.';
  }
  return '';
}

function assessExecutiveOpportunity(input) {
  const opportunity = validateOpportunity(input);
  const repeatedFailure = cleanText(opportunity.repeatedFailure);
  const businessPriority = cleanText(opportunity.businessPriority, 'a material business priority');
  const company = cleanText(opportunity.company, 'the organization');
  const executiveRole = cleanText(opportunity.executiveRole, 'executive sponsor');
  const businessCostUsd = finiteNonNegative(opportunity.businessCostUsd);
  const readiness = infrastructureReadiness(opportunity.infrastructure);
  const score = qualificationScore(opportunity);
  const hasPaidPain = bool(opportunity.liveWorkflow)
    && Boolean(repeatedFailure)
    && businessCostUsd > 0
    && bool(opportunity.canShareEvidence);
  const stopReason = hasPaidPain
    ? ''
    : 'No live repeated failure with shareable evidence and evidenced business cost; do not sell a generic AI-agent project.';
  const route = hasPaidPain ? routeOffer(score, readiness) : ROUTES.free_or_disqualify;
  const gapText = readiness.missing.length
    ? `infrastructure gaps remain in ${readiness.missing.join(', ')}`
    : 'the infrastructure is present but the repeated workflow failure remains unresolved';
  const executiveHypothesis = hasPaidPain
    ? `We suspect ${repeatedFailure} is putting ${businessPriority} at risk and costing approximately ${formatUsd(businessCostUsd)} because ${gapText}.`
    : `No paid business hypothesis is supportable for ${company} yet.`;
  const executiveQuestion = hasPaidPain
    ? `For the ${executiveRole}, which leadership metric shows this cost most clearly, and what evidence would prove the workflow is fixed?`
    : 'What live workflow has failed repeatedly, and what measurable business cost did it create?';

  return {
    company,
    executiveRole,
    qualified: hasPaidPain && route.offer !== 'free_or_disqualify',
    qualificationScore: score,
    iaReadiness: readiness,
    route,
    stopReason,
    executiveHypothesis,
    executiveQuestion,
    paidAsk: paidAskFor(route),
    llmRequired: false,
    actions: {
      send: false,
      createCheckout: false,
      mutateCustomerSystem: false,
    },
    nextStep: route.offer === 'free_or_disqualify'
      ? 'Collect evidence for one repeated costly workflow or close as no current paid pain.'
      : 'Use the hypothesis and question in an executive discovery conversation; send payment only after written scope acceptance.',
    provenance: {
      sourceIds: SOURCES.map(source => source.id),
      sources: SOURCES,
    },
  };
}

function parseArgs(argv) {
  const args = { input: null, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--input requires a path');
      args.input = value;
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (args.help) return args;
  return args.input === null ? { input: null, json: args.json } : { input: args.input, json: args.json };
}

function readInput(path) {
  const raw = path ? fs.readFileSync(path, 'utf8') : fs.readFileSync(0, 'utf8');
  if (!raw.trim()) throw new Error('input JSON is required via --input or stdin');
  return validateOpportunity(JSON.parse(raw));
}

function render(result) {
  const missing = result.iaReadiness.missing.length ? result.iaReadiness.missing.join(', ') : 'none';
  return [
    `Company: ${result.company}`,
    `Executive: ${result.executiveRole}`,
    `Qualified: ${result.qualified}`,
    `Qualification score: ${result.qualificationScore}/10`,
    `IA readiness: ${result.iaReadiness.readyCount}/${result.iaReadiness.totalCount} (${result.iaReadiness.percent}%)`,
    `Missing infrastructure: ${missing}`,
    `Route: ${result.route.offer} (${formatUsd(result.route.priceUsd)})`,
    `Hypothesis: ${result.executiveHypothesis}`,
    `Question: ${result.executiveQuestion}`,
    result.paidAsk ? `Paid ask: ${result.paidAsk}` : `Stop: ${result.stopReason}`,
    `Next step: ${result.nextStep}`,
    'Side effects: none',
  ].join('\n');
}

function usage() {
  return 'Usage: node tools/ia-before-ai-executive-gate.js [--input opportunity.json] [--json]\nReads stdin when --input is omitted. Never sends or creates checkout.';
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = assessExecutiveOpportunity(readInput(args.input));
    process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `${render(result)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${safeErrorMessage(error.message)}\n${usage()}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) main();

module.exports = {
  INFRASTRUCTURE_PILLARS,
  SOURCES,
  assessExecutiveOpportunity,
  infrastructureReadiness,
  parseArgs,
  qualificationScore,
  render,
  routeOffer,
  safeErrorMessage,
  validateOpportunity,
};
