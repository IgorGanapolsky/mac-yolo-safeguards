import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '../..');

describe('AI SDK Profiler contract', () => {
  const metro = fs.readFileSync(path.join(root, 'metro.config.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const shim = fs.readFileSync(path.join(root, 'src/devtools/aiSdkProfiler.ts'), 'utf8');

  it('opts Rozenite Metro in only via WITH_ROZENITE=true', () => {
    expect(metro).toContain("WITH_ROZENITE === 'true'");
    expect(metro).toContain('withRozenite');
    expect(metro).toContain('getSentryExpoConfig');
  });

  it('boots profiler only in __DEV__ through the local shim', () => {
    expect(app).toContain("from './src/devtools/aiSdkProfiler'");
    expect(app).toContain('__DEV__ ? <DevToolsBootstrap />');
    expect(shim).toContain('@react-native-ai/dev-tools/react-native');
  });

  it('keeps agent scripts for proof, Reassure, and agent-device', () => {
    expect(pkg.dependencies['@react-native-ai/dev-tools']).toBeTruthy();
    expect(pkg.devDependencies['@rozenite/metro']).toBeTruthy();
    expect(pkg.scripts['perf:ai-sdk-profiler:proof']).toContain('ai-sdk-profiler-proof');
    expect(pkg.scripts['test:perf']).toBe('reassure');
    expect(pkg.scripts['e2e:fast']).toContain('agent-device');
  });
});
