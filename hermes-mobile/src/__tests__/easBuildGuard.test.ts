import { spawnSync } from 'child_process';
import path from 'path';

describe('EAS build guard process contract', () => {
  const guard = path.resolve(__dirname, '../../scripts/eas-build-guard.cjs');

  it('keeps child JSON parseable on stdout and writes diagnostics to stderr', () => {
    const expected = [{ id: 'artifact', status: 'FINISHED' }];
    const result = spawnSync(
      process.execPath,
      [
        guard,
        '--platform',
        'android',
        '--profile',
        'production',
        '--commit',
        'test-commit',
        '--skip-usage',
        '--skip-duplicate',
        '--',
        process.execPath,
        '-e',
        `process.stdout.write(${JSON.stringify(JSON.stringify(expected))})`,
      ],
      {
        encoding: 'utf8',
        // Unit test bypasses overage hard-stop; production CI/agents do not set this.
        env: {
          ...process.env,
          HERMES_EAS_ALLOW_CLOUD_BUILD: 'YES_CLOUD_EAS_DESPITE_OVERAGE',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expected);
    expect(result.stdout).not.toContain('Hermes EAS build guard');
    expect(result.stderr).toContain(
      'Hermes EAS build guard: PASS (ANDROID/production/test-commit)',
    );
  });

  it('hard-stops Expo cloud builds during Starter overage window', () => {
    const result = spawnSync(
      process.execPath,
      [
        guard,
        '--platform',
        'android',
        '--profile',
        'production',
        '--commit',
        'test-commit',
        '--skip-usage',
        '--skip-duplicate',
        '--dry-run',
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          HERMES_EAS_CLOUD_HARD_STOP_UNTIL: '2026-07-22',
          HERMES_EAS_ALLOW_CLOUD_BUILD: '',
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toMatch(/HARD-STOPPED until 2026-07-22/);
  });
});
