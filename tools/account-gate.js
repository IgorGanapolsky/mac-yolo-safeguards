#!/usr/bin/env node
'use strict';

/**
 * Ask which account is about to act. Exit 0 admits it. Exit 77 blocks it.
 * This command never prints an account name and never copies a credential.
 */

const lib = require('./lib/account-gate');

const USAGE = [
  'usage: account-gate.js account --login <name> --owner <name> --action read|write|share',
  '       account-gate.js handoff --target <name> --scope read|edit|test --expires <iso> [--at <iso>]',
  '       account-gate.js audit --kind session|membership --at <iso> --enabled <iso>',
].join('\n');

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

function present(name) {
  return process.argv.includes(name);
}

function instant(value) {
  if (!value) return new Date(NaN);
  const parsed = new Date(value);
  return parsed;
}

function finish(effect, label, reason, blocked) {
  const verb = effect === 'admit' ? 'Admitted' : blocked;
  console.log(`${verb} ${label}. ${reason}`);
  return effect === 'admit' ? 0 : 77;
}

function main(argv) {
  const command = argv[2];
  if (command === 'account') {
    const action = option('--action');
    if (!action || option('--login') === undefined || option('--owner') === undefined) {
      console.log(USAGE);
      return 2;
    }
    const result = lib.judgeAccount(option('--login'), option('--owner'), action);
    return finish(result.effect, action, result.reason, 'Blocked');
  }
  if (command === 'handoff') {
    const target = option('--target');
    const scope = option('--scope');
    const expires = option('--expires');
    if (!target || !scope || !expires) {
      console.log(USAGE);
      return 2;
    }
    const when = option('--at');
    const at = when ? instant(when) : new Date();
    if (Number.isNaN(at.getTime())) {
      console.log(USAGE);
      return 2;
    }
    const result = lib.judgeHandoff(target, scope, expires, at);
    return finish(result.effect, scope, result.reason, 'Refused');
  }
  if (command === 'audit') {
    const kind = option('--kind');
    const at = option('--at');
    const enabled = option('--enabled');
    if (!kind || !at || !enabled || Number.isNaN(instant(at).getTime()) || Number.isNaN(instant(enabled).getTime())) {
      console.log(USAGE);
      return 2;
    }
    const event = { kind, ts: at };
    if (present('--price') || present('--pricing')) event.price = true;
    const result = lib.judgeAudit(event, enabled);
    return finish(result.effect, kind, result.reason, 'Refused');
  }
  console.log(USAGE);
  return 2;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
