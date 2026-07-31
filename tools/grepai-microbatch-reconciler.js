#!/usr/bin/env node
'use strict';

/**
 * Source-bound micro-batch reconciler for the production grepai index.
 *
 * A Git commit is the bounded snapshot/partition. Each run compares the latest
 * remote main SHA with the last committed generation receipt, coalesces any
 * intermediate commits into one latest-tree build, validates a non-served
 * builder, then publishes index.gob with a same-directory atomic rename.
 *
 * The committed generation receipt is deliberately separate from the attempt
 * receipt. A rejected build never advances the source watermark. The MCP gate
 * in grepai-mcp-fresh.js verifies the receipt, source SHA, config hash and index
 * hash before it exposes grepai to an agent.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const GENERATION_SCHEMA = 'retrieval-index-generation/v1';
const ATTEMPT_SCHEMA = 'retrieval-refresh-attempt/v1';
const DEFAULT_REPO = 'mac-yolo-safeguards';
const DEFAULT_REMOTE = 'https://github.com/IgorGanapolsky/mac-yolo-safeguards.git';
const DEFAULT_CANARIES = ['retrieval harness', 'resource lease'];
const DAY_MS = 86_400_000;

function validSha(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
}

function iso(nowMs) {
  return new Date(nowMs).toISOString();
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes;
    do {
      bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytes > 0) hash.update(buffer.subarray(0, bytes));
    } while (bytes > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function normalizedConfigHash(filePath) {
  const normalized = fs.readFileSync(filePath, 'utf8')
    // grepai resolves parallelism=0 and writes the machine-specific value, and
    // records last_index_time after every build. They are runtime state, not
    // embedding/chunking/search semantics, so they cannot define compatibility.
    .replace(/^\s*parallelism:\s*\d+\s*$/gm, '')
    .replace(/^\s*last_index_time:\s*.+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function syncDirectory(dirPath) {
  let fd;
  try {
    fd = fs.openSync(dirPath, 'r');
    fs.fsyncSync(fd);
  } catch {
    // Directory fsync is unavailable on some filesystems. The file fsync and
    // same-directory rename still preserve the no-partial-file invariant.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function atomicWriteJson(targetPath, value, mode = 0o600) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(
    dir,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${crypto.randomBytes(5).toString('hex')}`,
  );
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', mode);
    fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(temp, targetPath);
    syncDirectory(dir);
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch { /* best effort */ }
    throw error;
  }
}

function atomicReplaceFile(sourcePath, destinationPath, hooks = {}) {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error(`atomic source missing: ${sourcePath}`);
  }
  const dir = path.dirname(destinationPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const temp = path.join(
    dir,
    `.${path.basename(destinationPath)}.next-${process.pid}-${crypto.randomBytes(5).toString('hex')}`,
  );
  try {
    fs.copyFileSync(sourcePath, temp, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temp, fs.statSync(sourcePath).mode & 0o777);
    const fd = fs.openSync(temp, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (hooks.beforeRename) hooks.beforeRename({ sourcePath, destinationPath, tempPath: temp });
    fs.renameSync(temp, destinationPath);
    syncDirectory(dir);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* best effort */ }
    throw error;
  }
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function defaultOptions(input = {}) {
  const home = input.home || os.homedir();
  const indexRoot = path.resolve(
    input.indexRoot || process.env.HERMES_SEMANTIC_INDEX_ROOT
      || path.join(home, '.hermes', 'semantic-index'),
  );
  const repoName = input.repoName || DEFAULT_REPO;
  const servedDir = path.resolve(input.servedDir || path.join(indexRoot, repoName));
  const builderDir = path.resolve(input.builderDir || path.join(indexRoot, '.builders', repoName));
  return {
    home,
    indexRoot,
    repoName,
    servedDir,
    builderDir,
    remote: input.remote || process.env.HERMES_SEMANTIC_REMOTE || DEFAULT_REMOTE,
    branch: input.branch || 'main',
    statePath: path.resolve(input.statePath || path.join(servedDir, '.grepai', 'generation.json')),
    attemptPath: path.resolve(
      input.attemptPath || path.join(indexRoot, 'logs', `${repoName}-latest-attempt.json`),
    ),
    lockPath: path.resolve(input.lockPath || path.join(indexRoot, '.locks', `${repoName}.lock`)),
    minIndexBytes: input.minIndexBytes ?? 10 * 1024,
    maxCheckAgeMs: input.maxCheckAgeMs ?? 180_000,
    maxBuildMs: input.maxBuildMs ?? 15 * 60_000,
    watchLaunchTimeoutMs: input.watchLaunchTimeoutMs ?? 60_000,
    pollMs: input.pollMs ?? 2_000,
    canaryTimeoutMs: input.canaryTimeoutMs ?? 120_000,
    fullRebuildAfterMs: input.fullRebuildAfterMs ?? 7 * DAY_MS,
    forceFull: input.forceFull === true,
    canaries: input.canaries || DEFAULT_CANARIES,
  };
}

function assertPrivatePath(candidate, root, label) {
  const resolved = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`${label} must be a child of semantic index root: ${resolvedRoot}`);
  }
  for (const target of [resolvedRoot, resolved]) {
    let cursor = target;
    while (cursor.startsWith(resolvedRoot)) {
      if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
        throw new Error(`${label} contains a symbolic link: ${cursor}`);
      }
      if (cursor === resolvedRoot) break;
      cursor = path.dirname(cursor);
    }
  }
  const existing = (() => {
    let cursor = resolved;
    while (!fs.existsSync(cursor) && cursor !== resolvedRoot) cursor = path.dirname(cursor);
    return cursor;
  })();
  if (fs.existsSync(existing)) {
    const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync(resolvedRoot) : resolvedRoot;
    const realExisting = fs.realpathSync(existing);
    if (realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`${label} escapes semantic index root through filesystem links`);
    }
  }
}

function validateOptionPaths(opts) {
  assertPrivatePath(opts.servedDir, opts.indexRoot, 'servedDir');
  assertPrivatePath(opts.builderDir, opts.indexRoot, 'builderDir');
  validateCloneInternals(opts.servedDir, opts.indexRoot, 'servedDir');
  validateCloneInternals(opts.builderDir, opts.indexRoot, 'builderDir');
  assertPrivatePath(opts.attemptPath, opts.indexRoot, 'attemptPath');
  assertPrivatePath(opts.lockPath, opts.indexRoot, 'lockPath');
  assertPrivatePath(opts.statePath, opts.servedDir, 'statePath');
}

function validateCloneInternals(cloneDir, indexRoot, label) {
  for (const child of ['.git', '.grepai']) {
    const candidate = path.join(cloneDir, child);
    assertPrivatePath(candidate, indexRoot, `${label}/${child}`);
    if (child === '.git' && fs.existsSync(candidate) && !fs.lstatSync(candidate).isDirectory()) {
      throw new Error(`${label}/.git must be a directory from an isolated plain clone`);
    }
  }
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function acquireLock(lockPath, nowMs, staleAfterMs) {
  const token = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  try {
    fs.mkdirSync(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const holder = readJson(path.join(lockPath, 'holder.json'));
    const acquiredMs = Date.parse(holder?.acquiredAt || '');
    const age = Number.isFinite(acquiredMs)
      ? nowMs - acquiredMs
      : nowMs - fs.statSync(lockPath).mtimeMs;
    if (age <= staleAfterMs || isPidAlive(holder?.pid)) return null;
    const stalePath = `${lockPath}.stale-${Math.floor(nowMs)}-${token}`;
    try {
      fs.renameSync(lockPath, stalePath);
      fs.mkdirSync(lockPath, { mode: 0o700 });
    } catch (staleError) {
      if (staleError.code === 'EEXIST' || staleError.code === 'ENOENT') return null;
      throw staleError;
    } finally {
      try { fs.rmSync(stalePath, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
  atomicWriteJson(path.join(lockPath, 'holder.json'), {
    pid: process.pid,
    token,
    acquiredAt: iso(nowMs),
  });
  return token;
}

function releaseLock(lockPath, token) {
  const holder = readJson(path.join(lockPath, 'holder.json'));
  if (!holder || holder.token !== token) return false;
  try { fs.rmSync(lockPath, { recursive: true, force: true }); } catch { /* best effort */ }
  return true;
}

function currentMaterialHealth(opts, state, sourceProof = {}) {
  const indexPath = path.join(opts.servedDir, '.grepai', 'index.gob');
  const configPath = path.join(opts.servedDir, '.grepai', 'config.yaml');
  const artifactPath = state?.indexArtifact
    ? path.resolve(opts.servedDir, '.grepai', state.indexArtifact)
    : null;
  const problems = [];
  if (!state || state.schemaVersion !== GENERATION_SCHEMA || state.committed !== true) {
    problems.push('committed generation receipt missing');
  }
  if (!validSha(state?.indexedSha)) problems.push('indexed SHA missing or invalid');
  if (state?.observedOriginSha !== state?.indexedSha) {
    problems.push('remote watermark differs from indexed SHA');
  }
  if (sourceProof.checked) {
    if (!validSha(sourceProof.headSha)) problems.push('served Git HEAD unreadable');
    else if (sourceProof.headSha !== state?.indexedSha) problems.push('served Git HEAD differs from indexed SHA');
    if (!validSha(sourceProof.treeHash)) problems.push('served Git tree unreadable');
    else if (sourceProof.treeHash !== state?.sourceTreeHash) {
      problems.push('served Git tree differs from indexed source tree');
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(state?.indexSha256 || '')) {
    problems.push('generation artifact hash missing or invalid');
  }
  if (!Number.isFinite(state?.indexBytes) || state.indexBytes <= 0) {
    problems.push('generation artifact byte count missing or invalid');
  }
  if (!/^[a-f0-9]{64}$/i.test(state?.configSha256 || '')) {
    problems.push('served config hash missing or invalid');
  }
  if (!Array.isArray(state?.canaries) || state.canaries.length === 0) {
    problems.push('retrieval canary receipt missing');
  } else if (state.canaries.some((entry) => entry.passed !== true)) {
    problems.push('retrieval canary receipt contains a failure');
  }
  if (!fs.existsSync(indexPath)) problems.push('mutable served index missing');
  else if (fs.statSync(indexPath).size < opts.minIndexBytes) {
    problems.push(`mutable served index undersized (${fs.statSync(indexPath).size} bytes)`);
  }
  const grepaiRoot = path.resolve(opts.servedDir, '.grepai');
  try {
    if (artifactPath) assertPrivatePath(artifactPath, grepaiRoot, 'indexArtifact');
  } catch (error) {
    problems.push(error.message);
  }
  if (!artifactPath || !artifactPath.startsWith(`${grepaiRoot}${path.sep}`)) {
    problems.push('immutable generation artifact path missing or unsafe');
  } else if (!fs.existsSync(artifactPath)) {
    problems.push('immutable generation artifact missing');
  } else {
    const bytes = fs.statSync(artifactPath).size;
    if (bytes < opts.minIndexBytes) problems.push(`generation artifact undersized (${bytes} bytes)`);
    if (state?.indexBytes !== bytes) problems.push('generation artifact size differs from receipt');
    if (hashFile(artifactPath) !== state?.indexSha256) {
      problems.push('generation artifact hash differs from receipt');
    }
  }
  if (!fs.existsSync(configPath)) problems.push('served config missing');
  else if (hashFile(configPath) !== state?.configSha256) {
    problems.push('served config hash differs from receipt');
  }
  return { ok: problems.length === 0, problems, indexPath, configPath, artifactPath };
}

function validateBuild(build, opts, targetSha) {
  if (!build || typeof build !== 'object') throw new Error('builder returned no generation');
  if (!validSha(targetSha)) throw new Error(`invalid target SHA: ${targetSha}`);
  if (!validSha(build.sourceTreeHash)) throw new Error('builder source tree hash missing or invalid');
  if (!build.indexPath || !fs.existsSync(build.indexPath)) {
    throw new Error(`builder index missing: ${build.indexPath || '(unset)'}`);
  }
  const indexBytes = fs.statSync(build.indexPath).size;
  if (indexBytes < opts.minIndexBytes) {
    throw new Error(`builder index undersized: ${indexBytes} < ${opts.minIndexBytes}`);
  }
  if (!build.configPath || !fs.existsSync(build.configPath)) {
    throw new Error(`builder config missing: ${build.configPath || '(unset)'}`);
  }
  if (!Number.isFinite(build.files) || build.files <= 0) {
    throw new Error(`builder reported invalid file count: ${build.files}`);
  }
  if (!Number.isFinite(build.chunks) || build.chunks <= 0) {
    throw new Error(`builder reported invalid chunk count: ${build.chunks}`);
  }
  if (!Array.isArray(build.canaries) || build.canaries.length === 0) {
    throw new Error('builder did not produce retrieval canaries');
  }
  const failedCanaries = build.canaries.filter((entry) => entry.passed !== true);
  if (failedCanaries.length > 0) {
    throw new Error(`retrieval canary failed: ${failedCanaries.map((entry) => entry.query).join(', ')}`);
  }
  return {
    indexBytes,
    indexSha256: hashFile(build.indexPath),
    configSha256: hashFile(build.configPath),
  };
}

function writeAttempt(opts, body) {
  atomicWriteJson(opts.attemptPath, {
    schemaVersion: ATTEMPT_SCHEMA,
    ...body,
  });
}

function safeWriteAttempt(opts, body) {
  try {
    writeAttempt(opts, body);
    return null;
  } catch (error) {
    return String(error.message || error).slice(0, 1000);
  }
}

function publishIndexAndReceipt(opts, build, receipt, hooks = {}) {
  const servedIndex = path.join(opts.servedDir, '.grepai', 'index.gob');
  const servedConfig = path.join(opts.servedDir, '.grepai', 'config.yaml');
  const grepaiRoot = path.resolve(opts.servedDir, '.grepai');
  const artifactPath = path.resolve(grepaiRoot, receipt.indexArtifact);
  if (!artifactPath.startsWith(`${grepaiRoot}${path.sep}`)) {
    throw new Error(`unsafe generation artifact path: ${receipt.indexArtifact}`);
  }
  fs.mkdirSync(path.dirname(servedIndex), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true, mode: 0o700 });

  const indexBackup = fs.existsSync(servedIndex)
    ? path.join(path.dirname(servedIndex), `.index.gob.last-good-${process.pid}`)
    : null;
  const configExisted = fs.existsSync(servedConfig);
  const configBackup = configExisted
    ? path.join(path.dirname(servedConfig), `.config.yaml.last-good-${process.pid}`)
    : null;
  const artifactExisted = fs.existsSync(artifactPath);
  const artifactBackup = artifactExisted
    ? path.join(path.dirname(artifactPath), `.${path.basename(artifactPath)}.last-good-${process.pid}`)
    : null;
  for (const [source, backup] of [
    [servedIndex, indexBackup],
    [servedConfig, configBackup],
    [artifactPath, artifactBackup],
  ]) {
    if (!backup) continue;
    fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
    const fd = fs.openSync(backup, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }

  try {
    atomicReplaceFile(build.configPath, servedConfig);
    atomicReplaceFile(build.indexPath, artifactPath);
    atomicReplaceFile(artifactPath, servedIndex);
    const publishedHash = hashFile(artifactPath);
    if (publishedHash !== receipt.indexSha256) {
      throw new Error(`published index hash mismatch: ${publishedHash} != ${receipt.indexSha256}`);
    }
    const publishedConfigHash = hashFile(servedConfig);
    if (publishedConfigHash !== receipt.configSha256) {
      throw new Error(
        `published config hash mismatch: ${publishedConfigHash} != ${receipt.configSha256}`,
      );
    }
    (hooks.writeReceipt || atomicWriteJson)(opts.statePath, receipt);
    for (const backup of [indexBackup, configBackup, artifactBackup]) {
      if (!backup) continue;
      try { fs.unlinkSync(backup); } catch { /* receipt is committed; cleanup is best effort */ }
    }
    const keepArtifacts = new Set([
      `${receipt.generationId}.gob`,
      receipt.previousGenerationId ? `${receipt.previousGenerationId}.gob` : null,
    ].filter(Boolean));
    for (const entry of fs.readdirSync(path.dirname(artifactPath), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.gob') || keepArtifacts.has(entry.name)) continue;
      try { fs.unlinkSync(path.join(path.dirname(artifactPath), entry.name)); } catch { /* best effort */ }
    }
  } catch (error) {
    for (const [backup, destination] of [
      [indexBackup, servedIndex],
      [configBackup, servedConfig],
      [artifactBackup, artifactPath],
    ]) {
      if (!backup || !fs.existsSync(backup)) continue;
      atomicReplaceFile(backup, destination);
      try { fs.unlinkSync(backup); } catch { /* best effort */ }
    }
    if (!configExisted) try { fs.unlinkSync(servedConfig); } catch { /* best effort */ }
    if (!artifactExisted) try { fs.unlinkSync(artifactPath); } catch { /* best effort */ }
    throw error;
  }
}

async function reconcile(inputOptions = {}, injected = {}) {
  const opts = defaultOptions(inputOptions);
  validateOptionPaths(opts);
  const deps = Object.keys(injected).length > 0 ? injected : createRealDependencies(opts);
  const startedMs = deps.now ? deps.now() : Date.now();
  const lockToken = acquireLock(opts.lockPath, startedMs, opts.maxBuildMs * 2);
  if (!lockToken) {
    return { ok: true, action: 'busy', checkedAt: iso(startedMs), lockPath: opts.lockPath };
  }

  let targetSha = null;
  let state = null;
  let sourceSynced = false;
  try {
    targetSha = await deps.latestRemoteSha({ remote: opts.remote, branch: opts.branch });
    if (!validSha(targetSha)) throw new Error(`remote returned invalid SHA: ${targetSha}`);

    state = readJson(opts.statePath);
    const sourceProofChecked = typeof deps.servedHeadSha === 'function';
    const servedHeadSha = sourceProofChecked
      ? await deps.servedHeadSha({ projectPath: opts.servedDir })
      : null;
    const servedTreeHash = typeof deps.servedTreeHash === 'function'
      ? await deps.servedTreeHash({ projectPath: opts.servedDir })
      : sourceProofChecked ? null : undefined;
    const current = currentMaterialHealth(opts, state, {
      checked: sourceProofChecked,
      headSha: servedHeadSha,
      treeHash: servedTreeHash,
    });
    const lastFull = Date.parse(state?.lastFullRebuildAt || '');
    const fullDue = opts.forceFull
      || !state
      || !Number.isFinite(lastFull)
      || startedMs - lastFull >= opts.fullRebuildAfterMs
      || !current.ok;

    if (
      state
      && state.indexedSha === targetSha
      && state.observedOriginSha === targetSha
      && current.ok
      && !fullDue
    ) {
      const refreshed = {
        ...state,
        lastRemoteCheckedAt: iso(startedMs),
        observedOriginSha: targetSha,
      };
      atomicWriteJson(opts.statePath, refreshed);
      const telemetryWarning = safeWriteAttempt(opts, {
        status: 'noop',
        startedAt: iso(startedMs),
        completedAt: iso(startedMs),
        fromSha: state.indexedSha,
        targetSha,
        reason: 'watermark already equals latest remote SHA and material hashes match',
      });
      return { ok: true, action: 'noop', targetSha, generation: refreshed, telemetryWarning };
    }

    let build = null;
    let validated = null;
    let remoteCheckedMs = startedMs;
    let supersededBuilds = 0;
    for (let buildAttempt = 0; buildAttempt < 2; buildAttempt += 1) {
      build = await deps.prepareBuild({
        targetSha,
        previousState: state,
        fullRebuild: fullDue && buildAttempt === 0,
        options: opts,
      });
      validated = validateBuild(build, opts, targetSha);
      const confirmedSha = await deps.latestRemoteSha({ remote: opts.remote, branch: opts.branch });
      remoteCheckedMs = deps.now ? deps.now() : Date.now();
      if (!validSha(confirmedSha)) throw new Error(`remote returned invalid SHA: ${confirmedSha}`);
      if (confirmedSha === targetSha) break;
      supersededBuilds += 1;
      if (buildAttempt === 1) {
        throw new Error(
          `remote advanced during both bounded builds: ${targetSha} -> ${confirmedSha}`,
        );
      }
      targetSha = confirmedSha;
      build = null;
      validated = null;
    }
    if (!build || !validated) throw new Error('no remotely confirmed build was produced');

    const servedConfig = path.join(opts.servedDir, '.grepai', 'config.yaml');
    if (
      fs.existsSync(servedConfig)
      && normalizedConfigHash(servedConfig) !== normalizedConfigHash(build.configPath)
    ) {
      throw new Error('builder config differs from served config; source generation not publishable');
    }

    await deps.syncServedSource({ targetSha, options: opts });
    sourceSynced = true;
    const publicationRemoteSha = await deps.latestRemoteSha({
      remote: opts.remote,
      branch: opts.branch,
    });
    remoteCheckedMs = deps.now ? deps.now() : Date.now();
    if (!validSha(publicationRemoteSha)) {
      throw new Error(`remote returned invalid SHA before publication: ${publicationRemoteSha}`);
    }
    if (publicationRemoteSha !== targetSha) {
      throw new Error(
        `remote advanced before publication: ${targetSha} -> ${publicationRemoteSha}`,
      );
    }
    const completedMs = deps.now ? deps.now() : Date.now();
    const commitLag = Number.isFinite(build.commitTimeMs)
      ? Math.max(0, completedMs - build.commitTimeMs)
      : null;
    const generationId = `${targetSha.slice(0, 12)}-${validated.indexSha256.slice(0, 12)}`;
    const receipt = {
      schemaVersion: GENERATION_SCHEMA,
      committed: true,
      generationId,
      previousGenerationId: state?.generationId || null,
      indexedSha: targetSha,
      observedOriginSha: targetSha,
      sourceTreeHash: build.sourceTreeHash,
      indexSha256: validated.indexSha256,
      indexArtifact: `generations/${generationId}.gob`,
      configSha256: validated.configSha256,
      indexBytes: validated.indexBytes,
      files: build.files,
      chunks: build.chunks,
      model: build.model || null,
      diff: build.diff || { added: null, modified: null, deleted: null },
      skippedCommits: Number.isFinite(build.skippedCommits) ? build.skippedCommits : null,
      supersededBuilds,
      canaries: build.canaries,
      fullRebuild: fullDue,
      builtAt: build.builtAt || iso(completedMs),
      publishedAt: iso(completedMs),
      lastRemoteCheckedAt: iso(remoteCheckedMs),
      lastFullRebuildAt: fullDue
        ? iso(completedMs)
        : state?.lastFullRebuildAt || null,
      buildDurationMs: Math.max(0, completedMs - startedMs),
      commitToSearchableLagMs: commitLag,
    };

    const publishGeneration = deps.publishGeneration || publishIndexAndReceipt;
    publishGeneration(opts, build, receipt);
    const telemetryWarning = safeWriteAttempt(opts, {
      status: 'committed',
      startedAt: iso(startedMs),
      completedAt: iso(completedMs),
      fromSha: state?.indexedSha || null,
      targetSha,
      generationId,
      fullRebuild: fullDue,
      diff: receipt.diff,
      skippedCommits: receipt.skippedCommits,
      supersededBuilds,
      buildDurationMs: receipt.buildDurationMs,
      commitToSearchableLagMs: receipt.commitToSearchableLagMs,
    });
    return { ok: true, action: 'published', targetSha, generation: receipt, telemetryWarning };
  } catch (error) {
    const failedMs = deps.now ? deps.now() : Date.now();
    let finalError = error;
    if (sourceSynced && validSha(state?.indexedSha)) {
      try {
        await deps.syncServedSource({
          targetSha: state.indexedSha,
          options: opts,
          rollback: true,
        });
      } catch (rollbackError) {
        finalError = new Error(
          `${error.message || error}; source rollback failed: ${rollbackError.message || rollbackError}`,
        );
      }
    }
    safeWriteAttempt(opts, {
      status: 'rejected',
      startedAt: iso(startedMs),
      completedAt: iso(failedMs),
      targetSha,
      error: String(finalError.message || finalError).slice(0, 1000),
    });
    throw finalError;
  } finally {
    releaseLock(opts.lockPath, lockToken);
  }
}

function command(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeout || 120_000,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.error && !options.allowFailure) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = (result.stderr || result.stdout || '').trim().slice(0, 800);
    throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${detail}`);
  }
  return {
    status: result.status ?? (result.error ? 124 : 1),
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || result.error?.message || '').trim(),
  };
}

function stopWatcherVerified(cwd, label = 'grepai watcher', runner = command) {
  const stopped = runner('grepai', ['watch', '--stop'], {
    cwd,
    allowFailure: true,
    timeout: 30_000,
  });
  if (stopped.status !== 0) {
    throw new Error(
      `${label} stop failed (${stopped.status}): ${stopped.stderr || stopped.stdout || 'no output'}`,
    );
  }
  const status = runner('grepai', ['watch', '--status'], {
    cwd,
    allowFailure: true,
    timeout: 30_000,
  });
  const detail = `${status.stdout || ''}\n${status.stderr || ''}`;
  if (status.status !== 0 || /Status:\s*running/i.test(detail)) {
    throw new Error(`${label} is still running after stop: ${detail.trim() || status.status}`);
  }
  return true;
}

function parseGrepaiStatus(text) {
  const files = /Files indexed:\s*(\d+)/i.exec(text);
  const chunks = /Total chunks:\s*(\d+)/i.exec(text);
  const watcher = /Watcher:\s*(.+)/i.exec(text);
  return {
    files: files ? Number(files[1]) : 0,
    chunks: chunks ? Number(chunks[1]) : 0,
    watcher: watcher ? watcher[1].trim() : null,
  };
}

function parseSearch(stdout) {
  try {
    const body = JSON.parse(stdout);
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.results)) return body.results;
    if (Array.isArray(body.matches)) return body.matches;
  } catch {
    return [];
  }
  return [];
}

function diffSummary(builderDir, fromSha, targetSha) {
  if (!validSha(fromSha) || fromSha === targetSha) {
    return { diff: { added: 0, modified: 0, deleted: 0 }, skippedCommits: 0 };
  }
  let output;
  try {
    output = command('git', ['-C', builderDir, 'diff', '--name-status', fromSha, targetSha], {
      timeout: 60_000,
    }).stdout;
  } catch {
    return { diff: { added: null, modified: null, deleted: null }, skippedCommits: null };
  }
  const diff = { added: 0, modified: 0, deleted: 0 };
  for (const line of output.split('\n')) {
    const code = line.split(/\s+/)[0] || '';
    if (code.startsWith('A')) diff.added += 1;
    else if (code.startsWith('D')) diff.deleted += 1;
    else if (code) diff.modified += 1;
  }
  let skippedCommits = null;
  try {
    const count = Number(command(
      'git', ['-C', builderDir, 'rev-list', '--count', `${fromSha}..${targetSha}`],
    ).stdout);
    skippedCommits = Number.isFinite(count) ? Math.max(0, count - 1) : null;
  } catch { /* shallow history may not include the previous generation */ }
  return { diff, skippedCommits };
}

function selectDeltaCanary(builderDir, fromSha, targetSha) {
  if (!validSha(fromSha) || fromSha === targetSha) return null;
  let output;
  try {
    output = command('git', [
      '-C', builderDir, 'diff', '--unified=0', fromSha, targetSha, '--',
      '*.js', '*.ts', '*.tsx', '*.jsx', '*.py', '*.go', '*.rs', '*.java', '*.md',
    ], { timeout: 60_000 }).stdout;
  } catch {
    return null;
  }
  let currentPath = null;
  for (const line of output.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentPath = line.slice(6);
      continue;
    }
    if (!currentPath || !line.startsWith('+') || line.startsWith('+++')) continue;
    const tokens = line.match(/[A-Za-z_][A-Za-z0-9_]{15,}/g) || [];
    const token = tokens.find((value) => !/^https|function|implementation|configuration/i.test(value));
    if (token) return { query: token, expectedPath: currentPath };
  }
  return null;
}

function readRunLogs(logDir) {
  if (!fs.existsSync(logDir)) return '';
  const out = [];
  for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
    const candidate = path.join(logDir, entry.name);
    if (entry.isFile()) {
      try { out.push(fs.readFileSync(candidate, 'utf8')); } catch { /* writer may be rotating */ }
    }
  }
  return out.join('\n');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBuild(builderDir, logDir, opts) {
  const deadline = Date.now() + opts.maxBuildMs;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const statusResult = command('grepai', ['status', '--no-ui'], {
      cwd: builderDir,
      allowFailure: true,
      timeout: 30_000,
    });
    const status = parseGrepaiStatus(statusResult.stdout || statusResult.stderr);
    const logs = readRunLogs(logDir);
    const indexPath = path.join(builderDir, '.grepai', 'index.gob');
    const complete = logs.includes('Initial scan complete:') && /\[RUNNING\].*steady/i.test(logs);
    if (
      statusResult.status === 0
      && complete
      && status.files > 0
      && status.chunks > 0
      && fs.existsSync(indexPath)
      && fs.statSync(indexPath).size >= opts.minIndexBytes
    ) {
      return { ...status, indexPath };
    }
    lastStatus = { statusResult, status, logTail: logs.slice(-1000) };
    await delay(opts.pollMs);
  }
  throw new Error(`grepai build timed out after ${opts.maxBuildMs}ms: ${JSON.stringify(lastStatus)}`);
}

function runCanary(builderDir, spec, timeoutMs = 120_000) {
  const result = command(
    'grepai', ['search', spec.query, '--json', '--compact', '--limit', '10'],
    { cwd: builderDir, allowFailure: true, timeout: timeoutMs },
  );
  const hits = result.status === 0 ? parseSearch(result.stdout) : [];
  const paths = hits.map((hit) => hit.file_path || hit.path || hit.file || '').filter(Boolean);
  const pathPassed = spec.expectedPath
    ? paths.some((filePath) => filePath === spec.expectedPath || filePath.endsWith(spec.expectedPath))
    : true;
  return {
    query: spec.query,
    expectedPath: spec.expectedPath || null,
    results: hits.length,
    passed: result.status === 0 && hits.length > 0 && pathPassed,
    topPaths: paths.slice(0, 5),
    exitCode: result.status,
  };
}

function watcherStartupProgressing(startResult, logText, statusText = '') {
  if (startResult?.status === 0) return true;
  return /Performing initial scan|\[(?:QUEUED|STARTING|RUNNING)\]|Status:\s*running/i.test(
    `${logText || ''}\n${statusText || ''}`,
  );
}

function ensureClone(clonePath, remote, branch) {
  if (!fs.existsSync(path.join(clonePath, '.git'))) {
    fs.mkdirSync(path.dirname(clonePath), { recursive: true, mode: 0o700 });
    command('git', [
      'clone', '--single-branch', '--branch', branch, '--depth', '128', remote, clonePath,
    ], { timeout: 300_000 });
  }
}

function initializeBuilder(builderDir, servedDir) {
  const builderGrepai = path.join(builderDir, '.grepai');
  const builderConfig = path.join(builderGrepai, 'config.yaml');
  const servedConfig = path.join(servedDir, '.grepai', 'config.yaml');
  fs.mkdirSync(builderGrepai, { recursive: true, mode: 0o700 });
  if (fs.existsSync(servedConfig)) {
    fs.copyFileSync(servedConfig, builderConfig);
  } else if (!fs.existsSync(builderConfig)) {
    command('grepai', ['init', '--provider', 'ollama', '--backend', 'gob', '--yes'], {
      cwd: builderDir,
      timeout: 60_000,
    });
  }
}

async function prepareRealBuild(opts, { targetSha, previousState, fullRebuild }) {
  validateCloneInternals(opts.builderDir, opts.indexRoot, 'builderDir');
  ensureClone(opts.builderDir, opts.remote, opts.branch);
  validateCloneInternals(opts.builderDir, opts.indexRoot, 'builderDir');
  stopWatcherVerified(opts.builderDir, 'builder watcher');
  command('git', ['-C', opts.builderDir, 'fetch', 'origin', opts.branch, '--depth', '128', '--prune'], {
    timeout: 300_000,
  });
  command('git', ['-C', opts.builderDir, 'checkout', '-B', opts.branch, targetSha]);
  command('git', ['-C', opts.builderDir, 'reset', '--hard', targetSha]);

  const builderGrepai = path.join(opts.builderDir, '.grepai');
  let backup = null;
  let watcherAttempted = false;
  if (fullRebuild && fs.existsSync(builderGrepai)) {
    backup = `${builderGrepai}.last-incremental-${process.pid}`;
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    fs.renameSync(builderGrepai, backup);
  }

  try {
    initializeBuilder(opts.builderDir, opts.servedDir);
    const runId = `${Date.now()}-${targetSha.slice(0, 12)}`;
    const logDir = path.join(opts.builderDir, '.grepai', 'run-logs', runId);
    fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    watcherAttempted = true;
    const watchStart = command('grepai', ['watch', '--background', '--log-dir', logDir], {
      cwd: opts.builderDir,
      timeout: opts.watchLaunchTimeoutMs,
      allowFailure: true,
    });
    if (watchStart.status !== 0) {
      const logTail = readRunLogs(logDir).slice(-2000);
      const statusProbe = command('grepai', ['watch', '--status'], {
        cwd: opts.builderDir,
        timeout: 30_000,
        allowFailure: true,
      });
      if (!watcherStartupProgressing(watchStart, logTail, `${statusProbe.stdout}\n${statusProbe.stderr}`)) {
        throw new Error(
          `grepai background build failed to start (${watchStart.status}): `
          + `${watchStart.stderr || watchStart.stdout || '(no launcher output)'}\n${logTail}`,
        );
      }
    }
    let built;
    const stopOnSignal = () => {
      try { stopWatcherVerified(opts.builderDir, 'builder watcher'); } catch { /* exit is imminent */ }
      process.exit(143);
    };
    process.once('SIGTERM', stopOnSignal);
    process.once('SIGINT', stopOnSignal);
    try {
      built = await waitForBuild(opts.builderDir, logDir, opts);
    } finally {
      process.removeListener('SIGTERM', stopOnSignal);
      process.removeListener('SIGINT', stopOnSignal);
      stopWatcherVerified(opts.builderDir, 'builder watcher');
    }

    const stableCanaries = opts.canaries.map((query) => ({ query }));
    const delta = selectDeltaCanary(opts.builderDir, previousState?.indexedSha, targetSha);
    if (delta) stableCanaries.push(delta);
    const canaries = stableCanaries.map(
      (spec) => runCanary(opts.builderDir, spec, opts.canaryTimeoutMs),
    );
    const sourceTreeHash = command(
      'git', ['-C', opts.builderDir, 'rev-parse', `${targetSha}^{tree}`],
    ).stdout;
    const commitSeconds = Number(command(
      'git', ['-C', opts.builderDir, 'show', '-s', '--format=%ct', targetSha],
    ).stdout);
    const movement = diffSummary(opts.builderDir, previousState?.indexedSha, targetSha);
    const configPath = path.join(opts.builderDir, '.grepai', 'config.yaml');
    const configText = fs.readFileSync(configPath, 'utf8');
    const modelMatch = /\bmodel:\s*([^\s#]+)/.exec(configText);
    if (backup) fs.rmSync(backup, { recursive: true, force: true });
    return {
      indexPath: built.indexPath,
      configPath,
      sourceTreeHash,
      files: built.files,
      chunks: built.chunks,
      model: modelMatch ? modelMatch[1] : null,
      commitTimeMs: Number.isFinite(commitSeconds) ? commitSeconds * 1000 : null,
      diff: movement.diff,
      skippedCommits: movement.skippedCommits,
      canaries,
      builtAt: new Date().toISOString(),
    };
  } catch (error) {
    let cleanupError = null;
    if (watcherAttempted) {
      try { stopWatcherVerified(opts.builderDir, 'builder watcher'); } catch (stopError) {
        cleanupError = stopError;
      }
    }
    if (backup && fs.existsSync(backup)) {
      try { fs.rmSync(builderGrepai, { recursive: true, force: true }); } catch { /* best effort */ }
      fs.renameSync(backup, builderGrepai);
    }
    if (cleanupError) {
      throw new Error(`${error.message || error}; watcher cleanup failed: ${cleanupError.message}`);
    }
    throw error;
  }
}

function syncRealServedSource(opts, targetSha) {
  validateCloneInternals(opts.servedDir, opts.indexRoot, 'servedDir');
  ensureClone(opts.servedDir, opts.remote, opts.branch);
  validateCloneInternals(opts.servedDir, opts.indexRoot, 'servedDir');
  // Transition away from the legacy long-running watcher before publishing a
  // source-bound generation. Otherwise it can mutate index.gob after the
  // receipt is committed and immediately invalidate the generation hash.
  stopWatcherVerified(opts.servedDir, 'served watcher');
  command('git', ['-C', opts.servedDir, 'fetch', 'origin', opts.branch, '--depth', '128', '--prune'], {
    timeout: 300_000,
  });
  command('git', ['-C', opts.servedDir, 'checkout', '-B', opts.branch, targetSha]);
  command('git', ['-C', opts.servedDir, 'reset', '--hard', targetSha]);
}

function createRealDependencies(opts) {
  return {
    now: () => Date.now(),
    servedHeadSha: async () => {
      if (!fs.existsSync(path.join(opts.servedDir, '.git'))) return null;
      const result = command(
        'git', ['-C', opts.servedDir, 'rev-parse', 'HEAD'],
        { timeout: 20_000, allowFailure: true },
      );
      return result.status === 0 ? result.stdout : null;
    },
    servedTreeHash: async () => {
      if (!fs.existsSync(path.join(opts.servedDir, '.git'))) return null;
      const result = command(
        'git', ['-C', opts.servedDir, 'rev-parse', 'HEAD^{tree}'],
        { timeout: 20_000, allowFailure: true },
      );
      return result.status === 0 ? result.stdout : null;
    },
    latestRemoteSha: async () => {
      const output = command(
        'git', ['ls-remote', opts.remote, `refs/heads/${opts.branch}`],
        { timeout: 120_000 },
      ).stdout;
      return (output.split(/\s+/)[0] || '').trim();
    },
    prepareBuild: async (context) => prepareRealBuild(opts, context),
    syncServedSource: async ({ targetSha }) => syncRealServedSource(opts, targetSha),
  };
}

function parseArgs(argv) {
  const args = { json: false, forceFull: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--once') continue;
    if (arg === '--json') args.json = true;
    else if (arg === '--full') args.forceFull = true;
    else if (arg === '--served') args.servedDir = argv[++i];
    else if (arg === '--builder') args.builderDir = argv[++i];
    else if (arg === '--state') args.statePath = argv[++i];
    else if (arg === '--remote') args.remote = argv[++i];
    else if (arg === '--branch') args.branch = argv[++i];
    else if (arg === '--max-build-ms') args.maxBuildMs = Number(argv[++i]);
    else if (arg === '--poll-ms') args.pollMs = Number(argv[++i]);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await reconcile(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`grepai microbatch: ${result.action} ${result.targetSha || ''}`.trim());
  } catch (error) {
    console.error(`grepai microbatch: REJECTED ${error.message || error}`);
    process.exitCode = 1;
  }
}

module.exports = {
  ATTEMPT_SCHEMA,
  GENERATION_SCHEMA,
  assertPrivatePath,
  atomicReplaceFile,
  atomicWriteJson,
  createRealDependencies,
  command,
  defaultOptions,
  hashFile,
  normalizedConfigHash,
  parseGrepaiStatus,
  prepareRealBuild,
  publishIndexAndReceipt,
  acquireLock,
  releaseLock,
  reconcile,
  stopWatcherVerified,
  validateBuild,
  validateCloneInternals,
  validateOptionPaths,
  watcherStartupProgressing,
};

if (require.main === module) main();
