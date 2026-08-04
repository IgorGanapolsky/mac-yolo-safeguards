#!/usr/bin/env node
'use strict';

/**
 * Tests for Hermes three-path integration + real Nostr crypto.
 * Asserts against NIP-01 verification rules — not console aesthetics.
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const {
  generateNostrAgentIdentity,
  createNostrAgentEvent,
  verifyNostrEvent,
  parseBuzzNostrEvent,
  nostrEventToAcpMessage,
  nsecToHex,
  npubToHex,
  computeEventId,
} = require('../tools/buzz-nostr-bridge');
const { doctor, demoNostrAcp, PATHS } = require('../tools/hermes-integration-paths');

// --- identity ---
{
  const a = generateNostrAgentIdentity();
  assert.match(a.npub, /^npub1[a-z0-9]+$/);
  assert.match(a.nsec, /^nsec1[a-z0-9]+$/);
  assert.strictEqual(a.hexPublicKey.length, 64);
  assert.strictEqual(a.hexPrivateKey.length, 64);
  assert.strictEqual(npubToHex(a.npub), a.hexPublicKey);
  assert.strictEqual(nsecToHex(a.nsec), a.hexPrivateKey);
  // seed requires flag
  assert.throws(() => generateNostrAgentIdentity({ seed: 'x' }), /allowInsecureSeed/);
  const b = generateNostrAgentIdentity({ seed: 'test-seed', allowInsecureSeed: true });
  const c = generateNostrAgentIdentity({ seed: 'test-seed', allowInsecureSeed: true });
  assert.strictEqual(b.hexPrivateKey, c.hexPrivateKey);
  console.log('PASS identity NIP-19 roundtrip');
}

// --- sign + verify ---
{
  const id = generateNostrAgentIdentity();
  const ev = createNostrAgentEvent({
    identity: id,
    content: '@hermes-coder fix the false green',
    tags: [['t', 'test']],
  });
  const v = verifyNostrEvent(ev);
  assert.strictEqual(v.valid, true, v.error);
  assert.strictEqual(ev.id, computeEventId(ev));
  // tamper content
  const bad = { ...ev, content: ev.content + '!' };
  bad.id = computeEventId(bad);
  // signature still for old id — fail
  const v2 = verifyNostrEvent({ ...bad, id: ev.id, content: bad.content });
  assert.strictEqual(v2.valid, false);
  console.log('PASS schnorr sign/verify + tamper detect');
}

// --- HMAC false-green must fail ---
{
  const id = generateNostrAgentIdentity();
  const ev = createNostrAgentEvent({ identity: id, content: 'legit' });
  const hmacSig = crypto.createHmac('sha256', id.hexPrivateKey).update(ev.id).digest('hex');
  const fake = { ...ev, sig: hmacSig };
  const v = verifyNostrEvent(fake);
  assert.strictEqual(v.valid, false, 'HMAC must not pass schnorr verify');
  console.log('PASS HMAC theater rejected');
}

// --- parse + ACP ---
{
  const id = generateNostrAgentIdentity();
  const ev = createNostrAgentEvent({
    identity: id,
    content: '@hermes-reviewer look at PR #1191',
  });
  const parsed = parseBuzzNostrEvent(ev);
  assert.strictEqual(parsed.valid, true);
  assert.strictEqual(parsed.targetAgent, 'hermes-reviewer');
  assert.strictEqual(parsed.verified, true);

  const acp = nostrEventToAcpMessage(ev);
  assert.strictEqual(acp.metadata.nostrEventId, ev.id);
  assert.strictEqual(acp.sender.id, id.hexPublicKey);
  console.log('PASS parse + ACP map');
}

// --- three paths doctor ---
{
  assert.strictEqual(PATHS.length, 3);
  const d = doctor();
  assert.ok(d.paths.every((p) => p.missing.length === 0), JSON.stringify(d.paths));
  // verify may fail if deps missing — crypto should work after npm install
  const demo = demoNostrAcp();
  assert.strictEqual(demo.ok, true, demo.error);
  assert.strictEqual(demo.targetAgent, 'hermes-coder');
  console.log('PASS three-path doctor + demo');
}

// --- CLI self-tests ---
{
  const r = spawnSync(process.execPath, ['tools/hermes-integration-paths.js', '--self-test'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr + r.stdout);
  const r2 = spawnSync(process.execPath, ['tools/buzz-nostr-bridge.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.strictEqual(r2.status, 0, r2.stderr);
  assert.doesNotMatch(r2.stdout, /nsec1[a-z0-9]{20,}/, 'must not print nsec by default');
  console.log('PASS CLI self-tests (no nsec leak)');
}

console.log('PASS test-hermes-buzz-integration');
