#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = 'hermes-harness-checkpoint/v1';
const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(os.homedir(), '.hermes', 'receipts', 'harness-checkpoints');
const MAX_ARTIFACT_BYTES = 1024 * 1024;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return crypto.createHash('sha256').update(
    Buffer.isBuffer(value) ? value : String(value),
  ).digest('hex');
}

function artifactDigest(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, digest: null, size: 0 };
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { exists: true, digest: null, size: stat.size, invalidType: true };
  }
  if (stat.size > MAX_ARTIFACT_BYTES) {
    return { exists: true, digest: null, size: stat.size, tooLarge: true };
  }
  return {
    exists: true,
    digest: digest(fs.readFileSync(filePath)),
    size: stat.size,
  };
}

function runGit(repo, args) {
  const result = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    shell: false,
    timeout: 5000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function collectSnapshot(options = {}) {
  const repo = fs.realpathSync(path.resolve(options.repo || DEFAULT_REPO));
  const head = runGit(repo, ['rev-parse', 'HEAD']);
  const branch = runGit(repo, ['branch', '--show-current']) || null;
  const statusLines = runGit(repo, ['status', '--porcelain=v1', '--untracked-files=all'])
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();
  const loopStatePath = path.resolve(
    options.loopStatePath
      || path.join(repo, 'artifacts', 'hermes-loop-state', 'latest.json'),
  );
  const mobileProofPath = path.resolve(
    options.mobileProofPath
      || path.join(repo, 'hermes-mobile', 'docs', 'proofs', 'continuous', 'latest.json'),
  );
  const snapshot = {
    repo: {
      path: repo,
      head,
      branch,
      dirtyCount: statusLines.length,
      dirtyDigest: digest(statusLines.join('\n')),
    },
    artifacts: {
      loopState: artifactDigest(loopStatePath),
      mobileProof: artifactDigest(mobileProofPath),
    },
  };
  return {
    ...snapshot,
    stateDigest: digest(canonicalJson(snapshot)),
  };
}

function integrityPayload(checkpoint) {
  const copy = { ...checkpoint };
  delete copy.integrityDigest;
  return copy;
}

function validateCheckpoint(checkpoint) {
  if (!checkpoint || checkpoint.schema !== SCHEMA) {
    return { ok: false, reason: 'unsupported checkpoint schema' };
  }
  const expected = digest(canonicalJson(integrityPayload(checkpoint)));
  return {
    ok: expected === checkpoint.integrityDigest,
    reason: expected === checkpoint.integrityDigest ? null : 'checkpoint integrity mismatch',
    expected,
    actual: checkpoint.integrityDigest || null,
  };
}

function safeTaskId(value) {
  const taskId = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(taskId)) {
    throw new Error('--task-id must be 1-120 letters, numbers, dots, underscores, or hyphens');
  }
  return taskId;
}

function loadCheckpoint(filePath) {
  const resolved = path.resolve(filePath);
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARTIFACT_BYTES) {
    throw new Error('checkpoint must be a regular file no larger than 1 MiB');
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function checkpointId(createdAt, taskId, snapshot, parentId) {
  const stamp = createdAt.replace(/[-:.TZ]/g, '').slice(0, 17);
  return `cp_${stamp}_${digest(`${taskId}\n${snapshot.stateDigest}\n${parentId || ''}`).slice(0, 12)}`;
}

function writeCheckpoint(checkpoint, outDir) {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);
  const checkpointPath = path.join(outDir, `${checkpoint.id}.json`);
  fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  const latestPath = path.join(outDir, 'latest.json');
  const tempPath = `${latestPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({
    schema: 'hermes-harness-checkpoint-pointer/v1',
    checkpointId: checkpoint.id,
    checkpointPath,
  }, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, latestPath);
  fs.chmodSync(latestPath, 0o600);
  return { checkpointPath, latestPath };
}

function createCheckpoint(options = {}) {
  const started = process.hrtime.bigint();
  const taskId = safeTaskId(options.taskId);
  const snapshot = collectSnapshot(options);
  const createdAt = options.now || new Date().toISOString();
  let parent = null;
  if (options.parentPath) {
    parent = loadCheckpoint(options.parentPath);
    const validation = validateCheckpoint(parent);
    if (!validation.ok) throw new Error(validation.reason);
  }
  const id = checkpointId(createdAt, taskId, snapshot, parent?.id);
  const checkpoint = {
    schema: SCHEMA,
    id,
    createdAt,
    taskId,
    lineage: {
      rootId: parent?.lineage?.rootId || parent?.id || id,
      parentId: parent?.id || null,
      generation: parent ? Number(parent.lineage?.generation || 0) + 1 : 0,
    },
    snapshot,
    policy: {
      sourceTreeCopy: false,
      stateStorage: 'immutable receipt plus git object/worktree state',
      secretsStored: false,
      resumeRequiresIntegrityAndDriftCheck: true,
    },
    metrics: {
      createDurationMs: Number(process.hrtime.bigint() - started) / 1e6,
    },
  };
  checkpoint.integrityDigest = digest(canonicalJson(integrityPayload(checkpoint)));
  const outDir = path.resolve(options.outDir || DEFAULT_OUT_DIR);
  const artifacts = options.noWrite ? null : writeCheckpoint(checkpoint, outDir);
  return { checkpoint, artifacts };
}

function verifyCheckpoint(options = {}) {
  const started = process.hrtime.bigint();
  const checkpoint = loadCheckpoint(options.checkpointPath);
  const integrity = validateCheckpoint(checkpoint);
  if (!integrity.ok) {
    return {
      schema: 'hermes-harness-checkpoint-verification/v1',
      ok: false,
      checkpointId: checkpoint.id || null,
      integrity,
      drift: ['integrity'],
      durationMs: Number(process.hrtime.bigint() - started) / 1e6,
    };
  }
  const current = collectSnapshot({
    repo: options.repo || checkpoint.snapshot.repo.path,
    loopStatePath: options.loopStatePath,
    mobileProofPath: options.mobileProofPath,
  });
  const drift = [];
  if (current.repo.path !== checkpoint.snapshot.repo.path) drift.push('repo.path');
  if (current.repo.head !== checkpoint.snapshot.repo.head) drift.push('repo.head');
  if (current.repo.branch !== checkpoint.snapshot.repo.branch) drift.push('repo.branch');
  if (current.repo.dirtyDigest !== checkpoint.snapshot.repo.dirtyDigest) drift.push('repo.dirty');
  if (canonicalJson(current.artifacts.loopState)
    !== canonicalJson(checkpoint.snapshot.artifacts.loopState)) {
    drift.push('artifacts.loopState');
  }
  if (canonicalJson(current.artifacts.mobileProof)
    !== canonicalJson(checkpoint.snapshot.artifacts.mobileProof)) {
    drift.push('artifacts.mobileProof');
  }
  return {
    schema: 'hermes-harness-checkpoint-verification/v1',
    ok: drift.length === 0,
    checkpointId: checkpoint.id,
    integrity,
    drift,
    expectedStateDigest: checkpoint.snapshot.stateDigest,
    currentStateDigest: current.stateDigest,
    durationMs: Number(process.hrtime.bigint() - started) / 1e6,
  };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarizeCheckpoints(outDir = DEFAULT_OUT_DIR) {
  const resolved = path.resolve(outDir);
  if (!fs.existsSync(resolved)) {
    return {
      schema: 'hermes-harness-checkpoint-summary/v1',
      count: 0,
      valid: 0,
      invalid: 0,
      maxGeneration: 0,
      createDurationMs: { p50: null, p95: null, p99: null },
    };
  }
  const checkpointFiles = fs.readdirSync(resolved)
    .filter((name) => /^cp_.*\.json$/.test(name));
  const parsed = checkpointFiles.map((name) => {
    try {
      return { checkpoint: loadCheckpoint(path.join(resolved, name)), parseOk: true };
    } catch {
      return { checkpoint: null, parseOk: false };
    }
  });
  const valid = parsed
    .filter((entry) => entry.parseOk && validateCheckpoint(entry.checkpoint).ok)
    .map((entry) => entry.checkpoint);
  const durations = valid.map((checkpoint) => Number(checkpoint.metrics?.createDurationMs))
    .filter(Number.isFinite);
  return {
    schema: 'hermes-harness-checkpoint-summary/v1',
    count: checkpointFiles.length,
    valid: valid.length,
    invalid: checkpointFiles.length - valid.length,
    maxGeneration: valid.reduce(
      (maximum, checkpoint) => Math.max(maximum, Number(checkpoint.lineage?.generation || 0)),
      0,
    ),
    createDurationMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
    },
  };
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseArgs(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';
  const args = {
    command,
    repo: DEFAULT_REPO,
    outDir: DEFAULT_OUT_DIR,
    taskId: null,
    parentPath: null,
    checkpointPath: null,
    loopStatePath: null,
    mobileProofPath: null,
    noWrite: false,
    json: false,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--out-dir') args.outDir = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--task-id') args.taskId = requireValue(argv, ++index, arg);
    else if (arg === '--parent') args.parentPath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--checkpoint') args.checkpointPath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--loop-state') args.loopStatePath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--mobile-proof') args.mobileProofPath = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--no-write') args.noWrite = true;
    else if (arg === '--json') args.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node tools/hermes-harness-checkpoint.js create --task-id ID [--repo PATH] [--out-dir PATH]
  node tools/hermes-harness-checkpoint.js fork --task-id ID --parent CHECKPOINT [--repo PATH]
  node tools/hermes-harness-checkpoint.js verify --checkpoint CHECKPOINT [--repo PATH]
  node tools/hermes-harness-checkpoint.js summary [--out-dir PATH] [--json]

Creates immutable, integrity-protected harness state receipts. Git remains the
source snapshot/fork mechanism; receipts bind the exact repo, dirty-state digest,
loop state, and mobile E2E proof without storing prompts, diffs, or secrets.`;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let result;
  if (args.command === 'create' || args.command === 'fork') {
    if (args.command === 'fork' && !args.parentPath) throw new Error('fork requires --parent');
    result = createCheckpoint(args);
  } else if (args.command === 'verify') {
    if (!args.checkpointPath) throw new Error('verify requires --checkpoint');
    result = verifyCheckpoint(args);
  } else if (args.command === 'summary') {
    result = summarizeCheckpoints(args.outDir);
  } else {
    console.log(usage());
    return { help: true };
  }
  console.log(args.json ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  if (args.command === 'verify' && !result.ok) process.exitCode = 1;
  return result;
}

module.exports = {
  SCHEMA,
  artifactDigest,
  canonicalJson,
  collectSnapshot,
  createCheckpoint,
  digest,
  loadCheckpoint,
  summarizeCheckpoints,
  validateCheckpoint,
  verifyCheckpoint,
  writeCheckpoint,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 2;
  }
}
