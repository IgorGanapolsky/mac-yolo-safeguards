#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { judgeOffer } = require('./lib/owned-offer');

const USAGE = [
  'usage: node tools/owned-offer.js quote --cents <n> --url https://... --source measured [--motion text] [--paid] [--write]',
  '       node tools/owned-offer.js quote --cents <n> --url https://... --source measured --hire',
  'A hire figure, an illustration, or a missing measurement refuses. Nothing is sent.',
].join('\n');

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0 || index + 1 >= argv.length) return null;
  return argv[index + 1];
}

function flag(argv, name) {
  return argv.includes(name);
}

function dollars(cents) {
  const amount = cents / 100;
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function render(plan) {
  const lines = [`Sell. ${plan.reason}`];
  if (plan.blocked.length) lines.push(`Blocked: ${plan.blocked.join(', ')}.`);
  lines.push(`${plan.product}, ${dollars(plan.cents)}. The buyer owns the Mac app. ${plan.url}`);
  if (plan.customUsd == null) {
    lines.push('Custom build: waiting. It starts after that purchase is paid.');
  } else {
    const [first, second] = plan.payments;
    lines.push(
      `Custom build, quote only: $${plan.customUsd.toLocaleString('en-US')} in two payments of $${first.toLocaleString('en-US')} and $${second.toLocaleString('en-US')}, across ${plan.windowDays} days.`,
    );
    lines.push('The buyer owns what we build.');
  }
  lines.push(`Optional $${plan.retainerUsd.toLocaleString('en-US')} a month after delivery, only if they ask.`);
  lines.push(`Not sent. Calls placed: ${plan.callsPlaced}. Outbound spend: $${plan.outboundUsd}.`);
  return lines.join('\n');
}

function offerDir() {
  return process.env.OFFER_HOME || path.join(os.homedir(), '.dayglass', 'offers');
}

function writeSheet(text) {
  const dir = offerDir();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
  const file = path.join(dir, `owned-offer-${stamp}.md`);
  fs.writeFileSync(file, text + '\n', 'utf8');
  return file;
}

function main(argv) {
  if (argv[0] !== 'quote') {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  const centsText = option(argv, '--cents');
  const url = option(argv, '--url');
  const source = option(argv, '--source');
  if (centsText == null || url == null || source == null || !/^\d+$/.test(centsText)) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  const listing = {
    cents: Number(centsText),
    url,
    source,
    paid: flag(argv, '--paid'),
    hire: flag(argv, '--hire'),
    illustration: flag(argv, '--illustration'),
    episode: flag(argv, '--episode'),
  };
  const plan = judgeOffer(option(argv, '--motion') || '', listing);
  if (plan.effect !== 'sell') {
    process.stdout.write(`Refused. ${plan.reason}\n`);
    return 77;
  }
  const text = render(plan);
  process.stdout.write(text + '\n');
  if (flag(argv, '--write')) {
    process.stdout.write(`draft=${writeSheet(text)}\n`);
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { main };
