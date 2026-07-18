#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const INKLING = Object.freeze({
  model: 'thinkingmachines/Inkling',
  totalParameters: 975_000_000_000,
  activeParameters: 41_000_000_000,
  contextTokens: 1_000_000,
  inputModalities: ['text', 'image', 'audio'],
  theoreticalWeightBytesAt4Bit: 487_500_000_000,
  source: 'https://thinkingmachines.ai/news/introducing-inkling/',
});
const TINKER_SOURCE = 'https://thinkingmachines.ai/tinker';
const BASELINE_PROFILE = 'hermes-local-baseline';
const CANDIDATE_PROFILE = 'inkling-tinker-candidate';

function parseArgs(argv = process.argv.slice(2)) {
  const stateDir = process.env.TINKER_STATE_DIR
    || path.join(os.homedir(), '.hermes', 'tinker');
  const args = {
    dataset: process.env.TINKER_DATASET
      || path.join(stateDir, 'datasets', 'conversations.jsonl'),
    evalPath: process.env.TINKER_INKLING_EVAL
      || path.join(stateDir, 'evals', 'inkling-vs-baseline.json'),
    out: path.join(stateDir, 'receipts', 'recommend-latest.json'),
    json: false,
    write: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dataset') args.dataset = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--eval') args.evalPath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function safeExec(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    return '';
  }
}

function detectHost(env = process.env) {
  const injectedBytes = Number(env.TINKER_HOST_MEMORY_BYTES || 0);
  let memoryBytes = Number.isFinite(injectedBytes) && injectedBytes > 0 ? injectedBytes : 0;
  let machine = env.TINKER_HOST_MACHINE || '';
  let chip = env.TINKER_HOST_CHIP || '';
  if (!memoryBytes) memoryBytes = Number(safeExec('/usr/sbin/sysctl', ['-n', 'hw.memsize'])) || os.totalmem();
  if ((!machine || !chip) && process.platform === 'darwin') {
    try {
      const payload = JSON.parse(safeExec('/usr/sbin/system_profiler', ['SPHardwareDataType', '-json']) || '{}');
      const hardware = payload.SPHardwareDataType?.[0] || {};
      machine ||= hardware.machine_name || '';
      chip ||= hardware.chip_type || '';
    } catch (_) {
      // Fall through to platform identifiers without exposing host-specific IDs.
    }
  }
  return {
    machine: machine || os.platform(),
    chip: chip || os.arch(),
    architecture: os.arch(),
    memoryBytes,
    memoryGB: Number((memoryBytes / 1_000_000_000).toFixed(2)),
  };
}

function parseSupportedModels(raw = process.env.TINKER_SUPPORTED_MODELS_JSON || '[]') {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).sort() : [];
  } catch (_) {
    return [];
  }
}

function datasetMetadata(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, rows: 0, bytes: 0, privateMode: false };
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { exists: true, rows: 0, bytes: stat.size, privateMode: false, unsafeType: true };
  }
  const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim()).length;
  return {
    exists: true,
    rows,
    bytes: stat.size,
    privateMode: (stat.mode & 0o077) === 0,
  };
}

function readEval(evalPath) {
  if (!fs.existsSync(evalPath)) return { exists: false, status: 'missing', adopted: false };
  try {
    const payload = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
    const comparison = payload.profileComparison || {};
    const profilesMatch = comparison.baselineProfile === BASELINE_PROFILE
      && comparison.candidateProfile === CANDIDATE_PROFILE;
    const gates = comparison.gates || {};
    const adopted = comparison.status === 'adopt'
      && profilesMatch
      && gates.enoughRepeats === true
      && gates.holdoutNoRegression === true
      && gates.noRegressions === true;
    return {
      exists: true,
      status: comparison.status || 'unknown',
      profilesMatch,
      adopted,
    };
  } catch (_) {
    return { exists: true, status: 'invalid', adopted: false };
  }
}

function buildReport(options = {}) {
  const host = options.host || detectHost(options.env || process.env);
  const supportedModels = options.supportedModels || parseSupportedModels();
  const dataset = options.dataset || datasetMetadata(options.datasetPath || '');
  const evaluation = options.evaluation || readEval(options.evalPath || '');
  const tinkerAuthOK = options.tinkerAuthOK ?? (process.env.TINKER_AUTH_OK === 'true');
  const inklingInCatalog = supportedModels.some((name) => name.toLowerCase() === INKLING.model.toLowerCase());
  const weightsFitAt4Bit = host.memoryBytes >= INKLING.theoreticalWeightBytesAt4Bit;
  // A process environment flag is not durable proof that a 975B checkpoint was
  // loaded and smoke-tested by a compatible runtime. Keep this false until the
  // harness has a validated, host-bound runtime receipt format.
  const compatibleLocalRuntimeProven = false;
  const localInferenceFeasible = weightsFitAt4Bit && compatibleLocalRuntimeProven;
  const modelRole = evaluation.adopted ? 'approved-remote-candidate' : 'evaluation-only-remote-candidate';

  return {
    schema: 'hermes-tinker-harness/recommendation-v1',
    generatedAt: new Date().toISOString(),
    host,
    baseline: {
      profile: BASELINE_PROFILE,
      role: 'default-local-Hermes-runtime',
      unchanged: true,
    },
    candidate: {
      profile: CANDIDATE_PROFILE,
      model: INKLING.model,
      role: modelRole,
      totalParameters: INKLING.totalParameters,
      activeParameters: INKLING.activeParameters,
      contextTokens: INKLING.contextTokens,
      inputModalities: INKLING.inputModalities,
      theoreticalWeightGBAt4Bit: Number((INKLING.theoreticalWeightBytesAt4Bit / 1e9).toFixed(1)),
      weightsFitAt4Bit,
      compatibleLocalRuntimeProven,
      localInferenceFeasible,
      tinkerCatalogAvailable: inklingInCatalog,
    },
    tinker: {
      authOK: Boolean(tinkerAuthOK),
      supportedModelCount: supportedModels.length,
      role: 'managed-LoRA-training-and-remote-sampling',
      metered: true,
    },
    dataset,
    evaluation,
    gates: {
      privateDataset: !dataset.exists || dataset.privateMode === true,
      localDeploymentAllowed: localInferenceFeasible,
      candidatePromotionAllowed: evaluation.adopted === true,
      baselineReplacementAllowed: false,
    },
    recommendation: localInferenceFeasible
      ? 'Keep Inkling isolated as a candidate until paired repeated and held-out Hermes evals adopt it.'
      : 'Do not download or route Inkling locally on this host. Use Tinker only for an explicitly paid, data-approved candidate experiment; keep the local Hermes baseline.',
    sources: {
      inkling: INKLING.source,
      tinker: TINKER_SOURCE,
    },
  };
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(dirPath, 0o700);
}

function writePrivateJson(filePath, payload) {
  ensurePrivateDir(path.dirname(filePath));
  const temp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, filePath);
  fs.chmodSync(filePath, 0o600);
}

function renderText(report) {
  return [
    `Hermes Tinker/Inkling recommendation: ${report.candidate.role}`,
    `Host: ${report.host.machine} ${report.host.chip} memory=${report.host.memoryGB}GB`,
    `Inkling theoretical 4-bit weights=${report.candidate.theoreticalWeightGBAt4Bit}GB local_feasible=${report.candidate.localInferenceFeasible}`,
    `Tinker: auth=${report.tinker.authOK} inkling_catalog=${report.candidate.tinkerCatalogAvailable} models=${report.tinker.supportedModelCount}`,
    `Promotion: ${report.evaluation.status} baseline_replacement=false`,
    report.recommendation,
  ].join('\n');
}

function usage() {
  return `Usage: node tools/hermes-tinker-harness.js [--json] [--write]
  [--dataset PATH] [--eval PATH] [--out PATH]

Read-only recommendation and adoption gate. It never calls a model, uploads data,
downloads weights, changes the Hermes baseline, or activates provider billing.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const report = buildReport({
    datasetPath: args.dataset,
    evalPath: args.evalPath,
  });
  if (args.write) writePrivateJson(args.out, report);
  process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderText(report)}\n`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`hermes-tinker-harness: ${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = {
  BASELINE_PROFILE,
  CANDIDATE_PROFILE,
  INKLING,
  buildReport,
  datasetMetadata,
  detectHost,
  parseArgs,
  readEval,
  renderText,
  writePrivateJson,
};
