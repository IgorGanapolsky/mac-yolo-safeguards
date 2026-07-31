'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const {
  checkGraphStaleness,
  maybeQueueBackgroundUpdate,
} = require('../tools/graphify-staleness-check');
const { handleToolCall } = require('../tools/graphify-mcp-server');

const {
  atomicPublishGraph,
  inspectPublishedGraph,
  parseArgs,
  parseVersionCompatibility,
  refreshGraphify,
  runQueryCanary,
  sourceState,
  validateCandidateGraph,
} = require('../tools/graphify-snapshot');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graphify-snapshot-'));
const candidatePath = path.join(tmp, 'candidate.json');
const targetPath = path.join(tmp, 'served', 'graph.json');
const sourceSha = 'a'.repeat(40);
const nextSourceSha = 'b'.repeat(40);
const versionInfo = {
  packageVersion: '0.9.26',
  skillVersion: '0.9.26',
  compatible: true,
};

assert.deepStrictEqual(
  parseVersionCompatibility('warning: skill is from graphify 0.8.40, package is 0.9.26. Run graphify install.'),
  { packageVersion: '0.9.26', skillVersion: '0.8.40', compatible: false },
);
assert.deepStrictEqual(
  parseVersionCompatibility('graphify 0.9.26'),
  { packageVersion: '0.9.26', skillVersion: '0.9.26', compatible: true },
);
assert.throws(
  () => parseArgs(['--candidate-graph', '/tmp/obsolete-graph.json']),
  /disabled.*source-SHA provenance/i,
);
assert.deepStrictEqual(
  runQueryCanary('/fake/graphify', '/fake/graph.json', 'gateway', {
    runner: () => ({ status: 0, stdout: 'warning only, no results\n', stderr: '' }),
  }),
  {
    ok: false,
    query: 'gateway',
    resultCount: 0,
    exitCode: 0,
    error: null,
  },
);
assert.strictEqual(
  runQueryCanary('/fake/graphify', '/fake/graph.json', 'gateway', {
    runner: () => ({ status: 0, stdout: 'NODE gatewayProfiles\nEDGE a -> b\n', stderr: '' }),
  }).ok,
  true,
);

assert.throws(() => validateCandidateGraph({ nodes: [], links: [] }), /non-empty nodes/i);
assert.throws(() => validateCandidateGraph({ nodes: [{ id: 'a' }], links: [] }), /non-empty links/i);
assert.throws(() => validateCandidateGraph({ nodes: [{ id: 'a' }, { id: 'a' }], links: [{ source: 'a', target: 'a' }] }), /duplicate node id/i);
assert.throws(
  () => validateCandidateGraph({ nodes: [{ id: 'a' }], links: [{ source: 'external-a', target: 'external-b' }] }),
  /no known endpoint/i,
);
assert.deepStrictEqual(
  validateCandidateGraph({
    nodes: Array.from({ length: 10 }, (_, index) => ({ id: `n${index}` })),
    links: [
      ...Array.from({ length: 9 }, (_, index) => ({ source: `n${index}`, target: `n${index + 1}` })),
      { source: 'n0', target: 'node:stdlib' },
    ],
  }),
  {
    nodeCount: 10,
    linkCount: 10,
    knownEndpointCount: 19,
    externalEndpointCount: 1,
    endpointCoverage: 0.95,
  },
);

const lastGood = publishedGraph(sourceSha, '2026-07-29T12:00:00.000Z');
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, `${JSON.stringify(lastGood)}\n`);
const lastGoodHash = sha256(fs.readFileSync(targetPath));

fs.writeFileSync(candidatePath, '{"nodes":');
assert.throws(() => atomicPublishGraph({
  candidatePath,
  targetPath,
  sourceSha: nextSourceSha,
  originMainSha: nextSourceSha,
  versionInfo,
  canary: { ok: true, query: 'gateway profile', resultCount: 2 },
  now: '2026-07-30T12:00:00.000Z',
}), /invalid candidate graph json/i);
assert.strictEqual(sha256(fs.readFileSync(targetPath)), lastGoodHash);

fs.writeFileSync(candidatePath, `${JSON.stringify(candidateGraph('candidate'))}\n`);
for (const invalid of [
  {
    name: 'source lag',
    options: { sourceSha, originMainSha: nextSourceSha, versionInfo, canary: { ok: true, query: 'gateway', resultCount: 1 } },
    message: /source sha.*origin\/main/i,
  },
  {
    name: 'version mismatch',
    options: {
      sourceSha: nextSourceSha,
      originMainSha: nextSourceSha,
      versionInfo: { packageVersion: '0.9.26', skillVersion: '0.8.40', compatible: false },
      canary: { ok: true, query: 'gateway', resultCount: 1 },
    },
    message: /skill.*package version/i,
  },
  {
    name: 'failed canary',
    options: { sourceSha: nextSourceSha, originMainSha: nextSourceSha, versionInfo, canary: { ok: false, query: 'gateway', resultCount: 0 } },
    message: /query canary failed/i,
  },
]) {
  assert.throws(() => atomicPublishGraph({
    candidatePath,
    targetPath,
    now: '2026-07-30T12:00:00.000Z',
    ...invalid.options,
  }), invalid.message, invalid.name);
  assert.strictEqual(sha256(fs.readFileSync(targetPath)), lastGoodHash, invalid.name);
}

const receipt = atomicPublishGraph({
  candidatePath,
  targetPath,
  sourceSha: nextSourceSha,
  originMainSha: nextSourceSha,
  versionInfo,
  canary: { ok: true, query: 'gateway profile', resultCount: 2 },
  now: '2026-07-30T12:00:00.000Z',
});
assert.strictEqual(receipt.ok, true);
assert.strictEqual(receipt.sourceSha, nextSourceSha);
assert.strictEqual(receipt.nodeCount, 2);
assert.strictEqual(receipt.linkCount, 1);
assert.notStrictEqual(receipt.graphHash, lastGoodHash);

const healthy = inspectPublishedGraph({
  graphPath: targetPath,
  originMainSha: nextSourceSha,
  currentVersionInfo: versionInfo,
  now: '2026-07-30T13:00:00.000Z',
});
assert.strictEqual(healthy.ok, true, JSON.stringify(healthy));
assert.strictEqual(healthy.stale, false);
assert.strictEqual(healthy.sourceLag, 0);

const futureDated = inspectPublishedGraph({
  graphPath: targetPath,
  originMainSha: nextSourceSha,
  currentVersionInfo: versionInfo,
  now: '2026-07-30T11:00:00.000Z',
});
assert.strictEqual(futureDated.ok, false);
assert(futureDated.failures.includes('snapshot_timestamp_future'));

const receiptTamper = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
receiptTamper.nodes[0].label = 'silently modified';
fs.writeFileSync(targetPath, `${JSON.stringify(receiptTamper)}\n`);
const tampered = inspectPublishedGraph({
  graphPath: targetPath,
  originMainSha: nextSourceSha,
  currentVersionInfo: versionInfo,
  now: '2026-07-30T13:00:00.000Z',
});
assert.strictEqual(tampered.ok, false);
assert(tampered.failures.includes('snapshot_hash_mismatch'));
atomicPublishGraph({
  candidatePath,
  targetPath,
  sourceSha: nextSourceSha,
  originMainSha: nextSourceSha,
  versionInfo,
  canary: { ok: true, query: 'gateway profile', resultCount: 2 },
  now: '2026-07-30T12:00:00.000Z',
});

const staleSource = inspectPublishedGraph({
  graphPath: targetPath,
  originMainSha: 'c'.repeat(40),
  currentVersionInfo: versionInfo,
  now: '2026-07-30T13:00:00.000Z',
});
assert.strictEqual(staleSource.ok, false);
assert.strictEqual(staleSource.stale, true);
assert(staleSource.failures.includes('source_sha_lag'));

const legacyPath = path.join(tmp, 'legacy.json');
fs.writeFileSync(legacyPath, `${JSON.stringify(candidateGraph('legacy'))}\n`);
const legacy = inspectPublishedGraph({
  graphPath: legacyPath,
  originMainSha: nextSourceSha,
  currentVersionInfo: versionInfo,
});
assert.strictEqual(legacy.ok, false);
assert(legacy.failures.includes('snapshot_receipt_missing'));

const corruptPath = path.join(tmp, 'corrupt.json');
fs.writeFileSync(corruptPath, '{"nodes":');
const corrupt = inspectPublishedGraph({ graphPath: corruptPath, originMainSha: nextSourceSha, currentVersionInfo: versionInfo });
assert.strictEqual(corrupt.ok, false);
assert(corrupt.failures.includes('graph_json_invalid'));

const canonicalHealth = checkGraphStaleness({
  repo: tmp,
  graphPath: targetPath,
  graphifyBin: __filename,
  originMainSha: nextSourceSha,
  currentVersionInfo: versionInfo,
  now: '2026-07-30T13:00:00.000Z',
});
assert.strictEqual(canonicalHealth.ok, true, JSON.stringify(canonicalHealth));
assert.strictEqual(canonicalHealth.reason, 'validated snapshot matches fetched origin/main');

let spawnedRefresh = null;
const background = maybeQueueBackgroundUpdate({
  ...canonicalHealth,
  stale: true,
  graphifyAvailable: true,
}, {
  repo: tmp,
  graphPath: targetPath,
  graphifyBin: __filename,
  snapshotTool: __filename,
  logPath: path.join(tmp, 'refresh.log'),
  spawn(command, args, options) {
    spawnedRefresh = { command, args, options };
    return { pid: 4242, unref() {} };
  },
});
assert.strictEqual(background.triggered, true);
assert.strictEqual(background.pid, 4242);
assert.match(background.reason, /started.*not yet established/i);
assert.strictEqual(spawnedRefresh.command, process.execPath);
assert(spawnedRefresh.args.includes('--target-graph'));
assert.strictEqual(spawnedRefresh.options.detached, true);

const sourceRepo = path.join(tmp, 'source-repo');
fs.mkdirSync(sourceRepo);
execFileSync('git', ['init', '--quiet'], { cwd: sourceRepo });
execFileSync('git', ['config', 'user.name', 'Graphify Test'], { cwd: sourceRepo });
execFileSync('git', ['config', 'user.email', 'graphify-test@example.invalid'], { cwd: sourceRepo });
fs.writeFileSync(path.join(sourceRepo, 'tracked.js'), 'module.exports = true;\n');
execFileSync('git', ['add', 'tracked.js'], { cwd: sourceRepo });
execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture'], { cwd: sourceRepo });
execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: sourceRepo });
assert.strictEqual(sourceState(sourceRepo, { fetch: false }).dirty, false);
fs.writeFileSync(path.join(sourceRepo, 'untracked.js'), 'module.exports = false;\n');
assert.strictEqual(sourceState(sourceRepo, { fetch: false }).dirty, true);
fs.unlinkSync(path.join(sourceRepo, 'untracked.js'));

const fakeGraphify = path.join(tmp, 'fake-graphify.js');
const fakeBuildMarker = path.join(tmp, 'fake-build-path.txt');
fs.writeFileSync(fakeGraphify, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('graphify 0.9.26');
} else if (args[0] === 'extract') {
  const out = args[args.indexOf('--out') + 1];
  const graphPath = path.join(out, 'graphify-out', 'graph.json');
  fs.mkdirSync(path.dirname(graphPath), { recursive: true });
  fs.writeFileSync(graphPath, JSON.stringify({
    nodes: [{ id: 'file' }, { id: 'symbol' }],
    links: [{ source: 'file', target: 'symbol', relation: 'contains' }],
  }));
  fs.writeFileSync(${JSON.stringify(fakeBuildMarker)}, graphPath);
} else if (args[0] === 'query') {
  console.log('NODE gatewayProfiles');
} else {
  process.exitCode = 2;
}
`, { mode: 0o755 });
const refreshTarget = path.join(tmp, 'refresh-served', 'graph.json');
const refreshReceipt = refreshGraphify(parseArgs([
  '--source-repo', sourceRepo,
  '--target-graph', refreshTarget,
  '--graphify-bin', fakeGraphify,
  '--no-fetch',
  '--json',
]));
assert.strictEqual(refreshReceipt.ok, true);
assert.strictEqual(refreshReceipt.sourceSha, sourceState(sourceRepo, { fetch: false }).head);
const fakeCandidatePath = fs.readFileSync(fakeBuildMarker, 'utf8');
assert.notStrictEqual(fakeCandidatePath, refreshTarget);
assert(fakeCandidatePath.includes('graphify-candidate-'));
assert.strictEqual(fs.existsSync(path.dirname(path.dirname(fakeCandidatePath))), false);
assert.strictEqual(inspectPublishedGraph({
  graphPath: refreshTarget,
  originMainSha: refreshReceipt.sourceSha,
  currentVersionInfo: versionInfo,
}).ok, true);
const missingOriginTruth = checkGraphStaleness({
  repo: sourceRepo,
  graphPath: refreshTarget,
  graphifyBin: fakeGraphify,
  currentVersionInfo: versionInfo,
});
assert.strictEqual(missingOriginTruth.ok, false);
assert(missingOriginTruth.failures.includes('origin_main_fetch_failed'));

const remotePath = path.join(tmp, 'freshness-origin.git');
const producerRepo = path.join(tmp, 'freshness-producer');
const consumerRepo = path.join(tmp, 'freshness-consumer');
execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', remotePath]);
execFileSync('git', ['clone', '--quiet', remotePath, producerRepo]);
execFileSync('git', ['config', 'user.name', 'Graphify Producer'], { cwd: producerRepo });
execFileSync('git', ['config', 'user.email', 'producer@example.invalid'], { cwd: producerRepo });
fs.writeFileSync(path.join(producerRepo, 'source.js'), 'module.exports = 1;\n');
execFileSync('git', ['add', 'source.js'], { cwd: producerRepo });
execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'initial'], { cwd: producerRepo });
execFileSync('git', ['push', '--quiet', '-u', 'origin', 'main'], { cwd: producerRepo });
execFileSync('git', ['clone', '--quiet', remotePath, consumerRepo]);
const initialRemoteSha = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: consumerRepo, encoding: 'utf8' }).trim();
const remoteCandidate = path.join(tmp, 'remote-candidate.json');
const remoteTarget = path.join(tmp, 'remote-served', 'graph.json');
fs.writeFileSync(remoteCandidate, `${JSON.stringify(candidateGraph('remote'))}\n`);
atomicPublishGraph({
  candidatePath: remoteCandidate,
  targetPath: remoteTarget,
  sourceSha: initialRemoteSha,
  originMainSha: initialRemoteSha,
  versionInfo,
  canary: { ok: true, query: 'gateway profile', resultCount: 1 },
});
assert.strictEqual(checkGraphStaleness({
  repo: consumerRepo,
  graphPath: remoteTarget,
  graphifyBin: fakeGraphify,
  currentVersionInfo: versionInfo,
}).ok, true);
fs.writeFileSync(path.join(producerRepo, 'source.js'), 'module.exports = 2;\n');
execFileSync('git', ['add', 'source.js'], { cwd: producerRepo });
execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'advance upstream'], { cwd: producerRepo });
execFileSync('git', ['push', '--quiet', 'origin', 'main'], { cwd: producerRepo });
const advancedHealth = checkGraphStaleness({
  repo: consumerRepo,
  graphPath: remoteTarget,
  graphifyBin: fakeGraphify,
  currentVersionInfo: versionInfo,
});
assert.strictEqual(advancedHealth.ok, false);
assert(advancedHealth.failures.includes('source_sha_lag'));
assert.notStrictEqual(advancedHealth.originMainSha, initialRemoteSha);

verifyMcpFailClosed()
  .then(verifyConcurrentReaders)
  .then(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log('Graphify atomic snapshot tests: PASS (invalid/corrupt/lag/version/canary controls + 200 atomic swaps, zero reader parse failures)');
  })
  .catch((error) => {
    fs.rmSync(tmp, { recursive: true, force: true });
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });

async function verifyMcpFailClosed() {
  let graphifyCalls = 0;
  const blocked = await handleToolCall('graphify_search', { query: 'gateway profile' }, {
    getGraphStatus: () => ({ ok: false, failures: ['source_sha_lag'] }),
    runGraphify: async () => {
      graphifyCalls += 1;
      return { code: 0, stdout: 'must not run', stderr: '' };
    },
  });
  assert.strictEqual(blocked.isError, true);
  assert.match(blocked.content[0].text, /source_sha_lag/);
  assert.strictEqual(graphifyCalls, 0);

  let invokedArgs = null;
  const allowed = await handleToolCall('graphify_search', { query: 'gateway profile', budget: 9000 }, {
    graphPath: targetPath,
    getGraphStatus: () => ({ ok: true, failures: [] }),
    runGraphify: async (args) => {
      invokedArgs = args;
      return { code: 0, stdout: 'NODE gatewayProfiles', stderr: '' };
    },
  });
  assert.strictEqual(allowed.isError, undefined);
  assert.strictEqual(allowed.content[0].text, 'NODE gatewayProfiles');
  assert.deepStrictEqual(invokedArgs, [
    'query',
    'gateway profile',
    '--graph',
    targetPath,
    '--budget',
    '5000',
  ]);
}

async function verifyConcurrentReaders() {
  const readerScript = path.join(tmp, 'reader.js');
  const resultPath = path.join(tmp, 'reader-result.json');
  const readyPath = path.join(tmp, 'reader-ready');
  fs.writeFileSync(readerScript, `
    const fs = require('fs');
    const graphPath = process.argv[2];
    const resultPath = process.argv[3];
    const readyPath = process.argv[4];
    let reads = 0;
    let failures = 0;
    const until = Date.now() + 1500;
    fs.writeFileSync(readyPath, 'ready');
    while (Date.now() < until) {
      try {
        JSON.parse(fs.readFileSync(graphPath, 'utf8'));
        reads += 1;
      } catch {
        failures += 1;
      }
    }
    fs.writeFileSync(resultPath, JSON.stringify({ reads, failures }));
  `);
  const child = spawn(process.execPath, [readerScript, targetPath, resultPath, readyPath], { stdio: 'ignore' });
  await waitForFile(readyPath, 2000);
  for (let index = 0; index < 200; index += 1) {
    fs.writeFileSync(candidatePath, `${JSON.stringify(candidateGraph(`swap-${index}`))}\n`);
    atomicPublishGraph({
      candidatePath,
      targetPath,
      sourceSha: nextSourceSha,
      originMainSha: nextSourceSha,
      versionInfo,
      canary: { ok: true, query: 'gateway profile', resultCount: 2 },
      now: '2026-07-30T12:00:00.000Z',
    });
  }
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`reader exited ${code}`)));
  });
  const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  assert(result.reads > 100, JSON.stringify(result));
  assert.strictEqual(result.failures, 0, JSON.stringify(result));
}

async function waitForFile(filePath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) throw new Error(`reader start barrier timed out: ${filePath}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function candidateGraph(label) {
  return {
    nodes: [
      { id: `${label}:file`, label: 'gatewayProfiles.ts', source_file: 'hermes-mobile/src/services/gatewayProfiles.ts' },
      { id: `${label}:symbol`, label: 'selectGatewayProfile', source_file: 'hermes-mobile/src/services/gatewayProfiles.ts' },
    ],
    links: [
      { source: `${label}:file`, target: `${label}:symbol`, relation: 'contains' },
    ],
  };
}

function publishedGraph(sha, builtAt) {
  return {
    ...candidateGraph('last-good'),
    _hermesSnapshot: {
      schemaVersion: 1,
      sourceSha: sha,
      originMainSha: sha,
      builtAt,
      graphifyPackageVersion: '0.9.26',
      graphifySkillVersion: '0.9.26',
      nodeCount: 2,
      linkCount: 1,
      canary: { ok: true, query: 'gateway profile', resultCount: 2 },
    },
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
