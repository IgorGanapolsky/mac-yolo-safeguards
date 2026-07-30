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

  it('clears the composer from the end before each repeated prompt entry', () => {
    const composer = read('hermes-mobile/.maestro/regression-composer-typeable.yaml');

    expect((composer.match(/point: "95%,50%"/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((composer.match(/eraseText: 100/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((composer.match(/inputText: "make money today"/g) ?? []).length).toBe(2);

    // Both the clear and the retype are awaited EXPLICITLY. `eraseText`/`inputText`
    // return when keystrokes are dispatched, not when the controlled TextInput has
    // committed the value, so a bare `assertVisible` here races the render and is
    // only covered by Maestro's short implicit smart wait. A tapOn between erase and
    // input re-focuses but does not wait, which is why each side needs its own wait.
    expect((composer.match(/assertVisible: "make money today"/g) ?? []).length).toBe(0);
    expect(
      (composer.match(/extendedWaitUntil:\s*\n\s*visible: "make money today"\s*\n\s*timeout: \d+/g) ?? [])
        .length,
    ).toBe(2);

    // The empty-composer proof is the PLACEHOLDER, which renders only while the value is
    // the empty string. The old `notVisible: "make money today"` form is banned: it goes
    // true after a single character is deleted, so the retype could still interleave with
    // an in-flight clear, and it is already true over an unrelated leftover draft.
    // Executable steps only — `#` comment lines legitimately name the banned pattern.
    const composerSteps = composer
      .split(/\r?\n/)
      .filter((line) => !/^\s*#/.test(line))
      .join('\n');
    expect(composerSteps).not.toContain('notVisible: "make money today"');
    expect(
      (composer.match(
        /extendedWaitUntil:\s*\n\s*visible: "Type a message to Hermes\|Message your computer…"\s*\n\s*timeout: \d+/g,
      ) ?? []).length,
    ).toBe(3);
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
