#!/usr/bin/env node
'use strict';

/**
 * Beyond LLMs steal (Gurobi podcast, Adam Dejans Jr / David O'Keefe):
 * certified optimization is provable and repeatable, not merely plausible.
 * Governance: a certified allocation is NOT an execute license.
 * Defensive design: append-only audit + repeatability fingerprint.
 *
 *   node tools/gurobi-decision-audit.js [--json] [receipt.json|-]
 *
 * Does not call gurobipy. Does not send mail. Does not launch ADB.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_AUDIT = path.join(os.homedir(), '.hermes/gurobi/evals/audit.jsonl');

function auditPath() {
  return process.env.GUROBI_AUDIT_PATH || DEFAULT_AUDIT;
}

function fingerprint(receipt) {
  const payload = {
    solver: receipt.solver || 'Gurobi',
    status: receipt.status || null,
    certified_optimal: receipt.certified_optimal === true,
    allocated_spend_usd: receipt.allocated_spend_usd,
    exclusive_adb_assigned: receipt.exclusive_adb_assigned || [],
    is_infeasible: receipt.is_infeasible === true,
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function classify(receipt) {
  const skipped = receipt && receipt.skipped === true;
  const certified = receipt && receipt.certified_optimal === true;
  const iis = receipt && receipt.is_infeasible === true;
  const unbounded =
    receipt && (receipt.status === 'UNBOUNDED' || receipt.status === 'INF_OR_UNBD');
  const actionClass = (receipt && receipt.action_class) || 'observe';
  const hasCertificate = certified || iis || unbounded;
  const humanOk = receipt && receipt.human_ok === true;
  const highStakes =
    actionClass === 'mutate' ||
    actionClass === 'send' ||
    (Array.isArray(receipt && receipt.exclusive_adb_assigned) &&
      receipt.exclusive_adb_assigned.length > 0);

  const observe_allowed = !skipped && hasCertificate;
  // Observe/print is not execute. Mutate (ADB/spend) needs a human receipt.
  const action_allowed =
    !skipped && certified && actionClass === 'mutate' && humanOk && actionClass !== 'send';

  let reason = 'observe_ok';
  if (skipped) reason = 'skipped';
  else if (actionClass === 'send') reason = 'send_never_from_solver';
  else if (!hasCertificate) reason = 'not_certified';
  else if (actionClass === 'mutate' && !humanOk) reason = 'certified_allocation_is_not_execute_license';
  else if (highStakes && !humanOk) reason = 'certified_allocation_is_not_execute_license';

  return {
    layer: skipped ? 'skip' : hasCertificate ? 'computation' : 'unproven',
    action_class: actionClass,
    observe_allowed,
    action_allowed,
    execute_adb: false,
    oversight: highStakes ? 'human_receipt' : 'none',
    reason,
    not_plausible_guess: true,
    fingerprint: fingerprint(receipt || {}),
  };
}

function decorate(receipt) {
  const src = receipt && typeof receipt === 'object' ? receipt : {};
  const gov = classify(src);
  return { ...src, governance: gov };
}

function record(receipt) {
  const decorated = decorate(receipt);
  const line = {
    ts: new Date().toISOString(),
    solver: decorated.solver || 'Gurobi',
    certified_optimal: decorated.certified_optimal === true,
    observe_allowed: decorated.governance.observe_allowed,
    action_allowed: decorated.governance.action_allowed,
    reason: decorated.governance.reason,
    fingerprint: decorated.governance.fingerprint,
    allocated_spend_usd: decorated.allocated_spend_usd,
    exclusive_adb_assigned: decorated.exclusive_adb_assigned || [],
  };
  try {
    const dest = auditPath();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.appendFileSync(dest, `${JSON.stringify(line)}\n`);
  } catch {
    /* local cache only */
  }
  return decorated;
}

function formatHuman(decorated) {
  const g = (decorated && decorated.governance) || {};
  return [
    `Gurobi governance observe=${g.observe_allowed === true} action=${g.action_allowed === true}`,
    `reason=${g.reason} fp=${g.fingerprint} execute_adb=false`,
  ].join(' ');
}

function main(argv) {
  const args = argv || process.argv.slice(2);
  const json = args.includes('--json');
  const file = args.find((a) => a !== '--json' && a !== '--record');
  let receipt = {};
  if (file === '-' || !file) {
    const raw = fs.readFileSync(0, 'utf8');
    if (raw.trim()) receipt = JSON.parse(raw);
  } else {
    receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  const out = args.includes('--record') ? record(receipt) : decorate(receipt);
  if (json) process.stdout.write(`${JSON.stringify(out)}\n`);
  else process.stdout.write(`${formatHuman(out)}\n`);
  return out.governance.observe_allowed || out.skipped ? 0 : 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  classify,
  decorate,
  record,
  fingerprint,
  formatHuman,
  auditPath,
};
