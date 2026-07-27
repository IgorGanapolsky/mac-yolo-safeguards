import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('chat Maestro bootstrap navigation recovery', () => {
  it('delegates a missing Chat screen to the guarded recovery flow', () => {
    const bootstrap = read('hermes-mobile/.maestro/chat-e2e-bootstrap.yaml');
    const recover = read('hermes-mobile/.maestro/recover-chat-tab.yaml');
    const recoveryIndex = bootstrap.indexOf('runFlow: recover-chat-tab.yaml');
    const chatReadyIndex = bootstrap.indexOf('id: "chat-screen-header"');

    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(chatReadyIndex).toBeGreaterThan(recoveryIndex);
    expect(bootstrap).not.toContain('id: "tab-hermes"');

    expect(recover).toMatch(
      /when:\s*\n\s*visible:\s*\n\s*id: "tab-hermes"[\s\S]*?tapOn:\s*\n\s*id: "tab-hermes"/,
    );
    expect(recover).toContain('hermes://setup?demo=1&recover=1');
    expect(recover).toContain('hermes://chat');
    expect((recover.match(/text: "Open"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect((recover.match(/stopApp: false/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(recover).toMatch(
      /when:\s*\n\s*notVisible:\s*\n\s*id: "chat-screen-header"\s*\n\s*commands:\s*\n\s*- launchApp\s*\n\s*- extendedWaitUntil:\s*\n\s*notVisible:\s*\n\s*id: "hermes-bootstrap"/,
    );
  });
});
