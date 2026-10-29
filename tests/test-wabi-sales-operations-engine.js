#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  isAllowedProspectEmail,
  buildCollaborativeDealPlanWidget,
  buildSharedDealCountdownWidget,
  scanDealAndCheckoutDeadlines,
  runWabiSalesOperations,
} = require('../tools/wabi-sales-operations-engine');
const { callTool } = require('../tools/mac-yolo-mcp-server');
const { routeRequest } = require('../tools/mac-yolo-service');

function main() {
  // 1. Hard ECI domain isolation
  assert.strictEqual(isAllowedProspectEmail('founder@acme.ai'), true);
  assert.strictEqual(isAllowedProspectEmail('user@ecisolutions.com'), false);
  assert.strictEqual(isAllowedProspectEmail('dev@ecinexus.com'), false);

  const blockedPlan = buildCollaborativeDealPlanWidget({ email: 'test@ecisolutions.com' });
  assert.strictEqual(blockedPlan.ok, false);
  assert.strictEqual(blockedPlan.blockedReason, 'eci_domain_isolation');

  // 2. Wabi Pillar 1: Shared Collaborative Deal Plan & Fleet ROI Mini-App
  const soloPlan = buildCollaborativeDealPlanWidget({ company: 'SoloDev', teamMacs: 1 });
  assert.strictEqual(soloPlan.ok, true);
  assert.strictEqual(soloPlan.recommendedTier.priceUsd, 9.99);
  assert.strictEqual(soloPlan.recommendedTier.checkoutUrl, 'https://iganapolsky.gumroad.com/l/odrkon');

  const teamPlan = buildCollaborativeDealPlanWidget({ company: 'TeamStack', teamMacs: 3 });
  assert.strictEqual(teamPlan.recommendedTier.priceUsd, 49);
  assert.strictEqual(teamPlan.recommendedTier.checkoutUrl, 'https://iganapolsky.gumroad.com/l/vcrho');

  const diagPlan = buildCollaborativeDealPlanWidget({ company: 'ScaleAI', teamMacs: 7 });
  assert.strictEqual(diagPlan.recommendedTier.priceUsd, 499);
  assert.strictEqual(diagPlan.recommendedTier.checkoutUrl, 'https://buy.stripe.com/9B69ATbmI4r4ak5e0DS3i3k');

  const sprintPlan = buildCollaborativeDealPlanWidget({ company: 'GrowthEng', teamMacs: 12 });
  assert.strictEqual(sprintPlan.recommendedTier.priceUsd, 1500);

  const pilotPlan = buildCollaborativeDealPlanWidget({ company: 'EnterprisePod', teamMacs: 25 });
  assert.strictEqual(pilotPlan.recommendedTier.priceUsd, 3000);

  // 3. Wabi Pillar 2: Shared Deal & Trial Countdown Widget
  const countdown = buildSharedDealCountdownWidget({ hoursRemaining: 48, priceUsd: 499 });
  assert.strictEqual(countdown.ok, true);
  assert.strictEqual(countdown.hoursRemaining, 48);
  assert.strictEqual(countdown.priceUsd, 499);
  assert.strictEqual(countdown.checkoutUrl, 'https://buy.stripe.com/9B69ATbmI4r4ak5e0DS3i3k');

  // 4. Wabi Pillar 3: Email & Checkout Deadline Recovery Scanner
  const scan = scanDealAndCheckoutDeadlines({ checkoutStarts24h: 8, cancelPageViews24h: 4 });
  assert.strictEqual(scan.ok, true);
  assert.strictEqual(scan.outboundCashSpendUsd, 0);
  assert.strictEqual(scan.activeWindowsCount, 3);

  // 5. Full Engine + MCP + HTTP Service verification
  const full = runWabiSalesOperations({ company: 'WabiFleet', teamMacs: 8 });
  assert.strictEqual(full.ok, true);

  const mcpRes = callTool('yolo_wabi_sales_ops', { company: 'WabiFleet', teamMacs: 8 });
  assert.strictEqual(mcpRes.ok, true);

  const httpGet = routeRequest('GET', '/api/sales/wabi');
  assert.strictEqual(httpGet.status, 200);
  assert.strictEqual(httpGet.body.ok, true);

  const httpPost = routeRequest('POST', '/api/sales/wabi/widget', { company: 'FastTeam', teamMacs: 12 });
  assert.strictEqual(httpPost.status, 200);
  assert.strictEqual(httpPost.body.recommendedTier.priceUsd, 1500);

  console.log('test-wabi-sales-operations-engine: PASS');
}

main();
