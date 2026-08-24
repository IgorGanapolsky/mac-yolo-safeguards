'use strict';
// Regression guard for the 2026-08-20 Workers-quota incident: the connector's
// pairing poll was a hardcoded 3s loop that hit /api/pairing/status ~10k/day
// while unpaired. It is now configurable and defaults to a safe 10s.
const assert = require('node:assert/strict');
const test = require('node:test');
const { connectorPollingSchedule } = require('../tools/hermes-cloud-connector.js');

test('pairing poll defaults to 10s (was a hardcoded 3s)', () => {
  assert.equal(connectorPollingSchedule({}).pairPollMs, 10_000);
});

test('pairing poll is env-overridable', () => {
  assert.equal(connectorPollingSchedule({ HERMES_CONNECTOR_PAIR_POLL_MS: '20000' }).pairPollMs, 20_000);
});

test('invalid or zero override falls back to the safe default, never a tight loop', () => {
  assert.equal(connectorPollingSchedule({ HERMES_CONNECTOR_PAIR_POLL_MS: '0' }).pairPollMs, 10_000);
  assert.equal(connectorPollingSchedule({ HERMES_CONNECTOR_PAIR_POLL_MS: 'nope' }).pairPollMs, 10_000);
});
