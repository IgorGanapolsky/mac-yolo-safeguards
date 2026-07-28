import fs from 'fs';
import path from 'path';

const mobileRoot = path.resolve(__dirname, '../..');
const flow = fs.readFileSync(
  path.join(mobileRoot, '.maestro/ipad-simulator-edge-cases.yaml'),
  'utf8',
);
const ipadRunner = fs.readFileSync(
  path.join(mobileRoot, 'scripts/run-ipad-simulator-e2e.sh'),
  'utf8',
);
const continuousWorkflow = fs.readFileSync(
  path.join(mobileRoot, '../.github/workflows/mobile-continuous.yml'),
  'utf8',
);

describe('iPad simulator fresh-user edge-case flow', () => {
  it('starts from cleared real-user state and never enables demo automation', () => {
    expect(flow).toContain('appId: com.iganapolsky.hermesmobile');
    expect(flow).toMatch(/launchApp:\s*\n\s+clearState:\s*true/);
    expect(flow).not.toMatch(/demo=1|hermes:\/\/setup|EXPO_PUBLIC_E2E_AUTOMATION=1/);
    expect(flow).not.toContain('dismiss-notification-permission.yaml');
    expect(flow).not.toContain('dismiss-print-interruption.yaml');
  });

  it('captures the complete fresh-user gate before dismissing it', () => {
    const gateIndex = flow.indexOf('id: "connect-mac-gate"');
    const dismissTapIndex = flow.indexOf('- tapOn:\n    id: "connect-mac-gate-dismiss"');
    const gateScreenshotIndex = flow.indexOf('fresh-user-connect-gate');
    const firstScrollIndex = flow.indexOf('- scrollUntilVisible:');

    expect(gateIndex).toBeGreaterThan(-1);
    expect(dismissTapIndex).toBeGreaterThan(gateIndex);
    expect(gateScreenshotIndex).toBeGreaterThan(gateIndex);
    expect(firstScrollIndex).toBeGreaterThan(gateScreenshotIndex);
    expect(flow).toContain('id: "connect-mac-onboarding-card"');
    expect(flow).toContain('id: "connect-manual-input"');
    expect(flow).toContain('id: "connect-manual-submit"');
    expect(flow).toContain('id: "connect-search-wifi"');
    expect(flow).toContain('assertNotVisible: "Reconnecting"');
    expect(flow).toContain('fresh-user-connect-gate');
  });

  it('keeps every onboarding action reachable at maximum Dynamic Type', () => {
    for (const control of [
      'connect-manual-input',
      'connect-manual-submit',
      'connect-search-wifi',
    ]) {
      expect(flow).toMatch(
        new RegExp(
          `scrollUntilVisible:\\s*\\n\\s+element:\\s*\\n\\s+id: "${control}"`,
        ),
      );
    }
    expect(flow).toMatch(
      /id: "connect-mac-gate-dismiss"\s*\n\s+direction: UP/,
    );
  });

  it('proves every bottom tab stays reachable after hiding the keyboard', () => {
    for (const tab of ['tab-hermes', 'tab-leash', 'tab-settings']) {
      expect(flow).toContain(`id: "${tab}"`);
    }
    expect(flow).toContain('id: "THUMBGATE_LEASH"');
    expect(flow).toContain('id: "SETTINGS"');
    expect(flow).not.toContain('runFlow: fresh-user-tabs.yaml');
    expect(flow).not.toContain('runFlow: hide-keyboard-safe.yaml');
    expect(flow.match(/- hideKeyboard/g)).toHaveLength(2);
    expect(flow).toContain('tabs-safe-area');
    expect(flow).toContain('composer-and-tabs');
  });

  it('guards the iOS same-value Fabric input regression', () => {
    const promptEntries = flow.match(/inputText: "make money today"/g) ?? [];
    const firstPrompt = flow.indexOf('inputText: "make money today"');
    const secondPrompt = flow.indexOf('inputText: "make money today"', firstPrompt + 1);
    const interveningErase = flow.indexOf('eraseText: 100', firstPrompt);

    expect(promptEntries).toHaveLength(3);
    expect(firstPrompt).toBeGreaterThan(-1);
    expect(interveningErase).toBeGreaterThan(firstPrompt);
    expect(secondPrompt).toBeGreaterThan(interveningErase);
    expect(flow).toContain('point: "95%,50%"');
  });

  it('cold-relaunches without clearing state and rechecks native focus', () => {
    const relaunchIndex = flow.lastIndexOf('- launchApp:');
    const relaunchSlice = flow.slice(relaunchIndex);

    expect(relaunchSlice).toMatch(/clearState:\s*false/);
    expect(relaunchSlice).toContain('assertNotVisible:\n    id: "connect-mac-gate"');
    expect(relaunchSlice).toContain('id: "chat-input"');
    expect(relaunchSlice).toContain('inputText: "make money today"');
    expect(relaunchSlice).not.toContain('inputText: "relaunch focus works"');
    expect(relaunchSlice).toContain('relaunch-safe-area');
  });

  it('strictly selects an iPad before delegating to the shared simulator runner', () => {
    expect(ipadRunner).toContain('xcrun simctl list devices available -j');
    expect(ipadRunner).toContain('device.name.startsWith("iPad")');
    expect(ipadRunner).toContain('xcrun simctl shutdown all');
    expect(ipadRunner).toContain('xcrun simctl boot "$IPAD_UDID"');
    expect(ipadRunner).toContain('booted.length !== 1');
    expect(ipadRunner).toContain('EXPO_PUBLIC_E2E_AUTOMATION=0');
    expect(ipadRunner).toContain('bash "$SIMULATOR_RUNNER" "$FLOW"');
  });

  it('runs the strict real-user iPad matrix inside the required macOS E2E job', () => {
    const macosJob = continuousWorkflow.slice(
      continuousWorkflow.indexOf('macos-maestro-smoke:'),
    );

    expect(macosJob).toContain('name: Maestro ship-guard (macOS sim)');
    expect(macosJob).toContain('timeout-minutes: 75');
    expect(macosJob).toContain(
      'bash ./scripts/run-ipad-simulator-e2e.sh .maestro/ipad-simulator-edge-cases.yaml',
    );
  });
});
