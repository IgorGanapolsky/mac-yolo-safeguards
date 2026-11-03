#!/usr/bin/env node
'use strict';

/**
 * Ask before a reply. Exit 0 admits it. Exit 75 means the message waits.
 * Omitting the window admits the action. This command never sends mail.
 */

const lib = require('./lib/reply-block');

const USAGE = 'usage: reply-block.js check --action <name> [--window HH:MM-HH:MM] [--at HH:MM]';

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function atDate(value) {
  if (!value) return new Date();
  const parts = value.split(':');
  if (parts.length !== 2) return new Date(NaN);
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return new Date(NaN);
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now;
}

function main(argv) {
  if (argv[2] !== 'check') {
    console.log(USAGE);
    return 2;
  }
  const action = option('--action');
  if (!action) {
    console.log(USAGE);
    return 2;
  }
  const window = option('--window');
  const when = atDate(option('--at'));
  if (Number.isNaN(when.getTime())) {
    console.log(USAGE);
    return 2;
  }
  const overrideText = window ? `## Override\nzone: ${window}\n` : '## Override\nzone:\n';
  const result = lib.judge(action, overrideText, when);
  if (result.effect === 'defer') {
    console.log(`Deferred ${action}. ${result.reason}`);
    return 75;
  }
  console.log(`Admitted ${action}. ${result.reason}`);
  return 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
