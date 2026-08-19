/**
 * Hosted Hermes live-claim feasibility certificate.
 * Exact IIS (Irreducible Infeasible Subsystem). No gurobipy.
 *
 * live=1 is feasible only when:
 *   runner_healthy = 1   (WaitFor-healthy; running ≠ ready)
 *   model_alive    = 1
 *   spend_usd = 0  OR  spend_approved = 1
 *
 * Persist-before-live is unchanged: this module never probes Fly and
 * never blocks task persist. Facts are caller-supplied (cache-only).
 */

/** @see Gurobi Status codes */
export const GRB = Object.freeze({
  LOADED: 1,
  OPTIMAL: 2,
  INFEASIBLE: 3,
  INF_OR_UNBD: 4,
  UNBOUNDED: 5,
});

/** Gurobi IISMethod: 0=fast, 1=exact. This solver is exact. */
export const IISMethod = 1;

export const CONSTR = Object.freeze({
  runner_healthy: "runner_healthy",
  model_alive: "model_alive",
  spend_zero_or_approved: "spend_zero_or_approved",
  browser_healthy: "browser_healthy",
});

function asFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function violatedConstraints(input = {}) {
  const runnerHealthy = input.runnerHealthy === true;
  const modelAlive = input.modelAlive === true;
  const spendUsd = asFiniteNumber(input.spendUsd, 0);
  const spendApproved = input.spendApproved === true;
  const spendOk = spendUsd === 0 || spendApproved;
  const checkBrowser = Object.prototype.hasOwnProperty.call(input, "browserHealthy")
    && input.browserHealthy != null;
  const browserOk = !checkBrowser || input.browserHealthy === true;

  const violated = [];
  if (!runnerHealthy) violated.push(CONSTR.runner_healthy);
  if (!modelAlive) violated.push(CONSTR.model_alive);
  if (!spendOk) violated.push(CONSTR.spend_zero_or_approved);
  if (checkBrowser && !browserOk) violated.push(CONSTR.browser_healthy);
  return { runnerHealthy, modelAlive, spendUsd, spendApproved, spendOk, browserOk, violated };
}

/**
 * Exact IIS: each violated hard constraint is an irreducible singleton
 * that makes live=1 infeasible. IISConstr marks the conflict set.
 */
export function computeIIS(input = {}) {
  const { violated } = violatedConstraints(input);
  /** @type {Record<string, number>} */
  const IISConstr = Object.create(null);
  for (const name of violated) IISConstr[name] = 1;
  return {
    IISMethod,
    IISConstr,
    IISConstrName: violated.slice(),
  };
}

export function optimizeHostedLive(input = {}) {
  const iis = computeIIS(input);
  const feasible = iis.IISConstrName.length === 0;
  return {
    Status: feasible ? GRB.OPTIMAL : GRB.INFEASIBLE,
    ObjVal: feasible ? 1 : 0,
    live: feasible,
    IISMethod: iis.IISMethod,
    IISConstr: iis.IISConstr,
    IISConstrName: iis.IISConstrName,
  };
}

export function certifyHostedLive(input = {}) {
  const result = optimizeHostedLive(input);
  return {
    ...result,
    feasible: result.Status === GRB.OPTIMAL,
    certificate: result.Status === GRB.OPTIMAL
      ? { kind: "feasibility", live: true, IISConstrName: [] }
      : { kind: "IIS", live: false, IISConstrName: result.IISConstrName },
  };
}
