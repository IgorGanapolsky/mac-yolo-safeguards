#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_TARGET_GRAPH = path.join(REPO, 'graphify-out', 'graph.json');
const DEFAULT_GRAPHIFY_BIN = path.join(REPO, '.graphify-venv', 'bin', 'graphify');
const DEFAULT_CANARY_QUERY = 'gateway profile selection and connection health';
const DEFAULT_MAX_AGE_HOURS = 48;
const LOCK_MAX_AGE_MS = 60 * 60 * 1000;

function usage() {
  return `Usage:
  node tools/graphify-snapshot.js [options]

Options:
  --source-repo PATH      Clean source checkout (default: repository root)
  --target-graph PATH     Served graph.json path
  --graphify-bin PATH     Graphify CLI path
  --canary-query TEXT     Known-answer structural query
  --code-only             Accepted mode marker; snapshot builds are always code-only
  --no-cluster            Accepted mode marker; snapshot builds always skip clustering
  --no-fetch              Do not refresh origin/main before source-SHA validation
  --json                  Print the publication receipt
  --help                  Show this help

The source checkout must be clean and exactly at origin/main. A candidate is
built away from the served graph, validated, queried, and then published by one
atomic graph.json rename. A failed candidate never replaces the last-good graph.`;
}

function parseArgs(argv) {
  const args = {
    sourceRepo: REPO,
    targetGraph: DEFAULT_TARGET_GRAPH,
    graphifyBin: DEFAULT_GRAPHIFY_BIN,
    canaryQuery: DEFAULT_CANARY_QUERY,
    fetch: true,
    json: false,
    help: false,
    codeOnly: true,
    noCluster: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source-repo') args.sourceRepo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--target-graph') args.targetGraph = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--graphify-bin') args.graphifyBin = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--candidate-graph') {
      requireValue(argv, ++index, arg);
      throw new Error('--candidate-graph is disabled because an external candidate cannot prove source-SHA provenance');
    }
    else if (arg === '--canary-query') args.canaryQuery = requireValue(argv, ++index, arg).trim();
    else if (arg === '--code-only') args.codeOnly = true;
    else if (arg === '--no-cluster') args.noCluster = true;
    else if (arg === '--no-fetch') args.fetch = false;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.canaryQuery) throw new Error('--canary-query cannot be empty');
  if (path.basename(args.targetGraph) !== 'graph.json') throw new Error('--target-graph must end in graph.json');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseVersionCompatibility(output) {
  const text = String(output || '');
  const mismatch = text.match(/skill is from graphify\s+(\d+\.\d+\.\d+),\s*package is\s+(\d+\.\d+\.\d+)/i);
  if (mismatch) {
    return {
      packageVersion: mismatch[2],
      skillVersion: mismatch[1],
      compatible: mismatch[1] === mismatch[2],
    };
  }
  const version = (text.match(/\bgraphify\s+(\d+\.\d+\.\d+)\b/i) || [])[1] || '';
  return {
    packageVersion: version,
    skillVersion: version,
    compatible: Boolean(version),
  };
}

function detectVersionCompatibility(graphifyBin, options = {}) {
  if (!graphifyBin || !fs.existsSync(graphifyBin)) {
    return { packageVersion: '', skillVersion: '', compatible: false };
  }
  const runner = options.runner || spawnSync;
  const result = runner(graphifyBin, ['--version'], {
    encoding: 'utf8',
    timeout: options.timeoutMs || 10000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return parseVersionCompatibility(`${result.stdout || ''}\n${result.stderr || ''}`);
}

function validateCandidateGraph(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) throw new Error('Candidate graph must be a JSON object');
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) throw new Error('Candidate graph requires non-empty nodes');
  const links = Array.isArray(graph.links) ? graph.links : graph.edges;
  if (!Array.isArray(links) || links.length === 0) throw new Error('Candidate graph requires non-empty links');
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    const id = String(node?.id || '');
    if (!id) throw new Error('Candidate graph node is missing id');
    if (nodeIds.has(id)) throw new Error(`Candidate graph has duplicate node id: ${id}`);
    nodeIds.add(id);
  }
  let knownEndpointCount = 0;
  let externalEndpointCount = 0;
  for (const link of links) {
    const source = typeof link?.source === 'object' ? link.source.id : link?.source;
    const target = typeof link?.target === 'object' ? link.target.id : link?.target;
    if (!source || !target) throw new Error('Candidate graph link is missing source or target');
    const sourceKnown = nodeIds.has(String(source));
    const targetKnown = nodeIds.has(String(target));
    if (!sourceKnown && !targetKnown) throw new Error(`Candidate graph link has no known endpoint: ${source} -> ${target}`);
    knownEndpointCount += Number(sourceKnown) + Number(targetKnown);
    externalEndpointCount += Number(!sourceKnown) + Number(!targetKnown);
  }
  const endpointCount = links.length * 2;
  const endpointCoverage = knownEndpointCount / endpointCount;
  if (endpointCoverage < 0.9) {
    throw new Error(`Candidate graph endpoint coverage is too low: ${endpointCoverage.toFixed(4)}`);
  }
  return {
    nodeCount: graph.nodes.length,
    linkCount: links.length,
    knownEndpointCount,
    externalEndpointCount,
    endpointCoverage,
  };
}

function atomicPublishGraph(options) {
  const {
    candidatePath,
    targetPath,
    sourceSha,
    originMainSha,
    versionInfo,
    canary,
  } = options;
  assertSha(sourceSha, 'source SHA');
  assertSha(originMainSha, 'origin/main SHA');
  if (sourceSha !== originMainSha) throw new Error(`Source SHA ${sourceSha} does not match origin/main ${originMainSha}`);
  if (!versionInfo?.compatible
      || !versionInfo.packageVersion
      || versionInfo.packageVersion !== versionInfo.skillVersion) {
    throw new Error(`Graphify skill and package version mismatch: skill=${versionInfo?.skillVersion || 'unknown'} package=${versionInfo?.packageVersion || 'unknown'}`);
  }
  if (!canary?.ok || Number(canary.resultCount || 0) <= 0) {
    throw new Error(`Graphify query canary failed: ${canary?.query || 'unknown query'}`);
  }
  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid candidate graph JSON: ${error.message}`);
  }
  const counts = validateCandidateGraph(graph);
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Invalid snapshot timestamp');
  const candidateHash = sha256(Buffer.from(JSON.stringify(graph)));
  const published = {
    ...graph,
    _hermesSnapshot: {
      schemaVersion: 1,
      sourceSha,
      originMainSha,
      builtAt: now.toISOString(),
      graphifyPackageVersion: versionInfo.packageVersion,
      graphifySkillVersion: versionInfo.skillVersion,
      nodeCount: counts.nodeCount,
      linkCount: counts.linkCount,
      externalEndpointCount: counts.externalEndpointCount,
      endpointCoverage: counts.endpointCoverage,
      candidateHash,
      canary: {
        ok: true,
        query: canary.query,
        resultCount: Number(canary.resultCount),
      },
    },
  };
  const payload = `${JSON.stringify(published)}\n`;
  atomicWriteFile(targetPath, payload, options);
  return {
    ok: true,
    targetPath,
    sourceSha,
    originMainSha,
    builtAt: now.toISOString(),
    graphifyPackageVersion: versionInfo.packageVersion,
    graphifySkillVersion: versionInfo.skillVersion,
    nodeCount: counts.nodeCount,
    linkCount: counts.linkCount,
    externalEndpointCount: counts.externalEndpointCount,
    endpointCoverage: counts.endpointCoverage,
    candidateHash,
    graphHash: sha256(Buffer.from(payload)),
    canary: published._hermesSnapshot.canary,
  };
}

function inspectPublishedGraph(options = {}) {
  const graphPath = options.graphPath || DEFAULT_TARGET_GRAPH;
  const failures = [];
  if (!fs.existsSync(graphPath)) {
    return healthResult({ graphPath, failures: ['graph_missing'] });
  }
  let graph;
  try {
    graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  } catch {
    return healthResult({ graphPath, failures: ['graph_json_invalid'] });
  }
  let counts = { nodeCount: 0, linkCount: 0 };
  try {
    counts = validateCandidateGraph(graph);
  } catch {
    failures.push('graph_structure_invalid');
  }
  const snapshot = graph._hermesSnapshot;
  if (!snapshot || snapshot.schemaVersion !== 1) failures.push('snapshot_receipt_missing');
  const currentVersion = options.currentVersionInfo;
  if (currentVersion && !currentVersion.compatible) failures.push('graphify_version_mismatch');
  if (snapshot) {
    if (snapshot.nodeCount !== counts.nodeCount || snapshot.linkCount !== counts.linkCount) failures.push('snapshot_counts_mismatch');
    if (snapshot.externalEndpointCount !== counts.externalEndpointCount
        || snapshot.endpointCoverage !== counts.endpointCoverage) failures.push('snapshot_endpoint_coverage_mismatch');
    if (!snapshot.canary?.ok || Number(snapshot.canary?.resultCount || 0) <= 0) failures.push('snapshot_canary_failed');
    const { _hermesSnapshot: ignoredSnapshot, ...candidatePayload } = graph;
    const actualCandidateHash = sha256(Buffer.from(JSON.stringify(candidatePayload)));
    if (!snapshot.candidateHash || snapshot.candidateHash !== actualCandidateHash) failures.push('snapshot_hash_mismatch');
    if (options.originMainSha && snapshot.sourceSha !== options.originMainSha) failures.push('source_sha_lag');
    if (currentVersion && (
      snapshot.graphifyPackageVersion !== currentVersion.packageVersion
      || snapshot.graphifySkillVersion !== currentVersion.skillVersion
    )) failures.push('graphify_version_mismatch');
  }
  const now = options.now ? new Date(options.now) : new Date();
  const builtAt = snapshot?.builtAt ? new Date(snapshot.builtAt) : null;
  const rawAgeHours = builtAt && !Number.isNaN(builtAt.getTime())
    ? (now.getTime() - builtAt.getTime()) / 3600000
    : null;
  const ageHours = rawAgeHours === null ? null : Math.max(0, rawAgeHours);
  if (snapshot && ageHours === null) failures.push('snapshot_timestamp_invalid');
  if (rawAgeHours !== null && rawAgeHours < -(5 / 60)) failures.push('snapshot_timestamp_future');
  if (ageHours !== null && ageHours > (options.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS)) failures.push('snapshot_age_stale');
  return healthResult({
    graphPath,
    failures,
    nodeCount: counts.nodeCount,
    linkCount: counts.linkCount,
    externalEndpointCount: counts.externalEndpointCount,
    endpointCoverage: counts.endpointCoverage,
    snapshot,
    ageHours,
    originMainSha: options.originMainSha || null,
  });
}

function healthResult(options) {
  const failures = [...new Set(options.failures || [])];
  const snapshot = options.snapshot || null;
  return {
    ok: failures.length === 0,
    exists: !failures.includes('graph_missing'),
    valid: !failures.some((failure) => ['graph_missing', 'graph_json_invalid', 'graph_structure_invalid'].includes(failure)),
    stale: failures.length > 0,
    failures,
    graphPath: options.graphPath,
    nodeCount: options.nodeCount || 0,
    linkCount: options.linkCount || 0,
    externalEndpointCount: options.externalEndpointCount || 0,
    endpointCoverage: options.endpointCoverage || 0,
    sourceSha: snapshot?.sourceSha || null,
    originMainSha: options.originMainSha || null,
    sourceLag: snapshot && options.originMainSha ? (snapshot.sourceSha === options.originMainSha ? 0 : 1) : null,
    builtAt: snapshot?.builtAt || null,
    ageHours: options.ageHours === null || options.ageHours === undefined
      ? null
      : Math.round(options.ageHours * 10) / 10,
    graphifyPackageVersion: snapshot?.graphifyPackageVersion || null,
    graphifySkillVersion: snapshot?.graphifySkillVersion || null,
    canary: snapshot?.canary || null,
  };
}

function sourceState(sourceRepo, options = {}) {
  const runner = options.runner || spawnSync;
  const runGit = (args) => runner('git', ['-C', sourceRepo, ...args], {
    encoding: 'utf8',
    timeout: options.timeoutMs || 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (options.fetch !== false) {
    const fetch = runGit(['fetch', '--quiet', 'origin', 'main']);
    if (fetch.status !== 0) throw new Error(`Failed to refresh origin/main: ${(fetch.stderr || fetch.stdout || '').trim()}`);
  }
  const head = runGit(['rev-parse', 'HEAD']);
  const origin = runGit(['rev-parse', 'origin/main']);
  const status = runGit(['status', '--porcelain', '--untracked-files=all']);
  if (head.status !== 0 || origin.status !== 0 || status.status !== 0) throw new Error('Unable to inspect Graphify source checkout');
  return {
    head: head.stdout.trim(),
    originMain: origin.stdout.trim(),
    dirty: Boolean(status.stdout.trim()),
  };
}

function runQueryCanary(graphifyBin, graphPath, query, options = {}) {
  const runner = options.runner || spawnSync;
  const result = runner(graphifyBin, ['query', query, '--graph', graphPath, '--budget', '400'], {
    encoding: 'utf8',
    timeout: options.timeoutMs || 30000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const output = String(result.stdout || '').trim();
  const resultCount = (output.match(/^NODE\s+/gm) || []).length;
  return {
    ok: result.status === 0 && resultCount > 0,
    query,
    resultCount,
    exitCode: result.status,
    error: result.status === 0 ? null : String(result.stderr || '').trim().slice(0, 500),
  };
}

function refreshGraphify(args, options = {}) {
  if (args.candidateGraph) {
    throw new Error('External candidate graphs are disabled because source-SHA provenance cannot be proven');
  }
  const state = sourceState(args.sourceRepo, { fetch: args.fetch, runner: options.runner });
  if (state.dirty) throw new Error(`Graphify source checkout is dirty: ${args.sourceRepo}`);
  if (state.head !== state.originMain) throw new Error(`Graphify source checkout is stale: HEAD=${state.head} origin/main=${state.originMain}`);
  const versionInfo = detectVersionCompatibility(args.graphifyBin, { runner: options.runner });
  if (!versionInfo.compatible) {
    throw new Error(`Graphify skill/package mismatch: skill=${versionInfo.skillVersion || 'unknown'} package=${versionInfo.packageVersion || 'unknown'}`);
  }
  const lock = acquireLock(`${args.targetGraph}.refresh.lock`);
  let buildRoot = null;
  try {
    buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-candidate-'));
    const runner = options.runner || spawnSync;
    const build = runner(args.graphifyBin, [
      'extract',
      args.sourceRepo,
      '--code-only',
      '--no-cluster',
      '--out',
      buildRoot,
    ], {
      encoding: 'utf8',
      timeout: options.buildTimeoutMs || 20 * 60 * 1000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (build.status !== 0) throw new Error(`Graphify candidate build failed: ${String(build.stderr || build.stdout || '').trim().slice(0, 1000)}`);
    const candidatePath = path.join(buildRoot, 'graphify-out', 'graph.json');
    const canary = runQueryCanary(args.graphifyBin, candidatePath, args.canaryQuery, {
      runner: options.runner,
      timeoutMs: options.canaryTimeoutMs,
    });
    return atomicPublishGraph({
      candidatePath,
      targetPath: args.targetGraph,
      sourceSha: state.head,
      originMainSha: state.originMain,
      versionInfo,
      canary,
      now: options.now,
    });
  } finally {
    if (buildRoot) fs.rmSync(buildRoot, { recursive: true, force: true });
    releaseLock(lock);
  }
}

function acquireLock(lockPath) {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const token = crypto.randomBytes(12).toString('hex');
  const payload = { pid: process.pid, token, createdAt: new Date().toISOString() };
  try {
    fs.writeFileSync(lockPath, `${JSON.stringify(payload)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let existing = null;
    try {
      existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      throw new Error(`Graphify refresh lock is unreadable: ${lockPath}`);
    }
    const age = Date.now() - Date.parse(existing.createdAt || '');
    if (processIsAlive(existing.pid) || !Number.isFinite(age) || age < LOCK_MAX_AGE_MS) {
      throw new Error(`Graphify refresh already held by pid ${existing.pid || 'unknown'}`);
    }
    fs.unlinkSync(lockPath);
    fs.writeFileSync(lockPath, `${JSON.stringify(payload)}\n`, { flag: 'wx', mode: 0o600 });
  }
  return { lockPath, token };
}

function releaseLock(lock) {
  if (!lock?.lockPath || !fs.existsSync(lock.lockPath)) return;
  try {
    const current = JSON.parse(fs.readFileSync(lock.lockPath, 'utf8'));
    if (current.token === lock.token) fs.unlinkSync(lock.lockPath);
  } catch {
    // Never delete a lock whose ownership cannot be proved.
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function atomicWriteFile(targetPath, payload, options = {}) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
  );
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, payload, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    if (typeof options.beforeRename === 'function') options.beforeRename(temporaryPath, targetPath);
    fs.renameSync(temporaryPath, targetPath);
    const directoryDescriptor = fs.openSync(path.dirname(targetPath), 'r');
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function assertSha(value, label) {
  if (!/^[a-f0-9]{40}$/i.test(String(value || ''))) throw new Error(`Invalid ${label}: ${value || 'missing'}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const receipt = refreshGraphify(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`Graphify snapshot published: nodes=${receipt.nodeCount} links=${receipt.linkCount} source=${receipt.sourceSha} hash=${receipt.graphHash}`);
  } catch (error) {
    console.error(`Graphify snapshot refresh failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MAX_AGE_HOURS,
  acquireLock,
  atomicPublishGraph,
  detectVersionCompatibility,
  inspectPublishedGraph,
  parseArgs,
  parseVersionCompatibility,
  refreshGraphify,
  releaseLock,
  runQueryCanary,
  sourceState,
  validateCandidateGraph,
};
