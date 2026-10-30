#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  applyScurgeryBlock,
  removeScurgeryBlock,
  verifyScurgeryByteIdentical,
  selectMagicRouteConnector,
  evaluateTailwormSafeguards,
  evaluateIdentityScopedDbAccess,
  refereeAgentTailnetSession,
  rankSweMuxAttention,
  runAllTailscaleSteals,
} = require('../tools/tailscale-october-steals');

function main() {
  // 1. scurgery byte-identical policy surgery
  const original = '{\n  "acls": [\n    {"action": "accept", "src": ["*"], "dst": ["*:*"]}\n  ]\n}\n';
  const proof = verifyScurgeryByteIdentical(original, 'temp-oncall-grant', ['  // grant on-call write']);
  assert.strictEqual(proof.ok, true);
  assert.strictEqual(proof.byteIdentical, true);
  assert.strictEqual(proof.beforeSha256, proof.afterSha256);

  const withBlock = applyScurgeryBlock(original, 'temp-oncall-grant', ['  // grant']);
  assert.ok(withBlock.includes('BEGIN SCURGERY:temp-oncall-grant'));
  assert.strictEqual(removeScurgeryBlock(withBlock, 'temp-oncall-grant'), original);

  // 2. MagicRoute sticky connector selection
  const connectors = [
    { id: 'conn-a', locality: 'same_tailnet_lan', latencyMs: 20, errorRate: 0, successStreak: 4, healthy: true },
    { id: 'conn-b', locality: 'same_tailnet_lan', latencyMs: 12, errorRate: 0, successStreak: 4, healthy: true },
  ];
  const stickyResult = selectMagicRouteConnector(connectors, { currentConnectorId: 'conn-a' });
  assert.strictEqual(stickyResult.ok, true);
  assert.strictEqual(stickyResult.selected, 'conn-a', 'MagicRoute must stick with current healthy connector within margin');
  assert.strictEqual(stickyResult.keptSticky, true);

  // 3. Tailworm v1.104.4+ class safeguards
  assert.strictEqual(
    evaluateTailwormSafeguards({ tailscaleVersion: '1.104.4', sshHopCount: 1, openWebExposed: false }).ok,
    true,
  );
  assert.strictEqual(
    evaluateTailwormSafeguards({ tailscaleVersion: '1.102.0', sshHopCount: 1, openWebExposed: false }).ok,
    false,
  );
  assert.strictEqual(
    evaluateTailwormSafeguards({ tailscaleVersion: '1.104.4', sshHopCount: 2, refereeToken: false }).ok,
    false,
  );

  // 4. Identity-scoped zero-credential DB access
  assert.strictEqual(
    evaluateIdentityScopedDbAccess({
      identityRole: 'support',
      sql: 'SELECT * FROM organizations;',
      staticPasswordOnLaptop: false,
    }).allowed,
    true,
  );
  assert.strictEqual(
    evaluateIdentityScopedDbAccess({
      identityRole: 'support',
      sql: 'UPDATE organizations SET plan = "pro";',
      staticPasswordOnLaptop: false,
    }).allowed,
    false,
  );
  assert.strictEqual(
    evaluateIdentityScopedDbAccess({
      identityRole: 'on_call',
      sql: 'UPDATE organizations SET plan = "pro";',
      onCallLeaseActive: true,
      staticPasswordOnLaptop: false,
    }).allowed,
    true,
  );
  assert.strictEqual(
    evaluateIdentityScopedDbAccess({
      identityRole: 'on_call',
      sql: 'SELECT 1;',
      staticPasswordOnLaptop: true,
    }).allowed,
    false,
  );

  // 5. Muse tailnet node & SSH referee
  assert.strictEqual(
    refereeAgentTailnetSession({
      agentNode: 'tag:muse-agent',
      targetNode: 'tag:immich',
      command: 'tailscale status',
      openWebFacing: false,
    }).verdict,
    'ALLOW',
  );
  assert.strictEqual(
    refereeAgentTailnetSession({
      agentNode: 'tag:muse-agent',
      targetNode: 'tag:immich',
      command: 'rm -rf /',
      openWebFacing: false,
    }).verdict,
    'DENY',
  );

  // 6. swe-mux attention ranker
  const mux = rankSweMuxAttention();
  assert.strictEqual(mux.ok, true);
  assert.strictEqual(mux.topAttentionPane.id, 'pane-claude');
  assert.ok(mux.voiceSummary.includes('claude-code'));

  const all = runAllTailscaleSteals();
  assert.strictEqual(all.ok, true);

  console.log('test-tailscale-october-steals: PASS (all 6 pillars verified)');
}

main();
