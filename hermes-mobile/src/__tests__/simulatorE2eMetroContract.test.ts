import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('iOS simulator E2E Metro lifecycle', () => {
  it('requires a live Metro server before installing the development client', () => {
    const script = fs.readFileSync(
      path.join(repoRoot, 'hermes-mobile/scripts/run-simulator-e2e.sh'),
      'utf8',
    );
    const metroGateIndex = script.lastIndexOf('\nensure_metro_running\n');
    const installIndex = script.lastIndexOf('\nensure_ios_app_installed "$UDID"\n');

    expect(script).toContain(
      'CI=1 npx expo start --dev-client --lan --port "$METRO_PORT"',
    );
    expect(script).toContain(
      'mktemp "${TMPDIR:-/tmp}/hermes-metro.XXXXXX"',
    );
    expect(script).not.toMatch(/mktemp .*XXXXXX\.[A-Za-z0-9_-]+/);
    expect(script).toContain('"packager-status:running"');
    expect(script).toContain('trap cleanup_owned_metro EXIT');
    expect(script).toContain("trap 'exit 130' INT");
    expect(script).toContain("trap 'exit 143' TERM");
    expect(script).toContain(
      'npx expo run:ios --no-bundler --device "$udid" --port "$METRO_PORT"',
    );
    expect(metroGateIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(metroGateIndex);
    expect(script).not.toContain(
      'Metro:     not detected on :8081 — install may use embedded bundle only',
    );
  });
});
