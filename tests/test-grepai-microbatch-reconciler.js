#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REAL_GREPAI_LOCK = path.join(os.tmpdir(), 'hermes-grepai-real-adapter.lock');
const {
  atomicReplaceFile,
  acquireLock,
  command,
  hashFile,
  publishIndexAndReceipt,
  prepareRealBuild,
  releaseLock,
  reconcile,
  stopWatcherVerified,
  watcherStartupProgressing,
} = require(path.join(ROOT, 'tools', 'grepai-microbatch-reconciler.js'));
const {
  probePinnedGeneration,
  serveIfFresh,
  verifyGeneration,
} = require(path.join(ROOT, 'tools', 'grepai-mcp-fresh.js'));
const {
  isWatcherRunning,
  parseIndexStatus,
} = require(path.join(ROOT, 'tools', 'fleet-repo-intelligence-status.js'));

let passed = 0;
let failed = 0;
let skipped = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    if (result?.skip) {
      console.log(`SKIP ${name} — ${result.skip}`);
      skipped += 1;
    } else {
      console.log(`PASS ${name}`);
      passed += 1;
    }
  } catch (error) {
    console.error(`FAIL ${name}\n  ${error.stack || error.message || error}`);
    failed += 1;
  }
}

function sha(char) {
  return char.repeat(40);
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeout || 120_000,
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.error && options.allowFailure) {
    return {
      ...result,
      status: result.status ?? 127,
      stdout: result.stdout || '',
      stderr: result.stderr || result.error.message || '',
    };
  }
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result;
}

function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function commitAndPush(sourceDir, message) {
  run('git', ['add', '-A'], { cwd: sourceDir });
  run('git', ['commit', '-m', message], { cwd: sourceDir });
  run('git', ['push', 'origin', 'main'], { cwd: sourceDir });
  return run('git', ['rev-parse', 'HEAD'], { cwd: sourceDir }).stdout.trim();
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-microbatch-'));
  const servedDir = path.join(root, 'served');
  const builderDir = path.join(root, 'builder');
  const statePath = path.join(servedDir, '.grepai', 'generation.json');
  const attemptPath = path.join(root, 'attempt.json');
  const lockPath = path.join(root, 'reconcile.lock');
  fs.mkdirSync(path.join(servedDir, '.grepai'), { recursive: true });
  fs.mkdirSync(path.join(builderDir, '.grepai'), { recursive: true });
  const servedIndex = path.join(servedDir, '.grepai', 'index.gob');
  const servedConfig = path.join(servedDir, '.grepai', 'config.yaml');
  fs.writeFileSync(servedIndex, Buffer.alloc(4096, 'A'));
  fs.writeFileSync(servedConfig, 'embedder:\n  provider: synthetic\n  model: fixture-v1\n');
  const generationDir = path.join(servedDir, '.grepai', 'generations');
  fs.mkdirSync(generationDir);
  const generationArtifact = path.join(generationDir, 'gen-a.gob');
  fs.copyFileSync(servedIndex, generationArtifact);
  const now = Date.parse('2026-07-31T14:00:00.000Z');
  const state = {
    schemaVersion: 'retrieval-index-generation/v1',
    committed: true,
    generationId: 'gen-a',
    indexedSha: sha('a'),
    observedOriginSha: sha('a'),
    sourceTreeHash: sha('1'),
    indexSha256: hashFile(generationArtifact),
    indexArtifact: 'generations/gen-a.gob',
    configSha256: hashFile(servedConfig),
    indexBytes: fs.statSync(servedIndex).size,
    files: 10,
    chunks: 20,
    builtAt: new Date(now - 60_000).toISOString(),
    publishedAt: new Date(now - 60_000).toISOString(),
    lastRemoteCheckedAt: new Date(now - 10_000).toISOString(),
    lastFullRebuildAt: new Date(now - 86_400_000).toISOString(),
    canaries: [{ query: 'fixture', results: 1, passed: true }],
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return {
    root, servedDir, builderDir, statePath, attemptPath, lockPath,
    servedIndex, servedConfig, generationArtifact, now,
  };
}

function goodBuild(fixture, targetSha, overrides = {}) {
  const indexPath = path.join(fixture.builderDir, '.grepai', `index-${targetSha[0]}.gob`);
  const configPath = path.join(fixture.builderDir, '.grepai', `config-${targetSha[0]}.yaml`);
  fs.writeFileSync(indexPath, Buffer.alloc(8192, targetSha[0]));
  fs.writeFileSync(configPath, 'embedder:\n  provider: synthetic\n  model: fixture-v1\n');
  return {
    indexPath,
    configPath,
    sourceTreeHash: sha('2'),
    files: 12,
    chunks: 27,
    commitTimeMs: fixture.now - 5_000,
    skippedCommits: 2,
    diff: { added: 2, modified: 1, deleted: 1 },
    canaries: [
      { query: 'retrieval harness', results: 3, passed: true },
      { query: 'deltaUniqueSymbol', expectedPath: 'tools/new.js', results: 1, passed: true },
    ],
    ...overrides,
  };
}

function options(fixture) {
  return {
    indexRoot: fixture.root,
    servedDir: fixture.servedDir,
    builderDir: fixture.builderDir,
    statePath: fixture.statePath,
    attemptPath: fixture.attemptPath,
    lockPath: fixture.lockPath,
    minIndexBytes: 1024,
    fullRebuildAfterMs: 7 * 86_400_000,
  };
}

(async () => {
  await test('A -> B -> C coalesces into one latest-SHA build and source-bound receipt', async () => {
    const fixture = makeFixture();
    let builds = 0;
    let syncedSha = null;
    const result = await reconcile(options(fixture), {
      now: () => fixture.now,
      latestRemoteSha: async () => sha('c'),
      prepareBuild: async ({ targetSha }) => {
        builds += 1;
        assert.equal(targetSha, sha('c'));
        return goodBuild(fixture, targetSha);
      },
      syncServedSource: async ({ targetSha }) => { syncedSha = targetSha; },
    });
    assert.equal(result.action, 'published');
    assert.equal(builds, 1);
    assert.equal(syncedSha, sha('c'));
    const receipt = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
    assert.equal(receipt.indexedSha, sha('c'));
    assert.equal(receipt.observedOriginSha, sha('c'));
    assert.equal(receipt.previousGenerationId, 'gen-a');
    assert.equal(receipt.skippedCommits, 2);
    assert.deepEqual(receipt.diff, { added: 2, modified: 1, deleted: 1 });
    assert.equal(receipt.indexSha256, hashFile(fixture.servedIndex));
    assert.equal(receipt.configSha256, hashFile(fixture.servedConfig));
    assert.equal(receipt.commitToSearchableLagMs, 5_000);
    assert.ok(receipt.canaries.every((entry) => entry.passed));
  });

  await test('same remote SHA is a zero-build no-op that refreshes the liveness watermark', async () => {
    const fixture = makeFixture();
    let builds = 0;
    const first = await reconcile(options(fixture), {
      now: () => fixture.now,
      latestRemoteSha: async () => sha('c'),
      prepareBuild: async ({ targetSha }) => { builds += 1; return goodBuild(fixture, targetSha); },
      syncServedSource: async () => {},
    });
    assert.equal(first.action, 'published');
    const indexHash = hashFile(fixture.servedIndex);
    const secondNow = fixture.now + 60_000;
    const second = await reconcile(options(fixture), {
      now: () => secondNow,
      latestRemoteSha: async () => sha('c'),
      prepareBuild: async () => { builds += 1; throw new Error('must not build'); },
      syncServedSource: async () => { throw new Error('must not reset served source'); },
    });
    assert.equal(second.action, 'noop');
    assert.equal(builds, 1);
    assert.equal(hashFile(fixture.servedIndex), indexHash);
    const receipt = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
    assert.equal(receipt.lastRemoteCheckedAt, new Date(secondNow).toISOString());
  });

  await test('same-SHA receipt drift rebuilds instead of refreshing a false-green heartbeat', async () => {
    for (const drift of ['canaries', 'artifactHash', 'head', 'missingHead', 'tree']) {
      const fixture = makeFixture();
      const state = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
      if (drift === 'canaries') delete state.canaries;
      if (drift === 'artifactHash') delete state.indexSha256;
      fs.writeFileSync(fixture.statePath, `${JSON.stringify(state, null, 2)}\n`);
      let builds = 0;
      const result = await reconcile(options(fixture), {
        now: () => fixture.now,
        latestRemoteSha: async () => sha('a'),
        servedHeadSha: async () => {
          if (drift === 'missingHead') return null;
          return drift === 'head' ? sha('b') : sha('a');
        },
        servedTreeHash: async () => drift === 'tree' ? sha('9') : sha('1'),
        prepareBuild: async ({ targetSha }) => {
          builds += 1;
          return goodBuild(fixture, targetSha);
        },
        syncServedSource: async () => {},
      });
      assert.equal(result.action, 'published', drift);
      assert.equal(builds, 1, drift);
    }
  });

  await test('remote movement during build coalesces again before committing a freshness receipt', async () => {
    const fixture = makeFixture();
    const remoteSequence = [sha('b'), sha('c'), sha('c'), sha('c')];
    const buildTargets = [];
    const synced = [];
    const result = await reconcile(options(fixture), {
      now: () => fixture.now,
      latestRemoteSha: async () => remoteSequence.shift(),
      prepareBuild: async ({ targetSha }) => {
        buildTargets.push(targetSha);
        return goodBuild(fixture, targetSha);
      },
      syncServedSource: async ({ targetSha }) => { synced.push(targetSha); },
    });
    assert.deepEqual(buildTargets, [sha('b'), sha('c')]);
    assert.deepEqual(synced, [sha('c')]);
    assert.equal(result.generation.indexedSha, sha('c'));
    assert.equal(result.generation.observedOriginSha, sha('c'));
    assert.equal(result.generation.supersededBuilds, 1);
  });

  await test('remote movement during source sync rejects publication and rolls source back', async () => {
    const fixture = makeFixture();
    const remoteSequence = [sha('b'), sha('b'), sha('c')];
    const synced = [];
    const beforeState = fs.readFileSync(fixture.statePath);
    await assert.rejects(
      reconcile(options(fixture), {
        now: () => fixture.now,
        latestRemoteSha: async () => remoteSequence.shift(),
        prepareBuild: async ({ targetSha }) => goodBuild(fixture, targetSha),
        syncServedSource: async ({ targetSha }) => { synced.push(targetSha); },
      }),
      /remote advanced before publication/,
    );
    assert.deepEqual(synced, [sha('b'), sha('a')]);
    assert.deepEqual(fs.readFileSync(fixture.statePath), beforeState);
  });

  await test('failed build preserves last-good index and committed watermark byte-for-byte', async () => {
    const fixture = makeFixture();
    const beforeIndex = fs.readFileSync(fixture.servedIndex);
    const beforeState = fs.readFileSync(fixture.statePath);
    await assert.rejects(
      reconcile(options(fixture), {
        now: () => fixture.now,
        latestRemoteSha: async () => sha('d'),
        prepareBuild: async () => { throw new Error('synthetic embed failure'); },
        syncServedSource: async () => { throw new Error('must not publish'); },
      }),
      /synthetic embed failure/,
    );
    assert.deepEqual(fs.readFileSync(fixture.servedIndex), beforeIndex);
    assert.deepEqual(fs.readFileSync(fixture.statePath), beforeState);
    const attempt = JSON.parse(fs.readFileSync(fixture.attemptPath, 'utf8'));
    assert.equal(attempt.status, 'rejected');
    assert.match(attempt.error, /synthetic embed failure/);
  });

  await test('a post-sync publication failure rolls source back to the last committed SHA', async () => {
    const fixture = makeFixture();
    const syncTargets = [];
    const beforeIndex = fs.readFileSync(fixture.servedIndex);
    const beforeState = fs.readFileSync(fixture.statePath);
    await assert.rejects(
      reconcile(options(fixture), {
        now: () => fixture.now,
        latestRemoteSha: async () => sha('d'),
        prepareBuild: async ({ targetSha }) => goodBuild(fixture, targetSha),
        syncServedSource: async ({ targetSha }) => { syncTargets.push(targetSha); },
        publishGeneration: () => { throw new Error('synthetic disk full'); },
      }),
      /synthetic disk full/,
    );
    assert.deepEqual(syncTargets, [sha('d'), sha('a')]);
    assert.deepEqual(fs.readFileSync(fixture.servedIndex), beforeIndex);
    assert.deepEqual(fs.readFileSync(fixture.statePath), beforeState);
  });

  await test('undersized or failed-canary build is rejected before any served mutation', async () => {
    for (const corrupt of ['small', 'canary']) {
      const fixture = makeFixture();
      const beforeIndexHash = hashFile(fixture.servedIndex);
      const beforeState = fs.readFileSync(fixture.statePath);
      await assert.rejects(
        reconcile(options(fixture), {
          now: () => fixture.now,
          latestRemoteSha: async () => sha('e'),
          prepareBuild: async ({ targetSha }) => {
            if (corrupt === 'small') return goodBuild(fixture, targetSha, { indexPath: path.join(fixture.root, 'small.gob') });
            return goodBuild(fixture, targetSha, { canaries: [{ query: 'must-hit', results: 0, passed: false }] });
          },
          syncServedSource: async () => { throw new Error('must not publish corrupt build'); },
        }),
        corrupt === 'small' ? /missing|undersized/ : /canary/i,
      );
      assert.equal(hashFile(fixture.servedIndex), beforeIndexHash);
      assert.deepEqual(fs.readFileSync(fixture.statePath), beforeState);
    }
  });

  await test('atomic replacement cannot truncate last-good destination before rename', async () => {
    const fixture = makeFixture();
    const source = path.join(fixture.root, 'next.gob');
    fs.writeFileSync(source, Buffer.alloc(8192, 'N'));
    const before = hashFile(fixture.servedIndex);
    assert.throws(
      () => atomicReplaceFile(source, fixture.servedIndex, {
        beforeRename: () => { throw new Error('crash before rename'); },
      }),
      /crash before rename/,
    );
    assert.equal(hashFile(fixture.servedIndex), before);
    atomicReplaceFile(source, fixture.servedIndex);
    assert.equal(hashFile(fixture.servedIndex), hashFile(source));
  });

  await test('receipt-write failure restores an overwritten same-generation artifact', async () => {
    const fixture = makeFixture();
    const before = {
      index: fs.readFileSync(fixture.servedIndex),
      config: fs.readFileSync(fixture.servedConfig),
      artifact: fs.readFileSync(fixture.generationArtifact),
      state: fs.readFileSync(fixture.statePath),
    };
    const build = goodBuild(fixture, sha('a'));
    const prior = JSON.parse(before.state.toString('utf8'));
    const receipt = {
      ...prior,
      indexSha256: hashFile(build.indexPath),
      configSha256: hashFile(build.configPath),
      indexBytes: fs.statSync(build.indexPath).size,
    };
    assert.throws(
      () => publishIndexAndReceipt(options(fixture), build, receipt, {
        writeReceipt: () => { throw new Error('synthetic receipt fsync failure'); },
      }),
      /synthetic receipt fsync failure/,
    );
    assert.deepEqual(fs.readFileSync(fixture.servedIndex), before.index);
    assert.deepEqual(fs.readFileSync(fixture.servedConfig), before.config);
    assert.deepEqual(fs.readFileSync(fixture.generationArtifact), before.artifact);
    assert.deepEqual(fs.readFileSync(fixture.statePath), before.state);
  });

  await test('an existing reconciliation lock coalesces concurrent triggers without a second build', async () => {
    const fixture = makeFixture();
    fs.mkdirSync(fixture.lockPath);
    let built = false;
    const result = await reconcile(options(fixture), {
      now: () => fixture.now,
      latestRemoteSha: async () => sha('f'),
      prepareBuild: async () => { built = true; return goodBuild(fixture, sha('f')); },
      syncServedSource: async () => {},
    });
    assert.equal(result.action, 'busy');
    assert.equal(built, false);
  });

  await test('stale-lock replacement uses owner tokens and an old owner cannot release the successor', async () => {
    const fixture = makeFixture();
    fs.mkdirSync(fixture.lockPath);
    fs.writeFileSync(path.join(fixture.lockPath, 'holder.json'), JSON.stringify({
      pid: 99999999,
      token: 'expired-owner',
      acquiredAt: new Date(Date.now() - 120_000).toISOString(),
    }));
    const successor = acquireLock(fixture.lockPath, Date.now(), 1_000);
    assert.match(successor, /^[a-f0-9]{32}$/);
    assert.equal(releaseLock(fixture.lockPath, 'expired-owner'), false);
    assert.equal(fs.existsSync(fixture.lockPath), true);
    const third = acquireLock(fixture.lockPath, Date.now() + 120_000, 1_000);
    assert.equal(third, null, 'live successor PID prevents stale takeover');
    assert.equal(releaseLock(fixture.lockPath, successor), true);
    assert.equal(fs.existsSync(fixture.lockPath), false);
  });

  await test('the integration lock excludes a second host process', async () => {
    const fixture = makeFixture();
    const modulePath = path.join(ROOT, 'tools', 'grepai-microbatch-reconciler.js');
    const holderSource = [
      `const { acquireLock, releaseLock } = require(${JSON.stringify(modulePath)});`,
      `const lockPath = ${JSON.stringify(fixture.lockPath)};`,
      'const token = acquireLock(lockPath, Date.now(), 60_000);',
      'if (!token) process.exit(2);',
      'process.stdout.write("LOCKED\\n");',
      'setTimeout(() => { releaseLock(lockPath, token); }, 750);',
    ].join('\n');
    const contenderSource = [
      `const { acquireLock } = require(${JSON.stringify(modulePath)});`,
      `const token = acquireLock(${JSON.stringify(fixture.lockPath)}, Date.now(), 60_000);`,
      'process.stdout.write(token ? "ACQUIRED\\n" : "DENIED\\n");',
      'process.exit(token ? 1 : 0);',
    ].join('\n');
    const holder = spawn(process.execPath, ['-e', holderSource], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let holderOutput = '';
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('lock holder did not start')), 5_000);
      holder.stdout.on('data', (chunk) => {
        holderOutput += chunk.toString();
        if (holderOutput.includes('LOCKED')) {
          clearTimeout(timer);
          resolve();
        }
      });
      holder.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const contender = run(process.execPath, ['-e', contenderSource]);
    assert.equal(contender.stdout.trim(), 'DENIED');
    const holderExit = await new Promise((resolve, reject) => {
      holder.once('error', reject);
      holder.once('exit', (code, signal) => resolve({ code, signal }));
    });
    assert.deepEqual(holderExit, { code: 0, signal: null });
    assert.equal(fs.existsSync(fixture.lockPath), false);
  });

  await test('failed watcher shutdown blocks source mutation', async () => {
    const calls = [];
    assert.throws(
      () => stopWatcherVerified('/tmp/fixture', 'fixture watcher', (cmd, args) => {
        calls.push([cmd, ...args]);
        return { status: 1, stdout: '', stderr: 'permission denied' };
      }),
      /stop failed.*permission denied/,
    );
    assert.deepEqual(calls, [['grepai', 'watch', '--stop']]);
  });

  await test('known grepai launcher timeout is accepted only with live scan progress', async () => {
    const timeout = { status: 1, stderr: 'timeout waiting for process to become ready' };
    assert.equal(watcherStartupProgressing(timeout, '[STARTING]\nPerforming initial scan...'), true);
    assert.equal(watcherStartupProgressing(timeout, '', 'Status: running (PID 123)'), true);
    assert.equal(watcherStartupProgressing(timeout, 'fatal: provider unavailable'), false);
  });

  await test('allowed command timeout is normalized and a timed-out watcher launch is cleaned up', async () => {
    const timed = command(process.execPath, ['-e', 'setTimeout(() => {}, 1000)'], {
      timeout: 10,
      allowFailure: true,
    });
    assert.equal(timed.status, 124);
    assert.match(timed.stderr, /timed out|ETIMEDOUT/i);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-timeout-cleanup-'));
    const remote = path.join(root, 'remote.git');
    const source = path.join(root, 'source');
    const indexRoot = path.join(root, 'index-root');
    const builderDir = path.join(indexRoot, '.builders', 'fixture');
    const servedDir = path.join(indexRoot, 'fixture');
    const fakeBin = path.join(root, 'bin');
    const fakeState = path.join(root, 'fake-state');
    const oldPath = process.env.PATH;
    const oldState = process.env.FAKE_GREPAI_STATE;
    try {
      run('git', ['init', '--bare', remote]);
      run('git', ['init', '-b', 'main', source]);
      run('git', ['config', 'user.name', 'grepai-timeout-test'], { cwd: source });
      run('git', ['config', 'user.email', 'grepai-timeout@example.invalid'], { cwd: source });
      run('git', ['remote', 'add', 'origin', remote], { cwd: source });
      writeFixtureFile(source, 'src/fixture.js', 'export const TimeoutCleanupCanary = true;\n');
      const targetSha = commitAndPush(source, 'fixture');
      writeFixtureFile(
        servedDir,
        '.grepai/config.yaml',
        'embedder:\n  provider: synthetic\n  model: fixture-v1\n',
      );
      fs.mkdirSync(fakeBin, { recursive: true });
      fs.mkdirSync(fakeState, { recursive: true });
      writeFixtureFile(
        fakeBin,
        'grepai',
        '#!/bin/sh\nstate="$FAKE_GREPAI_STATE"\ncase "$1 $2" in\n  "watch --background")\n    logdir=""\n    while [ "$#" -gt 0 ]; do\n      if [ "$1" = "--log-dir" ]; then shift; logdir="$1"; fi\n      shift\n    done\n    mkdir -p "$logdir"\n    sleep 300 & child=$!\n    printf "%s\\n" "$child" > "$state/pid"\n    printf "%s\\n" "$child" > "$state/last_pid"\n    printf "[STARTING] fixture\\nPerforming initial scan...\\n" > "$logdir/fake.log"\n    sleep 5\n    ;;\n  "watch --stop")\n    if [ -f "$state/pid" ]; then\n      pid=$(sed -n "1p" "$state/pid")\n      kill "$pid" 2>/dev/null || true\n      n=0\n      while kill -0 "$pid" 2>/dev/null && [ "$n" -lt 20 ]; do sleep 0.05; n=$((n + 1)); done\n      kill -9 "$pid" 2>/dev/null || true\n      rm -f "$state/pid"\n    fi\n    ;;\n  "watch --status")\n    if [ -f "$state/pid" ] && kill -0 "$(sed -n "1p" "$state/pid")" 2>/dev/null; then\n      echo "Status: running"\n    else\n      echo "Status: not running"\n    fi\n    ;;\n  "status --no-ui")\n    echo "Files indexed: 0"\n    echo "Total chunks: 0"\n    ;;\nesac\nexit 0\n',
      );
      fs.chmodSync(path.join(fakeBin, 'grepai'), 0o755);
      process.env.PATH = `${fakeBin}:${oldPath}`;
      process.env.FAKE_GREPAI_STATE = fakeState;
      await assert.rejects(
        prepareRealBuild({
          indexRoot,
          builderDir,
          servedDir,
          remote,
          branch: 'main',
          minIndexBytes: 64,
          maxBuildMs: 100,
          pollMs: 10,
          watchLaunchTimeoutMs: 300,
          canaryTimeoutMs: 100,
          canaries: ['TimeoutCleanupCanary'],
        }, { targetSha, previousState: null, fullRebuild: false }),
        /build timed out/,
      );
      const childPid = Number(fs.readFileSync(path.join(fakeState, 'last_pid'), 'utf8').trim());
      assert.throws(() => process.kill(childPid, 0), /ESRCH/);
    } finally {
      process.env.PATH = oldPath;
      if (oldState === undefined) delete process.env.FAKE_GREPAI_STATE;
      else process.env.FAKE_GREPAI_STATE = oldState;
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  await test('outside-root state paths and symlinked generation artifacts fail before mutation', async () => {
    const fixture = makeFixture();
    let called = false;
    await assert.rejects(
      reconcile({ ...options(fixture), statePath: path.join(fixture.root, 'outside.json') }, {
        latestRemoteSha: async () => { called = true; return sha('a'); },
      }),
      /statePath must be a child/,
    );
    assert.equal(called, false);

    const builderEscape = makeFixture();
    const builderOutside = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-builder-escape-'));
    fs.rmSync(path.join(builderEscape.builderDir, '.grepai'), { recursive: true });
    fs.symlinkSync(builderOutside, path.join(builderEscape.builderDir, '.grepai'));
    let builderCalled = false;
    await assert.rejects(
      reconcile(options(builderEscape), {
        latestRemoteSha: async () => { builderCalled = true; return sha('a'); },
      }),
      /builderDir\/\.grepai contains a symbolic link/,
    );
    assert.equal(builderCalled, false);
    fs.rmSync(builderOutside, { recursive: true, force: true });

    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-artifact-escape-'));
    const generationDir = path.join(fixture.servedDir, '.grepai', 'generations');
    const artifactBytes = fs.readFileSync(fixture.generationArtifact);
    fs.rmSync(generationDir, { recursive: true });
    fs.writeFileSync(path.join(outside, 'gen-a.gob'), artifactBytes);
    fs.symlinkSync(outside, generationDir);
    const escaped = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('a'),
      treeHash: sha('1'),
      nowMs: fixture.now,
    });
    assert.equal(escaped.ok, false);
    assert.ok(escaped.problems.some((entry) => entry.code === 'index_artifact_path_invalid'));
    fs.rmSync(outside, { recursive: true, force: true });
  });

  await test('MCP freshness gate accepts only current source + exact index/config hashes + fresh check', async () => {
    const fixture = makeFixture();
    await reconcile(options(fixture), {
      now: () => fixture.now,
      latestRemoteSha: async () => sha('c'),
      prepareBuild: async ({ targetSha }) => goodBuild(fixture, targetSha),
      syncServedSource: async () => {},
    });
    const ok = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('c'),
      treeHash: sha('2'),
      nowMs: fixture.now + 30_000,
      maxCheckAgeMs: 120_000,
    });
    assert.equal(ok.ok, true, JSON.stringify(ok));

    const staleHead = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('d'),
      treeHash: sha('2'),
      nowMs: fixture.now + 30_000,
    });
    assert.equal(staleHead.ok, false);
    assert.ok(staleHead.problems.some((p) => p.code === 'indexed_sha_mismatch'));

    fs.appendFileSync(fixture.servedIndex, 'expected mutable query stats');
    const mutable = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('c'),
      treeHash: sha('2'),
      nowMs: fixture.now + 30_000,
    });
    assert.equal(mutable.ok, true, JSON.stringify(mutable));

    const receipt = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
    const artifact = path.join(fixture.servedDir, '.grepai', receipt.indexArtifact);
    fs.appendFileSync(artifact, 'tamper');
    const tampered = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('c'),
      treeHash: sha('2'),
      nowMs: fixture.now + 30_000,
    });
    assert.equal(tampered.ok, false);
    assert.ok(tampered.problems.some((p) => p.code === 'index_artifact_hash_mismatch'));

    const wrongTree = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('c'),
      treeHash: sha('9'),
      nowMs: fixture.now + 30_000,
    });
    assert.equal(wrongTree.ok, false);
    assert.ok(wrongTree.problems.some((p) => p.code === 'source_tree_mismatch'));

    const staleCheck = verifyGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('c'),
      treeHash: sha('2'),
      nowMs: fixture.now + 300_000,
      maxCheckAgeMs: 120_000,
    });
    assert.equal(staleCheck.ok, false);
    assert.ok(staleCheck.problems.some((p) => p.code === 'remote_check_stale'));
  });

  await test('MCP wrapper never spawns grepai on stale proof and executes it on current proof', async () => {
    const fixture = makeFixture();
    let spawns = 0;
    const stale = await serveIfFresh({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('b'),
      treeHash: sha('1'),
      nowMs: fixture.now,
      spawn: () => { spawns += 1; return { status: 0 }; },
    });
    assert.equal(stale.status, 78);
    assert.equal(spawns, 0);

    const current = await serveIfFresh({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('a'),
      treeHash: sha('1'),
      nowMs: fixture.now,
      spawn: (cmd, args) => {
        spawns += 1;
        assert.equal(cmd, 'grepai');
        assert.equal(args[0], 'mcp-serve');
        assert.match(args[1], /\.grepai\/mcp-sessions\//);
        assert.equal(hashFile(path.join(args[1], '.grepai', 'index.gob')), hashFile(fixture.generationArtifact));
        return { status: 0 };
      },
    });
    assert.equal(current.status, 0);
    assert.equal(spawns, 1);
  });

  await test('scorecard probe queries the immutable generation and returns its binding hashes', async () => {
    const fixture = makeFixture();
    const probe = probePinnedGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('a'),
      treeHash: sha('1'),
      nowMs: fixture.now,
      query: 'fixture',
      run: (cmd, args, opts) => {
        assert.equal(cmd, 'grepai');
        assert.equal(args[0], 'search');
        assert.match(opts.cwd, /\.grepai\/mcp-sessions\//);
        return {
          status: 0,
          stdout: JSON.stringify([{ file_path: 'src/fixture.js' }]),
          stderr: '',
        };
      },
    });
    const receipt = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
    assert.equal(probe.ok, true);
    assert.equal(probe.generationId, receipt.generationId);
    assert.equal(probe.indexSha256, receipt.indexSha256);
    assert.equal(probe.hits, 1);
    assert.deepEqual(probe.topPaths, ['src/fixture.js']);

    const raced = probePinnedGeneration({
      projectPath: fixture.servedDir,
      statePath: fixture.statePath,
      headSha: sha('a'),
      treeHash: sha('1'),
      nowMs: fixture.now,
      run: () => ({ status: 0, stdout: JSON.stringify([{ file_path: 'src/fixture.js' }]) }),
      beforePostProbeVerify: () => {
        const next = JSON.parse(fs.readFileSync(fixture.statePath, 'utf8'));
        next.generationId = 'gen-b';
        fs.writeFileSync(fixture.statePath, `${JSON.stringify(next, null, 2)}\n`);
      },
    });
    assert.equal(raced.ok, false);
    assert.equal(raced.raceDetected, true);
    assert.ok(raced.problems.some((entry) => entry.code === 'generation_changed_during_probe'));
  });

  await test('MCP detects verify-copy-publish race before spawning and retires a live old generation', async () => {
    const raceFixture = makeFixture();
    let raceSpawns = 0;
    const race = await serveIfFresh({
      projectPath: raceFixture.servedDir,
      statePath: raceFixture.statePath,
      headSha: sha('a'),
      treeHash: sha('1'),
      nowMs: raceFixture.now,
      beforePostVerify: async () => {
        const state = JSON.parse(fs.readFileSync(raceFixture.statePath, 'utf8'));
        state.generationId = 'gen-b';
        fs.writeFileSync(raceFixture.statePath, `${JSON.stringify(state, null, 2)}\n`);
      },
      spawn: () => { raceSpawns += 1; return { status: 0 }; },
    });
    assert.equal(race.status, 78);
    assert.equal(race.raceDetected, true);
    assert.equal(raceSpawns, 0);

    const liveFixture = makeFixture();
    let child = null;
    const serving = serveIfFresh({
      projectPath: liveFixture.servedDir,
      statePath: liveFixture.statePath,
      headSha: sha('a'),
      treeHash: sha('1'),
      nowMs: liveFixture.now,
      clock: () => liveFixture.now,
      monitorMs: 5,
      unrefMonitor: false,
      spawn: () => {
        child = new EventEmitter();
        child.killedWith = null;
        child.kill = (signal) => {
          child.killedWith = signal;
          setImmediate(() => child.emit('exit', null, signal));
          return true;
        };
        return child;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const next = JSON.parse(fs.readFileSync(liveFixture.statePath, 'utf8'));
    next.generationId = 'gen-c';
    fs.writeFileSync(liveFixture.statePath, `${JSON.stringify(next, null, 2)}\n`);
    const retired = await serving;
    assert.equal(retired.status, 78);
    assert.equal(child.killedWith, 'SIGTERM');
  });

  await test('production wiring uses a 60-second supervised reconciler and gated MCP command', async () => {
    const plist = fs.readFileSync(path.join(ROOT, 'com.igor.fleet-repo-intelligence.plist'), 'utf8');
    assert.match(plist, /index-microbatch\.js/);
    assert.match(plist, /<string>--heal<\/string>/);
    assert.match(plist, /<key>StartInterval<\/key>\s*<integer>60<\/integer>/);
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /__NODE__/);
    assert.match(plist, /__INDEX_ROOT__/);
    assert.match(plist, /__REMOTE__/);

    const installer = fs.readFileSync(path.join(ROOT, 'tools', 'install-fleet-repo-intelligence.sh'), 'utf8');
    assert.match(installer, /grepai-microbatch-reconciler\.js/);
    assert.doesNotMatch(installer, /grepai watch --background/);
    assert.doesNotMatch(installer, /launchctl load[^\n]+\|\| true/);
    assert.match(installer, /launchctl print/);
    assert.ok(
      installer.indexOf('node "$REPO/tools/grepai-microbatch-reconciler.js" --once --json')
        < installer.indexOf('if ! launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"'),
      'initial generation must commit before RunAtLoad can trigger',
    );

    const reconciler = fs.readFileSync(path.join(ROOT, 'tools', 'grepai-microbatch-reconciler.js'), 'utf8');
    const syncStart = reconciler.indexOf('function syncRealServedSource');
    assert.ok(syncStart >= 0);
    assert.match(reconciler.slice(syncStart, syncStart + 900), /stopWatcherVerified\(opts\.servedDir/);

    const mcp = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8'));
    assert.equal(mcp.mcpServers.grepai.command, 'node');
    assert.ok(mcp.mcpServers.grepai.args.some((arg) => /grepai-mcp-fresh\.js$/.test(arg)));
    assert.deepEqual(mcp.mcpServers.grepai.args.slice(1), ['serve']);
  });

  await test('status parser requires positive files and chunks instead of a non-empty-file false green', async () => {
    const emptyChunks = parseIndexStatus('Files indexed: 12\nTotal chunks: 0\nWatcher: stopped');
    assert.equal(emptyChunks.files, 12);
    assert.equal(emptyChunks.chunks, 0);
    const healthy = parseIndexStatus('Files indexed: 12\nTotal chunks: 37\nWatcher: stopped');
    assert.equal(healthy.chunks, 37);
    assert.equal(isWatcherRunning(healthy.watcher), false);
    assert.equal(isWatcherRunning('running (PID 35281)'), true);
  });

  await test('installer renders custom root and verifies the LaunchAgent is actually loaded', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-installer-'));
    const bin = path.join(fixture, 'bin');
    const home = path.join(fixture, 'home');
    const launchLog = path.join(fixture, 'launchctl.log');
    const grepaiLog = path.join(fixture, 'grepai.log');
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['node', 'plutil']) {
      writeFixtureFile(bin, name, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    writeFixtureFile(
      bin,
      'grepai',
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GREPAI_LOG"\ncase "$*" in\n  "watch --status") echo "Status: not running" ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'grepai'), 0o755);
    writeFixtureFile(
      bin,
      'launchctl',
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LAUNCHCTL_LOG"\ncase "$*" in\n  "print gui/"*"/com.igor.index-microbatch") exit 113 ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'launchctl'), 0o755);
    const legacyPlist = path.join(
      home,
      'Library',
      'LaunchAgents',
      'com.igor.index-microbatch.plist',
    );
    writeFixtureFile(home, 'Library/LaunchAgents/com.igor.index-microbatch.plist', 'legacy\n');
    const customRoot = path.join(fixture, 'custom-index');
    fs.mkdirSync(path.join(customRoot, 'mac-yolo-safeguards', '.grepai'), { recursive: true });
    const result = run('bash', [path.join(ROOT, 'tools', 'install-fleet-repo-intelligence.sh')], {
      allowFailure: true,
      env: {
        HOME: home,
        HERMES_RECONCILER_REPO: ROOT,
        HERMES_SEMANTIC_INDEX_ROOT: customRoot,
        HERMES_SEMANTIC_REMOTE: 'https://example.invalid/repo.git',
        GREPAI_LOG: grepaiLog,
        LAUNCHCTL_LOG: launchLog,
        PATH: `${bin}:/usr/bin:/bin`,
      },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const installed = fs.readFileSync(
      path.join(home, 'Library', 'LaunchAgents', 'com.igor.fleet-repo-intelligence.plist'),
      'utf8',
    );
    assert.match(installed, new RegExp(customRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(installed, /https:\/\/example\.invalid\/repo\.git/);
    assert.doesNotMatch(installed, /__[A-Z_]+__/);
    assert.equal(fs.existsSync(legacyPlist), false);
    assert.equal(
      fs.readdirSync(path.dirname(legacyPlist)).filter(
        (entry) => entry.startsWith('com.igor.index-microbatch.plist.disabled-'),
      ).length,
      1,
    );
    const launchCalls = fs.readFileSync(launchLog, 'utf8');
    assert.match(launchCalls, /bootstrap/);
    assert.match(launchCalls, /print gui\//);
    const grepaiCalls = fs.readFileSync(grepaiLog, 'utf8');
    assert.match(grepaiCalls, /watch --stop/);
    assert.match(grepaiCalls, /watch --status/);
  });

  await test('installer leaves the legacy plist intact and no canonical plist when retirement fails', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-installer-fail-'));
    const bin = path.join(fixture, 'bin');
    const home = path.join(fixture, 'home');
    const customRoot = path.join(fixture, 'custom-index');
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['node', 'plutil', 'launchctl']) {
      writeFixtureFile(bin, name, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    writeFixtureFile(
      bin,
      'grepai',
      '#!/bin/sh\ncase "$*" in\n  "watch --status") echo "Status: not running" ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'grepai'), 0o755);
    const legacy = path.join(home, 'Library', 'LaunchAgents', 'com.igor.index-microbatch.plist');
    const canonical = path.join(
      home,
      'Library',
      'LaunchAgents',
      'com.igor.fleet-repo-intelligence.plist',
    );
    writeFixtureFile(home, 'Library/LaunchAgents/com.igor.index-microbatch.plist', 'legacy\n');
    fs.mkdirSync(path.join(customRoot, 'mac-yolo-safeguards', '.grepai'), { recursive: true });
    const result = run('bash', [path.join(ROOT, 'tools', 'install-fleet-repo-intelligence.sh')], {
      allowFailure: true,
      env: {
        HOME: home,
        HERMES_RECONCILER_REPO: ROOT,
        HERMES_SEMANTIC_INDEX_ROOT: customRoot,
        PATH: `${bin}:/usr/bin:/bin`,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /legacy duplicate controller.*still loaded/);
    assert.equal(fs.existsSync(legacy), true);
    assert.equal(fs.existsSync(canonical), false);
  });

  await test('installer restores the legacy scheduler when canonical activation fails', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-installer-rollback-'));
    const bin = path.join(fixture, 'bin');
    const home = path.join(fixture, 'home');
    const customRoot = path.join(fixture, 'custom-index');
    const launchLog = path.join(fixture, 'launchctl.log');
    const launchState = path.join(fixture, 'legacy-restored');
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['node', 'plutil']) {
      writeFixtureFile(bin, name, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    writeFixtureFile(
      bin,
      'grepai',
      '#!/bin/sh\ncase "$*" in\n  "watch --status") echo "Status: not running" ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'grepai'), 0o755);
    writeFixtureFile(
      bin,
      'launchctl',
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LAUNCHCTL_LOG"\ncase "$*" in\n  "print gui/"*"/com.igor.index-microbatch") [ -f "$LAUNCHCTL_STATE" ] && exit 0; exit 113 ;;\n  "bootstrap "*"com.igor.index-microbatch.plist") touch "$LAUNCHCTL_STATE"; exit 0 ;;\n  "bootstrap "*"com.igor.fleet-repo-intelligence.plist") exit 1 ;;\n  "load -w "*"com.igor.fleet-repo-intelligence.plist") exit 1 ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'launchctl'), 0o755);
    const legacy = path.join(home, 'Library', 'LaunchAgents', 'com.igor.index-microbatch.plist');
    const canonical = path.join(
      home,
      'Library',
      'LaunchAgents',
      'com.igor.fleet-repo-intelligence.plist',
    );
    writeFixtureFile(home, 'Library/LaunchAgents/com.igor.index-microbatch.plist', 'legacy\n');
    fs.mkdirSync(path.join(customRoot, 'mac-yolo-safeguards', '.grepai'), { recursive: true });
    const result = run('bash', [path.join(ROOT, 'tools', 'install-fleet-repo-intelligence.sh')], {
      allowFailure: true,
      env: {
        HOME: home,
        HERMES_RECONCILER_REPO: ROOT,
        HERMES_SEMANTIC_INDEX_ROOT: customRoot,
        LAUNCHCTL_LOG: launchLog,
        LAUNCHCTL_STATE: launchState,
        PATH: `${bin}:/usr/bin:/bin`,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /activation failed; legacy scheduler restored/);
    assert.equal(fs.existsSync(legacy), true);
    assert.equal(fs.existsSync(canonical), false);
    assert.equal(
      fs.readdirSync(path.join(home, 'Library', 'Logs')).filter(
        (entry) => entry.startsWith('com.igor.fleet-repo-intelligence.failed-'),
      ).length,
      1,
    );
    assert.match(fs.readFileSync(launchLog, 'utf8'), /bootstrap .*com\.igor\.index-microbatch\.plist/);
  });

  await test('installer restores an existing canonical scheduler when its replacement fails', async () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-installer-upgrade-rollback-'));
    const bin = path.join(fixture, 'bin');
    const home = path.join(fixture, 'home');
    const customRoot = path.join(fixture, 'custom-index');
    const canonical = path.join(
      home,
      'Library',
      'LaunchAgents',
      'com.igor.fleet-repo-intelligence.plist',
    );
    fs.mkdirSync(bin, { recursive: true });
    for (const name of ['node', 'plutil']) {
      writeFixtureFile(bin, name, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(path.join(bin, name), 0o755);
    }
    writeFixtureFile(
      bin,
      'grepai',
      '#!/bin/sh\ncase "$*" in\n  "watch --status") echo "Status: not running" ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'grepai'), 0o755);
    writeFixtureFile(
      bin,
      'launchctl',
      '#!/bin/sh\ncase "$*" in\n  "print gui/"*"/com.igor.index-microbatch") exit 113 ;;\n  "print gui/"*"/com.igor.fleet-repo-intelligence")\n    grep -q "previous-canonical" "$CANONICAL_PATH" 2>/dev/null && exit 0\n    exit 113\n    ;;\n  "bootstrap "*"com.igor.fleet-repo-intelligence.plist"|"load -w "*"com.igor.fleet-repo-intelligence.plist")\n    grep -q "previous-canonical" "$CANONICAL_PATH" 2>/dev/null && exit 0\n    exit 1\n    ;;\nesac\nexit 0\n',
    );
    fs.chmodSync(path.join(bin, 'launchctl'), 0o755);
    writeFixtureFile(
      home,
      'Library/LaunchAgents/com.igor.fleet-repo-intelligence.plist',
      'previous-canonical\n',
    );
    fs.mkdirSync(path.join(customRoot, 'mac-yolo-safeguards', '.grepai'), { recursive: true });
    const result = run('bash', [path.join(ROOT, 'tools', 'install-fleet-repo-intelligence.sh')], {
      allowFailure: true,
      env: {
        HOME: home,
        CANONICAL_PATH: canonical,
        HERMES_RECONCILER_REPO: ROOT,
        HERMES_SEMANTIC_INDEX_ROOT: customRoot,
        PATH: `${bin}:/usr/bin:/bin`,
      },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /activation failed; previous canonical scheduler restored/);
    assert.equal(fs.readFileSync(canonical, 'utf8'), 'previous-canonical\n');
    assert.equal(
      fs.readdirSync(path.join(home, 'Library', 'Logs')).filter(
        (entry) => entry.startsWith('com.igor.fleet-repo-intelligence.failed-'),
      ).length,
      1,
    );
  });

  await test('real local grepai adapter publishes the newest coalesced Git snapshot', async () => {
    if (process.env.REQUIRE_REAL_GREPAI !== '1') {
      return { skip: 'set REQUIRE_REAL_GREPAI=1 for the serialized local Ollama/grepai integration gate' };
    }
    const integrationToken = acquireLock(REAL_GREPAI_LOCK, Date.now(), 30 * 60_000);
    if (!integrationToken) {
      throw new Error(`real grepai integration lock is held: ${REAL_GREPAI_LOCK}`);
    }
    let root = null;
    let servedDir = null;
    let builderDir = null;
    try {
      const available = run('grepai', ['version'], { allowFailure: true });
      const ollama = run('ollama', ['list'], { allowFailure: true });
      if (available.status !== 0 || ollama.status !== 0 || !/nomic-embed-text/i.test(ollama.stdout)) {
        throw new Error('REQUIRE_REAL_GREPAI=1 but grepai or local nomic-embed-text is unavailable');
      }

      root = fs.mkdtempSync(path.join(os.tmpdir(), 'grepai-real-adapter-'));
      const remote = path.join(root, 'remote.git');
      const source = path.join(root, 'source');
      const indexRoot = path.join(root, 'index-root');
      servedDir = path.join(indexRoot, 'fixture-repo');
      builderDir = path.join(indexRoot, '.builders', 'fixture-repo');
      run('git', ['init', '--bare', remote]);
      run('git', ['init', '-b', 'main', source]);
      const emptyHooks = path.join(root, 'empty-hooks');
      fs.mkdirSync(emptyHooks);
      run('git', ['config', 'core.hooksPath', emptyHooks], { cwd: source });
      run('git', ['config', 'user.name', 'grepai-test'], { cwd: source });
      run('git', ['config', 'user.email', 'grepai-test@example.invalid'], { cwd: source });
      run('git', ['remote', 'add', 'origin', remote], { cwd: source });
      writeFixtureFile(
        source,
        'src/stable.js',
        'export function InfoQStableCanaryToken() { return "stable"; }\n',
      );
      writeFixtureFile(source, 'src/retrieval.js', 'export const InfoQPublishedThenDeletedToken = "snapshot-a";\n');
      const shaA = commitAndPush(source, 'snapshot A');

      run('git', ['clone', '--branch', 'main', remote, servedDir]);
      run('grepai', [
        'init', '--provider', 'ollama', '--model', 'nomic-embed-text', '--backend', 'gob', '--yes',
      ], {
        cwd: servedDir,
      });

      const opts = {
        indexRoot,
        repoName: 'fixture-repo',
        servedDir,
        builderDir,
        remote,
        branch: 'main',
        minIndexBytes: 64,
        maxBuildMs: 60_000,
        pollMs: 100,
        canaries: ['InfoQStableCanaryToken'],
      };
      const first = await reconcile(opts);
      assert.equal(first.action, 'published');
      assert.equal(first.targetSha, shaA);
      assert.equal(verifyGeneration({
        projectPath: servedDir,
        nowMs: Date.parse(first.generation.lastRemoteCheckedAt) + 1_000,
      }).ok, true);

      writeFixtureFile(
        source,
        'src/intermediate.js',
        'export const InfoQIntermediateSnapshotToken = "snapshot-b";\n',
      );
      commitAndPush(source, 'snapshot B');
      writeFixtureFile(
        source,
        'src/latest.js',
        'export const InfoQLatestCoalescedSnapshotToken = "snapshot-c";\n',
      );
      fs.rmSync(path.join(source, 'src', 'intermediate.js'));
      fs.rmSync(path.join(source, 'src', 'retrieval.js'));
      const shaC = commitAndPush(source, 'snapshot C');
      const sourceDiff = run(
        'git', ['diff', '--name-status', shaA, shaC], { cwd: source },
      ).stdout.trim();
      assert.deepEqual(
        sourceDiff.split('\n').sort(),
        ['A\tsrc/latest.js', 'D\tsrc/retrieval.js'],
      );

      const second = await reconcile(opts);
      assert.equal(second.action, 'published');
      assert.equal(second.targetSha, shaC);
      assert.equal(second.generation.indexedSha, shaC);
      assert.equal(second.generation.skippedCommits, 1);
      assert.deepEqual(second.generation.diff, { added: 1, modified: 0, deleted: 1 });
      assert.ok(second.generation.canaries.every((entry) => entry.passed));
      assert.ok(
        second.generation.canaries.some(
          (entry) => entry.query === 'InfoQLatestCoalescedSnapshotToken'
            && entry.expectedPath === 'src/latest.js',
        ),
      );
      const deletedSearch = run(
        'grepai',
        ['search', 'InfoQPublishedThenDeletedToken', '--json', '--compact', '--limit', '10'],
        { cwd: servedDir },
      );
      assert.ok(
        !JSON.parse(deletedSearch.stdout).some(
          (entry) => (entry.file_path || entry.path || entry.file) === 'src/retrieval.js',
        ),
        deletedSearch.stdout,
      );
      const servedHead = run('git', ['rev-parse', 'HEAD'], { cwd: servedDir }).stdout.trim();
      assert.equal(servedHead, shaC);
      const search = run(
        'grepai',
        ['search', 'InfoQLatestCoalescedSnapshotToken', '--json', '--compact', '--limit', '10'],
        { cwd: servedDir },
      );
      const results = JSON.parse(search.stdout);
      assert.ok(
        results.some((entry) => (entry.file_path || entry.path || entry.file) === 'src/latest.js'),
        search.stdout,
      );
      const afterSearch = verifyGeneration({
        projectPath: servedDir,
        nowMs: Date.parse(second.generation.lastRemoteCheckedAt) + 1_000,
      });
      assert.equal(afterSearch.ok, true, JSON.stringify(afterSearch.problems));

      const rebuilt = await reconcile({ ...opts, forceFull: true });
      assert.equal(rebuilt.action, 'published');
      assert.equal(rebuilt.generation.fullRebuild, true);
      const rebuiltSearch = run(
        'grepai',
        ['search', 'InfoQLatestCoalescedSnapshotToken', '--json', '--compact', '--limit', '10'],
        { cwd: servedDir },
      );
      assert.ok(JSON.parse(rebuiltSearch.stdout).some(
        (entry) => (entry.file_path || entry.path || entry.file) === 'src/latest.js',
      ));
    } finally {
      if (servedDir) run('grepai', ['watch', '--stop'], { cwd: servedDir, allowFailure: true });
      if (builderDir) run('grepai', ['watch', '--stop'], { cwd: builderDir, allowFailure: true });
      if (root) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      releaseLock(REAL_GREPAI_LOCK, integrationToken);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
