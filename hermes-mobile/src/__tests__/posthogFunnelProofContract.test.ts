import { spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '../..');
const proofScript = path.join(mobileRoot, 'scripts/prove-posthog-funnel.sh');
const analyticsSource = path.join(mobileRoot, 'src/services/productAnalytics.ts');

function proofEnvironment(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env = { ...process.env, ...overrides };
  delete env.EXPO_PUBLIC_POSTHOG_API_KEY;
  delete env.EXPO_PUBLIC_POSTHOG_KEY;
  return { ...env, ...overrides };
}

describe('PostHog funnel proof key contract', () => {
  it('uses the same public API key name as the production analytics client', () => {
    const script = readFileSync(proofScript, 'utf8');
    const analytics = readFileSync(analyticsSource, 'utf8');

    expect(analytics).toContain('EXPO_PUBLIC_POSTHOG_API_KEY');
    expect(script).toContain('EXPO_PUBLIC_POSTHOG_API_KEY');
    expect(script).not.toMatch(/EXPO_PUBLIC_POSTHOG_KEY/);
  });

  it('rejects the obsolete key instead of reporting a false proof', () => {
    const result = spawnSync('bash', [proofScript], {
      cwd: mobileRoot,
      env: proofEnvironment({ EXPO_PUBLIC_POSTHOG_KEY: 'legacy-key' }),
      encoding: 'utf8',
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('set EXPO_PUBLIC_POSTHOG_API_KEY');
  });

  it('accepts the production key and reaches the capture endpoint contract', () => {
    const fakeBin = mkdtempSync(path.join(tmpdir(), 'hermes-posthog-proof-'));
    const fakeAdb = path.join(fakeBin, 'adb');
    const fakeCurl = path.join(fakeBin, 'curl');
    const fakeSleep = path.join(fakeBin, 'sleep');

    try {
      writeFileSync(fakeAdb, '#!/usr/bin/env bash\nexit 0\n');
      writeFileSync(fakeCurl, '#!/usr/bin/env bash\nprintf 200\n');
      writeFileSync(fakeSleep, '#!/usr/bin/env bash\nexit 0\n');
      [fakeAdb, fakeCurl, fakeSleep].forEach((file) => chmodSync(file, 0o755));

      const result = spawnSync('bash', [proofScript], {
        cwd: mobileRoot,
        env: proofEnvironment({
          EXPO_PUBLIC_POSTHOG_API_KEY: 'phc_production-contract',
          HERMES_ANDROID_DEVICE: 'contract-device',
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        }),
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('PASS: capture accepted (HTTP 200)');
    } finally {
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });
});
