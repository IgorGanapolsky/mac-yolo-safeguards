#!/usr/bin/env node
'use strict';

/**
 * LLM-as-Judge regression policy for mac-yolo-safeguards / ThumbGate.
 *
 * Design rule (hard): probabilistic LLM judges NEVER block merge by themselves.
 * Hard gates are deterministic: golden fixtures, path substrings, metric floors,
 * incident verifiers, product contracts. Human thumbs are the preferred soft
 * quality signal. LLM judges (when used) are diagnostic only.
 *
 * See docs/LLM-AS-JUDGE-REGRESSION-POLICY.md
 */

/** @typedef {'hard' | 'diagnostic'} GateClass */

/**
 * Catalog of anti-regression controls. `class: 'hard'` means a failure must
 * block ship/merge. `class: 'diagnostic'` means open a ticket / log, never
 * invent a green status.
 */
const GATES = Object.freeze([
  {
    id: 'rag-retrieval-floors',
    class: /** @type {GateClass} */ ('hard'),
    command: 'node tools/rag-retrieval-eval.js --json',
    why: 'Recall/MRR/nDCG floors on a frozen fixture; no model call.',
  },
  {
    id: 'incident-eval-pr',
    class: /** @type {GateClass} */ ('hard'),
    command: 'node tools/incident-eval-runner.js --tier pr',
    why: 'False-green ship classes encoded as deterministic verifiers.',
  },
  {
    id: 'human-feedback-curation',
    class: /** @type {GateClass} */ ('diagnostic'),
    command: 'node tools/curate-eval-set.js --json',
    why: 'Human thumbs holdout/train split; provenance sha256 for score comparability.',
  },
  {
    id: 'llm-judge-scores',
    class: /** @type {GateClass} */ ('diagnostic'),
    command: null,
    why: 'Any model-scored rubric is diagnostic only until calibrated against human holdout.',
  },
]);

/** Forbidden constants that used to fake LLM-as-judge quality. */
const FORBIDDEN_FABRICATED_SCORES = Object.freeze({
  groundednessScore: 0.98,
  helpfulnessScore: 0.96,
});

/**
 * Semantic names for human-feedback proxies formerly mislabeled as
 * "LLM-as-judge groundedness/helpfulness".
 */
const HUMAN_METRIC_SEMANTICS = Object.freeze({
  humanPositiveRate:
    'keptPositive / kept from human thumbs after curate-eval-set filters (NOT model groundedness)',
  holdoutFraction:
    'holdout / kept — eval rigor proxy (NOT model helpfulness)',
  role: 'human-label-proxy-not-llm-judge',
});

function hardGates() {
  return GATES.filter((g) => g.class === 'hard');
}

function diagnosticGates() {
  return GATES.filter((g) => g.class === 'diagnostic');
}

/**
 * @param {Record<string, unknown>} scores
 * @returns {{ ok: boolean, violations: string[] }}
 */
function assertNotFabricatedJudgeScores(scores) {
  const violations = [];
  for (const [key, forbidden] of Object.entries(FORBIDDEN_FABRICATED_SCORES)) {
    if (scores && scores[key] === forbidden) {
      violations.push(`${key} equals forbidden fabricated constant ${forbidden}`);
    }
  }
  return { ok: violations.length === 0, violations };
}

if (require.main === module) {
  const json = process.argv.includes('--json');
  const body = {
    policy: 'hard-gates-deterministic-llm-judge-diagnostic-only',
    hardGates: hardGates(),
    diagnosticGates: diagnosticGates(),
    forbiddenFabricatedScores: FORBIDDEN_FABRICATED_SCORES,
    humanMetricSemantics: HUMAN_METRIC_SEMANTICS,
  };
  if (json) {
    console.log(JSON.stringify(body, null, 2));
  } else {
    console.log('LLM-as-Judge policy: hard gates are deterministic; LLM judges are diagnostic only.\n');
    console.log('Hard gates:');
    for (const g of hardGates()) console.log(`  - ${g.id}: ${g.why}`);
    console.log('\nDiagnostic:');
    for (const g of diagnosticGates()) console.log(`  - ${g.id}: ${g.why}`);
  }
}

module.exports = {
  GATES,
  FORBIDDEN_FABRICATED_SCORES,
  HUMAN_METRIC_SEMANTICS,
  hardGates,
  diagnosticGates,
  assertNotFabricatedJudgeScores,
};
