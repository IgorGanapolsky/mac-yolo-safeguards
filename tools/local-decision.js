#!/usr/bin/env node
'use strict';

const { acceptScore, judgeQuestion } = require('./lib/local-decision');

const USAGE = [
  'usage: node tools/local-decision.js choice --gate allow|ask|block --options allow,ask,block',
  '       node tools/local-decision.js proceed --gate allow|ask|block',
  '       node tools/local-decision.js score',
  '       node tools/local-decision.js measure --probability 0|1 --source rule',
].join('\n');

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1];
}

function flag(argv, name) {
  return argv.includes(name);
}

function finish(effect, reason, line) {
  const label = effect === 'answer' ? 'Answered' : effect === 'abstain' ? 'Abstained' : 'Refused';
  const head = effect === 'answer' ? `${label} ${line}. ${reason}` : `${label}. ${reason}`;
  process.stdout.write(head + '\n');
  if (effect === 'answer') return 0;
  if (effect === 'abstain') return 75;
  return 77;
}

function choice(argv) {
  const gate = option(argv, '--gate');
  const options = option(argv, '--options');
  if (gate == null || options == null) return 2;
  const plan = judgeQuestion({ type: 'choice', criteria: options.split(',') }, gate);
  if (plan.effect !== 'answer') return finish(plan.effect, plan.reason);
  const probs = Object.entries(plan.probabilities).map(([name, value]) => `${name}=${value}`).join(' ');
  process.stdout.write(`Answered ${plan.choice}. ${plan.reason}\n${probs}\n`);
  return 0;
}

function proceed(argv) {
  const gate = option(argv, '--gate');
  if (gate == null) return 2;
  const plan = judgeQuestion({ type: 'noul', id: 'proceed', instructions: 'may the agent proceed' }, gate);
  if (plan.effect !== 'answer') return finish(plan.effect, plan.reason);
  process.stdout.write(`Answered ${plan.noul}. ${plan.reason}\n`);
  return 0;
}

function measure(argv) {
  const claim = { source: option(argv, '--source') };
  const probability = option(argv, '--probability');
  if (probability === '0' || probability === '1') claim.probability = Number(probability);
  if (flag(argv, '--rank') || flag(argv, '--price') || flag(argv, '--percent') || flag(argv, '--illustration')) {
    claim.rank = true;
  }
  if (!acceptScore(claim)) return finish('refuse', 'That score is not the local rule.');
  return finish('answer', 'The probability is the local rule.', String(claim.probability));
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'choice') {
    const code = choice(argv.slice(1));
    if (code === 2) process.stderr.write(USAGE + '\n');
    return code;
  }
  if (cmd === 'proceed') {
    const code = proceed(argv.slice(1));
    if (code === 2) process.stderr.write(USAGE + '\n');
    return code;
  }
  if (cmd === 'score') return finish('abstain', 'No local score.');
  if (cmd === 'measure') return measure(argv.slice(1));
  process.stderr.write(USAGE + '\n');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
