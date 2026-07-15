#!/usr/bin/env node
/**
 * Agent proof for Callstack AI SDK Profiler / Rozenite wiring.
 * Writes docs/perf-proofs/ai-sdk-profiler-latest.json — does not replace Reassure.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'perf-proofs');
const outFile = path.join(outDir, 'ai-sdk-profiler-latest.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function tryRequireDevTools() {
  try {
    // Metro resolves react-native.ts; Node may need the source path.
    const pkgRoot = path.join(root, 'node_modules', '@react-native-ai', 'dev-tools');
    const pkg = readJson(path.join(pkgRoot, 'package.json'));
    const distMain = path.join(pkgRoot, 'dist', 'react-native.cjs');
    const sourceEntry = path.join(pkgRoot, 'react-native.ts');
    const rozeniteJson = path.join(pkgRoot, 'dist', 'rozenite.json');
    return {
      installed: true,
      version: pkg.version,
      peerDependencies: pkg.peerDependencies || {},
      dependencies: pkg.dependencies || {},
      hasDistMain: fs.existsSync(distMain),
      hasSourceEntry: fs.existsSync(sourceEntry),
      hasRozeniteManifest: fs.existsSync(rozeniteJson),
      packageMain: pkg.main || null,
    };
  } catch (error) {
    return { installed: false, error: String(error && error.message ? error.message : error) };
  }
}

function metroWiring() {
  const metroPath = path.join(root, 'metro.config.js');
  const body = fs.readFileSync(metroPath, 'utf8');
  return {
    hasWithRozenite: /withRozenite/.test(body),
    gatedByWithRozeniteEnv: /WITH_ROZENITE\s*===\s*['"]true['"]/.test(body),
    keepsSentryExpoConfig: /getSentryExpoConfig/.test(body),
  };
}

function appWiring() {
  const appPath = path.join(root, 'App.tsx');
  const body = fs.readFileSync(appPath, 'utf8');
  return {
    usesLocalShim: /from ['"]\.\/src\/devtools\/aiSdkProfiler['"]/.test(body),
    bootstrapBehindDev: /__DEV__\s*\?\s*<DevToolsBootstrap\s*\/>/.test(body),
    hasDevToolsBootstrap: /function DevToolsBootstrap/.test(body),
  };
}

function packageScripts() {
  const pkg = readJson(path.join(root, 'package.json'));
  return {
    hasRozeniteMetro: Boolean(pkg.devDependencies && pkg.devDependencies['@rozenite/metro']),
    hasAiDevTools: Boolean(pkg.dependencies && pkg.dependencies['@react-native-ai/dev-tools']),
    hasReassure: Boolean(pkg.devDependencies && pkg.devDependencies.reassure),
    hasAgentDevice: Boolean(pkg.devDependencies && pkg.devDependencies['agent-device']),
    scripts: {
      'devtools:rozenite': pkg.scripts['devtools:rozenite'] || null,
      'devtools:ai-sdk-profiler': pkg.scripts['devtools:ai-sdk-profiler'] || null,
      'perf:ai-sdk-profiler:proof': pkg.scripts['perf:ai-sdk-profiler:proof'] || null,
      'test:perf': pkg.scripts['test:perf'] || null,
      'e2e:fast': pkg.scripts['e2e:fast'] || null,
    },
  };
}

function runReassureSmoke() {
  const result = spawnSync(
    'npx',
    ['reassure', '--version'],
    { cwd: root, encoding: 'utf8', timeout: 30000 },
  );
  return {
    exitCode: result.status,
    stdout: (result.stdout || '').trim().slice(0, 200),
    stderr: (result.stderr || '').trim().slice(0, 200),
  };
}

function main() {
  const pkgInfo = tryRequireDevTools();
  const metro = metroWiring();
  const app = appWiring();
  const scripts = packageScripts();
  const reassure = runReassureSmoke();

  const blockers = [];
  if (!pkgInfo.installed) {
    blockers.push('package_not_installed');
  }
  if (pkgInfo.installed && !pkgInfo.hasDistMain && !pkgInfo.hasSourceEntry) {
    blockers.push('no_resolvable_entry');
  }
  if (pkgInfo.installed && !pkgInfo.hasDistMain) {
    blockers.push(
      'npm_tarball_missing_dist — panel discovery needs dist/rozenite.json; Metro can still load react-native.ts',
    );
  }
  if (pkgInfo.installed && !pkgInfo.hasRozeniteManifest) {
    blockers.push('rozenite_manifest_missing_until_plugin_build');
  }
  if (!metro.hasWithRozenite || !metro.gatedByWithRozeniteEnv) {
    blockers.push('metro_not_opt_in_wired');
  }
  if (!app.bootstrapBehindDev) {
    blockers.push('app_not_dev_gated');
  }

  // Hermes chat is gateway HTTP — not Vercel AI SDK — so live chat spans are N/A.
  const fit = {
    expoSdk: '55',
    reactNative: scripts.hasAiDevTools ? 'peer * (compatible)' : 'unknown',
    hermesUsesVercelAiSdk: false,
    profilesChatListJitter: false,
    profilesAiSdkOtelSpans: true,
    closestPathForChatJitter: ['npm run test:perf (Reassure)', 'npm run perf:flashlight', 'appPerformance JS lag'],
    agentDeviceParallel: 'npm run e2e:fast / e2e:accelerated — Maestro acceleration, not AI span UI',
  };

  const status =
    blockers.length === 0
      ? 'ready'
      : blockers.every((b) => b.startsWith('npm_tarball') || b.startsWith('rozenite_manifest'))
        ? 'partial_metro_source_ok'
        : 'blocked';

  const proof = {
    generatedAt: new Date().toISOString(),
    tool: '@react-native-ai/dev-tools (Callstack AI SDK Profiler)',
    blog: 'https://www.callstack.com/blog/announcing-ai-sdk-profiler-for-react-native',
    npm: 'https://www.npmjs.com/package/@react-native-ai/dev-tools',
    status,
    blockers,
    package: pkgInfo,
    metro,
    app,
    scripts,
    reassureCli: reassure,
    fit,
    invoke: {
      metroWithProfiler: 'WITH_ROZENITE=true npm start',
      openPanel: 'React Native DevTools → AI SDK Profiler (requires Rozenite discovery + AI SDK telemetry)',
      proof: 'npm run perf:ai-sdk-profiler:proof',
      chatJitterBaseline: 'npm run test:perf',
    },
    docs: {
      agent: 'docs/AI-SDK-PROFILER.md',
      perf: 'docs/PERFORMANCE.md',
    },
    relatedArtifacts: {
      reassurePerfTests: exists('src/__perf__/chatMessageDisplay.perf-test.ts'),
      thisProof: path.relative(root, outFile),
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({ ok: status !== 'blocked', status, outFile, blockers }, null, 2));
  process.exit(status === 'blocked' ? 1 : 0);
}

main();
