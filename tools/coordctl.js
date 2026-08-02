#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCHEMA_VERSION = 1;
const LOCK_STALE_MS = 30_000;
const LOCK_TIMEOUT_MS = 15_000;

function git(cwd, args, required = true) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    if (!required) return null;
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  }
  return result.stdout.trim();
}

function repoContext(cwd = process.cwd()) {
  const topLevel = path.resolve(cwd, git(cwd, ['rev-parse', '--show-toplevel']));
  const commonRaw = git(cwd, ['rev-parse', '--git-common-dir']);
  const commonDir = path.resolve(topLevel, commonRaw);
  const branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'], false)
    || `detached:${git(cwd, ['rev-parse', '--short=12', 'HEAD'])}`;
  const remote = git(cwd, ['remote', 'get-url', 'origin'], false);
  const repoIdentity = remote
    ? remote.replace(/\/\/[^/@]+@/, '//').replace(/\.git$/, '').toLowerCase()
    : fs.realpathSync(commonDir);
  return {
    topLevel,
    commonDir,
    branch,
    repoId: crypto.createHash('sha256').update(repoIdentity).digest('hex'),
  };
}

function resolveStateRoot(cwd = process.cwd(), explicitRoot) {
  if (explicitRoot) return path.resolve(explicitRoot);
  if (process.env.COORDCTL_STATE_ROOT) return path.resolve(process.env.COORDCTL_STATE_ROOT);
  return path.join(repoContext(cwd).commonDir, 'coordination', 'coordctl-v1');
}

function normalizeRepoPath(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('claim path must be non-empty');
  const raw = value.trim().replaceAll('\\', '/');
  if (path.posix.isAbsolute(raw) || /^[A-Za-z]:\//.test(raw)) throw new Error(`absolute claim path rejected: ${value}`);
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`path traversal rejected: ${value}`);
  }
  if (normalized === '.git' || normalized.startsWith('.git/')) throw new Error('.git claims are forbidden');
  return normalized;
}

function normalizePaths(values) {
  return [...new Set(values.map(normalizeRepoPath))].sort();
}

function pathsOverlap(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock(stateRoot) {
  fs.mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const lockDir = path.join(stateRoot, '.lock');
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockDir, { mode: 0o700 });
      fs.writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { mode: 0o600 });
      return () => fs.rmSync(lockDir, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code === 'ENOENT') continue;
        throw statError;
      }
      if (Date.now() >= deadline) throw new Error(`coordination lock timeout: ${lockDir}`);
      sleep(5 + Math.floor(Math.random() * 16));
    }
  }
}

function emptyState() {
  return { schemaVersion: SCHEMA_VERSION, revision: 0, claims: {}, operations: {} };
}

function readState(stateRoot) {
  const stateFile = path.join(stateRoot, 'state.json');
  if (!fs.existsSync(stateFile)) return emptyState();
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  if (state.schemaVersion !== SCHEMA_VERSION || !state.claims || !state.operations) {
    throw new Error(`unsupported or invalid coordination state: ${stateFile}`);
  }
  return state;
}

function writeState(stateRoot, state) {
  const stateFile = path.join(stateRoot, 'state.json');
  const temporary = path.join(stateRoot, `.state.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, stateFile);
  fs.chmodSync(stateFile, 0o600);
}

function signingKey(stateRoot) {
  const keyFile = path.join(stateRoot, 'signing.key');
  try {
    const descriptor = fs.openSync(keyFile, 'wx', 0o600);
    fs.writeFileSync(descriptor, crypto.randomBytes(32));
    fs.closeSync(descriptor);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const key = fs.readFileSync(keyFile);
  if (key.length !== 32) throw new Error('invalid coordination signing key');
  return key;
}

function signReceipt(stateRoot, payload) {
  const key = signingKey(stateRoot);
  return {
    payload,
    payloadHash: sha256(canonical(payload)),
    signature: crypto.createHmac('sha256', key).update(canonical(payload)).digest('hex'),
    keyId: sha256(key).slice(0, 16),
  };
}

function verifyReceipt(stateRoot, receipt, expected = {}) {
  if (!receipt || !receipt.payload || !receipt.signature || !receipt.payloadHash) return { ok: false, reason: 'malformed_receipt' };
  const serialized = canonical(receipt.payload);
  if (sha256(serialized) !== receipt.payloadHash) return { ok: false, reason: 'payload_hash_mismatch' };
  let key;
  try { key = fs.readFileSync(path.join(stateRoot, 'signing.key')); } catch { return { ok: false, reason: 'signing_key_unavailable' }; }
  const actual = crypto.createHmac('sha256', key).update(serialized).digest('hex');
  const left = Buffer.from(actual, 'hex');
  const right = Buffer.from(receipt.signature, 'hex');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return { ok: false, reason: 'signature_mismatch' };
  for (const field of ['repoId', 'branch', 'actor']) {
    if (expected[field] && receipt.payload[field] !== expected[field]) return { ok: false, reason: `${field}_mismatch` };
  }
  return { ok: true, payload: receipt.payload };
}

function receiptCovers(receipt, changedPaths) {
  const claimed = receipt.payload && Array.isArray(receipt.payload.paths) ? receipt.payload.paths : [];
  const uncovered = normalizePaths(changedPaths).filter((changed) => !claimed.some((owner) => changed === owner || changed.startsWith(`${owner}/`)));
  return { ok: uncovered.length === 0, uncovered };
}

function fingerprint(operation, input) {
  return sha256(canonical({ operation, ...input }));
}

function operationReplay(state, opId, wantedFingerprint) {
  const previous = state.operations[opId];
  if (!previous) return null;
  if (previous.fingerprint !== wantedFingerprint) throw new Error(`operation id reused with different payload: ${opId}`);
  return { ...previous.result, idempotentReplay: true };
}

function storeOperation(state, opId, wantedFingerprint, result) {
  state.operations[opId] = { fingerprint: wantedFingerprint, result, recordedAt: new Date().toISOString() };
}

function mutate(stateRoot, action) {
  const unlock = acquireLock(stateRoot);
  try {
    const state = readState(stateRoot);
    const result = action(state);
    writeState(stateRoot, state);
    return result;
  } finally {
    unlock();
  }
}

function claim(options) {
  const { stateRoot, repoId, branch, actor, opId, kind } = options;
  if (!repoId || !branch || !actor || !opId) throw new Error('repoId, branch, actor, and opId are required');
  if (!['source', 'singleton'].includes(kind)) throw new Error('kind must be source or singleton');
  const paths = normalizePaths(options.paths || []);
  if (paths.length === 0) throw new Error('at least one --path is required');
  const ttlMs = Number(options.ttlMs);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttl must be positive');
  const wantedFingerprint = fingerprint('claim', { repoId, branch, actor, kind, paths, ttlMs });
  return mutate(stateRoot, (state) => {
    const replay = operationReplay(state, opId, wantedFingerprint);
    if (replay) return replay;
    const now = Date.now();
    let blocker = null;
    for (const existing of Object.values(state.claims)) {
      if (existing.repoId !== repoId || !existing.paths.some((owned) => paths.some((wanted) => pathsOverlap(owned, wanted)))) continue;
      const expired = Date.parse(existing.expiresAt) <= now;
      if (expired && existing.kind === 'singleton') {
        delete state.claims[existing.claimId];
        continue;
      }
      blocker = { claimId: existing.claimId, actor: existing.actor, kind: existing.kind, stale: expired, paths: existing.paths };
      break;
    }
    if (blocker) {
      const result = { accepted: false, reason: blocker.stale && blocker.kind === 'source' ? 'source_stale_requires_release' : 'overlap', blocker };
      storeOperation(state, opId, wantedFingerprint, result);
      state.revision += 1;
      return result;
    }
    state.revision += 1;
    const claimId = crypto.randomUUID();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + ttlMs).toISOString();
    const record = { claimId, repoId, branch, actor, kind, paths, issuedAt, expiresAt, revision: state.revision };
    state.claims[claimId] = record;
    const receipt = signReceipt(stateRoot, { schemaVersion: SCHEMA_VERSION, operation: 'claim', ...record });
    const result = { accepted: true, claim: record, receipt };
    storeOperation(state, opId, wantedFingerprint, result);
    return result;
  });
}

function renew(options) {
  const { stateRoot, claimId, actor, opId } = options;
  const ttlMs = Number(options.ttlMs);
  if (!claimId || !actor || !opId || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('claimId, actor, opId, and positive ttl are required');
  const wantedFingerprint = fingerprint('renew', { claimId, actor, ttlMs });
  return mutate(stateRoot, (state) => {
    const replay = operationReplay(state, opId, wantedFingerprint);
    if (replay) return replay;
    const existing = state.claims[claimId];
    if (!existing || existing.actor !== actor) {
      const result = { accepted: false, reason: existing ? 'actor_mismatch' : 'claim_not_found' };
      storeOperation(state, opId, wantedFingerprint, result);
      state.revision += 1;
      return result;
    }
    state.revision += 1;
    existing.expiresAt = new Date(Date.now() + ttlMs).toISOString();
    existing.revision = state.revision;
    const receipt = signReceipt(stateRoot, { schemaVersion: SCHEMA_VERSION, operation: 'renew', ...existing });
    const result = { accepted: true, claim: existing, receipt };
    storeOperation(state, opId, wantedFingerprint, result);
    return result;
  });
}

function release(options) {
  const { stateRoot, claimId, actor, opId } = options;
  if (!claimId || !actor || !opId) throw new Error('claimId, actor, and opId are required');
  const wantedFingerprint = fingerprint('release', { claimId, actor });
  return mutate(stateRoot, (state) => {
    const replay = operationReplay(state, opId, wantedFingerprint);
    if (replay) return replay;
    const existing = state.claims[claimId];
    if (!existing || existing.actor !== actor) {
      const result = { accepted: false, reason: existing ? 'actor_mismatch' : 'claim_not_found' };
      storeOperation(state, opId, wantedFingerprint, result);
      state.revision += 1;
      return result;
    }
    state.revision += 1;
    delete state.claims[claimId];
    const receipt = signReceipt(stateRoot, { schemaVersion: SCHEMA_VERSION, operation: 'release', ...existing, revision: state.revision, releasedAt: new Date().toISOString() });
    const result = { accepted: true, claimId, receipt };
    storeOperation(state, opId, wantedFingerprint, result);
    return result;
  });
}

function snapshot(stateRoot) {
  if (!fs.existsSync(stateRoot)) return { initialized: false, schemaVersion: SCHEMA_VERSION, revision: 0, claims: [] };
  const state = readState(stateRoot);
  return { initialized: true, schemaVersion: state.schemaVersion, revision: state.revision, claims: Object.values(state.claims), operationCount: Object.keys(state.operations).length };
}

function doctor(stateRoot) {
  if (!fs.existsSync(stateRoot)) return { ok: true, initialized: false, stateRoot };
  try {
    const state = readState(stateRoot);
    const now = Date.now();
    const claims = Object.values(state.claims);
    const stale = claims.filter((item) => Date.parse(item.expiresAt) <= now);
    const overlaps = [];
    for (let i = 0; i < claims.length; i += 1) {
      for (let j = i + 1; j < claims.length; j += 1) {
        if (claims[i].repoId === claims[j].repoId && claims[i].paths.some((a) => claims[j].paths.some((b) => pathsOverlap(a, b)))) {
          overlaps.push([claims[i].claimId, claims[j].claimId]);
        }
      }
    }
    const keyFile = path.join(stateRoot, 'signing.key');
    const permissionsOk = !fs.existsSync(keyFile) || (fs.statSync(keyFile).mode & 0o077) === 0;
    return {
      ok: overlaps.length === 0 && permissionsOk,
      initialized: true,
      stateRoot,
      revision: state.revision,
      activeClaims: claims.length - stale.length,
      staleSourceClaims: stale.filter((item) => item.kind === 'source').length,
      staleSingletonClaims: stale.filter((item) => item.kind === 'singleton').length,
      overlaps,
      signingKeyPermissionsOk: permissionsOk,
    };
  } catch (error) {
    return { ok: false, initialized: true, stateRoot, error: error.message };
  }
}

function parseArgs(argv) {
  const args = { _: [], path: [], changedFile: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { args._.push(token); continue; }
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (key === 'json') { args.json = true; continue; }
    const value = argv[++i];
    if (value === undefined) throw new Error(`missing value for ${token}`);
    if (key === 'path' || key === 'changedFile') args[key].push(value);
    else args[key] = value;
  }
  return args;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const command = args._[0];
  if (!command) throw new Error('command required: doctor|snapshot|claim|renew|release|verify-receipt');
  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  const context = repoContext(cwd);
  const stateRoot = resolveStateRoot(cwd, args.stateRoot);
  let result;
  if (command === 'doctor') result = doctor(stateRoot);
  else if (command === 'snapshot') result = snapshot(stateRoot);
  else if (command === 'claim') result = claim({ stateRoot, repoId: context.repoId, branch: args.branch || context.branch, actor: args.actor, opId: args.opId, kind: args.kind, paths: args.path, ttlMs: Number(args.ttl || 300) * 1000 });
  else if (command === 'renew') result = renew({ stateRoot, claimId: args.claimId, actor: args.actor, opId: args.opId, ttlMs: Number(args.ttl || 300) * 1000 });
  else if (command === 'release') result = release({ stateRoot, claimId: args.claimId, actor: args.actor, opId: args.opId });
  else if (command === 'verify-receipt') {
    if (!args.receipt) throw new Error('--receipt is required');
    const receipt = JSON.parse(fs.readFileSync(path.resolve(args.receipt), 'utf8'));
    const verified = verifyReceipt(stateRoot, receipt, { repoId: context.repoId, branch: args.branch || context.branch, actor: args.actor });
    const coverage = verified.ok ? receiptCovers(receipt, args.changedFile) : { ok: false, uncovered: args.changedFile };
    result = { ok: verified.ok && coverage.ok, verification: verified, coverage };
  } else throw new Error(`unknown command: ${command}`);
  print(result);
  if (result.accepted === false || result.ok === false) process.exitCode = 2;
}

if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = {
  claim,
  doctor,
  normalizeRepoPath,
  pathsOverlap,
  receiptCovers,
  release,
  renew,
  repoContext,
  resolveStateRoot,
  snapshot,
  verifyReceipt,
};
