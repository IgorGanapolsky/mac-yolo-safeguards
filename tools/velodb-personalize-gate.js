#!/usr/bin/env node
'use strict';

const { judgePersonalize } = require('./lib/velodb-personalize-gate');

const USAGE = [
  'usage: node tools/velodb-personalize-gate.js label --workload NAME',
  '       node tools/velodb-personalize-gate.js trial',
  '       node tools/velodb-personalize-gate.js continue',
  '       node tools/velodb-personalize-gate.js remote',
  '       node tools/velodb-personalize-gate.js warehouse',
  '       node tools/velodb-personalize-gate.js claim',
].join('\n');

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1];
}

function marketed(argv) {
  return ['--relevance', '--latency', '--percent', '--compression', '--speedup'].some((flag) => argv.includes(flag));
}

function finish(plan) {
  const label = plan.effect === 'label' ? 'Admitted' : 'Refused';
  process.stdout.write(`${label}. ${plan.reason}\n`);
  process.stdout.write('provisioned=false calledVelo=false addedDatabase=false trialStarted=false\n');
  if (plan.effect === 'label') return 0;
  return 77;
}

function requestFrom(argv) {
  if (marketed(argv)) return { claim: true };
  const cmd = argv[0];
  if (cmd === 'label') {
    const workload = option(argv, '--workload');
    if (!workload) return null;
    return { workload };
  }
  if (cmd === 'trial') return { trial: true };
  if (cmd === 'continue') return { continueSetup: true };
  if (cmd === 'remote') return { callVelo: true };
  if (cmd === 'warehouse') return { addDatabase: true };
  if (cmd === 'claim') return { claim: true };
  return null;
}

function main(argv) {
  const request = requestFrom(argv);
  if (!request) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  return finish(judgePersonalize(request));
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
