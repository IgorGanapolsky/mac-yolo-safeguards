#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');
const {
  COUNSEL_CLEARANCE,
  HOSTED_PRICE_USD,
  evaluate,
  observe,
  shareCheck,
  maskRecord,
  honesty,
  catalog,
} = require('../tools/hosted-resource-grant');

const TOOL = path.join(__dirname, '..', 'tools', 'hosted-resource-grant.js');
const BIN = path.join(__dirname, '..', 'bin', 'hosted-resource-grant');

const REPO_A = 'github:repo:mac-yolo-safeguards';
const REPO_B = 'github:repo:other';
const TABLE = 'd1:customers';
const GRANT_A = { resourceId: REPO_A, actions: ['read', 'write'], mask: ['token'] };

function cli(args) {
  return spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' });
}

console.log('=== test-hosted-resource-grant ===');

assert.equal(COUNSEL_CLEARANCE, false);
assert.equal(HOSTED_PRICE_USD, 10);
const hon = honesty();
assert.equal(hon.clonedCloudflareOs, false);
assert.equal(hon.clonedWorkerdGadgets, false);
assert.equal(hon.notOakSparrowGatekeeper, true);
assert.equal(hon.notMcpAmbient, true);
assert.equal(catalog().mcpAmbientIsNotAGrant, true);

const empty = evaluate({ grants: [], resourceId: REPO_A, action: 'read' });
assert.equal(empty.decision, 'deny');
assert.equal(empty.deny, 'zero_ambient');

const wrongRepo = evaluate({ grants: [GRANT_A], resourceId: REPO_B, action: 'read' });
assert.equal(wrongRepo.decision, 'deny');
assert.equal(wrongRepo.deny, 'not_granted');

const mcpAmbientIsNotEnough = evaluate({
  grants: [{ resourceId: 'mcp:github', actions: ['read'] }],
  resourceId: REPO_A,
  action: 'read',
});
assert.equal(mcpAmbientIsNotEnough.deny, 'not_granted');

const okRead = evaluate({ grants: [GRANT_A], resourceId: REPO_A, action: 'read' });
assert.equal(okRead.decision, 'allow');

const merge = evaluate({ grants: [GRANT_A], resourceId: REPO_A, action: 'write' });
assert.equal(merge.decision, 'confirm');
assert.equal(merge.deny, 'needs_approval');
assert.equal(merge.surface, 'thumbgate.app');

const approved = evaluate({
  grants: [GRANT_A],
  resourceId: REPO_A,
  action: 'write',
  approved: true,
});
assert.equal(approved.decision, 'allow');

const seen = observe({
  grants: [{ resourceId: TABLE, actions: ['read'], mask: ['ssn'] }],
  resourceId: TABLE,
  record: { name: 'Acme', ssn: '000-00-0000', token: 'sk-live-x' },
});
assert.equal(seen.decision, 'allow');
assert.equal(seen.record.ssn, undefined);
assert.equal(seen.record.token, undefined);
assert.equal(seen.record.name, 'Acme');
assert.equal(seen.observation.resourceId, TABLE);

const leak = shareCheck({
  observations: [{ resourceId: TABLE }],
  recipientGrants: [],
});
assert.equal(leak.decision, 'deny');
assert.equal(leak.deny, 'share_recipient_missing_grant');

const safeShare = shareCheck({
  observations: [{ resourceId: TABLE }],
  recipientGrants: [{ resourceId: TABLE, actions: ['read'] }],
});
assert.equal(safeShare.decision, 'allow');
assert.equal(safeShare.shared, true);

assert.deepEqual(maskRecord({ ssn: '1', ok: true }, []), { ok: true });

const zeroCli = cli(['--evaluate', '--resource', REPO_A, '--grants', '[]', '--json']);
assert.equal(zeroCli.status, 0);
assert.equal(JSON.parse(zeroCli.stdout).deny, 'zero_ambient');

const shareCli = cli([
  '--share',
  '--observed',
  JSON.stringify([{ resourceId: TABLE }]),
  '--recipient-grants',
  '[]',
  '--json',
]);
assert.equal(JSON.parse(shareCli.stdout).deny, 'share_recipient_missing_grant');

const honestyCli = cli(['--honesty', '--json']);
assert.equal(JSON.parse(honestyCli.stdout).clonedCloudflareOs, false);

const bin = spawnSync(BIN, ['--honesty', '--json'], { encoding: 'utf8' });
assert.equal(bin.status, 0);
assert.equal(JSON.parse(bin.stdout).hostedHermesPriceUsd, 10);

console.log('PASS');
