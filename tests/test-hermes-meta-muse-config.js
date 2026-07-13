#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  SPEC,
  applyCommands,
  buildCommands,
  buildPlan,
  commandToString,
  parseArgs,
  worstCaseCost,
} = require('../tools/hermes-meta-muse-config');

let checks = 0;
function check(name, fn) {
  fn();
  checks += 1;
  console.log(`ok - ${name}`);
}

check('provider contract matches the official Meta Model API values', () => {
  assert.equal(SPEC.model, 'muse-spark-1.1');
  assert.equal(SPEC.baseUrl, 'https://api.meta.ai/v1');
  assert.equal(SPEC.apiKeyEnv, 'MODEL_API_KEY');
  assert.equal(SPEC.transport, 'chat_completions');
});

check('main config adds Meta without changing the default route', () => {
  const args = parseArgs(['--hermes-home', '/tmp/main-hermes']);
  const commands = buildCommands(args).map(commandToString);
  assert(commands.some((line) => line.includes('providers.meta-muse-spark.base_url')));
  assert(commands.some((line) => line.includes('env:MODEL_API_KEY')));
  assert(commands.some((line) => line.includes('extra_body.reasoning_effort high')));
  assert(!commands.some((line) => line.includes('model.provider')));
  assert(!commands.some((line) => line.includes('fallback_providers')));
});

check('isolated profile pins Meta and empties both fallback formats', () => {
  const args = parseArgs(['--isolated', '--hermes-home', '/tmp/meta-hermes']);
  const commands = buildCommands(args).map(commandToString);
  assert(commands.some((line) => line.includes('model.provider custom:meta-muse-spark')));
  assert(commands.some((line) => line.includes('model.default muse-spark-1.1')));
  assert(commands.some((line) => line.endsWith("fallback_providers '[]'")));
  assert(commands.some((line) => line.endsWith("fallback_model '{}'")));
  assert(commands.some((line) => line.includes('compression.enabled false')));
  assert(commands.some((line) => line.includes('agent.max_turns 4')));
});

check('default operational budget has a real sub-ten-cent upper bound', () => {
  assert.equal(Number(worstCaseCost().toFixed(6)), 0.099328);
  assert(worstCaseCost() < 0.10);
});

check('plan never contains a credential value', () => {
  const args = parseArgs(['--isolated', '--hermes-home', '/tmp/meta-hermes']);
  const plan = buildPlan(args, { MODEL_API_KEY: 'unit-test-credential-material-12345' });
  const serialized = JSON.stringify(plan);
  assert.equal(plan.apiKeyReference, 'env:MODEL_API_KEY');
  assert.equal(plan.apiKeyPresentInEnvironment, true);
  assert(!serialized.includes('unit-test-credential-material-12345'));
  assert.deepEqual(plan.fallbackProviders, []);
});

check('apply runs every command under the requested HERMES_HOME', () => {
  const calls = [];
  const spawn = (binary, args, options) => {
    calls.push({ binary, args, home: options.env.HERMES_HOME });
    return { status: 0, stdout: 'ok', stderr: '' };
  };
  const args = parseArgs(['--isolated', '--hermes-home', '/tmp/meta-hermes']);
  const commands = buildCommands(args);
  const results = applyCommands(commands, args.hermesHome, {}, spawn);
  assert.equal(results.length, commands.length);
  assert(calls.every((call) => call.home === path.resolve('/tmp/meta-hermes')));
  assert(calls.every((call) => call.binary === 'hermes'));
});

check('apply stops on the first failed Hermes config write', () => {
  let invocations = 0;
  const spawn = () => {
    invocations += 1;
    return { status: invocations === 2 ? 1 : 0, stdout: '', stderr: 'failed' };
  };
  const args = parseArgs(['--isolated']);
  const results = applyCommands(buildCommands(args), args.hermesHome, {}, spawn);
  assert.equal(results.length, 2);
  assert.equal(results[1].status, 1);
});

console.log(`${checks} checks passed.`);
