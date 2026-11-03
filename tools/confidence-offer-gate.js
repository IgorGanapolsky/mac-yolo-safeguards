#!/usr/bin/env node
'use strict';

const { judgeOffer } = require('./lib/confidence-offer-gate');

const USAGE = [
  'usage: node tools/confidence-offer-gate.js offer',
  '       node tools/confidence-offer-gate.js discount',
  '       node tools/confidence-offer-gate.js demo',
  '       node tools/confidence-offer-gate.js remote',
  '       node tools/confidence-offer-gate.js harm',
  '       node tools/confidence-offer-gate.js split --left URL --right URL',
].join('\n');

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1];
}

function marketed(argv) {
  return argv.includes('--rate') || argv.includes('--percent') || argv.includes('--pipeline') || argv.includes('--uplift');
}

function finish(plan) {
  const label = plan.effect === 'sell' ? 'Admitted' : plan.effect === 'hold' ? 'Held' : 'Refused';
  process.stdout.write(`${label}. ${plan.reason}\n`);
  process.stdout.write('launched=false calledConfidence=false listingChanged=false recorded=0\n');
  if (plan.effect === 'sell') return 0;
  if (plan.effect === 'hold') return 75;
  return 77;
}

function requestFrom(argv) {
  if (marketed(argv)) return { uplift: true };
  const cmd = argv[0];
  if (cmd === 'offer') return { surfaces: [] };
  if (cmd === 'discount') return { discount: true };
  if (cmd === 'demo') return { demo: true, name: 'Reduce checkout time (Ship)' };
  if (cmd === 'remote') return { callConfidence: true };
  if (cmd === 'harm') return { guardrailHarm: true };
  if (cmd === 'split') {
    const left = option(argv, '--left');
    const right = option(argv, '--right');
    if (!left || !right) return null;
    return { surfaces: [left, right] };
  }
  return null;
}

function main(argv) {
  const request = requestFrom(argv);
  if (!request) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  return finish(judgeOffer(request));
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
