import fs from 'fs';
import path from 'path';

/**
 * 2026-08-03 user report: "Tap to reconnect does nothing."
 *
 * Root cause was not a dead button. The Computer tile's tap ran, failed, and
 * re-set the SAME banner that was already on screen, so the post-tap state was
 * indistinguishable from the pre-tap state. Both give-up paths in
 * handleMacRetry returned early with no observable result.
 *
 * These assertions pin behaviour that a user can perceive, and pin the
 * referenced control to the constant exported by the component that owns it —
 * copy naming a renamed button is the dead end this whole fix is about.
 */

const repoFile = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');

describe('reconnect tap is never silent', () => {
  const chatScreen = repoFile('src/screens/ChatScreen.tsx');
  const hub = repoFile('src/components/ConnectionHealthHub.tsx');

  it('surfaces a visible result on the stale-credential give-up path', () => {
    const authBranch = chatScreen.slice(
      chatScreen.indexOf('if (postRetryHealth.authMismatch) {'),
    );
    const branchBody = authBranch.slice(0, authBranch.indexOf('return;'));

    expect(branchBody).toContain('Alert.alert');
    // Must route the user to the control that actually repairs a stale key,
    // not repeat "reconnect" — reconnecting alone provably cannot fix it.
    expect(branchBody).toContain('RECONNECT_REPAIR_ACTION_LABEL');
  });

  it('surfaces a visible result on the unreachable give-up path', () => {
    const idx = chatScreen.indexOf('!postRetryHealth.directGatewayReachable');
    expect(idx).toBeGreaterThan(-1);
    const branchBody = chatScreen.slice(idx, chatScreen.indexOf('return;', idx));
    expect(branchBody).toContain('Alert.alert');
  });

  it('names the repair control via the exported constant, not a copy-pasted string', () => {
    expect(hub).toContain('export const RECONNECT_REPAIR_ACTION_LABEL');
    expect(chatScreen).toContain(
      "import { RECONNECT_REPAIR_ACTION_LABEL } from '../components/ConnectionHealthHub'",
    );
    // The hub must render the constant so the alert and the button cannot drift.
    expect(hub).toContain('? RECONNECT_REPAIR_ACTION_LABEL');
  });

  it('keeps the busy flag released so repeat taps are possible', () => {
    // A stuck busy flag disables the tile (onPress becomes undefined) and
    // recreates "tap does nothing" permanently.
    const handler = chatScreen.slice(chatScreen.indexOf('const handleMacRetry'));
    expect(handler.slice(0, handler.indexOf('}, ['))).toContain(
      'finally {\n      setMacRetryBusy(false);',
    );
  });
});
