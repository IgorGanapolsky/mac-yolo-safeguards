#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUTCOME_ROOT = path.join(os.homedir(), '.hermes', 'receipts', 'outcomes');
const DEFAULT_OUT = path.join(OUTCOME_ROOT, 'latest.json');
const DEFAULT_HISTORY = path.join(OUTCOME_ROOT, 'history.jsonl');
const EXECUTION_STATUSES = new Set(['pass', 'fail', 'blocked', 'skipped']);
const VERIFICATION_STATUSES = new Set(['pass', 'fail', 'blocked', 'skipped']);
const DELIVERY_STATUSES = new Set(['pass', 'fail', 'blocked', 'skipped', 'not-required']);

function usage() {
  return `Usage:
  hermes-outcome-gate --task-id LABEL
    --execution-status pass|fail|blocked|skipped
    --verification-status pass|fail|blocked|skipped
    [--delivery-required]
    [--delivery-status pass|fail|blocked|skipped|not-required]
    [--execution-evidence-id LABEL ...]
    [--verification-evidence-id LABEL ...]
    [--delivery-evidence-id LABEL ...]
    [--duration-ms N] [--actual-cost-usd N] [--max-cost-usd N]
    [--value-signal LABEL ...]
    [--write] [--out PATH] [--history PATH] [--json]

Records whether work was executed, independently verified, and delivered when
delivery is required. Only opaque labels and numeric metrics are accepted;
prompts, drafts, URLs, and raw tool output are intentionally excluded.`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    taskId: '',
    executionStatus: 'skipped',
    verificationStatus: 'skipped',
    deliveryRequired: false,
    deliveryStatus: null,
    executionEvidenceIds: [],
    verificationEvidenceIds: [],
    deliveryEvidenceIds: [],
    durationMs: 0,
    actualCostUsd: 0,
    maxCostUsd: 0,
    valueSignals: [],
    write: false,
    out: DEFAULT_OUT,
    history: DEFAULT_HISTORY,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task-id') args.taskId = parseLabel(requireValue(argv, ++index, arg), arg);
    else if (arg === '--execution-status') args.executionStatus = parseStatus(requireValue(argv, ++index, arg), arg, EXECUTION_STATUSES);
    else if (arg === '--verification-status') args.verificationStatus = parseStatus(requireValue(argv, ++index, arg), arg, VERIFICATION_STATUSES);
    else if (arg === '--delivery-required') args.deliveryRequired = true;
    else if (arg === '--delivery-status') args.deliveryStatus = parseStatus(requireValue(argv, ++index, arg), arg, DELIVERY_STATUSES);
    else if (arg === '--execution-evidence-id') args.executionEvidenceIds.push(parseLabel(requireValue(argv, ++index, arg), arg));
    else if (arg === '--verification-evidence-id') args.verificationEvidenceIds.push(parseLabel(requireValue(argv, ++index, arg), arg));
    else if (arg === '--delivery-evidence-id') args.deliveryEvidenceIds.push(parseLabel(requireValue(argv, ++index, arg), arg));
    else if (arg === '--duration-ms') args.durationMs = parseNonNegativeNumber(requireValue(argv, ++index, arg), arg);
    else if (arg === '--actual-cost-usd') args.actualCostUsd = parseNonNegativeNumber(requireValue(argv, ++index, arg), arg);
    else if (arg === '--max-cost-usd') args.maxCostUsd = parseNonNegativeNumber(requireValue(argv, ++index, arg), arg);
    else if (arg === '--value-signal') args.valueSignals.push(parseLabel(requireValue(argv, ++index, arg), arg));
    else if (arg === '--write') args.write = true;
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--history') args.history = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.taskId) throw new Error('--task-id is required');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseLabel(value, flag = 'label') {
  const label = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(label)) {
    throw new Error(`${flag} must be 1-80 letters, numbers, dots, underscores, or hyphens`);
  }
  return label;
}

function parseStatus(value, flag, allowed) {
  const status = String(value || '').toLowerCase();
  if (!allowed.has(status)) throw new Error(`${flag} has unsupported status: ${value}`);
  return status;
}

function parseNonNegativeNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative number`);
  return parsed;
}

function uniqueLabels(values) {
  return [...new Set((values || []).map((value) => parseLabel(value)))].sort();
}

function receiptId(args, generatedAt) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify({
    taskId: args.taskId,
    generatedAt,
    executionStatus: args.executionStatus,
    verificationStatus: args.verificationStatus,
    deliveryStatus: args.deliveryStatus,
  }));
  return `outcome-${hash.digest('hex').slice(0, 20)}`;
}

function buildReceipt(args, options = {}) {
  const generatedAt = new Date(options.nowMs ?? Date.now()).toISOString();
  const executionStatus = parseStatus(args.executionStatus || 'skipped', 'executionStatus', EXECUTION_STATUSES);
  const verificationStatus = parseStatus(args.verificationStatus || 'skipped', 'verificationStatus', VERIFICATION_STATUSES);
  const deliveryRequired = Boolean(args.deliveryRequired);
  const deliveryStatus = args.deliveryStatus || (deliveryRequired ? 'skipped' : 'not-required');
  if (!DELIVERY_STATUSES.has(deliveryStatus)) throw new Error(`unsupported delivery status: ${deliveryStatus}`);

  const executionEvidenceIds = uniqueLabels(args.executionEvidenceIds);
  const verificationEvidenceIds = uniqueLabels(args.verificationEvidenceIds);
  const deliveryEvidenceIds = uniqueLabels(args.deliveryEvidenceIds);
  const valueSignals = uniqueLabels(args.valueSignals);
  const durationMs = parseNonNegativeNumber(args.durationMs ?? 0, 'durationMs');
  const actualCostUsd = parseNonNegativeNumber(args.actualCostUsd ?? 0, 'actualCostUsd');
  const maxCostUsd = parseNonNegativeNumber(args.maxCostUsd ?? 0, 'maxCostUsd');

  const blockers = [];
  const failures = [];
  if (executionStatus !== 'pass') blockers.push(`execution_${executionStatus}`);
  if (executionStatus === 'pass' && executionEvidenceIds.length === 0) blockers.push('execution_evidence_missing');
  if (verificationStatus !== 'pass') blockers.push(`verification_${verificationStatus}`);
  if (verificationStatus === 'pass' && verificationEvidenceIds.length === 0) blockers.push('verification_evidence_missing');
  if (deliveryRequired && deliveryStatus !== 'pass') blockers.push(`delivery_${deliveryStatus}`);
  if (deliveryRequired && deliveryStatus === 'pass' && deliveryEvidenceIds.length === 0) blockers.push('delivery_evidence_missing');
  if (deliveryRequired && deliveryStatus === 'not-required') blockers.push('delivery_required_but_marked_not_required');
  if (actualCostUsd > maxCostUsd) failures.push('cost_cap_exceeded');
  if (executionStatus === 'fail') failures.push('execution_failed');
  if (verificationStatus === 'fail') failures.push('verification_failed');
  if (deliveryRequired && deliveryStatus === 'fail') failures.push('delivery_failed');

  const overallStatus = failures.length ? 'fail' : blockers.length ? 'blocked' : 'pass';
  const draftOnly = executionStatus !== 'pass'
    && verificationStatus !== 'pass'
    && deliveryStatus !== 'pass';
  const failureStage = failures.includes('cost_cap_exceeded')
    ? 'budget'
    : executionStatus !== 'pass' || executionEvidenceIds.length === 0
      ? 'execution'
      : verificationStatus !== 'pass' || verificationEvidenceIds.length === 0
        ? 'independent-verification'
        : deliveryRequired && (deliveryStatus !== 'pass' || deliveryEvidenceIds.length === 0)
          ? 'delivery'
          : null;

  return {
    schema: 'hermes-outcome-gate/receipt-v1',
    id: receiptId(args, generatedAt),
    generatedAt,
    taskId: parseLabel(args.taskId, 'taskId'),
    stages: {
      planned: { status: 'pass' },
      execution: { status: executionStatus, evidenceIds: executionEvidenceIds },
      independentVerification: { status: verificationStatus, evidenceIds: verificationEvidenceIds },
      delivery: { required: deliveryRequired, status: deliveryStatus, evidenceIds: deliveryEvidenceIds },
    },
    metrics: {
      durationMs,
      actualCostUsd,
      maxCostUsd,
      valueSignals,
    },
    completion: {
      completed: overallStatus === 'pass',
      draftOnly,
      overallStatus,
      failureStage,
      blockers: [...new Set(blockers)],
      failures: [...new Set(failures)],
      rule: 'execution_pass_with_evidence AND independent_verification_pass_with_evidence AND delivery_pass_with_evidence_when_required AND actual_cost_within_cap',
    },
    overallStatus,
  };
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function writeReceipt(receipt, options = {}) {
  const out = options.out || DEFAULT_OUT;
  const history = options.history || DEFAULT_HISTORY;
  ensurePrivateDirectory(path.dirname(out));
  ensurePrivateDirectory(path.dirname(history));

  const temporary = path.join(path.dirname(out), `.${path.basename(out)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, out);
  fs.chmodSync(out, 0o600);

  const historyFd = fs.openSync(history, 'a', 0o600);
  try {
    fs.writeSync(historyFd, `${JSON.stringify(receipt)}\n`);
  } finally {
    fs.closeSync(historyFd);
  }
  fs.chmodSync(history, 0o600);
  return { out, history };
}

function render(receipt) {
  return [
    '# Hermes Outcome Gate',
    '',
    `Task ID: ${receipt.taskId}`,
    `Status: ${receipt.overallStatus}`,
    `Executed: ${receipt.stages.execution.status}`,
    `Independently verified: ${receipt.stages.independentVerification.status}`,
    `Delivery: ${receipt.stages.delivery.required ? receipt.stages.delivery.status : 'not required'}`,
    `Actual cost: $${receipt.metrics.actualCostUsd} / $${receipt.metrics.maxCostUsd}`,
    `Duration: ${receipt.metrics.durationMs}ms`,
    `Value signals: ${receipt.metrics.valueSignals.join(', ') || 'none'}`,
    `Failure stage: ${receipt.completion.failureStage || 'none'}`,
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      console.log(usage());
      return;
    }
    const receipt = buildReceipt(args);
    const artifacts = args.write ? writeReceipt(receipt, args) : null;
    const output = artifacts ? { ...receipt, artifacts } : receipt;
    console.log(args.json ? JSON.stringify(output, null, 2) : render(output));
    if (receipt.overallStatus !== 'pass') process.exitCode = 2;
  } catch (error) {
    console.error(`hermes-outcome-gate: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_HISTORY,
  DEFAULT_OUT,
  buildReceipt,
  parseArgs,
  parseLabel,
  receiptId,
  render,
  writeReceipt,
};

if (require.main === module) main();
