#!/usr/bin/env node
'use strict';

/**
 * Ask what to do with a defect report. Exit 0 reproduces, ignores, or accepts.
 * Exit 75 waits for a person. Exit 77 stops. This command never scans processes.
 */

const lib = require('./lib/defect-loop');

const USAGE = [
  'usage: defect-loop.js report --text <words> [--seen N] [--evidence <fact>] [--prior <fact>]',
  '       defect-loop.js result [--reproduced] [--accepted] [--fixed]',
  '       defect-loop.js measure --minutes <n> --source measured',
].join('\n');

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function present(name) {
  return process.argv.includes(name);
}

function finish(effect, reason) {
  const verb = {
    reproduce: 'Reproduced',
    ignore: 'Ignored',
    stop: 'Stopped',
    accept: 'Accepted',
    hold: 'Held',
    refuse: 'Refused',
  }[effect] || 'Refused';
  console.log(`${verb}. ${reason}`);
  if (effect === 'reproduce' || effect === 'ignore' || effect === 'accept') return 0;
  if (effect === 'hold') return 75;
  return 77;
}

function seenCount(value) {
  if (value === undefined) return 0;
  if (!/^\d+$/.test(value)) return null;
  return Number(value);
}

function main(argv) {
  const command = argv[2];
  if (command === 'report') {
    const text = option('--text');
    if (!text) {
      console.log(USAGE);
      return 2;
    }
    const seen = seenCount(option('--seen'));
    if (seen === null) {
      console.log(USAGE);
      return 2;
    }
    const result = lib.judgeReport(text, seen, option('--evidence'), option('--prior'));
    return finish(result.effect, result.reason);
  }
  if (command === 'result') {
    const result = lib.judgeResult({
      reproduced: present('--reproduced'),
      accepted: present('--accepted'),
      fixed: present('--fixed'),
    });
    return finish(result.effect, result.reason);
  }
  if (command === 'measure') {
    const minutes = Number(option('--minutes'));
    const source = option('--source');
    if (!source || !Number.isFinite(minutes)) {
      console.log(USAGE);
      return 2;
    }
    const claim = { minutes, source };
    if (present('--percent') || present('--price')) {
      claim.percent = true;
    }
    const kept = lib.acceptMeasurement(claim);
    console.log(kept ? 'Accepted. The minute count was measured.' : 'Refused. That figure is not a measurement.');
    return kept ? 0 : 77;
  }
  console.log(USAGE);
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
