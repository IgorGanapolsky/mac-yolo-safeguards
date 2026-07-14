'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildGateActionMessage,
  gateBlockedToRelayEvent,
  pollVerdicts,
} = require('../tools/hermes-relay-worker');

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('Hermes relay worker approval integrity', () => {
  it('creates a digest-bound exact call envelope', () => {
    const event = gateBlockedToRelayEvent(JSON.stringify({
      event: 'GATE.BLOCKED',
      payload: {
        actionId: 'act-1',
        toolName: 'Bash',
        command: 'npm test',
        workspacePath: '/repo',
        affectedFiles: ['src/app.ts'],
      },
    }));
    assert.equal(event.id, 'act-1');
    assert.equal(event.approval_integrity.display.command, 'npm test');
    assert.equal(event.approval_integrity.display.destination, '/repo');
    assert.deepEqual(event.approval_integrity.display.affected_files, ['src/app.ts']);
    assert.match(event.approval_integrity.digest, /^[a-f0-9]{64}$/);
  });

  it('forwards only a matching unexpired allow verdict', async () => {
    const event = gateBlockedToRelayEvent(JSON.stringify({
      event: 'GATE.BLOCKED',
      payload: { actionId: 'act-2', toolName: 'Bash', command: 'npm test' },
    }));
    global.fetch = async () => new Response(JSON.stringify({ verdicts: [{
      event_id: event.id,
      decision: 'allow',
      approval_digest: event.approval_integrity.digest,
      approval_integrity: event.approval_integrity,
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const sent = [];
    await pollVerdicts(
      { HERMES_MOBILE_CLOUD_URL: 'https://relay.example', HERMES_RELAY_WORKER_TOKEN: 'worker' },
      { sendGateAction: (message) => { sent.push(JSON.parse(message)); return true; } },
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.approvalDigest, event.approval_integrity.digest);
  });

  it('drops a tampered allow verdict before it reaches the gateway', async () => {
    const event = gateBlockedToRelayEvent(JSON.stringify({
      event: 'GATE.BLOCKED',
      payload: { actionId: 'act-3', toolName: 'Bash', command: 'npm test' },
    }));
    global.fetch = async () => new Response(JSON.stringify({ verdicts: [{
      event_id: event.id,
      decision: 'allow',
      approval_digest: '0'.repeat(64),
      approval_integrity: event.approval_integrity,
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    let sent = false;
    await pollVerdicts(
      { HERMES_MOBILE_CLOUD_URL: 'https://relay.example', HERMES_RELAY_WORKER_TOKEN: 'worker' },
      { sendGateAction: () => { sent = true; return true; } },
    );
    assert.equal(sent, false);
  });

  it('serializes the gateway action with the approved digest', () => {
    const message = JSON.parse(buildGateActionMessage('act-4', 'approve', 'once', 'abc'));
    assert.equal(message.payload.approvalDigest, 'abc');
  });
});
