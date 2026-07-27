import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('chat Maestro bootstrap navigation recovery', () => {
  it('recovers Chat after the shared bootstrap intentionally leaves the app on Leash', () => {
    const launch = read('hermes-mobile/.maestro/launch.yaml');
    const bootstrapIndex = launch.indexOf('runFlow: e2e-bootstrap.yaml');
    const recoveryIndex = launch.indexOf('runFlow: recover-chat-tab.yaml');
    const chatAssertionIndex = launch.indexOf('id: "HERMES CHAT"');

    expect(bootstrapIndex).toBeGreaterThan(-1);
    expect(recoveryIndex).toBeGreaterThan(bootstrapIndex);
    expect(chatAssertionIndex).toBeGreaterThan(recoveryIndex);
  });

  it('foregrounds the already-loaded Expo development client without stopping it', () => {
    const shipGuard = read('hermes-mobile/.maestro/ship-guard.yaml');
    const commands = shipGuard.slice(shipGuard.indexOf('---') + 3).trimStart();

    expect(commands).toMatch(/^- launchApp:\s*\n\s+stopApp: false\b/);
    expect(commands).not.toMatch(/^- launchApp\s*$/m);
  });

  it('delegates a missing Chat screen to the guarded recovery flow', () => {
    const bootstrap = read('hermes-mobile/.maestro/chat-e2e-bootstrap.yaml');
    const recover = read('hermes-mobile/.maestro/recover-chat-tab.yaml');
    const recoveryIndex = bootstrap.indexOf('runFlow: recover-chat-tab.yaml');
    const chatReadyIndex = bootstrap.indexOf('id: "chat-screen-header"');

    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(chatReadyIndex).toBeGreaterThan(recoveryIndex);
    expect(bootstrap).not.toContain('id: "tab-hermes"');

    expect(recover).toMatch(
      /extendedWaitUntil:\s*\n\s*visible:\s*\n\s*id: "tab-hermes"[\s\S]*?tapOn:\s*\n\s*id: "tab-hermes"/,
    );
    expect(recover).toContain('hermes://setup?demo=1&recover=1');
    expect(recover).not.toContain('hermes://chat');
    expect((recover.match(/text: "Open"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((recover.match(/stopApp: false/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(recover).not.toMatch(/^\s*-\s+launchApp\s*$/m);
    expect(recover.indexOf('id: "tab-hermes"')).toBeLessThan(
      recover.indexOf('id: "chat-screen-header"'),
    );
  });
});
