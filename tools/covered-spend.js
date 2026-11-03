#!/usr/bin/env node
'use strict';

const { judgeMeter } = require('./lib/covered-spend');

const USAGE = [
  'usage: node tools/covered-spend.js spend --kind topup|node|job|remote --quote-cents N --collected-cents N',
  '       node tools/covered-spend.js park',
  '       node tools/covered-spend.js sell --cents N --url https://... --source measured',
].join('\n');

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1];
}

function flag(argv, name) {
  return argv.includes(name);
}

function whole(text) {
  return typeof text === 'string' && /^(0|[1-9]\d*)$/.test(text);
}

function finish(effect, reason, extra) {
  const label = effect === 'park' || effect === 'sell' ? 'Admitted'
    : effect === 'hold' ? 'Held' : 'Refused';
  process.stdout.write(`${label}. ${reason}\n`);
  if (extra) process.stdout.write(extra + '\n');
  if (effect === 'park' || effect === 'sell') return 0;
  if (effect === 'hold') return 75;
  return 77;
}

function marketed(argv) {
  return flag(argv, '--rate') || flag(argv, '--illustration') || flag(argv, '--percent') || flag(argv, '--hire');
}

function spend(argv) {
  if (marketed(argv)) return finish('refuse', 'That rate is not a local measurement.');
  const kind = option(argv, '--kind');
  const quote = option(argv, '--quote-cents');
  const collected = option(argv, '--collected-cents');
  if (kind == null || quote == null || collected == null) return 2;
  const request = { kind };
  if (whole(quote)) request.quoteCents = Number(quote);
  if (whole(collected)) request.collectedCents = Number(collected);
  const plan = judgeMeter(request);
  return finish(plan.effect, plan.reason);
}

function park() {
  const plan = judgeMeter({ kind: 'park' });
  return finish(plan.effect, plan.reason, 'charge=0 purchased=false');
}

function sell(argv) {
  if (marketed(argv)) return finish('refuse', 'That rate is not a local measurement.');
  const cents = option(argv, '--cents');
  const url = option(argv, '--url');
  const source = option(argv, '--source');
  if (cents == null || url == null || source == null) return 2;
  const listing = { source, url };
  if (whole(cents)) listing.cents = Number(cents);
  const plan = judgeMeter({ kind: 'sell', listing });
  if (plan.effect !== 'sell') return finish(plan.effect, plan.reason);
  return finish(plan.effect, plan.reason, `${plan.product} purchased=false sent=false calls=0`);
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'spend') {
    const code = spend(argv.slice(1));
    if (code === 2) process.stderr.write(USAGE + '\n');
    return code;
  }
  if (cmd === 'park') return park();
  if (cmd === 'sell') {
    const code = sell(argv.slice(1));
    if (code === 2) process.stderr.write(USAGE + '\n');
    return code;
  }
  process.stderr.write(USAGE + '\n');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
