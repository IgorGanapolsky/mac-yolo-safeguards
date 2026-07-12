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
      { encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expected);
    expect(result.stdout).not.toContain('Hermes EAS build guard');
    expect(result.stderr).toContain(
      'Hermes EAS build guard: PASS (ANDROID/production/test-commit)',
    );
  });
});
