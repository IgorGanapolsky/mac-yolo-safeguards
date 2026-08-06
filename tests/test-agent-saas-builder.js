'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateAgentSaaSPlan } = require('../tools/agent-saas-builder');

test('generateAgentSaaSPlan generates a complete 30-day build & productization specification', () => {
  const plan = generateAgentSaaSPlan();
  assert.equal(plan.niche, 'B2B AI Tool Vendors');
  assert.equal(plan.shadowingJobsCount, 20);
  assert.equal(plan.buildMilestones.length, 6);
  assert.ok(plan.pricingAnchor.includes('$2,500/month'));
  assert.ok(plan.distributionTeardown.oldWay.length > 0);
  assert.ok(plan.distributionTeardown.agentWay.length > 0);
});
