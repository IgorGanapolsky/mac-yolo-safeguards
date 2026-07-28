#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'evals', 'incidents', 'v1.json');
const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'receipts', 'incident-evals', 'latest.json');
const MANIFEST_SCHEMA = 'hermes/incident-eval-manifest/v1';
const REPORT_SCHEMA = 'hermes/incident-eval-report/v1';
const DECISIONS = new Set(['accept', 'reject']);
const TIERS = new Set(['pr', 'nightly']);

function usage() {
  return `Usage:
  incident-eval-runner [--manifest PATH] [--tier pr|nightly]
    [--write] [--out PATH] [--json]

Runs versioned, zero-network incident fixtures through deterministic verifiers.
Reports contain input digests and evidence codes, never raw fixture values.`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    manifest: DEFAULT_MANIFEST,
    tier: 'pr',
    write: false,
    out: DEFAULT_OUT,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifest = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--tier') args.tier = requireValue(argv, ++index, arg);
    else if (arg === '--write') args.write = true;
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!TIERS.has(args.tier)) throw new Error(`--tier must be one of: ${[...TIERS].join(', ')}`);
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function isLabel(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('manifest must be an object');
  }
  if (manifest.schema !== MANIFEST_SCHEMA) throw new Error(`manifest schema must be ${MANIFEST_SCHEMA}`);
  if (!isLabel(manifest.version)) throw new Error('manifest version must be an opaque label');
  if (!Array.isArray(manifest.tasks) || manifest.tasks.length === 0) {
    throw new Error('manifest tasks must be a non-empty array');
  }

  const taskIds = new Set();
  for (const task of manifest.tasks) {
    if (!isLabel(task.id)) throw new Error('every task id must be an opaque label');
    if (taskIds.has(task.id)) throw new Error(`duplicate task id: ${task.id}`);
    taskIds.add(task.id);
    if (!TIERS.has(task.tier)) throw new Error(`${task.id}: unsupported tier`);
    if (typeof task.ability !== 'string' || task.ability.trim().length < 10) {
      throw new Error(`${task.id}: ability must describe the measured behavior`);
    }
    if (typeof task.instruction !== 'string' || task.instruction.trim().length < 10) {
      throw new Error(`${task.id}: instruction is required`);
    }
    if (!task.environment || task.environment.kind !== 'fixture') {
      throw new Error(`${task.id}: only fixture environments are allowed`);
    }
    if (task.environment.network !== 'denied' || task.environment.productionWrites !== 'denied') {
      throw new Error(`${task.id}: PR incident evals must deny network and production writes`);
    }
    if (!Object.prototype.hasOwnProperty.call(VERIFIERS, task.verifier)) {
      throw new Error(`${task.id}: unknown verifier ${task.verifier}`);
    }
    if (!Array.isArray(task.cases) || task.cases.length < 2) {
      throw new Error(`${task.id}: at least one positive and one adversarial case are required`);
    }
    const caseIds = new Set();
    const decisions = new Set();
    for (const evalCase of task.cases) {
      if (!isLabel(evalCase.id)) throw new Error(`${task.id}: every case id must be an opaque label`);
      if (caseIds.has(evalCase.id)) throw new Error(`${task.id}: duplicate case id ${evalCase.id}`);
      caseIds.add(evalCase.id);
      if (!DECISIONS.has(evalCase.expectedDecision)) {
        throw new Error(`${task.id}/${evalCase.id}: expectedDecision must be accept or reject`);
      }
      decisions.add(evalCase.expectedDecision);
      if (!evalCase.input || typeof evalCase.input !== 'object' || Array.isArray(evalCase.input)) {
        throw new Error(`${task.id}/${evalCase.id}: input must be an object`);
      }
    }
    if (!decisions.has('accept') || !decisions.has('reject')) {
      throw new Error(`${task.id}: cases must exercise both accept and reject decisions`);
    }
  }
  return manifest;
}

function connectionProof(input) {
  const evidenceCodes = [];
  const text = typeof input.visibleText === 'string' ? input.visibleText.trim() : '';
  if (input.connectionState !== 'connected') evidenceCodes.push('structured_state_not_connected');
  if (input.authenticatedHealth !== true) evidenceCodes.push('authenticated_health_missing');
  if (!/(^|[.·]\s*)connected(?:[.\s·]|$)/i.test(text)) evidenceCodes.push('positive_connected_copy_missing');
  if (/\bnot\s+connected\b/i.test(text)) evidenceCodes.push('negative_connected_copy_present');
  if (/\bdisconnected\b/i.test(text)) evidenceCodes.push('disconnected_copy_present');
  return {
    decision: evidenceCodes.length === 0 ? 'accept' : 'reject',
    evidenceCodes,
  };
}

function continuousE2eProof(input) {
  const evidenceCodes = [];
  if (input.e2e !== 'pass') evidenceCodes.push(input.e2e === 'skipped' ? 'e2e_skipped' : 'e2e_not_passed');
  if (!/^[a-f0-9]{7,64}$/i.test(String(input.gitSha || ''))) evidenceCodes.push('git_revision_missing');
  if (!/^[a-f0-9]{64}$/i.test(String(input.artifactSha256 || ''))) evidenceCodes.push('artifact_digest_missing');
  return {
    decision: evidenceCodes.length === 0 ? 'accept' : 'reject',
    evidenceCodes,
  };
}

function ipadRunnerCostProof(input) {
  const evidenceCodes = [];
  const labels = Array.isArray(input.runsOn) ? input.runsOn.map(String) : [];
  const normalized = labels.map((label) => label.toLowerCase());
  if (!normalized.includes('self-hosted')) evidenceCodes.push('self_hosted_label_missing');
  if (!normalized.includes('ipad-simulator')) evidenceCodes.push('ipad_capability_label_missing');
  if (normalized.some((label) => /^macos-(?:latest|\d)/.test(label))) {
    evidenceCodes.push('github_hosted_macos_requested');
  }
  if (input.trustedSource !== true) evidenceCodes.push('untrusted_code_on_self_hosted');
  return {
    decision: evidenceCodes.length === 0 ? 'accept' : 'reject',
    evidenceCodes,
  };
}

const VERIFIERS = Object.freeze({
  'connection-proof-v1': connectionProof,
  'continuous-e2e-proof-v1': continuousE2eProof,
  'ipad-runner-cost-proof-v1': ipadRunnerCostProof,
});

function loadManifest(manifestPath = DEFAULT_MANIFEST) {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return validateManifest(parsed);
}

function runIncidentEvals(manifest, options = {}) {
  validateManifest(manifest);
  const tier = options.tier || 'pr';
  if (!TIERS.has(tier)) throw new Error(`unsupported tier: ${tier}`);
  const verifiers = { ...VERIFIERS, ...(options.verifiers || {}) };
  const generatedAt = new Date(options.nowMs ?? Date.now()).toISOString();
  const selected = manifest.tasks.filter((task) => task.tier === tier || tier === 'nightly');
  if (selected.length === 0) throw new Error(`manifest has no tasks for tier ${tier}`);

  const results = [];
  for (const task of selected) {
    const verifier = verifiers[task.verifier];
    if (typeof verifier !== 'function') throw new Error(`${task.id}: verifier unavailable`);
    for (const evalCase of task.cases) {
      const started = process.hrtime.bigint();
      const observed = stableValue(evalCase.input);
      const executionDurationNs = Number(process.hrtime.bigint() - started);
      const verifierStarted = process.hrtime.bigint();
      const verdict = verifier(observed);
      const verifierDurationNs = Number(process.hrtime.bigint() - verifierStarted);
      if (!verdict || !DECISIONS.has(verdict.decision) || !Array.isArray(verdict.evidenceCodes)) {
        throw new Error(`${task.id}/${evalCase.id}: verifier returned an invalid verdict`);
      }
      if (!verdict.evidenceCodes.every(isLabel)) {
        throw new Error(`${task.id}/${evalCase.id}: verifier evidence codes must be opaque labels`);
      }
      const matched = verdict.decision === evalCase.expectedDecision;
      results.push({
        taskId: task.id,
        caseId: evalCase.id,
        status: matched ? 'pass' : 'fail',
        executionTrajectory: {
          schema: 'hermes/incident-eval-execution-trajectory/v1',
          environment: {
            kind: task.environment.kind,
            network: task.environment.network,
            productionWrites: task.environment.productionWrites,
          },
          inputDigest: digest(observed),
          observedFields: Object.keys(observed).sort(),
          durationNs: executionDurationNs,
        },
        verifierTrajectory: {
          schema: 'hermes/incident-eval-verifier-trajectory/v1',
          verifierId: task.verifier,
          decision: verdict.decision,
          expectedDecision: evalCase.expectedDecision,
          evidenceCodes: [...new Set(verdict.evidenceCodes.map(String))].sort(),
          matched,
          durationNs: verifierDurationNs,
        },
      });
    }
  }

  const passed = results.filter((result) => result.status === 'pass').length;
  const failed = results.length - passed;
  return {
    schema: REPORT_SCHEMA,
    generatedAt,
    manifest: {
      schema: manifest.schema,
      version: manifest.version,
      digest: digest(manifest),
    },
    tier,
    metrics: {
      tasks: selected.length,
      cases: results.length,
      passed,
      failed,
      accepted: results.filter((result) => result.verifierTrajectory.decision === 'accept').length,
      rejected: results.filter((result) => result.verifierTrajectory.decision === 'reject').length,
    },
    results,
    overallStatus: failed === 0 ? 'pass' : 'fail',
  };
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function writeReport(report, out = DEFAULT_OUT) {
  ensurePrivateDirectory(path.dirname(out));
  const temporary = path.join(path.dirname(out), `.${path.basename(out)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, out);
  fs.chmodSync(out, 0o600);
  return out;
}

function render(report) {
  const lines = [
    '=== Hermes Incident Evals ===',
    `manifest=${report.manifest.version} digest=${report.manifest.digest}`,
    `tier=${report.tier} status=${report.overallStatus}`,
    `tasks=${report.metrics.tasks} cases=${report.metrics.cases} passed=${report.metrics.passed} failed=${report.metrics.failed}`,
  ];
  for (const result of report.results) {
    lines.push(
      `${result.status.toUpperCase()} ${result.taskId}/${result.caseId} `
      + `decision=${result.verifierTrajectory.decision} expected=${result.verifierTrajectory.expectedDecision}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2)) {
  try {
    const args = parseArgs(argv);
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    const report = runIncidentEvals(loadManifest(args.manifest), { tier: args.tier });
    if (args.write) writeReport(report, args.out);
    process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : render(report));
    return report.overallStatus === 'pass' ? 0 : 1;
  } catch (error) {
    process.stderr.write(`incident-eval-runner: ${error.message}\n`);
    return 2;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DEFAULT_MANIFEST,
  DEFAULT_OUT,
  MANIFEST_SCHEMA,
  REPORT_SCHEMA,
  VERIFIERS,
  connectionProof,
  continuousE2eProof,
  digest,
  ipadRunnerCostProof,
  loadManifest,
  main,
  parseArgs,
  render,
  runIncidentEvals,
  validateManifest,
  writeReport,
};
