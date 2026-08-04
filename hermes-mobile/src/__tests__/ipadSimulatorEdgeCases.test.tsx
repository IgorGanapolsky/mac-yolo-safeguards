import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const mobileRoot = path.resolve(__dirname, '../..');
const flow = fs.readFileSync(
  path.join(mobileRoot, '.maestro/ipad-simulator-edge-cases.yaml'),
  'utf8',
);
const ipadRunner = fs.readFileSync(
  path.join(mobileRoot, 'scripts/run-ipad-simulator-e2e.sh'),
  'utf8',
);
const ipadWorkflow = fs.readFileSync(
  path.join(mobileRoot, '../.github/workflows/ipad-simulator-e2e.yml'),
  'utf8',
);
const continuousWorkflow = fs.readFileSync(
  path.join(mobileRoot, '../.github/workflows/mobile-continuous.yml'),
  'utf8',
);

/**
 * Every value typed into the composer must be awaited with an EXPLICIT wait that
 * carries its own timeout, never a bare `assertVisible` relying on Maestro's
 * implicit smart wait. Flake evidence 2026-07-29: the retype step passed four
 * consecutive runs then failed with `Assertion is false: "make money today" is
 * visible` on identical app code, because the erase/re-input pair races the
 * controlled RN TextInput and the implicit wait is too short on a loaded CI sim.
 */
const awaitedVisible = (value: string) =>
  new RegExp(
    `extendedWaitUntil:\\s*\\n\\s+visible: "${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\n\\s+timeout: \\d+`,
  );

/**
 * An empty composer is proven by its PLACEHOLDER, which React Native renders only while
 * the TextInput value is the empty string. `notVisible: "<draft>"` is NOT an empty proof —
 * it goes true the instant one character is deleted, and it is already true when the
 * composer holds any unrelated draft, so it would let a retype interleave with an
 * in-flight clear (the exact race this flow guards).
 */
const COMPOSER_EMPTY = 'Type a message to Hermes|Message your computer…';

const awaitedComposerEmpty = new RegExp(
  `extendedWaitUntil:\\s*\\n\\s+visible: "${COMPOSER_EMPTY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\n\\s+timeout: \\d+`,
);

/** Executable steps only — `#` comment lines legitimately name the banned patterns. */
const stepsOnly = (yaml: string) =>
  yaml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

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

  it('proves onboarding and the focused composer survive iPad rotation', () => {
    const onboardingScreenshot = flow.indexOf('fresh-user-connect-gate');
    const dismissTap = flow.indexOf('- tapOn:\n    id: "connect-mac-gate-dismiss"');
    const leftRotation = flow.indexOf('- setOrientation: LANDSCAPE_LEFT');
    const rightRotation = flow.indexOf('- setOrientation: LANDSCAPE_RIGHT');
    const firstPortraitReset = flow.indexOf('- setOrientation: PORTRAIT');
    const firstComposerText = flow.indexOf('inputText: "make money today"');
    const secondComposerText = flow.indexOf(
      'inputText: "make money today"',
      firstComposerText + 1,
    );
    const composerRotation = flow.indexOf(
      '- setOrientation: LANDSCAPE_LEFT',
      secondComposerText,
    );
    const composerLandscapeScreenshot = flow.indexOf('composer-landscape-keyboard');

    expect(leftRotation).toBeGreaterThan(onboardingScreenshot);
    expect(rightRotation).toBeGreaterThan(leftRotation);
    expect(firstPortraitReset).toBeGreaterThan(rightRotation);
    expect(dismissTap).toBeGreaterThan(firstPortraitReset);
    expect(flow).toContain('onboarding-landscape-left');
    expect(flow).toContain('onboarding-landscape-right');
    expect(composerRotation).toBeGreaterThan(secondComposerText);
    expect(composerLandscapeScreenshot).toBeGreaterThan(composerRotation);
    expect(flow).toContain('inputText: "!"');
    expect(flow).toMatch(awaitedVisible('make money today!'));
    expect(flow).toContain('inputText: "?"');
    expect(flow).toMatch(awaitedVisible('make money today!?'));
    expect(flow).toContain('inputText: "#"');
    expect(flow).toMatch(awaitedVisible('make money today!?#'));
    expect(flow).toContain('inputText: "."');
    expect(flow).toMatch(awaitedVisible('make money today!?#.'));
    expect(flow.match(/- setOrientation: PORTRAIT/g)).toHaveLength(3);
    expect(flow.match(/- setOrientation: UPSIDE_DOWN/g)).toHaveLength(1);
    expect(flow.match(/- setOrientation: LANDSCAPE_RIGHT/g)).toHaveLength(2);
  });

  it('backgrounds and resumes the focused draft without restarting the app', () => {
    const backgroundIndex = flow.indexOf('- pressKey: Home');
    const resumeIndex = flow.indexOf('stopApp: false', backgroundIndex);
    const resumeSlice = flow.slice(backgroundIndex);

    expect(backgroundIndex).toBeGreaterThan(-1);
    expect(resumeIndex).toBeGreaterThan(backgroundIndex);
    expect(resumeSlice).toMatch(awaitedVisible('make money today!?#.'));
    expect(resumeSlice).toContain('point: "95%,50%"');
    expect(resumeSlice).toContain('inputText: "+"');
    expect(resumeSlice).toMatch(awaitedVisible('make money today!?#.+'));
  });

  it('does not steal focus after an intentional keyboard dismissal and rotation', () => {
    const resumedDraft = flow.indexOf('visible: "make money today!?#.+"');
    const hideKeyboard = flow.indexOf('- hideKeyboard', resumedDraft);
    const rotation = flow.indexOf('- setOrientation: LANDSCAPE_LEFT', hideKeyboard);
    const unrequestedInput = flow.indexOf('inputText: "x"', rotation);
    // A negative contract cannot be awaited, so the flow must settle first and then
    // prove BOTH that the stray character was dropped and that the draft is intact.
    // Without the settle the notVisible assert could pass before "x" ever rendered.
    const settle = flow.indexOf('- waitForAnimationToEnd:', unrequestedInput);
    const strayDropped = flow.indexOf(
      'assertNotVisible: "make money today!?#.+x"',
      unrequestedInput,
    );
    const unchangedDraft = flow.indexOf(
      'assertVisible: "make money today!?#.+"',
      unrequestedInput,
    );

    expect(resumedDraft).toBeGreaterThan(-1);
    expect(hideKeyboard).toBeGreaterThan(resumedDraft);
    expect(rotation).toBeGreaterThan(hideKeyboard);
    expect(unrequestedInput).toBeGreaterThan(rotation);
    expect(settle).toBeGreaterThan(unrequestedInput);
    expect(strayDropped).toBeGreaterThan(settle);
    expect(unchangedDraft).toBeGreaterThan(strayDropped);
  });

  it('proves every bottom tab stays reachable after hiding the keyboard', () => {
    for (const tab of ['tab-hermes', 'tab-leash', 'tab-settings']) {
      expect(flow).toContain(`id: "${tab}"`);
    }
    expect(flow).toContain('id: "THUMBGATE_LEASH"');
    expect(flow).toContain('id: "SETTINGS"');
    expect(flow).not.toContain('runFlow: fresh-user-tabs.yaml');
    expect(flow).not.toContain('runFlow: hide-keyboard-safe.yaml');
    expect(flow.match(/- hideKeyboard/g)).toHaveLength(3);
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

    // The regression this flow guards is a RACE, so the erase must be proven to
    // have fully cleared the composer before the same value is retyped. Retyping
    // while the clear is still in flight is what produced the observed
    // `Assertion is false` failure on otherwise-passing app code.
    expect(flow).toMatch(awaitedComposerEmpty);
    const eraseSettled = flow.indexOf(`visible: "${COMPOSER_EMPTY}"`, interveningErase);
    expect(eraseSettled).toBeGreaterThan(interveningErase);
    expect(secondPrompt).toBeGreaterThan(eraseSettled);

    // And the weaker substring-absence form must never come back: it is satisfied by a
    // partial erase and by a leftover unrelated draft.
    expect(stepsOnly(flow)).not.toContain('notVisible: "make money today"');
  });

  it('never leaves a text mutation without an explicit wait', () => {
    // Guards the whole flow, not just the known sites. TWO offending shapes:
    //   mutation -> assertion  (assertion rides Maestro's implicit smart wait)
    //   mutation -> mutation   (eraseText -> inputText: THE original regression,
    //                          which contains no assertion at all)
    const steps = flow.split(/\r?\n/).filter((line) => /^\s*-\s/.test(line));
    const offenders: string[] = [];
    for (let i = 0; i < steps.length - 1; i += 1) {
      if (!/^\s*-\s*(inputText|eraseText)\b/.test(steps[i])) continue;
      const next = steps[i + 1];
      if (
        /^\s*-\s*(assertVisible|assertNotVisible|assertTrue)\b/.test(next) ||
        /^\s*-\s*(inputText|eraseText)\b/.test(next)
      ) {
        offenders.push(`${steps[i].trim()} -> ${next.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('cold-relaunches without clearing state and rechecks native focus', () => {
    const relaunchIndex = flow.lastIndexOf('- launchApp:');
    const relaunchSlice = flow.slice(relaunchIndex);
    const settleIndex = relaunchSlice.indexOf('- waitForAnimationToEnd:');
    const bootstrapIndex = relaunchSlice.indexOf('id: "hermes-bootstrap"');

    expect(relaunchSlice).toMatch(/clearState:\s*false/);
    expect(settleIndex).toBeGreaterThan(-1);
    expect(settleIndex).toBeLessThan(bootstrapIndex);
    expect(relaunchSlice).toContain('assertNotVisible:\n    id: "connect-mac-gate"');
    expect(relaunchSlice).toContain('id: "chat-input"');
    expect(relaunchSlice).toContain('inputText: "make money today"');
    expect(relaunchSlice).not.toContain('inputText: "relaunch focus works"');
    expect(relaunchSlice).toContain('relaunch-safe-area');
  });

  it('creates and deletes a disposable iPad before delegating to the shared simulator runner', () => {
    expect(ipadRunner).toContain('xcrun simctl list devices available -j');
    expect(ipadRunner).toContain('device.name.startsWith("iPad")');
    expect(ipadRunner).toContain('device.deviceTypeIdentifier');
    expect(ipadRunner).toContain('xcrun simctl create');
    expect(ipadRunner).toContain('trap cleanup EXIT');
    expect(ipadRunner).toContain('xcrun simctl delete "$IPAD_UDID"');
    expect(ipadRunner).not.toContain('xcrun simctl erase');
    expect(ipadRunner).toContain('xcrun simctl shutdown all');
    expect(ipadRunner).toContain('xcrun simctl boot "$IPAD_UDID"');
    expect(ipadRunner).toContain('booted.length !== 1');
    expect(ipadRunner).toContain('EXPO_PUBLIC_E2E_AUTOMATION=0');
    expect(ipadRunner).toContain('bash "$SIMULATOR_RUNNER" "$FLOW"');
    expect(ipadRunner).toContain('E2E_LEASE_DIR="${YOLO_E2E_LEASE_DIR:-/tmp/yolo-guard-e2e}"');
    expect(ipadRunner).toContain('printf \'%s\\n\' "$$" >"$E2E_LEASE_FILE"');
    expect(ipadRunner).toContain('rm -f "$E2E_LEASE_FILE"');
    expect(ipadRunner).toContain('trap - EXIT');
    expect(ipadRunner).toContain('for attempt in 1 2');
    expect(ipadRunner).toContain(
      'device.udid === process.env.IPAD_UDID',
    );
    expect(ipadRunner).toContain(
      'Failed to delete disposable iPad simulator $IPAD_UDID',
    );
    expect(ipadRunner).not.toContain(
      'xcrun simctl delete "$IPAD_UDID" >/dev/null 2>&1 || true',
    );
  });

  it('fails the gate instead of printing PASS when simulator deletion cannot be verified', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ipad-cleanup-test-'));
    const fakeXcrun = path.join(tempRoot, 'xcrun');
    const fakeRunner = path.join(tempRoot, 'runner.sh');
    const leaseDir = path.join(tempRoot, 'leases');

    fs.writeFileSync(
      fakeXcrun,
      `#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == "simctl list devices available -j" ]]; then
  printf '%s\\n' '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-18-5":[{"name":"iPad Test","udid":"TEMPLATE-UDID","state":"Shutdown","isAvailable":true,"deviceTypeIdentifier":"com.apple.CoreSimulator.SimDeviceType.iPad"}]}}'
elif [[ "$1 $2" == "simctl create" ]]; then
  printf '%s\\n' 'DISPOSABLE-UDID'
elif [[ "$*" == "simctl list devices booted -j" ]]; then
  printf '%s\\n' '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-18-5":[{"name":"iPad Hermes E2E test","udid":"DISPOSABLE-UDID","state":"Booted"}]}}'
elif [[ "$*" == "simctl list devices -j" ]]; then
  printf '%s\\n' '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-18-5":[{"name":"iPad Hermes E2E test","udid":"DISPOSABLE-UDID","state":"Shutdown"}]}}'
elif [[ "$1 $2" == "simctl delete" ]]; then
  exit 1
fi
`,
      { mode: 0o755 },
    );
    fs.writeFileSync(fakeRunner, '#!/usr/bin/env bash\nexit 0\n', {
      mode: 0o755,
    });

    try {
      const result = spawnSync(
        'bash',
        [path.join(mobileRoot, 'scripts/run-ipad-simulator-e2e.sh')],
        {
          cwd: mobileRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${tempRoot}:${process.env.PATH ?? ''}`,
            HERMES_SIMULATOR_RUNNER: fakeRunner,
            YOLO_E2E_LEASE_DIR: leaseDir,
          },
          timeout: 5_000,
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Failed to delete disposable iPad simulator DISPOSABLE-UDID',
      );
      expect(result.stdout).not.toContain('Strict iPad Simulator E2E: PASS');
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('gates mobile changes on strict iPad E2E without charging unrelated PRs', () => {
    expect(ipadWorkflow).toContain('name: Hermes Mobile iPad Simulator E2E');
    expect(ipadWorkflow).toContain('name: Real-user iPad simulator E2E');
    expect(ipadWorkflow).toContain('name: Hermes Mobile iPad simulator gate');
    expect(ipadWorkflow).toContain(
      'runs-on: ${{ fromJSON(\'["self-hosted", "ipad-simulator"]\') }}',
    );
    expect(ipadWorkflow).toContain(
      'does not carry the generic `hermes-e2e` label',
    );
    expect(ipadWorkflow).not.toContain('cache: npm');
    expect(ipadWorkflow).not.toContain('cache-dependency-path:');
    expect(ipadWorkflow).not.toContain('runs-on: macos-26');
    expect(ipadWorkflow).toContain('github.event.pull_request.draft');
    expect(ipadWorkflow).not.toContain('brew install openjdk@17');
    expect(ipadWorkflow).not.toContain('https://get.maestro.mobile.dev');
    expect(ipadWorkflow).toContain(
      "needs.detect-changes.outputs.run-ipad == 'true'",
    );
    expect(ipadWorkflow).toContain('if: always()');
    expect(ipadWorkflow).toContain('hermes-mobile/');
    expect(ipadWorkflow).toContain(
      'bash ./scripts/run-ipad-simulator-e2e.sh .maestro/ipad-simulator-edge-cases.yaml',
    );
    expect(ipadWorkflow).toContain(
      'Heavy iPad E2E not required for this draft or unrelated change.',
    );
    expect(continuousWorkflow).not.toContain('run-ipad-simulator-e2e.sh');
  });

  it('keeps the macOS sim ship-guard off per-PR but never without scheduled coverage', () => {
    // Measured 2026-07-29 across 35 executed job instances: 2 success / 20 failure /
    // 13 cancelled (5.7%), 8-35 min each, and the failures are a real hosted-simulator
    // regression rather than infra flake. So it stays opt-in for pull requests...
    const smoke = continuousWorkflow.slice(
      continuousWorkflow.indexOf('macos-maestro-smoke:'),
    );
    const gate = smoke.slice(0, smoke.indexOf('steps:'));

    expect(gate).toContain("contains(join(github.event.pull_request.labels.*.name, ','), 'macos-e2e')");
    // ...but coverage must NOT be silently deleted: the 6-hourly cron still runs it, so a
    // regression like the recover-chat-tab failure has something that catches it.
    expect(gate).toContain("github.event_name == 'schedule'");
    expect(continuousWorkflow).toContain('schedule:');
    // A permanently-red non-required check must never gate the merge queue.
    expect(gate).not.toContain("github.event_name == 'merge_group'");
  });
});
