#!/usr/bin/env node
'use strict';

const { judgeOffer, summariseCheckout } = require('./lib/confidence-offer-gate');

const USAGE = [
  'usage: node tools/confidence-offer-gate.js offer',
  '       node tools/confidence-offer-gate.js summary',
  '       node tools/confidence-offer-gate.js project',
  '       node tools/confidence-offer-gate.js discount',
  '       node tools/confidence-offer-gate.js demo',
  '       node tools/confidence-offer-gate.js remote',
  '       node tools/confidence-offer-gate.js mcp',
  '       node tools/confidence-offer-gate.js slack',
  '       node tools/confidence-offer-gate.js github',
  '       node tools/confidence-offer-gate.js autopilot',
  '       node tools/confidence-offer-gate.js email',
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

function finish(plan, extraLine) {
  const label = plan.effect === 'sell' ? 'Admitted' : plan.effect === 'hold' ? 'Held' : 'Refused';
  process.stdout.write(`${label}. ${plan.reason}\n`);
  if (extraLine) {
    process.stdout.write(`${extraLine}\n`);
  }
  process.stdout.write('launched=false calledConfidence=false listingChanged=false recorded=0\n');
  if (plan.effect === 'sell') return 0;
  if (plan.effect === 'hold') return 75;
  return 77;
}

function requestFrom(argv) {
  if (marketed(argv)) return { uplift: true };
  const cmd = argv[0];
  if (cmd === 'offer' || cmd === 'summary' || cmd === 'project') return { surfaces: [] };
  if (cmd === 'discount') return { discount: true };
  if (cmd === 'demo') return { demo: true, name: 'Reduce checkout time (Ship)' };
  if (cmd === 'remote') return { callConfidence: true };
  if (cmd === 'mcp') return { addMcp: true, mcpUrl: 'https://mcp.confidence.dev/mcp/flags' };
  if (cmd === 'slack') return { addSlack: true };
  if (cmd === 'github') return { connectGithub: true };
  if (cmd === 'autopilot') return { autopilot: true, reviewBeforeAct: false };
  if (cmd === 'email') return { onboardingReply: true, senderEmail: 'jsoderholm@confidence.spotify.com' };
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
  if (argv[0] === 'summary') {
    const summary = summariseCheckout(request);
    return finish(
      summary,
      `regressions=${summary.regressionSummary} recommendation=${summary.recommendation} reviewBeforeAct=${summary.reviewBeforeAct} autopilot=${summary.autopilot}`,
    );
  }
  if (argv[0] === 'project') {
    const plan = judgeOffer(request);
    return finish(
      plan,
      `project=${plan.project.name} surface=${plan.offerUrl} metric=${plan.project.successMetric} reviewBeforeAct=${plan.reviewBeforeAct}`,
    );
  }
  return finish(judgeOffer(request));
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
