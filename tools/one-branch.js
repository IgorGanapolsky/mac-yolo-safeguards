#!/usr/bin/env node
'use strict';

const { acceptListing, judgeArgs } = require('./lib/one-branch');

const USAGE = [
  'usage: node tools/one-branch.js check --default simple|current|upstream|matching -- git push -u origin HEAD',
  '       node tools/one-branch.js advertise --refs N --bytes N --source measured --scope trunk',
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

function finish(effect, reason) {
  const label = effect === 'allow' ? 'Allowed' : effect === 'block' ? 'Blocked' : 'Refused';
  process.stdout.write(`${label}. ${reason}\n`);
  return effect === 'allow' ? 0 : 77;
}

function check(argv) {
  const dash = argv.indexOf('--');
  if (dash < 0) return 2;
  const pushDefault = option(argv.slice(0, dash), '--default');
  const plan = judgeArgs(argv.slice(dash + 1), pushDefault);
  return finish(plan.effect, plan.reason);
}

function advertise(argv) {
  const marketed = flag(argv, '--speedup') || flag(argv, '--percent') || flag(argv, '--price')
    || flag(argv, '--volume') || flag(argv, '--illustration');
  if (marketed) return finish('refuse', 'That listing is not a local measurement.');
  const refs = option(argv, '--refs');
  const bytes = option(argv, '--bytes');
  const source = option(argv, '--source');
  const scope = option(argv, '--scope');
  if (refs == null || bytes == null || source == null || scope == null) return 2;
  const claim = { source, scope };
  if (whole(refs)) claim.refs = Number(refs);
  if (whole(bytes)) claim.bytes = Number(bytes);
  if (scope === 'every-ref' && source === 'measured' && Number.isInteger(claim.refs) && Number.isInteger(claim.bytes)) {
    return finish('block', 'The listing names every ref.');
  }
  if (!acceptListing(claim)) return finish('refuse', 'That listing is not a local measurement.');
  process.stdout.write(`Allowed. The listing names the trunk.\nrefs=${claim.refs} bytes=${claim.bytes}\n`);
  return 0;
}

function main(argv) {
  const cmd = argv[0];
  if (cmd === 'check') {
    const code = check(argv.slice(1));
    if (code === 2) process.stderr.write(USAGE + '\n');
    return code;
  }
  if (cmd === 'advertise') {
    const code = advertise(argv.slice(1));
    if (code === 2) process.stderr.write(USAGE + '\n');
    return code;
  }
  process.stderr.write(USAGE + '\n');
  return 2;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
