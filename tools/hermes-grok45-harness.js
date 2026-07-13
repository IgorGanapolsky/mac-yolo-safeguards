#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  DEFAULT_DENY_RULES,
  HERMES_VERIFIER_PROFILE,
  MODEL,
  XAI_PRICING,
  buildHermesArgs,
  buildHermesEnv,
  grokDoctor,
  redact,
} = require('../grok-yolo-wrapper');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'receipts', 'grok45', 'latest.json');
const DEFAULT_HISTORY = path.join(os.homedir(), '.hermes', 'receipts', 'grok45', 'history.jsonl');
const MAX_CAPTURE_CHARS = 50000;
function usage() {
  return `Usage:
  hermes-grok45 --task "verify this change" [--repo PATH] [--execute]
    [--case-id ID] [--paid-ok] [--max-turns N] [--timeout-ms N]
    [--write] [--out PATH] [--json]

Without --execute this emits a secret-safe readiness and billing receipt only.
With --execute it runs Grok 4.5 as an independent Hermes verifier. Direct
XAI_API_KEY billing requires --paid-ok; grok.com OAuth/free-plan quota does not.`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    task: '',
    caseId: null,
    repo: DEFAULT_REPO,
    execute: false,
    paidOk: false,
    maxTurns: 20,
    timeoutMs: 20 * 60 * 1000,
    write: false,
    out: DEFAULT_OUT,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task') args.task = requireValue(argv, ++index, arg);
    else if (arg === '--case-id') args.caseId = normalizeCaseId(requireValue(argv, ++index, arg));
    else if (arg === '--repo' || arg === '--cwd') args.repo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--paid-ok') args.paidOk = true;
    else if (arg === '--max-turns') args.maxTurns = parseBoundedInt(requireValue(argv, ++index, arg), arg, 1, 100);
    else if (arg === '--timeout-ms') args.timeoutMs = parseBoundedInt(requireValue(argv, ++index, arg), arg, 1000, 2 * 60 * 60 * 1000);
    else if (arg === '--write') args.write = true;
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.task.trim()) throw new Error('--task is required');
  return args;
}

function normalizeCaseId(value) {
  const caseId = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(caseId)) {
    throw new Error('--case-id must be 1-80 letters, numbers, dots, underscores, or hyphens');
  }
  return caseId;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseBoundedInt(value, flag, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function digest(_value, length = 20) {
  // Legacy receipt fields retain the *Digest name, but the value is an opaque
  // random id with no mathematical or stored in-memory relation to task text.
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function safeCapture(value, maxChars = MAX_CAPTURE_CHARS) {
  const clean = redact(value || '');
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, maxChars)}\n[TRUNCATED ${clean.length - maxChars} chars]`;
}

function sanitizeGrokOutput(value) {
  const clean = safeCapture(value || '');
  try {
    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return clean;
    const allowed = {};
    for (const key of ['text', 'stopReason', 'usage', 'model']) {
      if (parsed[key] !== undefined) allowed[key] = parsed[key];
    }
    return JSON.stringify(allowed, null, 2);
  } catch {
    return clean;
  }
}

function billingReceipt(doctor, paidOk) {
  const directApi = doctor.authMode === 'xai_api_key';
  return {
    authMode: doctor.authMode,
    mode: doctor.billingMode,
    directApi,
    paidApprovalRequired: directApi,
    paidApprovalPresent: Boolean(paidOk),
    apiBillingActivatedByHarness: false,
    apiPricing: XAI_PRICING,
    freeBoundary: doctor.authMode === 'grok.com_oauth'
      ? 'Uses the account plan or limited free Grok Build quota; quota and future plan terms can change.'
      : 'Direct xAI API calls are usage-billed; this harness does not create keys or buy credits.',
  };
}

function initialStatus(options, doctor, billing) {
  if (!doctor.ready) return { status: 'blocked', blocker: doctor.blocker || 'doctor_failed' };
  if (billing.paidApprovalRequired && !options.paidOk) {
    return { status: 'blocked', blocker: 'direct_xai_api_billing_requires_paid_ok' };
  }
  if (!options.execute) return { status: 'ready_not_executed', blocker: null };
  return { status: 'ready_to_execute', blocker: null };
}

function safeCommandSummary(args) {
  const summarized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-p' || arg === '--single' || arg === '--prompt') {
      const task = args[++index] || '';
      summarized.push(arg, `<task:${digest(task, 12)}>`);
    } else if (arg === '--rules') {
      const rules = args[++index] || '';
      summarized.push(arg, `<rules:${digest(rules, 12)}>`);
    } else {
      summarized.push(arg);
    }
  }
  return summarized;
}

function executeVerifier(options, doctor, runner = spawnSync) {
  const args = buildHermesArgs(options.task, {
    cwd: options.repo,
    maxTurns: options.maxTurns,
    outputFormat: 'json',
  });
  const started = Date.now();
  const result = runner(doctor.binary, args, {
    cwd: options.repo,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
    env: buildHermesEnv(process.env),
  });
  const stdout = sanitizeGrokOutput(result.stdout || '');
  const stderr = safeCapture(result.stderr || '');
  const exitCode = result.status == null ? null : result.status;
  const error = result.error ? safeCapture(result.error.message, 2000) : null;
  const status = exitCode === 0 && !error ? 'pass' : result.error && result.error.code === 'ETIMEDOUT' ? 'timeout' : 'fail';
  return {
    attempted: true,
    status,
    exitCode,
    signal: result.signal || null,
    durationMs: Date.now() - started,
    command: [path.basename(doctor.binary), ...safeCommandSummary(args)],
    stdout,
    stderr,
    stdoutDigest: digest(stdout),
    stderrDigest: digest(stderr),
    error,
  };
}

function buildHarness(options = {}, dependencies = {}) {
  const doctor = options.doctor || (dependencies.doctor || grokDoctor)();
  const billing = billingReceipt(doctor, options.paidOk);
  const readiness = initialStatus(options, doctor, billing);
  let execution = {
    attempted: false,
    status: readiness.status,
    exitCode: null,
    durationMs: 0,
  };
  if (readiness.status === 'ready_to_execute') {
    execution = executeVerifier(options, doctor, dependencies.runner || spawnSync);
  }
  const overallStatus = execution.attempted ? execution.status : readiness.status;
  const taskRunId = digest(options.task);
  const receipt = {
    schema: 'hermes-grok45-harness/v1',
    generatedAt: options.now || new Date().toISOString(),
    host: options.host || os.hostname(),
    repo: path.resolve(options.repo || DEFAULT_REPO),
    caseId: options.caseId ? normalizeCaseId(options.caseId) : null,
    taskDigest: taskRunId,
    profileId: HERMES_VERIFIER_PROFILE.id,
    role: 'independent_verifier',
    model: MODEL,
    candidateOnly: true,
    defaultHermesRouteChanged: false,
    standaloneCommand: 'grok-yolo',
    hermesCommand: 'hermes-grok45',
    readiness,
    doctor,
    billing,
    guardrails: {
      permissionMode: 'always-approve-with-explicit-denials',
      profileId: HERMES_VERIFIER_PROFILE.id,
      sandbox: HERMES_VERIFIER_PROFILE.sandbox,
      writeFileEnabled: HERMES_VERIFIER_PROFILE.writeFileEnabled,
      denyRules: DEFAULT_DENY_RULES,
      noSubagents: true,
      noCrossSessionMemory: true,
      maxTurns: options.maxTurns,
      timeoutMs: options.timeoutMs,
      deniedSideEffects: ['merge', 'push', 'publish', 'delete', 'credential-read', 'credential-rotation'],
    },
    execution,
    overallStatus,
    adoptionGates: [
      'grok-cli-minimum-version',
      'grok-4.5-listed-for-account',
      'authentication-mode-recorded',
      'billing-mode-recorded',
      'independent-verifier-output',
      'focused-command-evidence',
      'do-not-change-default-route-without-comparison-receipt',
    ],
  };
  return JSON.parse(redact(JSON.stringify(receipt)));
}

function writeReceipt(receipt, target = DEFAULT_OUT) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.writeFileSync(target, `${JSON.stringify(storageReceipt(receipt), null, 2)}\n`, { mode: 0o600 });
  return target;
}

function storageReceipt(receipt) {
  const stored = JSON.parse(JSON.stringify(receipt));
  if (stored.execution) {
    stored.execution.stdoutObserved = Boolean(stored.execution.stdout);
    stored.execution.stderrObserved = Boolean(stored.execution.stderr);
    delete stored.execution.stdout;
    delete stored.execution.stderr;
  }
  return stored;
}

function historySummary(receipt) {
  return {
    schema: 'hermes-grok45-harness/trace-v1',
    generatedAt: receipt.generatedAt,
    host: receipt.host,
    repoDigest: digest(receipt.repo),
    caseId: receipt.caseId,
    taskDigest: receipt.taskDigest,
    profileId: receipt.profileId,
    role: receipt.role,
    model: receipt.model,
    readiness: receipt.readiness,
    billing: {
      authMode: receipt.billing.authMode,
      mode: receipt.billing.mode,
      directApi: receipt.billing.directApi,
      paidApprovalPresent: receipt.billing.paidApprovalPresent,
    },
    execution: {
      attempted: receipt.execution.attempted,
      status: receipt.execution.status,
      exitCode: receipt.execution.exitCode,
      durationMs: receipt.execution.durationMs,
      stdoutDigest: receipt.execution.stdoutDigest || null,
      stderrDigest: receipt.execution.stderrDigest || null,
      error: receipt.execution.error || null,
    },
    overallStatus: receipt.overallStatus,
  };
}

function appendHistoryReceipt(receipt, target = DEFAULT_HISTORY) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.appendFileSync(target, `${JSON.stringify(historySummary(receipt))}\n`, { mode: 0o600 });
  fs.chmodSync(target, 0o600);
  return target;
}

function render(receipt) {
  const lines = [
    '# Hermes Grok 4.5 Harness',
    '',
    `Host: ${receipt.host}`,
    `Model: ${receipt.model}`,
    `Profile: ${receipt.profileId}`,
    `Case: ${receipt.caseId || 'unlabeled'}`,
    `Auth: ${receipt.doctor.authMode}`,
    `Billing: ${receipt.billing.mode}`,
    `Ready: ${receipt.doctor.ready ? 'yes' : 'no'}`,
    `Execution: ${receipt.execution.status}`,
    `Candidate only: ${receipt.candidateOnly ? 'yes' : 'no'}`,
  ];
  if (receipt.readiness.blocker) lines.push(`Blocker: ${receipt.readiness.blocker}`);
  if (receipt.execution.attempted) {
    lines.push(`Exit: ${receipt.execution.exitCode}`);
    lines.push(`Duration: ${receipt.execution.durationMs}ms`);
    if (receipt.execution.stdout) lines.push('', receipt.execution.stdout);
  }
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(usage());
      return;
    }
    const receipt = buildHarness(options);
    if (options.write) {
      receipt.receiptPath = writeReceipt(receipt, options.out);
      receipt.historyPath = appendHistoryReceipt(receipt);
    }
    console.log(options.json ? JSON.stringify(receipt, null, 2) : render(receipt));
    if (receipt.overallStatus === 'blocked' || receipt.overallStatus === 'fail' || receipt.overallStatus === 'timeout') {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(`hermes-grok45: ${redact(error.message)}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_OUT,
  DEFAULT_HISTORY,
  MAX_CAPTURE_CHARS,
  billingReceipt,
  buildHarness,
  digest,
  executeVerifier,
  initialStatus,
  parseArgs,
  render,
  safeCapture,
  safeCommandSummary,
  sanitizeGrokOutput,
  storageReceipt,
  writeReceipt,
  appendHistoryReceipt,
  historySummary,
  normalizeCaseId,
};

if (require.main === module) main();
