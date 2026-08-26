#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  SOURCE,
  BOUND_SKU,
  SKU_CAP_USD,
  honesty,
  classifySku,
  isolationMode,
  agentFacingCatalog,
  gradeCostIsolation,
  attachCostIsolation,
  main,
} = require('../tools/hosted-motherduck-cost-isolation');

const h = honesty();
assert.strictEqual(h.clonedMotherDuck, false);
assert.strictEqual(h.clonedDuckDb, false);
assert.strictEqual(h.clonedDucklings, false);
assert.strictEqual(h.clonedFlights, false);
assert.strictEqual(h.clonedDives, false);
assert.strictEqual(h.clonedNewMotherduckJwt, false);
assert.strictEqual(h.dualEditTowerLastMile, false);
assert.strictEqual(h.dualEditLlmsTxtRoute, false);
assert.strictEqual(h.workerLive, false);
assert.strictEqual(h.capturedRevenueUsd, 0);
assert.strictEqual(h.boundSku, BOUND_SKU);
assert.strictEqual(h.skuCapUsd, SKU_CAP_USD);
assert.strictEqual(h.source, SOURCE);
assert.ok(!h.steal.some((line) => /flights python|cannot rent a foundation/i.test(line)));

assert.strictEqual(classifySku('hosted-10'), 'hosted-10');
assert.strictEqual(classifySku('vps'), 'hosted-10');
assert.strictEqual(classifySku('giga'), 'foreign');
assert.strictEqual(classifySku('Duckling'), 'foreign');
assert.strictEqual(classifySku('warehouse'), 'foreign');
assert.strictEqual(isolationMode(''), 'shared-fenced-vps');
assert.strictEqual(isolationMode('per-agent duckling'), 'claimed-duckling');

const giga = gradeCostIsolation({
  requestedSku: 'giga',
  requestedUsd: 500,
  agentTenantId: 'a',
  boundTenantId: 'a',
});
assert.strictEqual(giga.status, 'NOT_OFFERED');
assert.strictEqual(giga.isolated, false);
assert.strictEqual(giga.liveClaim, false);
assert.ok(giga.reasons.includes('sku_not_offered'));
assert.ok(giga.reasons.includes('sku_cap_10'));

const duckling = gradeCostIsolation({
  requestedSku: 'hosted-10',
  claimedIsolation: 'per-agent duckling',
  claimedIdleShutdownMs: 100,
});
assert.strictEqual(duckling.status, 'ISOLATION_INCOMPLETE');
assert.ok(duckling.reasons.includes('not_per_agent_duckling'));
assert.ok(duckling.reasons.includes('idle_shutdown_not_duckling'));
assert.strictEqual(duckling.idleShutdownImplemented, false);

const cross = gradeCostIsolation({
  requestedSku: 'hosted-10',
  agentTenantId: 'agent-a',
  boundTenantId: 'tenant-b',
});
assert.ok(cross.reasons.includes('cross_tenant_sku_escalation'));
assert.strictEqual(cross.isolated, false);

const jwt = gradeCostIsolation({
  mintUrl: 'https://new.motherduck.com',
  requestedSku: 'hosted-10',
});
assert.strictEqual(jwt.status, 'NOT_OFFERED');
assert.ok(jwt.reasons.includes('jwt_mint_not_offered'));

const hosted = gradeCostIsolation({
  requestedSku: 'hosted-10',
  requestedUsd: 10,
  claimedIsolation: 'shared-fenced-vps',
  agentTenantId: 't1',
  boundTenantId: 't1',
  workerLive: true,
});
assert.strictEqual(hosted.isolated, true);
assert.strictEqual(hosted.liveClaim, false);
assert.strictEqual(hosted.status, 'NOT_LIVE');
assert.strictEqual(hosted.isolation, 'shared-fenced-vps');
assert.strictEqual(hosted.clonedDucklings, false);

const talk = gradeCostIsolation({
  homepageUrl: SOURCE,
  requestedSku: 'hosted-10',
});
assert.ok(talk.reasons.includes('talk_is_not_production'));
assert.strictEqual(talk.isolated, false);

const catalog = agentFacingCatalog();
assert.strictEqual(catalog.motherduckMcp, false);
assert.strictEqual(catalog.fuzzyWarehouseCatalog, false);
assert.strictEqual(catalog.summarizeCommentGuidelines, false);
assert.strictEqual(catalog.divesShares, false);
assert.strictEqual(catalog.hostedChat, true);
assert.strictEqual(catalog.fencedVps, true);
assert.strictEqual(catalog.boundSku, 'hosted-10');

const attach = attachCostIsolation({
  requestedSku: 'hosted-10',
  requestedUsd: 10,
  claimedIsolation: 'shared-fenced-vps',
});
assert.strictEqual(attach.liveClaim, false);
assert.strictEqual(attach.clonedMotherDuck, false);
assert.strictEqual(attach.clonedDucklings, false);
assert.strictEqual(attach.isolated, true);
assert.strictEqual(attach.reason, 'hosted_10_shared_vps');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'md-cost-iso-'));
const gradeFile = path.join(tmp, 'grade.json');
fs.writeFileSync(gradeFile, JSON.stringify({
  requestedSku: 'hosted-10',
  requestedUsd: 10,
  claimedIsolation: 'shared-fenced-vps',
  agentTenantId: 'cli',
  boundTenantId: 'cli',
}));
assert.strictEqual(main(['--grade', gradeFile, '--json']), 0);
assert.strictEqual(main(['--demo', '--json']), 0);
assert.strictEqual(main(['--catalog', '--json']), 0);

const skill = fs.readFileSync(
  path.join(__dirname, '../.agents/skills/hosted-motherduck-cost-isolation/SKILL.md'),
  'utf8',
);
assert.match(skill, /hosted-motherduck-cost-isolation/);
assert.doesNotMatch(skill, /clonedDucklings: true/);

console.log('test-hosted-motherduck-cost-isolation: PASS');
