#!/usr/bin/env node
/**
 * Test Suite for ThumbGate AI Employee & Agency Snapshot Engine
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AI_EMPLOYEE_TEMPLATES,
  createAgencySnapshotBundle,
  generateAgencySalesCopy
} = require('../tools/thumbgate_ai_employee_snapshots.js');

test('AI_EMPLOYEE_TEMPLATES includes high-value core roles', () => {
  assert.ok(AI_EMPLOYEE_TEMPLATES.devops_sentry);
  assert.ok(AI_EMPLOYEE_TEMPLATES.pr_automation_engineer);
  assert.ok(AI_EMPLOYEE_TEMPLATES.billing_retention_agent);
  assert.equal(AI_EMPLOYEE_TEMPLATES.devops_sentry.monthlyPriceUsd, 297);
});

test('createAgencySnapshotBundle builds complete white-label agency bundle with Stripe checkout', () => {
  const bundle = createAgencySnapshotBundle('Alpha Media', 'alpha.thumbgate.app', ['devops_sentry', 'pr_automation_engineer']);

  assert.equal(bundle.agencyName, 'Alpha Media');
  assert.equal(bundle.clientDomain, 'alpha.thumbgate.app');
  assert.equal(bundle.employees.length, 2);
  assert.equal(bundle.monthlyBillingTotal, 297 + 497); // 794
  assert.match(bundle.stripeCheckoutUrl, /amount=794/);
  assert.equal(bundle.status, 'ready_for_provisioning');
});

test('generateAgencySalesCopy produces persuasive client pitch copy', () => {
  const bundle = createAgencySnapshotBundle('Apex AI Labs', 'apex.thumbgate.app', ['devops_sentry']);
  const copy = generateAgencySalesCopy(bundle);

  assert.match(copy, /Apex AI Labs/);
  assert.match(copy, /24\/7 DevOps & Production Sentry/);
  assert.match(copy, /\$297\/month/);
  assert.match(copy, /Deploy AI Employees Now/);
});
