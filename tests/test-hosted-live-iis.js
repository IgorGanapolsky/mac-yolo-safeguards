#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modUrl = pathToFileURL(
  path.join(__dirname, '..', 'apps', 'hermes-control-plane', 'lib', 'hosted-live-iis.js'),
).href;

describe('hosted Hermes exact IIS live certificate', async () => {
  const {
    GRB,
    IISMethod,
    CONSTR,
    computeIIS,
    optimizeHostedLive,
    certifyHostedLive,
  } = await import(modUrl);

  it('is feasible when runner healthy, model alive, spend=0', () => {
    const cert = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 0,
      spendApproved: false,
    });
    assert.equal(cert.Status, GRB.OPTIMAL);
    assert.equal(cert.ObjVal, 1);
    assert.equal(cert.feasible, true);
    assert.equal(cert.live, true);
    assert.equal(IISMethod, 1);
    assert.deepEqual(cert.IISConstrName, []);
    assert.deepEqual(cert.certificate, { kind: 'feasibility', live: true, IISConstrName: [] });
  });

  it('is infeasible when the runner is down', () => {
    const cert = certifyHostedLive({
      runnerHealthy: false,
      modelAlive: true,
      spendUsd: 0,
    });
    assert.equal(cert.Status, GRB.INFEASIBLE);
    assert.equal(cert.feasible, false);
    assert.equal(cert.live, false);
    assert.equal(cert.IISConstr[CONSTR.runner_healthy], 1);
    assert.ok(cert.IISConstrName.includes(CONSTR.runner_healthy));
    const iis = computeIIS({ runnerHealthy: false, modelAlive: true, spendUsd: 0 });
    assert.equal(iis.IISMethod, 1);
    assert.equal(iis.IISConstr.runner_healthy, 1);
  });

  it('is infeasible when spend>0 without approval', () => {
    const cert = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 12.5,
      spendApproved: false,
    });
    assert.equal(cert.Status, GRB.INFEASIBLE);
    assert.equal(cert.live, false);
    assert.equal(cert.IISConstr[CONSTR.spend_zero_or_approved], 1);
    assert.ok(cert.IISConstrName.includes(CONSTR.spend_zero_or_approved));
    assert.equal(cert.IISConstr[CONSTR.runner_healthy], undefined);
  });

  it('claims live false when the certificate is infeasible', () => {
    const down = optimizeHostedLive({
      runnerHealthy: false,
      modelAlive: false,
      spendUsd: 4,
      spendApproved: false,
    });
    assert.equal(down.Status, GRB.INFEASIBLE);
    assert.equal(down.live, false);
    assert.ok(down.IISConstrName.includes(CONSTR.runner_healthy));
    assert.ok(down.IISConstrName.includes(CONSTR.model_alive));
    assert.ok(down.IISConstrName.includes(CONSTR.spend_zero_or_approved));

    const approvedSpend = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 4,
      spendApproved: true,
    });
    assert.equal(approvedSpend.Status, GRB.OPTIMAL);
    assert.equal(approvedSpend.live, true);
  });

  it('names gateway-budget and fail-closes when spend is not approved', () => {
    const cert = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 8,
      spendApproved: false,
    });
    assert.equal(cert.live, false);
    assert.equal(cert.IISConstr[CONSTR.gateway_budget], 1);
    assert.ok(cert.IISConstrName.includes('gateway-budget'));
  });

  it('fail-closes live when named runner identity is missing or generic', () => {
    const missing = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 0,
      runnerIdentity: '',
    });
    assert.equal(missing.live, false);
    assert.equal(missing.IISConstr[CONSTR.runner_identity], 1);

    const shared = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 0,
      runnerIdentity: 'shared',
    });
    assert.equal(shared.live, false);

    const named = certifyHostedLive({
      runnerHealthy: true,
      modelAlive: true,
      spendUsd: 0,
      runnerIdentity: 'igor-hermes-cloud-runner',
    });
    assert.equal(named.live, true);
  });

  it('claims live false when runner or model is down', () => {
    assert.equal(certifyHostedLive({ runnerHealthy: false, modelAlive: true, spendUsd: 0 }).live, false);
    assert.equal(certifyHostedLive({ runnerHealthy: true, modelAlive: false, spendUsd: 0 }).live, false);
  });

});
