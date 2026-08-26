#!/usr/bin/env node
'use strict';

/**
 * Hosted cost isolation — MotherDuck homepage process steal for thumbgate.app.
 * Source: https://motherduck.com/ (2026-08-26)
 *
 * Steal: a Standard-tier agent cannot run up Giga prices; isolation is a
 * bound SKU, not a rented Duckling. Not MotherDuck, DuckDB, Ducklings,
 * Flights, Dives, or POST new.motherduck.com JWT mint.
 *
 * Complementary to PR #2123 (last-mile / Flights analog). Do not dual-edit
 * hosted-tower-last-mile, hosted-source-of-truth, or llms.txt routes.
 */

const fs = require('node:fs');
const path = require('node:path');

const SOURCE = 'https://motherduck.com/';
const SCHEMA = 'hosted-cost-isolation/v1';
const BOUND_SKU = 'hosted-10';
const SKU_CAP_USD = 10;
const TALK_RE = /motherduck\.com|thenewstack\.io|tower\.dev/i;
const FOREIGN_SKU_RE =
  /\b(giga|duckling|duckdb|warehouse|flights|dives|iceberg|motherduck|python pipeline)\b/i;
const BOUND_SKU_RE = /^(hosted-10|hosted|vps|fenced-vps|hosted-vps|\$?10)$/i;
const DUCKLING_ISOLATION_RE = /\b(duckling|per-agent|hypertenan|own isolated)\b/i;
const JWT_MINT_RE = /new\.motherduck\.com/i;

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedMotherDuck: false,
    clonedDuckDb: false,
    clonedDucklings: false,
    clonedFlights: false,
    clonedDives: false,
    clonedNewMotherduckJwt: false,
    dualEditTowerLastMile: false,
    dualEditLlmsTxtRoute: false,
    workerLive: false,
    capturedRevenueUsd: 0,
    boundSku: BOUND_SKU,
    skuCapUsd: SKU_CAP_USD,
    steal: [
      'cost isolation: a hosted-10 task cannot escalate to Giga/warehouse/Duckling SKUs',
      'isolation mode is shared fenced VPS, not a per-agent Duckling',
      'agent-facing catalog is honest: no fuzzy warehouse MCP / Dives shares',
    ],
    skip: [
      'Ducklings / 100ms idle-shutdown compute',
      'Flights Python jobs (PR #2123 last-mile analog)',
      'Dives shareable viz',
      'POST https://new.motherduck.com JWT mint',
      'DuckDB / Iceberg / S3 warehouse',
      '$499 SKU / paid outreach (ECI uncleared)',
    ],
  };
}

function classifySku(requested) {
  const value = String(requested || '').trim();
  if (!value) return 'hosted-10';
  if (BOUND_SKU_RE.test(value)) return 'hosted-10';
  if (FOREIGN_SKU_RE.test(value)) return 'foreign';
  return 'unknown';
}

function isolationMode(claimed) {
  const value = String(claimed || '').trim();
  if (!value) return 'shared-fenced-vps';
  if (DUCKLING_ISOLATION_RE.test(value)) return 'claimed-duckling';
  if (/shared|fenced|vps/i.test(value)) return 'shared-fenced-vps';
  return 'unknown';
}

function agentFacingCatalog() {
  return {
    motherduckMcp: false,
    fuzzyWarehouseCatalog: false,
    summarizeCommentGuidelines: false,
    divesShares: false,
    hostedChat: true,
    hostedApprovals: true,
    fencedVps: true,
    boundSku: BOUND_SKU,
    costIsolationAnalog: true,
  };
}

function gradeCostIsolation(input = {}) {
  const reasons = [];
  if (TALK_RE.test(String(input.blogUrl || input.talkUrl || input.homepageUrl || ''))) {
    reasons.push('talk_is_not_production');
  }
  if (JWT_MINT_RE.test(String(input.claimedProduct || input.prompt || input.mintUrl || ''))) {
    reasons.push('jwt_mint_not_offered');
  }

  const sku = classifySku(input.requestedSku || input.claimedProduct || input.sku);
  if (sku === 'foreign') reasons.push('sku_not_offered');
  if (sku === 'unknown') reasons.push('sku_unknown');

  const requestedUsd = Number(input.requestedUsd);
  if (Number.isFinite(requestedUsd) && requestedUsd > SKU_CAP_USD) {
    reasons.push('sku_cap_10');
  }

  const isolation = isolationMode(input.claimedIsolation || input.isolation);
  if (isolation === 'claimed-duckling') reasons.push('not_per_agent_duckling');

  const idleMs = Number(input.claimedIdleShutdownMs);
  if (input.claimedIdleShutdown === true || (Number.isFinite(idleMs) && idleMs > 0 && idleMs <= 1000)) {
    reasons.push('idle_shutdown_not_duckling');
  }

  const agentTenant = String(input.agentTenantId || '').trim();
  const boundTenant = String(input.boundTenantId || '').trim();
  if (agentTenant && boundTenant && agentTenant !== boundTenant) {
    reasons.push('cross_tenant_sku_escalation');
  }

  const isolated =
    sku === 'hosted-10' &&
    isolation === 'shared-fenced-vps' &&
    !reasons.includes('sku_not_offered') &&
    !reasons.includes('sku_cap_10') &&
    !reasons.includes('not_per_agent_duckling') &&
    !reasons.includes('idle_shutdown_not_duckling') &&
    !reasons.includes('cross_tenant_sku_escalation') &&
    !reasons.includes('jwt_mint_not_offered') &&
    !reasons.includes('talk_is_not_production');

  let status = 'NOT_LIVE';
  if (
    reasons.includes('sku_not_offered') ||
    reasons.includes('jwt_mint_not_offered')
  ) {
    status = 'NOT_OFFERED';
  } else if (!isolated && !reasons.includes('talk_is_not_production')) {
    status = 'ISOLATION_INCOMPLETE';
  }

  return {
    schema: SCHEMA,
    clonedMotherDuck: false,
    clonedDucklings: false,
    clonedFlights: false,
    clonedDives: false,
    workerLive: false,
    capturedRevenueUsd: 0,
    liveClaim: false,
    boundSku: BOUND_SKU,
    skuCapUsd: SKU_CAP_USD,
    requestedSku: sku,
    isolation: isolation === 'claimed-duckling' ? 'claimed-duckling' : 'shared-fenced-vps',
    idleShutdownImplemented: false,
    isolated,
    status,
    reasons,
    catalog: agentFacingCatalog(),
  };
}

function attachCostIsolation(input = {}) {
  const grade = gradeCostIsolation(input);
  return {
    schema: grade.schema,
    boundSku: grade.boundSku,
    skuCapUsd: grade.skuCapUsd,
    isolation: grade.isolation,
    idleShutdownImplemented: false,
    isolated: grade.isolated,
    liveClaim: false,
    clonedMotherDuck: false,
    clonedDucklings: false,
    status: grade.status,
    reason:
      grade.reasons[0] || (grade.isolated ? 'hosted_10_shared_vps' : 'isolation_incomplete'),
  };
}

function runDemo() {
  return {
    giga: gradeCostIsolation({
      requestedSku: 'giga',
      requestedUsd: 500,
      agentTenantId: 'a',
      boundTenantId: 'a',
    }),
    duckling: gradeCostIsolation({
      requestedSku: 'hosted-10',
      claimedIsolation: 'per-agent duckling',
      claimedIdleShutdownMs: 100,
    }),
    jwt: gradeCostIsolation({
      mintUrl: 'https://new.motherduck.com',
      requestedSku: 'hosted-10',
    }),
    hosted: gradeCostIsolation({
      requestedSku: 'hosted-10',
      requestedUsd: 10,
      claimedIsolation: 'shared-fenced-vps',
      agentTenantId: 't1',
      boundTenantId: 't1',
    }),
    talk: gradeCostIsolation({
      homepageUrl: SOURCE,
      requestedSku: 'hosted-10',
    }),
    catalog: agentFacingCatalog(),
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const pretty = json ? 2 : 0;
  if (argv.includes('--demo')) {
    process.stdout.write(`${JSON.stringify({ ...honesty(), demo: runDemo() }, null, pretty)}\n`);
    return 0;
  }
  if (argv.includes('--catalog')) {
    process.stdout.write(`${JSON.stringify({ ...honesty(), catalog: agentFacingCatalog() }, null, pretty)}\n`);
    return 0;
  }
  const file = argv.find((arg, i) => argv[i - 1] === '--grade');
  if (file) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const grade = gradeCostIsolation(raw);
    process.stdout.write(`${JSON.stringify({ ...honesty(), ...grade }, null, pretty)}\n`);
    return grade.isolated ? 0 : 1;
  }
  process.stdout.write(`${JSON.stringify(honesty(), null, pretty)}\n`);
  return 0;
}

if (require.main === module) process.exit(main());

module.exports = {
  SCHEMA,
  SOURCE,
  BOUND_SKU,
  SKU_CAP_USD,
  honesty,
  classifySku,
  isolationMode,
  agentFacingCatalog,
  gradeCostIsolation,
  attachCostIsolation,
  runDemo,
  main,
};
