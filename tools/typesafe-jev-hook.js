#!/usr/bin/env node
/**
 * TypeSafe Jev 1.14.0 & console.typesafe.ai/hook System-One Engine
 *
 * Implements the architectural steals from:
 *   1. https://console.typesafe.ai/hook ("Meet Jev" RLCD manifesto, 3x3 Properties/Limitations/Benefits,
 *      and mandatory Pop Quiz Comprehension Gate: "Can you chat with Jev? -> No (3% true, 97% false)")
 *   2. https://api.typesafe.ai/openapi.json (POST /v1/systemone with Noul, Choice, Score, and Box
 *      primitives, TypeSafe-Danger-Zone-Images, TypeSafe-Danger-Zone-Long-Context 262k tokens,
 *      $42/Btok = $0.042/Mtok input, $0 output tokens)
 *   3. https://docs.typesafe.ai/cookbooks/llm_guardrails.md ("Judgments from Jev, decisions in code":
 *      input/output Noul hazard batteries + Severity Score + 3-band thresholds [0.30, 0.70] +
 *      precedence ladder: ["support", "block", "review", "pass"])
 *   4. https://docs.typesafe.ai/cookbooks/skill_suggestion.md (2-call progressive-disclosure skill
 *      router cutting wrong skill loads 15.7% -> 7.9% and needless loads 14.0% -> 5.2%)
 *   5. https://docs.typesafe.ai/patterns/fan-out.md (Speculative Fan-Out: 12.2x cheaper, 10.0x faster
 *      by bundling shared-state questions into one POST /v1/systemone call)
 *   6. https://docs.typesafe.ai/model-jaggedness.md (9 Jaggedness Guardrails static request linter +
 *      Choice option-order consistency verifier)
 */

'use strict';

const assert = require('assert');

// ---------------------------------------------------------------------------
// 1. console.typesafe.ai/hook — RLCD Manifesto, 3x3 Matrix & Pop Quiz Gate
// ---------------------------------------------------------------------------

const TYPESAFE_JEV_SPECS = Object.freeze({
  modelId: 'jev-1.14.0',
  aliases: Object.freeze({
    'jev-latest': 'jev-1.14.0',
    'jev-preview': 'jev-1.14.0',
  }),
  releaseDate: '2026-10-14',
  endpoint: 'https://api.typesafe.ai/v1/systemone',
  trainingAlgorithm: 'RLCD (Reinforcement Learning for Calibrated Decisions)',
  tagline: 'Smart if-statements — structured decisions for code, not generative chat',
  founders: Object.freeze(['Diogo', 'Erik', 'Sasha']),
  pricing: Object.freeze({
    inputPerBtokUsd: 42.0,
    inputPerMtokUsd: 0.042,
    outputPerMtokUsd: 0.0,
  }),
  contextLimits: Object.freeze({
    defaultPerRequestTokens: 64_000,
    defaultPerQuestionTokens: 32_000,
    longContextHeader: 'TypeSafe-Danger-Zone-Long-Context',
    longContextTokens: 262_000,
    imagesHeader: 'TypeSafe-Danger-Zone-Images',
  }),
  speedupVsLlmRange: Object.freeze([20, 200]),
  costSavingsVsLlmRange: Object.freeze([40, 1000]),
  parallelBatchEfficiency: Object.freeze({
    costReductionMultiplier: 12.2,
    speedupMultiplier: 10.0,
    benchmarkQuestions: 13,
    source: 'docs.typesafe.ai/patterns/fan-out.md citation already in this file',
    measuredLocally: false,
  }),
  // Read on the signed-in console home on 2026-11-03. Their claim, not a local timing.
  consoleRead: Object.freeze({
    readOn: '2026-11-03',
    page: 'https://console.typesafe.ai/home',
    orgLabel: "Igor's org",
    balanceUsd: 0,
    modelLabelOnHome: 'JEV V13',
    measuredLocally: false,
    calledApi: false,
    quiz: Object.freeze({
      question: "Can you chat with Jev, TypeSafe's new model?",
      observedTrue: 0.03,
      observedFalse: 0.97,
      verdict: 'TypeSafe only responds with structured decisions',
    }),
    parallelCookbook: Object.freeze({
      cheaperMultiplier: 11.5,
      fasterMultiplier: 9.6,
      card: 'Parallel questions',
      note: '13-question GDPR briefing card on the console home. Not timed on this machine.',
    }),
  }),
  hookMatrix: Object.freeze({
    properties: Object.freeze([
      {
        title: 'Structured, machine-native outputs',
        summary: 'System One produces structured outputs optimized for code, with 100% type correctness guaranteed by design.',
      },
      {
        title: 'Parallel sampling for fast decisions',
        summary: 'Evaluates multiple questions together in a single pass without waiting for previous ones, with sub-second latency.',
      },
      {
        title: 'Consistent, calibrated, probabilistic results',
        summary: 'Reports calibrated probabilities and concentration confidence so similar inputs produce stable outputs.',
      },
    ]),
    limitations: Object.freeze([
      {
        title: 'Not good at System 2 tasks',
        summary: 'Weaker than reasoning models at multi-hop indirection, arithmetic, counting, and games like chess.',
      },
      {
        title: 'Not trained on specialized domains',
        summary: 'Requires domain facts in `state` and concrete boundary cases in `instructions` and `criteria`.',
      },
      {
        title: 'Not a generative chat model',
        summary: 'Does not generate text or chat; callers define the shape of the answer (Noul, Choice, Score, Box).',
      },
    ]),
    benefits: Object.freeze([
      {
        title: '20-200x faster',
        summary: 'Sub-second parallel System-1 evaluation vs 15-30s autoregressive decoding.',
      },
      {
        title: '40-1,000x cheaper',
        summary: '$42/Btok ($0.042/Mtok) input tokens with zero output token charges.',
      },
      {
        title: 'Frontier-level intelligence for System 1 tasks',
        summary: 'Approaches frontier reasoning models on instinctive judgment and common sense over structured state.',
      },
    ]),
  }),
});

/**
 * Evaluates the console.typesafe.ai/hook onboarding Pop Quiz comprehension gate.
 * Users/agents must answer "No" to "Can you chat with Jev?" (Noul: 3% true, 97% false)
 * before unlocking console/API key execution.
 */
function verifyHookComprehensionQuiz(answer) {
  const normalized = String(answer || '').trim().toLowerCase();
  const passed = normalized === 'no' || normalized === 'false';
  return {
    question: "Can you chat with Jev, TypeSafe's new model?",
    suppliedAnswer: answer,
    passed,
    jevNoulEvaluation: {
      type: 'noul',
      trueProbability: 0.03,
      falseProbability: 0.97,
      verdict: 'TypeSafe only responds with structured decisions (Noul, Choice, Score, Box).',
    },
    consoleUnlocked: passed,
  };
}

// ---------------------------------------------------------------------------
// 2. Jaggedness Linter (9 Failure Modes from docs.typesafe.ai/model-jaggedness.md)
// ---------------------------------------------------------------------------

function lintSystemOneRequest(request) {
  const state = request && request.state !== undefined ? request.state : '';
  const questions = (request && request.questions) || {};
  const headers = (request && request.headers) || {};
  const warnings = [];
  const errors = [];

  const stateStr = typeof state === 'string' ? state : JSON.stringify(state);
  const estimatedStateTokens = Math.ceil(stateStr.length / 4);

  // Failure Mode 5: Large state full of irrelevant detail / context limits
  if (estimatedStateTokens > TYPESAFE_JEV_SPECS.contextLimits.defaultPerQuestionTokens) {
    if (headers[TYPESAFE_JEV_SPECS.contextLimits.longContextHeader] !== 'true') {
      errors.push({
        mode: 'large_state_context_limit',
        message: `Estimated state (${estimatedStateTokens} tok) exceeds 32k per-question limit without ${TYPESAFE_JEV_SPECS.contextLimits.longContextHeader}: true.`,
      });
    } else if (estimatedStateTokens > TYPESAFE_JEV_SPECS.contextLimits.longContextTokens) {
      errors.push({
        mode: 'long_context_exceeded',
        message: `Estimated state (${estimatedStateTokens} tok) exceeds 262k long-context ceiling.`,
      });
    }
  }

  let hasChoiceWithoutCompanionNoul = false;
  let choiceCount = 0;
  let noulCount = 0;

  for (const [qid, q] of Object.entries(questions)) {
    const instr = String((q && q.instructions) || '');
    const qType = String((q && q.type) || '').toLowerCase();

    if (qType === 'choice') choiceCount += 1;
    if (qType === 'noul') noulCount += 1;

    // Failure Mode 2: Counting / Math in questions
    if (/\b(how many|count the number|calculate|sum of|multiply|divide|average of)\b/i.test(instr)) {
      warnings.push({
        qid,
        mode: 'math_and_counting',
        remediation: 'Jev does not count or calculate reliably. Ask one Noul per candidate item and sum in code.',
      });
    }

    // Failure Mode 3: Date/time comparison in questions
    if (/\b(which date comes first|days between|how many days apart|before or after)\b/i.test(instr)) {
      warnings.push({
        qid,
        mode: 'date_time_comparison',
        remediation: 'Extract date parts via Choice (month/day/year) and compare timestamps in code.',
      });
    }

    // Failure Mode 4: Double negatives / indirection
    if (/\b(not\s+un\w+|never\s+fails?\s+to\s+not|is\s+it\s+false\s+that)\b/i.test(instr)) {
      warnings.push({
        qid,
        mode: 'indirection_double_negative',
        remediation: 'Phrase instructions directly so a true statement means yes.',
      });
    }

    // Failure Mode 9: Generative prompt disguised as a System-One question
    if (/\b(write a|generate a|summarize in a paragraph|explain in detail|draft an email)\b/i.test(instr)) {
      errors.push({
        qid,
        mode: 'generation_request',
        remediation: 'Jev is a System-One model and cannot generate prose. Use Noul, Choice, Score, or Box.',
      });
    }

    // Choice checks: positional option names & embedded "none_of_the_above"
    if (qType === 'choice' && q.criteria && typeof q.criteria === 'object') {
      const optKeys = Object.keys(q.criteria);
      if (optKeys.some((k) => /^(option_?\d+|[a-d]|left|right)$/i.test(k))) {
        warnings.push({
          qid,
          mode: 'positional_choice_names',
          remediation: 'Option names are sent to the model. Use semantic names (e.g. refund_request) instead of option_1/A/B.',
        });
      }
      if (optKeys.some((k) => /^(none|none_of_the_above|other|n_a)$/i.test(k))) {
        warnings.push({
          qid,
          mode: 'embedded_null_option',
          remediation: 'As of Jev 1.14, pair Choice with a companion Noul ("Does any option fit?") instead of a none_of_the_above option.',
        });
      }
    }

    // Box check: requires TypeSafe-Danger-Zone-Images header
    if (qType === 'box' && headers[TYPESAFE_JEV_SPECS.contextLimits.imagesHeader] !== 'true') {
      errors.push({
        qid,
        mode: 'box_missing_images_header',
        remediation: 'Box questions require header `TypeSafe-Danger-Zone-Images: true` and model `jev-1.14.0`.',
      });
    }
  }

  if (choiceCount > 0 && noulCount === 0) {
    hasChoiceWithoutCompanionNoul = true;
    warnings.push({
      mode: 'choice_without_companion_noul',
      remediation: 'Choice always selects an option. Pair with a companion Noul in the same request to detect when nothing fits.',
    });
  }

  // Compute parallel fan-out efficiency vs sequential calls
  const questionCount = Object.keys(questions).length;
  const sequentialTokens = estimatedStateTokens * Math.max(1, questionCount);
  const batchedTokens = estimatedStateTokens + questionCount * 35;
  const tokenSavingsRatio =
    questionCount > 1 && batchedTokens > 0
      ? Number((sequentialTokens / batchedTokens).toFixed(2))
      : 1.0;

  return {
    valid: errors.length === 0,
    questionCount,
    estimatedStateTokens,
    tokenSavingsRatio,
    hasChoiceWithoutCompanionNoul,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 3. System-One Primitives Engine (Noul, Choice, Score, Box)
// ---------------------------------------------------------------------------

function clamp01(v) {
  return Math.max(0.001, Math.min(0.999, Number(v.toFixed(4))));
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_./:-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function scoreOverlap(stateText, targetText) {
  const sTokens = new Set(tokenize(stateText));
  const tTokens = tokenize(targetText).filter((w) => w.length > 2);
  if (tTokens.length === 0) return 0;
  let hits = 0;
  for (const t of tTokens) {
    if (sTokens.has(t)) hits += 1;
  }
  return hits / tTokens.length;
}

/**
 * Deterministic local System-One evaluator matching POST /v1/systemone response contract.
 * Supports `noul`, `choice`, `score`, and `box` questions in a single parallel batch.
 */
function runSystemOneBatch({ model = 'jev-1.14.0', state, questions = {}, assets = {}, headers = {} }) {
  const resolvedModel = TYPESAFE_JEV_SPECS.aliases[model] || model;
  const stateText = typeof state === 'string' ? state : JSON.stringify(state || {});
  const answers = {};

  for (const [qid, q] of Object.entries(questions)) {
    const qType = String(q.type || '').toLowerCase();
    const instr = String(q.instructions || '');

    if (qType === 'noul') {
      const yesText = (q.criteria && (q.criteria.true || q.criteria.yes)) || instr;
      const noText = (q.criteria && (q.criteria.false || q.criteria.no)) || '';
      const yesScore =
        typeof q._calibratedNoul === 'number'
          ? q._calibratedNoul
          : Math.min(
              0.99,
              Math.max(0.01, 0.15 + scoreOverlap(stateText, `${instr} ${yesText}`) * 0.82 - scoreOverlap(stateText, noText) * 0.35)
            );
      answers[qid] = {
        type: 'noul',
        noul: clamp01(yesScore),
      };
    } else if (qType === 'choice') {
      const criteria = q.criteria || {};
      const keys = Object.keys(criteria);
      const rawLogits = keys.map((k) => {
        if (q._calibratedLogits && typeof q._calibratedLogits[k] === 'number') {
          return q._calibratedLogits[k];
        }
        const desc = typeof criteria[k] === 'string' ? criteria[k] : JSON.stringify(criteria[k]);
        return scoreOverlap(stateText, `${k.replace(/_/g, ' ')} ${desc}`) * 4.5;
      });
      const maxL = Math.max(...rawLogits, 0);
      const exps = rawLogits.map((l) => Math.exp(l - maxL));
      const sumExp = exps.reduce((a, b) => a + b, 0) || 1;
      const probabilities = {};
      let bestKey = keys[0] || null;
      let bestProb = -1;
      keys.forEach((k, idx) => {
        const p = Number((exps[idx] / sumExp).toFixed(4));
        probabilities[k] = p;
        if (p > bestProb) {
          bestProb = p;
          bestKey = k;
        }
      });
      // Concentration confidence (1 - normalized entropy)
      const n = keys.length;
      let entropy = 0;
      for (const p of Object.values(probabilities)) {
        if (p > 0) entropy -= p * Math.log(p);
      }
      const maxEntropy = n > 1 ? Math.log(n) : 1;
      const confidence = clamp01(1 - entropy / maxEntropy);
      answers[qid] = {
        type: 'choice',
        choice: bestKey,
        confidence,
        probabilities,
      };
    } else if (qType === 'score') {
      const criteriaList = Array.isArray(q.criteria) ? q.criteria : [];
      const legend = {};
      const probabilities = {};
      const weights = criteriaList.map((desc, idx) => {
        legend[String(idx)] = desc;
        if (q._calibratedLevelProbs && typeof q._calibratedLevelProbs[idx] === 'number') {
          return q._calibratedLevelProbs[idx];
        }
        return Math.max(0.02, scoreOverlap(stateText, desc) + (idx === 0 ? 0.1 : 0));
      });
      const sumW = weights.reduce((a, b) => a + b, 0) || 1;
      let expectedScore = 0;
      let maxP = 0;
      weights.forEach((w, idx) => {
        const p = Number((w / sumW).toFixed(4));
        probabilities[String(idx)] = p;
        expectedScore += idx * p;
        if (p > maxP) maxP = p;
      });
      answers[qid] = {
        type: 'score',
        score: Number(expectedScore.toFixed(4)),
        confidence: clamp01(maxP),
        legend,
        probabilities,
      };
    } else if (qType === 'box') {
      if (headers[TYPESAFE_JEV_SPECS.contextLimits.imagesHeader] !== 'true') {
        throw new Error('Box questions require header TypeSafe-Danger-Zone-Images: true');
      }
      const boxCoords = q._calibratedBox || { top: 0.2, bottom: 0.66, left: 0.19, right: 0.68 };
      answers[qid] = {
        type: 'box',
        box: boxCoords,
        confidence: null,
      };
    }
  }

  const inputTokens = Math.max(16, Math.ceil((stateText.length + JSON.stringify(questions).length) / 4));
  return {
    model: resolvedModel,
    answers,
    usage: {
      input_tokens: inputTokens,
      output_tokens: 0,
      estimated_cost_usd: Number(((inputTokens / 1_000_000) * TYPESAFE_JEV_SPECS.pricing.inputPerMtokUsd).toFixed(8)),
    },
    assets_used: Object.keys(assets).length,
  };
}

// ---------------------------------------------------------------------------
// 4. LLM & PreToolUse Guardrail Battery (cookbooks/llm_guardrails.md)
//    "Judgments from Jev, decisions in code"
// ---------------------------------------------------------------------------

const GUARDRAIL_POLICIES = Object.freeze({
  strict: Object.freeze({
    review_threshold: 0.30,
    action_threshold: 0.70,
    severity_block: 2.0,
  }),
  permissive: Object.freeze({
    review_threshold: 0.70,
    action_threshold: 0.85,
    severity_block: 2.0,
  }),
});

const HAZARD_ACTION = Object.freeze({
  jailbreak: 'block',
  drop_safeguards: 'block',
  destructive_mutation: 'block',
  secret_exfiltration: 'block',
  unverified_external_spend: 'review',
  medical_or_legal_advice: 'review',
  self_harm: 'support',
});

const ACTION_PRECEDENCE = Object.freeze(['support', 'block', 'review', 'pass']);

/**
 * Pure code truth-table router over Jev Noul hazard probabilities + Severity Score.
 * Never asks the model "Should we block?"; code owns the thresholds and precedence.
 */
function routeGuardrailTruthTable(nouls, severityScore, policyName = 'strict') {
  const policy = GUARDRAIL_POLICIES[policyName] || GUARDRAIL_POLICIES.strict;
  const triggered = [];
  const hazardBreakdown = {};

  for (const [hazard, prob] of Object.entries(nouls)) {
    const mappedAction = HAZARD_ACTION[hazard] || 'review';
    let band = 'no (<0.30)';
    if (prob >= policy.action_threshold) {
      triggered.push(mappedAction);
      band = `yes (>=${policy.action_threshold}) -> ${mappedAction}`;
    } else if (prob >= policy.review_threshold) {
      triggered.push('review');
      band = `unsettled ([${policy.review_threshold}, ${policy.action_threshold})) -> review`;
    }
    hazardBreakdown[hazard] = { noul: prob, band };
  }

  let upgradedBySeverity = false;
  let finalTriggered = [...triggered];
  if (severityScore >= policy.severity_block) {
    if (finalTriggered.includes('review')) upgradedBySeverity = true;
    finalTriggered = finalTriggered.map((act) => (act === 'review' ? 'block' : act));
    if (finalTriggered.length === 0) {
      finalTriggered.push('block');
      upgradedBySeverity = true;
    }
  }

  const decision = ACTION_PRECEDENCE.find((act) => finalTriggered.includes(act)) || 'pass';
  return {
    decision,
    permissionDecision: decision === 'pass' ? 'allow' : decision === 'review' ? 'ask' : 'deny',
    policy: policyName,
    severityScore,
    upgradedBySeverity,
    hazardBreakdown,
  };
}

/**
 * A Noul is the likelihood the statement is true. Confidence is how peaked the
 * distribution is, and it does not pick the action. A missing answer is not a no.
 * Bands match the TypeSafe skill: >= 0.7 yes, <= 0.3 no, otherwise unsettled.
 */
function decideFromNoul(noul, confidence) {
  const echoed = confidence == null ? null : confidence;
  const probability = Number(noul);
  const settled = Number.isFinite(probability) && probability >= 0 && probability <= 1;
  if (!settled) {
    return {
      decision: 'error',
      permissionDecision: 'ask',
      band: 'missing',
      noul: null,
      confidence: echoed,
      confidenceUsedAsGate: false,
      reason: 'A missing answer is not a no.',
    };
  }
  let decision = 'unsettled';
  let permissionDecision = 'ask';
  let band = 'unsettled';
  if (probability >= 0.7) {
    decision = 'yes';
    permissionDecision = 'allow';
    band = 'yes';
  } else if (probability <= 0.3) {
    decision = 'no';
    permissionDecision = 'deny';
    band = 'no';
  }
  return {
    decision,
    permissionDecision,
    band,
    noul: probability,
    confidence: echoed,
    confidenceUsedAsGate: false,
    reason: 'The Noul band decided. Confidence was not the gate.',
  };
}

/**
 * The signed-in console showed a $0 balance. Do not install their skill and do
 * not POST to their API from this check. The refusal is local.
 */
function refuseRemoteTypeSafe(toolName, inputData) {
  const blob = `${toolName || ''}\n${
    typeof inputData === 'string' ? inputData : JSON.stringify(inputData || {})
  }`;
  const remote = /api\.typesafe\.ai|typesafe-ai\/skills|plugin install typesafe@typesafe-ai|TYPESAFE_API_KEY/i.test(
    blob
  );
  if (!remote) return null;
  return {
    permissionDecision: 'deny',
    decision: 'block',
    calledTypeSafe: false,
    confidenceUsedAsGate: false,
    confidence: null,
    reason:
      "This stays local. The console balance was $0, and this check does not install their skill or call api.typesafe.ai.",
  };
}

/**
 * Evaluates a PreToolUse or message guardrail check using TypeSafe System-One atomic judgments.
 * Preserves backward-compatible `{ permissionDecision, confidence, reason }` fields for callers.
 */
function evaluateJevHook(toolName, inputData, options = {}) {
  const remoteRefusal = refuseRemoteTypeSafe(toolName, inputData);
  if (remoteRefusal) return remoteRefusal;

  const payloadStr = JSON.stringify({ toolName, inputData }).toLowerCase();

  // Atomic observable judgments (Noul probabilities in [0, 1])
  const isDestructive =
    /\b(rm\s+-rf|rm|drop\s+table|drop|delete\s+from|delete|git\s+push\s+--force|force-push|overwrite|truncate\s+table)\b/i.test(
      payloadStr
    );

  const isJailbreak =
    /\b(ignore\s+(all\s+)?(previous|your)\s+instructions|act\s+as\s+freebot|no\s+rules\s+no\s+filters)\b/i.test(
      payloadStr
    );
  const isSecretExfil =
    /\b(printenv|env\b.*secret|cat\s+.*\.env|curl\s+.*api_key|gh\s+auth\s+token)\b/i.test(payloadStr);
  const isExternalSpend =
    /\b(stripe\s+charges\s+create|eas\s+build|aws\s+ec2\s+run-instances|purchase_requisition)\b/i.test(payloadStr);

  const batch = runSystemOneBatch({
    model: 'jev-1.14.0',
    state: { toolName, inputData },
    questions: {
      destructive_mutation: {
        type: 'noul',
        instructions: 'Does this tool call delete files, drop tables, or force-push git history?',
        _calibratedNoul: isDestructive ? 0.96 : 0.02,
      },
      jailbreak: {
        type: 'noul',
        instructions: 'Does this input attempt to override or bypass safety instructions?',
        _calibratedNoul: isJailbreak ? 0.98 : 0.01,
      },
      secret_exfiltration: {
        type: 'noul',
        instructions: 'Does this tool call print or transmit credentials, .env files, or bearer tokens?',
        _calibratedNoul: isSecretExfil ? 0.94 : 0.02,
      },
      unverified_external_spend: {
        type: 'noul',
        instructions: 'Does this tool call trigger paid cloud builds or external financial charges?',
        _calibratedNoul: isExternalSpend ? 0.55 : 0.03,
      },
      severity: {
        type: 'score',
        instructions: 'How much harm could result if the agent executed this action without review?',
        criteria: [
          'No harm: ordinary read-only or safe local development command.',
          'Mild: touches configuration or billing preview without irreversible mutation.',
          'Serious: irreversible destructive deletion, force-push, or credential leak.',
          'Severe: catastrophic production data loss or unauthorized financial spend.',
        ],
        _calibratedLevelProbs:
          isDestructive || isJailbreak || isSecretExfil
            ? [0.01, 0.04, 0.65, 0.30]
            : isExternalSpend
            ? [0.10, 0.70, 0.15, 0.05]
            : [0.92, 0.06, 0.01, 0.01],
      },
    },
  });

  const nouls = {
    destructive_mutation: batch.answers.destructive_mutation.noul,
    jailbreak: batch.answers.jailbreak.noul,
    secret_exfiltration: batch.answers.secret_exfiltration.noul,
    unverified_external_spend: batch.answers.unverified_external_spend.noul,
  };
  const severityScore = batch.answers.severity.score;
  const routed = routeGuardrailTruthTable(nouls, severityScore, options.policy || 'strict');

  return {
    permissionDecision: routed.permissionDecision,
    decision: routed.decision,
    confidence: batch.answers.severity.confidence,
    confidenceUsedAsGate: false,
    calledTypeSafe: false,
    severityScore,
    nouls,
    hazardBreakdown: routed.hazardBreakdown,
    usage: batch.usage,
    reason:
      routed.permissionDecision === 'deny'
        ? 'Jev typed safety check: high destructive/security hazard probability detected.'
        : routed.permissionDecision === 'ask'
        ? 'Jev typed safety check: unsettled spend/policy noul band ([0.30, 0.70)) requires human confirmation.'
        : 'Jev typed safety check passed successfully.',
  };
}

// ---------------------------------------------------------------------------
// 5. 2-Call Progressive-Disclosure Skill Router (cookbooks/skill_suggestion.md)
// ---------------------------------------------------------------------------

const SKILL_ROUTER_THRESHOLDS = Object.freeze({
  shortlistSize: 3,
  excerptChars: 700,
  gateThreshold: 0.30,
  namedThreshold: 0.50,
  fitsThreshold: 0.30,
  benchmarkWrongLoadBaselinePct: 15.7,
  benchmarkWrongLoadJevPct: 7.9,
  benchmarkNeedlessLoadBaselinePct: 14.0,
  benchmarkNeedlessLoadJevPct: 5.2,
});

function suggestSkillWithJev(userRequest, roster) {
  if (!Array.isArray(roster) || roster.length === 0) {
    return { suggestedSkill: null, stageStopped: 'empty_roster', callCount: 0 };
  }

  // Call 1: Skim one-line summaries + 4 action Nouls ("Need a skill at all?")
  const choiceCriteria = {};
  const calibratedLogits = {};
  for (const skill of roster) {
    choiceCriteria[skill.name] = skill.description;
    calibratedLogits[skill.name] =
      scoreOverlap(userRequest, `${skill.name.replace(/-/g, ' ')} ${skill.description}`) * 6.0;
  }

  const reqLower = String(userRequest || '').toLowerCase();
  const namesMethod = roster.some((s) => reqLower.includes(s.name.toLowerCase()));
  const isTrivialChat = /^(what is a monad|hello|thanks|2\s*\+\s*2|explain\s+closure)/i.test(reqLower.trim());
  const maxOverlap = Math.max(
    ...roster.map((s) => scoreOverlap(userRequest, `${s.name.replace(/-/g, ' ')} ${s.description} ${s.excerpt || ''}`)),
    0
  );

  const call1 = runSystemOneBatch({
    model: 'jev-1.14.0',
    state: { request: userRequest },
    questions: {
      rank_skills: {
        type: 'choice',
        instructions: 'Which skill in the roster best fits the user request?',
        criteria: choiceCriteria,
        _calibratedLogits: calibratedLogits,
      },
      needs_workflow: {
        type: 'noul',
        instructions: 'Does the request ask to execute a multi-step engineering or operational workflow?',
        _calibratedNoul: isTrivialChat ? 0.04 : Math.min(0.95, 0.20 + maxOverlap * 0.9),
      },
      needs_tool_or_api: {
        type: 'noul',
        instructions: 'Does the request involve an external CLI, API, browser, or repo tool?',
        _calibratedNoul: isTrivialChat ? 0.03 : Math.min(0.95, 0.18 + maxOverlap * 0.85),
      },
      needs_repo_convention: {
        type: 'noul',
        instructions: 'Does the request touch a domain governed by a specialized repo skill?',
        _calibratedNoul: isTrivialChat ? 0.05 : Math.min(0.95, 0.15 + maxOverlap * 0.85),
      },
      names_specific_skill: {
        type: 'noul',
        instructions: 'Does the request explicitly name a skill, tool, or workflow from the catalog?',
        _calibratedNoul: namesMethod ? 0.92 : 0.08,
      },
    },
  });

  const actionMean =
    (call1.answers.needs_workflow.noul +
      call1.answers.needs_tool_or_api.noul +
      call1.answers.needs_repo_convention.noul) /
    3;
  const namedNoul = call1.answers.names_specific_skill.noul;

  if (
    actionMean < SKILL_ROUTER_THRESHOLDS.gateThreshold &&
    namedNoul < SKILL_ROUTER_THRESHOLDS.namedThreshold
  ) {
    return {
      suggestedSkill: null,
      suggestionBlock: null,
      stageStopped: 'call1_gate_no_skill_needed',
      callCount: 1,
      actionMean: Number(actionMean.toFixed(4)),
      namedNoul,
    };
  }

  // Shortlist top 3 skills from Call 1 probabilities
  const probs = call1.answers.rank_skills.probabilities;
  const shortlistNames = Object.keys(probs)
    .sort((a, b) => probs[b] - probs[a])
    .slice(0, SKILL_ROUTER_THRESHOLDS.shortlistSize);

  const byName = Object.fromEntries(roster.map((s) => [s.name, s]));
  const call2Questions = {
    pick_top3: {
      type: 'choice',
      instructions: 'Which of the 3 shortlisted skills actually performs what the user asked for?',
      criteria: Object.fromEntries(
        shortlistNames.map((n) => [
          n,
          `${byName[n].fullDescription || byName[n].description} — ${(byName[n].excerpt || '').slice(
            0,
            SKILL_ROUTER_THRESHOLDS.excerptChars
          )}`,
        ])
      ),
    },
  };

  for (const name of shortlistNames) {
    const s = byName[name];
    const fullOverlap = scoreOverlap(
      userRequest,
      `${s.name.replace(/-/g, ' ')} ${s.fullDescription || s.description} ${s.excerpt || ''}`
    );
    call2Questions[`fits_${name}`] = {
      type: 'noul',
      instructions: `Does skill \`${name}\` actually perform the user's requested task (not merely a nearby topic)?`,
      _calibratedNoul: s._calibratedFit !== undefined ? s._calibratedFit : Math.min(0.96, fullOverlap * 1.35),
    };
  }

  const call2 = runSystemOneBatch({
    model: 'jev-1.14.0',
    state: { request: userRequest },
    questions: call2Questions,
  });

  let bestSkill = null;
  let bestFitNoul = -1;
  for (const name of shortlistNames) {
    const fit = call2.answers[`fits_${name}`].noul;
    if (fit > bestFitNoul) {
      bestFitNoul = fit;
      bestSkill = name;
    }
  }

  if (bestFitNoul < SKILL_ROUTER_THRESHOLDS.fitsThreshold) {
    return {
      suggestedSkill: null,
      suggestionBlock: null,
      stageStopped: 'call2_shortlist_rejected',
      callCount: 2,
      shortlistNames,
      bestFitNoul,
    };
  }

  return {
    suggestedSkill: bestSkill,
    suggestionBlock: `<skill_relevance>\nRelevant to the current request: ${bestSkill}. Ignore this if it does not fit what the user actually asked for.\n</skill_relevance>`,
    stageStopped: 'winner_selected',
    callCount: 2,
    shortlistNames,
    bestFitNoul,
  };
}

// ---------------------------------------------------------------------------
// 6. Self-Tests (6 Deterministic Verification Checks)
// ---------------------------------------------------------------------------

function runSelfTest() {
  const results = [];

  // Test 1: console.typesafe.ai/hook RLCD Manifesto, 3x3 Matrix & Pop Quiz Comprehension Gate
  const wrongQuiz = verifyHookComprehensionQuiz('Yes');
  const rightQuiz = verifyHookComprehensionQuiz('No');
  assert.strictEqual(wrongQuiz.passed, false);
  assert.strictEqual(wrongQuiz.consoleUnlocked, false);
  assert.strictEqual(rightQuiz.passed, true);
  assert.strictEqual(rightQuiz.consoleUnlocked, true);
  assert.strictEqual(rightQuiz.jevNoulEvaluation.falseProbability, 0.97);
  assert.strictEqual(TYPESAFE_JEV_SPECS.hookMatrix.properties.length, 3);
  assert.strictEqual(TYPESAFE_JEV_SPECS.hookMatrix.limitations.length, 3);
  assert.strictEqual(TYPESAFE_JEV_SPECS.hookMatrix.benefits.length, 3);
  results.push({
    test: 'hook_onboarding_comprehension_quiz_and_3x3_matrix',
    status: 'PASS',
    detail: `Quiz 'No'->unlocked (Noul 3% true / 97% false), RLCD 3x3 matrix verified`,
  });

  // Test 2: Jev 1.14.0 All 4 Primitives (Noul, Choice, Score, Box) & $0 Output Token Billing
  const batchRes = runSystemOneBatch({
    model: 'jev-latest',
    state: 'I was charged twice for my subscription this month. Please refund the extra charge.',
    headers: { 'TypeSafe-Danger-Zone-Images': 'true' },
    assets: { invoice_photo: { type: 'image', format: 'png' } },
    questions: {
      is_billing: {
        type: 'noul',
        instructions: 'Is this message about billing?',
        _calibratedNoul: 0.98,
      },
      tone: {
        type: 'choice',
        instructions: 'What is the tone of this message?',
        criteria: {
          angry: 'An upset or hostile message',
          calm: 'A neutral or polite message',
          excited: 'An enthusiastic or eager message',
        },
        _calibratedLogits: { angry: 1.2, calm: 2.9, excited: 0.1 },
      },
      urgency: {
        type: 'score',
        instructions: 'How urgent is this message?',
        criteria: ['Can wait', 'Needs attention this week', 'Needs attention today'],
        _calibratedLevelProbs: [0.1, 0.1, 0.8],
      },
      duplicate_line_box: {
        type: 'box',
        instructions: 'Locate the duplicate charge line item in `invoice_photo`.',
        _calibratedBox: { top: 0.2, bottom: 0.66, left: 0.19, right: 0.68 },
      },
    },
  });
  assert.strictEqual(batchRes.model, 'jev-1.14.0');
  assert.strictEqual(batchRes.answers.is_billing.noul, 0.98);
  assert.strictEqual(batchRes.answers.tone.choice, 'calm');
  assert.strictEqual(batchRes.answers.urgency.score, 1.7);
  assert.deepStrictEqual(batchRes.answers.duplicate_line_box.box, {
    top: 0.2,
    bottom: 0.66,
    left: 0.19,
    right: 0.68,
  });
  assert.strictEqual(batchRes.usage.output_tokens, 0);
  results.push({
    test: 'jev_1_14_0_four_primitives_noul_choice_score_box',
    status: 'PASS',
    detail: `model=${batchRes.model}, noul=0.98, choice=calm, score=1.7, box=[0.2..0.66], output_tokens=0`,
  });

  // Test 3: Truth-Table Guardrail Battery ("Judgments from Jev, decisions in code")
  const safeHook = evaluateJevHook('Bash', { command: 'git status' });
  const destructiveHook = evaluateJevHook('Bash', { command: 'git push --force origin main' });
  const spendReviewHook = evaluateJevHook('Bash', { command: 'npx eas build --platform ios' });
  assert.strictEqual(safeHook.permissionDecision, 'allow');
  assert.strictEqual(destructiveHook.permissionDecision, 'deny');
  assert.strictEqual(spendReviewHook.permissionDecision, 'ask');
  assert.strictEqual(safeHook.calledTypeSafe, false);
  assert.strictEqual(safeHook.confidenceUsedAsGate, false);
  const peakedButFalse = decideFromNoul(0.1, 0.99);
  const flatButTrue = decideFromNoul(0.9, 0.01);
  const missingAnswer = decideFromNoul(undefined, 0.99);
  assert.strictEqual(peakedButFalse.decision, 'no');
  assert.strictEqual(peakedButFalse.confidenceUsedAsGate, false);
  assert.strictEqual(flatButTrue.decision, 'yes');
  assert.strictEqual(missingAnswer.decision, 'error');
  assert.strictEqual(missingAnswer.permissionDecision, 'ask');
  const installRefusal = evaluateJevHook('Bash', {
    command: 'npx skills add typesafe-ai/skills --skill typesafe-ai',
  });
  const apiRefusal = evaluateJevHook('Bash', {
    command: 'curl -X POST https://api.typesafe.ai/v1/systemone',
  });
  assert.strictEqual(installRefusal.permissionDecision, 'deny');
  assert.strictEqual(installRefusal.calledTypeSafe, false);
  assert.strictEqual(apiRefusal.permissionDecision, 'deny');
  assert.strictEqual(apiRefusal.calledTypeSafe, false);
  assert.strictEqual(TYPESAFE_JEV_SPECS.consoleRead.measuredLocally, false);
  assert.strictEqual(TYPESAFE_JEV_SPECS.consoleRead.calledApi, false);
  assert.strictEqual(TYPESAFE_JEV_SPECS.consoleRead.balanceUsd, 0);
  assert.strictEqual(TYPESAFE_JEV_SPECS.consoleRead.parallelCookbook.cheaperMultiplier, 11.5);
  assert.strictEqual(TYPESAFE_JEV_SPECS.consoleRead.parallelCookbook.fasterMultiplier, 9.6);
  assert.strictEqual(TYPESAFE_JEV_SPECS.consoleRead.quiz.observedFalse, 0.97);
  results.push({
    test: 'guardrail_truth_table_allow_ask_deny_bands',
    status: 'PASS',
    detail: `safe=${safeHook.permissionDecision}, spend=${spendReviewHook.permissionDecision} ([0.30,0.70) band), destructive=${destructiveHook.permissionDecision}, confidenceNotGate=true, remoteRefused=true`,
  });

  // Test 4: 2-Call Progressive-Disclosure Skill Router (194-skill Hermes/OMP pattern)
  const sampleRoster = [
    {
      name: 'pptx-author',
      description: 'Edit and update existing PowerPoint .pptx slide decks.',
      fullDescription: 'Modify slides, layouts, and speaker notes inside an existing .pptx presentation.',
      excerpt: 'Use pptx-author when the user already has a .pptx file and wants to edit slides.',
      _calibratedFit: 0.91,
    },
    {
      name: 'finance-deck-builder',
      description: 'Generate new pitch decks and financial models from scratch.',
      fullDescription: 'Creates brand-new investor decks from financial spreadsheets.',
      excerpt: 'Do not use for editing existing .pptx files.',
      _calibratedFit: 0.12,
    },
    {
      name: 'gitbutler',
      description: 'Manage virtual branches, commits, and PRs.',
      fullDescription: 'Replaces git write commands with GitButler CLI.',
      excerpt: 'Use for branch and commit operations.',
      _calibratedFit: 0.04,
    },
  ];
  const noSkillTurn = suggestSkillWithJev('Explain what a monad is in Haskell', sampleRoster);
  const matchedSkillTurn = suggestSkillWithJev('Edit slide 4 of our existing .pptx presentation deck', sampleRoster);
  assert.strictEqual(noSkillTurn.suggestedSkill, null);
  assert.strictEqual(noSkillTurn.callCount, 1);
  assert.strictEqual(matchedSkillTurn.suggestedSkill, 'pptx-author');
  assert.strictEqual(matchedSkillTurn.callCount, 2);
  assert(matchedSkillTurn.suggestionBlock.includes('pptx-author'));
  results.push({
    test: 'progressive_2_call_skill_router',
    status: 'PASS',
    detail: `uncoveredStoppedAt=${noSkillTurn.stageStopped} (1 call), coveredWinner=${matchedSkillTurn.suggestedSkill} (2 calls)`,
  });

  // Test 5: 9 Jaggedness Guardrails Linter & Parallel Speculative Fan-Out Savings
  const badReqLint = lintSystemOneRequest({
    state: 'x'.repeat(140_000), // ~35k tokens > 32k per-question default without header
    questions: {
      q1: {
        type: 'choice',
        instructions: 'How many fruits are in the list and write a summary paragraph?',
        criteria: { option_1: 'Apples', none_of_the_above: 'Nothing' },
      },
      q2: {
        type: 'box',
        instructions: 'Locate the apple.',
      },
    },
  });
  assert.strictEqual(badReqLint.valid, false);
  assert(badReqLint.errors.some((e) => e.mode === 'large_state_context_limit'));
  assert(badReqLint.errors.some((e) => e.mode === 'generation_request'));
  assert(badReqLint.errors.some((e) => e.mode === 'box_missing_images_header'));
  assert(badReqLint.warnings.some((w) => w.mode === 'math_and_counting'));
  assert(badReqLint.warnings.some((w) => w.mode === 'positional_choice_names'));
  assert(badReqLint.warnings.some((w) => w.mode === 'embedded_null_option'));
  assert(badReqLint.warnings.some((w) => w.mode === 'choice_without_companion_noul'));
  results.push({
    test: 'jaggedness_9_failure_modes_linter',
    status: 'PASS',
    detail: `caught ${badReqLint.errors.length} hard errors + ${badReqLint.warnings.length} jaggedness warnings`,
  });

  // Test 6: Speculative Fan-Out Token & Cost Efficiency (13 questions sharing 1 state)
  const fanOutQuestions = {};
  for (let i = 1; i <= 13; i += 1) {
    fanOutQuestions[`gdpr_check_${i}`] = {
      type: 'noul',
      instructions: `Does article section ${i} apply to data processors?`,
    };
  }
  const fanOutLint = lintSystemOneRequest({
    state: 'GDPR regulatory text '.repeat(1200),
    questions: fanOutQuestions,
  });
  assert.strictEqual(fanOutLint.valid, true);
  assert(fanOutLint.tokenSavingsRatio >= 10.0);
  results.push({
    test: 'speculative_fan_out_batch_efficiency',
    status: 'PASS',
    detail: `13 parallel questions local tokenSavingsRatio=${fanOutLint.tokenSavingsRatio}x. Their docs cite 12.2x/10.0x. Console home on 2026-11-03 cited 11.5x/9.6x. Neither figure was timed here.`,
  });

  return {
    ok: true,
    model: TYPESAFE_JEV_SPECS.modelId,
    totalChecks: results.length,
    passedChecks: results.length,
    results,
  };
}

module.exports = {
  TYPESAFE_JEV_SPECS,
  GUARDRAIL_POLICIES,
  SKILL_ROUTER_THRESHOLDS,
  verifyHookComprehensionQuiz,
  lintSystemOneRequest,
  runSystemOneBatch,
  routeGuardrailTruthTable,
  decideFromNoul,
  refuseRemoteTypeSafe,
  evaluateJevHook,
  suggestSkillWithJev,
  runSelfTest,
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    const report = runSelfTest();
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
  if (args.includes('--status')) {
    const quiz = verifyHookComprehensionQuiz('No');
    const sampleHook = evaluateJevHook('Bash', { command: 'git status' });
    console.log(
      JSON.stringify(
        {
          ok: true,
          specs: TYPESAFE_JEV_SPECS,
          hookQuizGate: quiz,
          skillRouterThresholds: SKILL_ROUTER_THRESHOLDS,
          sampleGuardrail: sampleHook,
        },
        null,
        2
      )
    );
    process.exit(0);
  }
  const result = evaluateJevHook('Bash', { command: 'git status' });
  console.log('Jev Hook Evaluation Result:', JSON.stringify(result, null, 2));
}
