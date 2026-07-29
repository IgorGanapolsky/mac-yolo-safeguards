#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_MANIFEST = path.join(ROOT, 'evals', 'incidents', 'v1.json');
const DEFAULT_OUT = path.join(os.homedir(), '.hermes', 'receipts', 'incident-evals', 'latest.json');
const MANIFEST_SCHEMA = 'hermes/incident-eval-manifest/v1';
const REPORT_SCHEMA = 'hermes/incident-eval-report/v1';
const DECISIONS = new Set(['accept', 'reject']);
const TIERS = new Set(['pr', 'nightly']);
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const PRODUCTION_PREDICATE_TIMEOUT_MS = 30_000;

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

function digestBytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isLabel(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240) return false;
  if (!/^[A-Za-z0-9.][A-Za-z0-9._/-]*$/.test(value)) return false;
  if (path.isAbsolute(value) || value.includes('\0')) return false;
  const normalized = path.normalize(value);
  return normalized !== '..' && !normalized.startsWith(`..${path.sep}`);
}

function readArtifact(relativePath, context = {}) {
  if (!isSafeRelativePath(relativePath)) throw new Error('artifact path must stay inside the repository');
  const repoRoot = path.resolve(context.repoRoot || ROOT);
  const fullPath = path.resolve(repoRoot, relativePath);
  if (fullPath !== repoRoot && !fullPath.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error('artifact path escaped the repository');
  }

  const overrides = context.artifactOverrides || {};
  let bytes;
  if (Object.prototype.hasOwnProperty.call(overrides, relativePath)) {
    const override = overrides[relativePath];
    bytes = Buffer.isBuffer(override) ? override : Buffer.from(String(override));
  } else {
    const realRoot = fs.realpathSync(repoRoot);
    const realPath = fs.realpathSync(fullPath);
    if (realPath !== realRoot && !realPath.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error('artifact symlink escaped the repository');
    }
    const stat = fs.statSync(realPath);
    if (!stat.isFile()) throw new Error('artifact must be a regular file');
    if (stat.size > MAX_ARTIFACT_BYTES) throw new Error('artifact exceeds the 1 MiB eval limit');
    bytes = fs.readFileSync(realPath);
  }
  if (bytes.length > MAX_ARTIFACT_BYTES) throw new Error('artifact exceeds the 1 MiB eval limit');
  return {
    relativePath: relativePath.split(path.sep).join('/'),
    fullPath,
    bytes,
    sha256: digestBytes(bytes),
  };
}

function runTypeScriptExport(artifact, exportName, input) {
  if (!isLabel(exportName)) throw new Error('TypeScript export must be an opaque label');
  const source = `
    import { pathToFileURL } from 'node:url';
    const [modulePath, exportName, payload] = process.argv.slice(1);
    const loaded = await import(pathToFileURL(modulePath).href);
    if (typeof loaded[exportName] !== 'function') throw new Error('export is not callable');
    process.stdout.write(JSON.stringify(loaded[exportName](JSON.parse(payload))));
  `;
  const child = spawnSync(process.execPath, [
    '--no-warnings',
    '--experimental-strip-types',
    '--input-type=module',
    '-e',
    source,
    artifact.fullPath,
    exportName,
    JSON.stringify(input),
  ], {
    encoding: 'utf8',
    timeout: PRODUCTION_PREDICATE_TIMEOUT_MS,
    maxBuffer: 256 * 1024,
  });
  if (child.error) throw new Error(`production predicate failed: ${child.error.message}`);
  if (child.status !== 0) throw new Error('production predicate exited non-zero');
  try {
    return JSON.parse(child.stdout);
  } catch {
    throw new Error('production predicate returned invalid JSON');
  }
}

function taskArtifact(context, kind) {
  const artifact = context.task?.artifact;
  if (!artifact || artifact.kind !== kind) {
    throw new Error(`${context.task?.id || 'task'} requires a ${kind} artifact`);
  }
  return artifact;
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
    if (task.artifact !== undefined) {
      if (!task.artifact || typeof task.artifact !== 'object' || Array.isArray(task.artifact)) {
        throw new Error(`${task.id}: artifact must be an object`);
      }
      if (!['typescript-export', 'json-binding'].includes(task.artifact.kind)) {
        throw new Error(`${task.id}: unsupported artifact kind`);
      }
      if (!isSafeRelativePath(task.artifact.path)) {
        throw new Error(`${task.id}: artifact path must stay inside the repository`);
      }
      if (task.artifact.kind === 'typescript-export' && !isLabel(task.artifact.export)) {
        throw new Error(`${task.id}: artifact export must be an opaque label`);
      }
      if (
        task.artifact.kind === 'json-binding'
        && !/^[a-f0-9]{64}$/i.test(String(task.artifact.sha256 || ''))
      ) {
        throw new Error(`${task.id}: JSON artifact requires a SHA-256 binding`);
      }
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
      if (
        Object.prototype.hasOwnProperty.call(evalCase.input, 'artifactPath')
        && !isSafeRelativePath(evalCase.input.artifactPath)
      ) {
        throw new Error(`${task.id}/${evalCase.id}: artifact path must stay inside the repository`);
      }
    }
    if (!decisions.has('accept') || !decisions.has('reject')) {
      throw new Error(`${task.id}: cases must exercise both accept and reject decisions`);
    }
  }
  return manifest;
}

function connectionProof(input, context = {}) {
  const definition = taskArtifact(context, 'typescript-export');
  const artifact = readArtifact(definition.path, context);
  const production = runTypeScriptExport(artifact, definition.export, input);
  const evidenceCodes = [];
  if (production?.status !== 'connected') evidenceCodes.push('production_status_not_connected');
  if (production?.label !== 'Connected') evidenceCodes.push('production_label_not_exact_connected');
  return {
    decision: evidenceCodes.length === 0 ? 'accept' : 'reject',
    evidenceCodes,
    artifactEvidence: [{ path: artifact.relativePath, sha256: artifact.sha256 }],
  };
}

function continuousE2eProof(input, context = {}) {
  const definition = taskArtifact(context, 'json-binding');
  const artifact = readArtifact(definition.path, context);
  const evidenceCodes = [];
  if (input.e2e !== 'pass') evidenceCodes.push(input.e2e === 'skipped' ? 'e2e_skipped' : 'e2e_not_passed');
  if (!/^[a-f0-9]{40}$/i.test(String(input.gitSha || ''))) evidenceCodes.push('git_revision_missing');
  if (!/^[a-f0-9]{64}$/i.test(String(input.artifactSha256 || ''))) evidenceCodes.push('artifact_digest_missing');
  if (artifact.sha256 !== definition.sha256) evidenceCodes.push('manifest_artifact_digest_mismatch');
  if (artifact.sha256 !== input.artifactSha256) evidenceCodes.push('reported_artifact_digest_mismatch');

  let metadata = null;
  try {
    metadata = JSON.parse(artifact.bytes.toString('utf8'));
  } catch {
    evidenceCodes.push('artifact_metadata_invalid');
  }
  if (metadata) {
    if (metadata.schema !== 'hermes/continuous-e2e-artifact/v1') {
      evidenceCodes.push('artifact_schema_invalid');
    }
    if (metadata.e2e !== 'pass') evidenceCodes.push('artifact_e2e_not_passed');
    if (metadata.gitSha !== input.gitSha) evidenceCodes.push('artifact_revision_mismatch');
  }
  return {
    decision: evidenceCodes.length === 0 ? 'accept' : 'reject',
    evidenceCodes,
    artifactEvidence: [{ path: artifact.relativePath, sha256: artifact.sha256 }],
  };
}

function ipadRunnerCostProof(input, context = {}) {
  const artifact = readArtifact(input.artifactPath, context);
  const workflow = artifact.bytes.toString('utf8').replace(/^\s*#.*$/gm, '');
  const evidenceCodes = [];
  const detectStart = workflow.indexOf('\n  detect-changes:');
  const ipadStart = workflow.indexOf('\n  ipad-simulator:');
  const gateStart = workflow.indexOf('\n  required-gate:');
  const detection = detectStart >= 0 && ipadStart > detectStart
    ? workflow.slice(detectStart, ipadStart)
    : '';
  const ipadJob = ipadStart >= 0 && gateStart > ipadStart
    ? workflow.slice(ipadStart, gateStart)
    : '';
  const requiredGate = gateStart >= 0 ? workflow.slice(gateStart) : '';
  const reservedRunner = 'runs-on: ${{ fromJSON(\'["self-hosted", "ipad-simulator"]\') }}';
  if (!ipadJob.includes(reservedRunner)) evidenceCodes.push('reserved_ipad_runner_missing');
  if (/runs-on:\s*macos-(?:latest|\d)/i.test(ipadJob)) evidenceCodes.push('github_hosted_macos_requested');
  const forkComparison = /\[\s*"\$PR_HEAD_REPO"\s*!=\s*"\${{\s*github\.repository\s*}}"\s*\]/;
  if (
    !detection.includes('PR_HEAD_REPO')
    || !detection.includes('github.repository')
    || !forkComparison.test(detection)
  ) {
    evidenceCodes.push('fork_identity_check_missing');
  }
  if (
    !detection.includes('trusted_source=false')
    || !detection.includes('echo "trusted-source=$trusted_source"')
  ) {
    evidenceCodes.push('fork_deny_assignment_missing');
  }
  if (!ipadJob.includes("needs.detect-changes.outputs.trusted-source == 'true'")) {
    evidenceCodes.push('trusted_source_job_gate_missing');
  }
  if (!requiredGate.includes('Mobile changes from fork PRs cannot execute on the self-hosted iPad runner.')) {
    evidenceCodes.push('required_gate_fork_denial_missing');
  }
  return {
    decision: evidenceCodes.length === 0 ? 'accept' : 'reject',
    evidenceCodes,
    artifactEvidence: [{ path: artifact.relativePath, sha256: artifact.sha256 }],
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
  const verifierContext = {
    repoRoot: path.resolve(options.repoRoot || ROOT),
    artifactOverrides: options.artifactOverrides || {},
  };
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
      const verdict = verifier(observed, {
        ...verifierContext,
        task,
        evalCase,
      });
      const verifierDurationNs = Number(process.hrtime.bigint() - verifierStarted);
      if (!verdict || !DECISIONS.has(verdict.decision) || !Array.isArray(verdict.evidenceCodes)) {
        throw new Error(`${task.id}/${evalCase.id}: verifier returned an invalid verdict`);
      }
      if (!verdict.evidenceCodes.every(isLabel)) {
        throw new Error(`${task.id}/${evalCase.id}: verifier evidence codes must be opaque labels`);
      }
      const artifactEvidence = verdict.artifactEvidence || [];
      if (
        !Array.isArray(artifactEvidence)
        || !artifactEvidence.every((item) => (
          item
          && isSafeRelativePath(item.path)
          && /^[a-f0-9]{64}$/i.test(String(item.sha256 || ''))
        ))
      ) {
        throw new Error(`${task.id}/${evalCase.id}: verifier artifact evidence is invalid`);
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
          artifacts: artifactEvidence.map((item) => ({
            path: item.path,
            sha256: item.sha256,
          })),
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
  digestBytes,
  ipadRunnerCostProof,
  isSafeRelativePath,
  loadManifest,
  main,
  parseArgs,
  render,
  readArtifact,
  runIncidentEvals,
  runTypeScriptExport,
  validateManifest,
  writeReport,
};
