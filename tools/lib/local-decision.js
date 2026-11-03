'use strict';

/**
 * A local decision is one named gate, with a probability of 1 on that gate
 * and 0 on the others. A score, and any option outside allow, ask, and block,
 * abstains. This module never downloads a model file and never generates text.
 */

const GATES = ['allow', 'ask', 'block'];
const PROCEED = 'may the agent proceed';

function optionNames(criteria) {
  if (Array.isArray(criteria) && criteria.every((item) => typeof item === 'string')) return criteria.slice();
  if (criteria && typeof criteria === 'object') return Object.keys(criteria);
  return null;
}

function localOptions(criteria) {
  const names = optionNames(criteria);
  if (!names || !names.length) return null;
  if (new Set(names).size !== names.length) return null;
  if (names.some((name) => !GATES.includes(name))) return null;
  return names;
}

function readableGate(gate) {
  return GATES.includes(gate);
}

function judgeQuestion(question, gate) {
  const qtype = question && question.type;
  if (qtype === 'score') return { effect: 'abstain', reason: 'No local score.' };
  if (qtype === 'choice') {
    const names = localOptions(question.criteria);
    if (!names) return { effect: 'abstain', reason: 'The options are not the local gate.' };
    if (!readableGate(gate)) return { effect: 'abstain', reason: 'The local gate is unreadable.' };
    if (!names.includes(gate)) return { effect: 'abstain', reason: 'The local gate is outside these options.' };
    const probabilities = {};
    for (const name of names) probabilities[name] = name === gate ? 1 : 0;
    return { effect: 'answer', choice: gate, probabilities, reason: 'The local gate picked one option.' };
  }
  if (qtype === 'noul') {
    const instructions = String((question && question.instructions) || '').toLowerCase();
    const proceed = question.id === 'proceed' || instructions.includes(PROCEED);
    if (!proceed) return { effect: 'abstain', reason: 'No local yes or no for this question.' };
    if (!readableGate(gate)) return { effect: 'abstain', reason: 'The local gate is unreadable.' };
    return { effect: 'answer', noul: gate === 'allow' ? 1 : 0, reason: 'Proceed only when the gate allows.' };
  }
  return { effect: 'abstain', reason: 'That question type has no local answer.' };
}

function acceptScore(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (claim.illustration === true || claim.pricing === true) return false;
  if (claim.rank != null || claim.price != null || claim.percent != null) return false;
  if (claim.source !== 'rule') return false;
  return claim.probability === 0 || claim.probability === 1;
}

module.exports = {
  GATES,
  PROCEED,
  acceptScore,
  judgeQuestion,
  localOptions,
  optionNames,
};
