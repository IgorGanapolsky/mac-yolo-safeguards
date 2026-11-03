#!/usr/bin/env node
'use strict';

/**
 * Ask before an agent build. Exit 0 admits it. Exit 75 means wait and ask again.
 * Missing foreground or load admits the build and changes nothing.
 * This command never signals a process.
 */

const lib = require('./lib/work-first-yield');

const USAGE = `usage: work-first-yield.js check --cmd <name> [--front <app>] [--load <n>] [--ncpu <n>] [--block] [--urgent]
       work-first-yield.js decide --front <app> --load <n> --ncpu <n>`;

function flag(name) {
  return process.argv.includes(name);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function numberOption(name) {
  const raw = option(name);
  if (raw === undefined) return NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : NaN;
}

function main(argv) {
  const command = argv[2];
  if (command !== 'check' && command !== 'decide') {
    console.log(USAGE);
    return 2;
  }
  const front = option('--front') || '';
  const load1 = numberOption('--load');
  const ncpu = numberOption('--ncpu');
  if (command === 'decide') {
    const decision = lib.decide(front, load1, ncpu);
    console.log(decision);
    return decision === 'yield' ? 75 : 0;
  }
  const cmd = option('--cmd');
  if (!cmd) {
    console.log(USAGE);
    return 2;
  }
  const result = lib.verdict({
    front,
    load1,
    ncpu,
    cmd,
    block: flag('--block'),
    urgent: flag('--urgent'),
  });
  if (result.action === 'defer') {
    console.log(`Deferred ${cmd}. ${result.reason}.`);
    return 75;
  }
  console.log(`Admitted ${cmd}. ${result.reason}.`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
