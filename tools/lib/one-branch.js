'use strict';

/** A push may move one branch. A listing may name the trunk. This module never pushes and never builds a pack. */

const ONE_DEFAULTS = ['simple', 'current', 'upstream'];
const VALUE_FLAGS = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo']);

function positionals(argv) {
  const out = [];
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token === '--') {
      out.push(...argv.slice(index + 1));
      break;
    }
    if (VALUE_FLAGS.has(token)) {
      index += 2;
      continue;
    }
    if (token.startsWith('-')) {
      index += 1;
      continue;
    }
    out.push(token);
    index += 1;
  }
  return out;
}

function judgeArgs(argv, pushDefault) {
  if (!Array.isArray(argv) || argv.some((item) => typeof item !== 'string')) {
    return { effect: 'refuse', reason: 'The push arguments are unreadable.' };
  }
  let args = argv;
  if (args[0] === 'git' && args[1] === 'push') args = args.slice(2);
  if (args.some((flag) => flag === '--all' || flag === '--mirror' || flag === '--tags')) {
    return { effect: 'block', reason: 'That push moves every ref.' };
  }
  const specs = positionals(args);
  if (!specs.length) {
    if (typeof pushDefault !== 'string' || pushDefault.length === 0) {
      return { effect: 'refuse', reason: 'The push default is unreadable.' };
    }
    if (ONE_DEFAULTS.includes(pushDefault)) {
      return { effect: 'allow', reason: 'The push moves one branch.' };
    }
    if (pushDefault === 'matching') {
      return { effect: 'block', reason: 'A matching push moves every shared branch.' };
    }
    return { effect: 'block', reason: 'The push default is not one branch.' };
  }
  const refspecs = specs.slice(1);
  if (refspecs.some((spec) => spec.includes('*'))) {
    return { effect: 'block', reason: 'A wildcard push moves every matching ref.' };
  }
  if (refspecs.length > 1) {
    return { effect: 'block', reason: 'That push names more than one ref.' };
  }
  return { effect: 'allow', reason: 'The push moves one branch.' };
}

function acceptListing(claim) {
  if (!claim || typeof claim !== 'object') return false;
  if (claim.source !== 'measured') return false;
  if (claim.scope !== 'trunk') return false;
  if (!Number.isInteger(claim.refs) || claim.refs < 0) return false;
  if (!Number.isInteger(claim.bytes) || claim.bytes < 0) return false;
  if (claim.illustration || claim.speedup || claim.percent || claim.price || claim.volume) return false;
  return true;
}

module.exports = { ONE_DEFAULTS, acceptListing, judgeArgs };
