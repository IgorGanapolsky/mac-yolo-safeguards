import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

describe('iOS simulator E2E embedded Release lifecycle', () => {
  it('fresh-installs the exact source with an embedded bundle and no host Metro dependency', () => {
    const script = fs.readFileSync(
      path.join(repoRoot, 'hermes-mobile/scripts/run-simulator-e2e.sh'),
      'utf8',
    );
    const uninstallIndex = script.indexOf(
      'xcrun simctl uninstall "$udid" "$IOS_BUNDLE_ID"',
    );
    const releaseInstallIndex = script.indexOf(
      'npx expo run:ios --no-bundler --device "$udid" --configuration Release',
    );
    const containerGoneCheckIndex = script.indexOf(
      'Stale $IOS_BUNDLE_ID container remains after uninstall',
    );
    const bundleCheckIndex = script.indexOf(
      '[[ ! -s "$app_path/main.jsbundle" ]]',
    );

    expect(script).toContain(
      'export EXPO_PUBLIC_E2E_AUTOMATION="${EXPO_PUBLIC_E2E_AUTOMATION:-1}"',
    );
    expect(script).toContain('export SENTRY_DISABLE_AUTO_UPLOAD=true');
    expect(script).toContain(
      'if maestro list-devices >/dev/null 2>&1; then',
    );
    expect(script).not.toContain("grep -Fqi 'iPhone'");
    expect(script).not.toContain('expo start --dev-client');
    expect(script).not.toContain('ensure_metro_running');
    expect(script).not.toContain('already installed');
    expect(script).not.toContain('open -a Simulator');
    expect(script).not.toContain(
      'xcrun simctl uninstall "$udid" "$IOS_BUNDLE_ID" >/dev/null 2>&1 || true',
    );
    expect(uninstallIndex).toBeGreaterThan(-1);
    expect(containerGoneCheckIndex).toBeGreaterThan(uninstallIndex);
    expect(releaseInstallIndex).toBeGreaterThan(containerGoneCheckIndex);
    expect(bundleCheckIndex).toBeGreaterThan(releaseInstallIndex);
  });
});
