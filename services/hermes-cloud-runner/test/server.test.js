'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { configFromEnv } = require('../server');

test('requires control plane, runner, and model provider credentials', () => {
  assert.throws(() => configFromEnv({}), /HERMES_CONTROL_PLANE_URL/);
});

test('normalizes runner configuration without exposing tokens', () => {
  const config = configFromEnv({ HERMES_CONTROL_PLANE_URL: 'https://control.example/', HERMES_CLOUD_RUNNER_TOKEN: 'runner-secret', OPENAI_BASE_URL: 'https://api.example/v1/', OPENAI_API_KEY: 'provider-secret', OPENAI_MODEL: 'model-a', HERMES_CLOUD_RUNNER_ID: 'runner-a' });
  assert.equal(config.controlPlaneUrl, 'https://control.example');
  assert.equal(config.openaiBaseUrl, 'https://api.example/v1');
  assert.equal(config.runnerId, 'runner-a');
});
