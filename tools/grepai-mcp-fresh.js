#!/usr/bin/env node
'use strict';

/**
 * Fail-closed wrapper for grepai MCP.
 *
 * An index is servable only when the committed generation receipt binds the
 * active index bytes and config to the checked-out source SHA, and the remote
 * comparison heartbeat is recent. This turns a stale/torn index into an
 * explicit unavailable backend so agents can fall back to deterministic rg.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const {
  GENERATION_SCHEMA,
  assertPrivatePath,
  atomicReplaceFile,
  atomicWriteJson,
  hashFile,
} = require('./grepai-microbatch-reconciler.js');

function problem(code, detail) {
  return { code, detail };
}

function readReceipt(statePath) {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

function gitHead(projectPath) {
  const result = spawnSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.status !== 0) return null;
  return (result.stdout || '').trim();
}

function gitTreeHash(projectPath) {
  const result = spawnSync('git', ['-C', projectPath, 'rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
    timeout: 20_000,
  });
  if (result.status !== 0) return null;
  return (result.stdout || '').trim();
}

function defaultProjectPath() {
  const indexRoot = process.env.HERMES_SEMANTIC_INDEX_ROOT
    || path.join(os.homedir(), '.hermes', 'semantic-index');
  return path.join(indexRoot, 'mac-yolo-safeguards');
}

function verifyGeneration(input = {}) {
  const projectPath = path.resolve(input.projectPath || defaultProjectPath());
  const statePath = path.resolve(
    input.statePath || path.join(projectPath, '.grepai', 'generation.json'),
  );
  const nowMs = input.nowMs ?? Date.now();
  const maxCheckAgeMs = input.maxCheckAgeMs ?? 180_000;
  const receipt = readReceipt(statePath);
  const problems = [];

  if (!receipt) {
    problems.push(problem('generation_receipt_missing', `no parseable receipt at ${statePath}`));
    return { ok: false, projectPath, statePath, receipt: null, problems };
  }
  if (receipt.schemaVersion !== GENERATION_SCHEMA || receipt.committed !== true) {
    problems.push(problem(
      'generation_receipt_uncommitted',
      `expected ${GENERATION_SCHEMA} with committed=true`,
    ));
  }
  if (!/^[a-f0-9]{40}$/i.test(receipt.indexedSha || '')) {
    problems.push(problem('indexed_sha_invalid', `invalid indexedSha: ${receipt.indexedSha}`));
  }
  if (receipt.observedOriginSha !== receipt.indexedSha) {
    problems.push(problem(
      'remote_watermark_mismatch',
      `${receipt.observedOriginSha || '(missing)'} != ${receipt.indexedSha || '(missing)'}`,
    ));
  }

  const headSha = input.headSha || gitHead(projectPath);
  if (!headSha) problems.push(problem('source_head_unreadable', `cannot read Git HEAD at ${projectPath}`));
  else if (headSha !== receipt.indexedSha) {
    problems.push(problem('indexed_sha_mismatch', `${receipt.indexedSha} != source HEAD ${headSha}`));
  }
  const treeHash = input.treeHash || gitTreeHash(projectPath);
  if (!treeHash) problems.push(problem('source_tree_unreadable', `cannot read Git tree at ${projectPath}`));
  else if (treeHash !== receipt.sourceTreeHash) {
    problems.push(problem(
      'source_tree_mismatch',
      `${receipt.sourceTreeHash || '(missing)'} != source tree ${treeHash}`,
    ));
  }

  const checkedAtMs = Date.parse(receipt.lastRemoteCheckedAt || '');
  if (!Number.isFinite(checkedAtMs)) {
    problems.push(problem('remote_check_missing', 'lastRemoteCheckedAt is absent or invalid'));
  } else {
    const ageMs = nowMs - checkedAtMs;
    if (ageMs < -30_000 || ageMs > maxCheckAgeMs) {
      problems.push(problem(
        'remote_check_stale',
        `remote comparison age ${ageMs}ms exceeds ${maxCheckAgeMs}ms`,
      ));
    }
  }

  const indexPath = path.join(projectPath, '.grepai', 'index.gob');
  const grepaiRoot = path.resolve(projectPath, '.grepai');
  const artifactPath = receipt.indexArtifact
    ? path.resolve(grepaiRoot, receipt.indexArtifact)
    : null;
  const configPath = path.join(projectPath, '.grepai', 'config.yaml');
  try {
    if (artifactPath) assertPrivatePath(artifactPath, grepaiRoot, 'indexArtifact');
  } catch (error) {
    problems.push(problem('index_artifact_path_invalid', error.message));
  }
  if (!artifactPath || !artifactPath.startsWith(`${grepaiRoot}${path.sep}`)) {
    problems.push(problem('index_artifact_path_invalid', receipt.indexArtifact || '(missing)'));
  } else if (!fs.existsSync(artifactPath)) {
    problems.push(problem('index_artifact_missing', artifactPath));
  } else {
    const artifactHash = hashFile(artifactPath);
    if (artifactHash !== receipt.indexSha256) {
      problems.push(problem('index_artifact_hash_mismatch', `${artifactHash} != ${receipt.indexSha256}`));
    }
    const bytes = fs.statSync(artifactPath).size;
    if (bytes !== receipt.indexBytes) {
      problems.push(problem('index_artifact_size_mismatch', `${bytes} != ${receipt.indexBytes}`));
    }
  }
  if (!fs.existsSync(configPath)) {
    problems.push(problem('config_missing', configPath));
  } else {
    const configHash = hashFile(configPath);
    if (configHash !== receipt.configSha256) {
      problems.push(problem('config_hash_mismatch', `${configHash} != ${receipt.configSha256}`));
    }
  }
  if (!Array.isArray(receipt.canaries) || receipt.canaries.length === 0) {
    problems.push(problem('canary_receipt_missing', 'no retrieval canaries recorded'));
  } else if (receipt.canaries.some((entry) => entry.passed !== true)) {
    problems.push(problem('canary_receipt_failed', 'one or more committed canaries are not passing'));
  }

  return {
    ok: problems.length === 0,
    projectPath,
    statePath,
    generationId: receipt.generationId || null,
    indexedSha: receipt.indexedSha || null,
    checkedAt: new Date(nowMs).toISOString(),
    receipt,
    problems,
  };
}

function preparePinnedSession(verification, input = {}) {
  const projectPath = verification.projectPath;
  const grepaiRoot = path.join(projectPath, '.grepai');
  const sessionRoot = path.resolve(input.sessionRoot || path.join(grepaiRoot, 'mcp-sessions'));
  assertPrivatePath(sessionRoot, grepaiRoot, 'mcpSessionRoot');
  fs.mkdirSync(sessionRoot, { recursive: true, mode: 0o700 });
  const now = Date.now();
  for (const entry of fs.readdirSync(sessionRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(sessionRoot, entry.name);
    try {
      if (now - fs.statSync(candidate).mtimeMs > 86_400_000) {
        fs.rmSync(candidate, { recursive: true, force: true });
      }
    } catch { /* best effort cleanup of abandoned sessions */ }
  }
  const sessionId = `${verification.generationId}-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  const sessionDir = path.join(sessionRoot, sessionId);
  const sessionGrepai = path.join(sessionDir, '.grepai');
  fs.mkdirSync(sessionGrepai, { recursive: true, mode: 0o700 });
  const artifactPath = path.resolve(
    projectPath, '.grepai', verification.receipt.indexArtifact,
  );
  atomicReplaceFile(artifactPath, path.join(sessionGrepai, 'index.gob'));
  atomicReplaceFile(
    path.join(projectPath, '.grepai', 'config.yaml'),
    path.join(sessionGrepai, 'config.yaml'),
  );
  atomicWriteJson(path.join(sessionGrepai, 'generation.json'), verification.receipt);
  const copiedIndex = path.join(sessionGrepai, 'index.gob');
  const copiedConfig = path.join(sessionGrepai, 'config.yaml');
  if (
    hashFile(copiedIndex) !== verification.receipt.indexSha256
    || hashFile(copiedConfig) !== verification.receipt.configSha256
  ) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
    throw new Error('pinned MCP session bytes do not match the committed generation');
  }
  return { sessionDir, sessionId };
}

function parseSearchHits(stdout) {
  try {
    const body = JSON.parse(stdout || '');
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.results)) return body.results;
    if (Array.isArray(body.matches)) return body.matches;
  } catch { /* handled as an empty probe */ }
  return [];
}

function probePinnedGeneration(input = {}) {
  const projectPath = path.resolve(input.projectPath || defaultProjectPath());
  const verification = verifyGeneration({ ...input, projectPath });
  if (!verification.ok) return { ok: false, verification, problems: verification.problems };
  const pinned = preparePinnedSession(verification, input);
  try {
    const query = input.query || 'retrieval harness';
    const execute = input.run || spawnSync;
    const result = execute(
      'grepai',
      ['search', query, '--json', '--compact', '--limit', '10'],
      { cwd: pinned.sessionDir, encoding: 'utf8', timeout: input.probeTimeoutMs || 120_000 },
    );
    const hits = result.status === 0 ? parseSearchHits(result.stdout) : [];
    if (input.beforePostProbeVerify) input.beforePostProbeVerify({ verification, pinned });
    const postProbe = verifyGeneration({ ...input, projectPath });
    if (!postProbe.ok || postProbe.generationId !== verification.generationId) {
      return {
        ok: false,
        generationId: verification.generationId,
        indexedSha: verification.indexedSha,
        indexSha256: verification.receipt.indexSha256,
        query,
        hits: hits.length,
        raceDetected: true,
        problems: [problem(
          'generation_changed_during_probe',
          `${verification.generationId} -> ${postProbe.generationId || 'invalid'}`,
        ), ...postProbe.problems],
      };
    }
    return {
      ok: result.status === 0 && hits.length > 0,
      generationId: verification.generationId,
      indexedSha: verification.indexedSha,
      indexSha256: verification.receipt.indexSha256,
      query,
      hits: hits.length,
      topPaths: hits.slice(0, 5).map((hit) => hit.file_path || hit.path || hit.file || null),
      problems: result.status === 0 && hits.length > 0
        ? []
        : [problem('pinned_canary_failed', (result.stderr || result.stdout || 'zero hits').slice(0, 500))],
    };
  } finally {
    fs.rmSync(pinned.sessionDir, { recursive: true, force: true });
  }
}

async function superviseChild(child, verification, input, cleanup) {
  if (!child || typeof child.on !== 'function') {
    cleanup();
    return { status: child?.status ?? 1, verification };
  }
  return new Promise((resolve) => {
    let settled = false;
    let stale = null;
    const finish = (status, error = null) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      process.removeListener('SIGTERM', forwardTerm);
      process.removeListener('SIGINT', forwardInt);
      cleanup();
      resolve({ status, verification, stale, error });
    };
    const terminateForStale = (next) => {
      stale = next;
      try { child.kill('SIGTERM'); } catch { /* exit handler resolves */ }
      setTimeout(() => {
        if (!settled) try { child.kill('SIGKILL'); } catch { /* best effort */ }
      }, input.killAfterMs ?? 5_000).unref?.();
    };
    const poll = () => {
      const next = verifyGeneration({
        projectPath: verification.projectPath,
        statePath: verification.statePath,
        nowMs: input.clock ? input.clock() : Date.now(),
        maxCheckAgeMs: input.maxCheckAgeMs,
        headSha: input.headSha,
        treeHash: input.treeHash,
      });
      if (!next.ok || next.generationId !== verification.generationId) terminateForStale(next);
    };
    const timer = setInterval(poll, input.monitorMs ?? 1_000);
    if (input.unrefMonitor !== false) timer.unref?.();
    const forwardTerm = () => { try { child.kill('SIGTERM'); } catch { /* best effort */ } };
    const forwardInt = () => { try { child.kill('SIGINT'); } catch { /* best effort */ } };
    process.on('SIGTERM', forwardTerm);
    process.on('SIGINT', forwardInt);
    child.once('error', (error) => finish(1, String(error.message || error)));
    child.once('exit', (code, signal) => finish(stale ? 78 : (code ?? (signal ? 1 : 0))));
  });
}

async function serveIfFresh(input = {}) {
  const projectPath = path.resolve(input.projectPath || defaultProjectPath());
  const verification = verifyGeneration({ ...input, projectPath });
  if (!verification.ok) return { status: 78, verification };
  const pinned = preparePinnedSession(verification, input);
  const cleanup = () => {
    try { fs.rmSync(pinned.sessionDir, { recursive: true, force: true }); } catch { /* best effort */ }
  };
  if (input.beforePostVerify) await input.beforePostVerify({ verification, pinned });
  const postCopy = verifyGeneration({ ...input, projectPath });
  if (!postCopy.ok || postCopy.generationId !== verification.generationId) {
    cleanup();
    return { status: 78, verification: postCopy, raceDetected: true };
  }
  const spawnChild = input.spawn || spawn;
  const child = spawnChild('grepai', ['mcp-serve', pinned.sessionDir], {
    stdio: 'inherit',
  });
  return superviseChild(child, verification, input, cleanup);
}

function parseArgs(argv) {
  const args = { mode: 'serve', json: false };
  let index = 0;
  if (argv[0] === 'serve' || argv[0] === 'check' || argv[0] === 'probe') {
    args.mode = argv[0];
    index = 1;
  }
  for (; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') args.json = true;
    else if (arg === '--state') args.statePath = argv[++index];
    else if (arg === '--query') args.query = argv[++index];
    else if (arg === '--max-check-age-ms') args.maxCheckAgeMs = Number(argv[++index]);
    else if (!args.projectPath) args.projectPath = arg;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.mode === 'check') {
      const result = verifyGeneration(args);
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else if (result.ok) console.log(`grepai generation: FRESH ${result.generationId}`);
      else console.error(`grepai generation: STALE ${result.problems.map((p) => p.code).join(',')}`);
      process.exitCode = result.ok ? 0 : 78;
      return;
    }
    if (args.mode === 'probe') {
      const result = probePinnedGeneration(args);
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else if (result.ok) console.log(`grepai pinned probe: PASS ${result.generationId} hits=${result.hits}`);
      else console.error(`grepai pinned probe: FAIL ${(result.problems || []).map((p) => p.code).join(',')}`);
      process.exitCode = result.ok ? 0 : 78;
      return;
    }
    const result = await serveIfFresh(args);
    if (result.status === 78) {
      console.error(JSON.stringify({
        error: 'grepai_generation_stale',
        fallback: 'Use deterministic rg until the micro-batch reconciler commits a fresh generation.',
        problems: result.verification.problems,
      }));
    }
    process.exitCode = result.status;
  } catch (error) {
    console.error(`grepai MCP freshness gate: ${error.message || error}`);
    process.exitCode = 78;
  }
}

module.exports = {
  gitHead,
  gitTreeHash,
  defaultProjectPath,
  preparePinnedSession,
  probePinnedGeneration,
  serveIfFresh,
  verifyGeneration,
};

if (require.main === module) main();
