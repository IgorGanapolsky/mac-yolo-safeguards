#!/usr/bin/env node
'use strict';

/**
 * Judgment-call review, from Anthropic's study of experts and agents.
 * Source: https://www.anthropic.com/research/agents-judgment-calls
 *
 * A judgment names both options and the caller's own prior.
 * Following an agent's lean needs local evidence.
 * Repeating the agent's wording needs a credit.
 * The study's rates are not stored as measurements we made.
 */

const SOURCE = 'https://www.anthropic.com/research/agents-judgment-calls';

const JUDGMENT = /\b(merge|approve|send|spend|delete|ship|publish|recommend\w*|policy|roll[\s-]?out|discontinue)\b/i;

const BARE_RATE = [
  /86\s*%/i,
  /77\s*%/i,
  /91(?:\.1)?\s*%/i,
  /28\s*%\s*faster/i,
];

const STUDY_SPECIFIC = [
  /blind deferral/i,
  /mode collapse/i,
  /60\s*%\s*(?:switched|abandon|of the time)/i,
  /112\s*(?:out of|\/)\s*123/i,
  /55\s*%[^.\n]{0,40}6\s*%/i,
  /62\s*(?:to|–|-)\s*82\s*percentage/i,
];

const STUDY_ATTRIBUTION = /\b(anthropic|defer\w*|judgment[\s-]calls?)\b|anthropic\.com\/research\/agents-judgment-calls/i;

function finding(id) {
  return { id, severity: 'block' };
}

function filled(value) {
  return String(value == null ? '' : value).trim();
}

function side(value) {
  const text = filled(value).toLowerCase();
  if (text === 'a' || text === 'b' || text === 'none') return text;
  return '';
}

function sameText(left, right) {
  const a = filled(left).toLowerCase().replace(/\s+/g, ' ');
  const b = filled(right).toLowerCase().replace(/\s+/g, ' ');
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 40 && a.includes(b)) return true;
  if (a.length >= 40 && b.includes(a)) return true;
  return false;
}

function claimsVendorStudy(blob) {
  if (STUDY_SPECIFIC.some((pattern) => pattern.test(blob))) return true;
  return BARE_RATE.some((pattern) => pattern.test(blob)) && STUDY_ATTRIBUTION.test(blob);
}

function isJudgment(input, task) {
  if (input.kind === 'judgment') return true;
  if (input.kind === 'routine') return false;
  if (!task) return true;
  return JUDGMENT.test(task);
}

function reviewJudgment(input = {}) {
  const task = filled(input.task);
  const blob = [
    task,
    input.reason,
    input.agentArgument,
    input.caseForA,
    input.caseForB,
    input.localEvidence,
  ].join('\n');
  const findings = [];
  if (claimsVendorStudy(blob)) findings.push(finding('vendor_study_claim'));

  const judgment = isJudgment(input, task);
  if (!judgment) {
    return {
      ok: findings.length === 0,
      status: findings.length ? 'blocked' : 'clear',
      judgment: false,
      findings,
      measuredDeferral: null,
      calledModel: false,
      source: SOURCE,
    };
  }

  const optionA = filled(input.optionA);
  const optionB = filled(input.optionB);
  const caseForA = filled(input.caseForA);
  const caseForB = filled(input.caseForB);
  const choice = side(input.choice);
  const prior = side(input.prior);
  const lean = side(input.agentLean);
  const evidence = filled(input.localEvidence);
  const reason = filled(input.reason);
  const agentArgument = filled(input.agentArgument);

  if (!optionA || !optionB || optionA.toLowerCase() === optionB.toLowerCase()) findings.push(finding('options_missing'));
  if (!caseForA || !caseForB || sameText(caseForA, caseForB)) findings.push(finding('one_sided'));
  if (choice !== 'a' && choice !== 'b') findings.push(finding('choice_missing'));
  if (prior !== 'a' && prior !== 'b' && prior !== 'none') findings.push(finding('prior_missing'));
  if (lean !== 'a' && lean !== 'b' && lean !== 'none') findings.push(finding('lean_missing'));
  if (sameText(reason, agentArgument) && input.creditedAgent !== true) findings.push(finding('uncited_agent_wording'));

  const followsLean = (lean === 'a' || lean === 'b') && choice === lean;
  if (followsLean && !evidence) findings.push(finding('signoff_without_evidence'));
  if (followsLean && evidence && sameText(evidence, agentArgument)) findings.push(finding('evidence_is_agent_text'));
  if (followsLean && (prior === 'a' || prior === 'b') && prior !== choice && input.creditedAgent !== true) {
    findings.push(finding('switched_to_lean'));
  }

  const agentModel = filled(input.agentModel);
  const secondModel = filled(input.secondModel);
  if (secondModel && agentModel && secondModel.toLowerCase() === agentModel.toLowerCase()) {
    findings.push(finding('same_model_second_check'));
  }

  return {
    ok: findings.length === 0,
    status: findings.length ? 'blocked' : 'clear',
    judgment: true,
    findings,
    measuredDeferral: null,
    calledModel: false,
    source: SOURCE,
  };
}

function formatStatus() {
  return [
    'Judgment-call review is ready. This command does not call a model.',
    'A merge, a send, a spend, or a recommendation needs both options, your own prior, and local evidence when the choice follows an agent lean.',
    'measuredDeferral: null',
  ].join('\n');
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--review')) {
    const report = reviewJudgment({
      task: argValue(argv, '--task'),
      kind: argValue(argv, '--kind'),
      optionA: argValue(argv, '--option-a'),
      optionB: argValue(argv, '--option-b'),
      choice: argValue(argv, '--choice'),
      prior: argValue(argv, '--prior'),
      agentLean: argValue(argv, '--lean'),
      caseForA: argValue(argv, '--case-a'),
      caseForB: argValue(argv, '--case-b'),
      reason: argValue(argv, '--reason'),
      agentArgument: argValue(argv, '--agent-argument'),
      localEvidence: argValue(argv, '--evidence'),
      creditedAgent: argv.includes('--credit'),
      agentModel: argValue(argv, '--agent-model'),
      secondModel: argValue(argv, '--second-model'),
    });
    if (argv.includes('--json')) console.log(JSON.stringify(report));
    else {
      console.log(formatStatus());
      console.log(report.ok ? 'Review: clear' : 'Review: blocked');
      for (const item of report.findings) console.log('blocked: ' + item.id);
    }
    process.exit(report.ok ? 0 : 2);
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      ready: true,
      calledModel: false,
      measuredDeferral: null,
      source: SOURCE,
    }));
  } else {
    console.log(formatStatus());
  }
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  reviewJudgment,
};
