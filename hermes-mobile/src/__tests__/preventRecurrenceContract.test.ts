import fs from 'fs';
import path from 'path';
import {
  isConnectedWrongKeyContradiction,
  isMacGatewayHttpOk,
  resolveChatLinkDisplay,
  resolveEffectiveMacHttpOk,
} from '../utils/gatewayConnection';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';
import {
  assertUsbHeaderIdentityLaw,
  resolveChatMachineHeaderDisplay,
  usbHeaderClaimsNamedHost,
  USB_UNKNOWN_MACHINE_LABEL,
} from '../utils/chatMachineHeader';

const root = path.resolve(__dirname, '../../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('prevent recurrence contract (July 2026 CI gates)', () => {
  it('Connected ⊕ Wrong key: authMismatch never yields green Connected', () => {
    const link = resolveChatLinkDisplay({
      connectionState: 'connected',
      macHttpOk: true,
      authMismatch: true,
    });
    expect(link.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(link.label).not.toContain('Connected');
    expect(link.chatReachable).toBe(false);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: link.label,
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('Connected ⊕ Wrong key: stale wrong-key banner never yields green Connected', () => {
    const link = resolveChatLinkDisplay({
      connectionState: 'connected',
      macHttpOk: true,
      wrongKeyBannerActive: true,
    });
    expect(link.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(link.chatReachable).toBe(false);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: 'Connected',
        wrongKeyBannerActive: true,
      }),
    ).toBe(true);
  });

  it('green health with authMismatch is not mac HTTP ok', () => {
    expect(
      isMacGatewayHttpOk({
        level: 'green',
        checkedAt: '2026-07-14T00:00:00Z',
        directGatewayReachable: true,
        authMismatch: true,
      }),
    ).toBe(false);
    expect(
      resolveEffectiveMacHttpOk({
        macHttpOk: true,
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('wires preventRecurrenceContract into test:release-safety', () => {
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.scripts['test:release-safety']).toContain('preventRecurrenceContract.test.ts');
  });

  it('continuous E2E records fail (not skipped) when android-only and no phone', () => {
    const runner = read('hermes-mobile/scripts/run-continuous-e2e.sh');
    expect(runner).toMatch(/e2e_status="fail"/);
    expect(runner).toMatch(/no USB Android device connected/);
    expect(runner).not.toMatch(/android-only continuous E2E skipped/);
  });

  it('tier-0 Maestro validator requires stranger-cold-start and wrong-key-repair', () => {
    const validator = read('hermes-mobile/scripts/validate-maestro-flows.js');
    expect(validator).toContain("'stranger-cold-start'");
    expect(validator).toContain("'wrong-key-repair'");
    for (const flow of ['stranger-cold-start', 'wrong-key-repair']) {
      const yaml = read(`hermes-mobile/.maestro/${flow}.yaml`);
      expect(yaml).toContain('appId: com.iganapolsky.hermesmobile');
      expect(yaml).toMatch(/^---/m);
    }
  });

  it('ChatScreen passes authMismatch and wrongKeyBannerActive into header', () => {
    const chat = read('hermes-mobile/src/screens/ChatScreen.tsx');
    // SHIP BLOCK: header must use effectiveAuthMismatch (health OR stale banner), never health-only.
    expect(chat).toContain(
      'health?.authMismatch === true || wrongKeyBannerActive',
    );
    expect(chat).toContain('authMismatch={effectiveAuthMismatch}');
    expect(chat).toContain('wrongKeyBannerActive');
    expect(chat).toContain('isAuthRepairMessage');
  });

  it('documents failure→guard→verify checklist for S1–S8', () => {
    const doc = read('hermes-mobile/docs/PREVENT-RECURRENCE-JULY-2026.md');
    expect(doc).toContain('Session failure checklist');
    for (const id of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8']) {
      expect(doc).toContain(`| ${id} |`);
    }
    expect(doc).toContain('require-device-verified.js');
    expect(doc).toContain('hermes-prevention-watchdog.sh');
    expect(doc).toContain('pendingApprovalsCap');
    expect(doc).toMatch(/never pull App Review to fix shots/i);
  });

  it('requires busy spinners for Start fresh in ChatScreen + RunProgressBanner', () => {
    const chat = read('hermes-mobile/src/screens/ChatScreen.tsx');
    const banner = read('hermes-mobile/src/components/RunProgressBanner.tsx');
    expect(chat).toContain('isStartingFreshChat');
    expect(chat).toContain('ActivityIndicator');
    expect(chat).toMatch(/accessibilityState=\{\{\s*busy:\s*isStartingFreshChat/);
    expect(banner).toContain('isStartingFreshChat');
    expect(banner).toContain('ActivityIndicator');
    expect(banner).toMatch(/accessibilityState=\{\{\s*busy:\s*isStartingFreshChat/);
  });

  it('keeps ASC duplicate-frame guard wired into capture scripts', () => {
    const assertScript = read('hermes-mobile/scripts/_assert_store_frame_distinct.py');
    expect(assertScript).toContain('must be visually distinct');
    expect(assertScript).toMatch(/THRESHOLD\s*=\s*90\.0|95\.0/);
    const capture = read('hermes-mobile/scripts/capture-store-screenshots.sh');
    expect(capture).toContain('_assert_store_frame_distinct.py');
    const recapture = read('hermes-mobile/scripts/recapture-store-screenshots.py');
    expect(recapture).toContain('_assert_store_frame_distinct.py');
  });

  it('ships leash badge hard-cap util that formats 5557 as 99+', () => {
    const cap = read('hermes-mobile/src/utils/pendingApprovalsCap.ts');
    expect(cap).toContain('PENDING_APPROVALS_HARD_CAP');
    expect(cap).toContain('PENDING_BADGE_DISPLAY_CAP');
    expect(cap).toContain('dedupeAndCapPendingApprovals');
    expect(cap).toContain('formatPendingApprovalBadge');
  });

  it('exposes shouldAutoClearStalledRun for Connected-stall recovery', () => {
    const stale = read('hermes-mobile/src/utils/runStaleDetection.ts');
    expect(stale).toContain('shouldAutoClearStalledRun');
    expect(stale).toContain('recovering automatically');
  });

  it('exposes transferComposerDraft for mega Start-fresh draft transfer', () => {
    const draft = read('hermes-mobile/src/utils/composerDraftStorage.ts');
    expect(draft).toContain('transferComposerDraft');
  });

  it('ships device-verified gate tool', () => {
    const gate = read('tools/require-device-verified.js');
    expect(gate).toContain('deviceVerified');
    expect(gate).toContain('e2e');
    expect(gate).toContain('--allow-ota');
  });

  it('false Mac·USB header: stale red health + loopback must not claim named host', () => {
    const display = resolveChatMachineHeaderDisplay({
      activeProfile: {
        id: 'mac_usb',
        label: 'Computer via USB',
        gatewayUrl: 'http://127.0.0.1:8642',
        localIp: '127.0.0.1',
        addedAt: '2026-07-14T00:00:00.000Z',
      },
      profiles: [
        {
          id: 'mac_mini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          addedAt: '2026-06-24T00:00:00.000Z',
        },
      ],
      gatewayUrl: 'http://127.0.0.1:8642',
      health: {
        level: 'red',
        checkedAt: '2026-07-14T00:00:00.000Z',
        hostname: 'Igors-Mac-mini.local',
        directGatewayReachable: false,
      },
      connectionMode: 'gateway',
      isPaired: false,
      workers: [],
      savedMacCount: 2,
    });
    expect(display.machineLabel).not.toBe('Igors-Mac-mini');
    expect(display.machineLabel).toBe(USB_UNKNOWN_MACHINE_LABEL);
    expect(usbHeaderClaimsNamedHost(display)).toBe(false);
    expect(
      assertUsbHeaderIdentityLaw({
        display,
        gatewayUrl: 'http://127.0.0.1:8642',
        health: display.machineEndpoint ? { level: 'red', checkedAt: '2026-07-14T00:00:00.000Z' } : null,
      }),
    ).toBeNull();
  });

  it('documents S9 fresh-install wrong-key multi-Mac guard', () => {
    const doc = read('hermes-mobile/docs/PREVENT-RECURRENCE-JULY-2026.md');
    expect(doc).toContain('| S9 |');
    expect(doc).toContain('Wrong key');
    expect(doc).toContain('assertHostKeyConsistency');
    const pairLib = read('tools/hermes-mobile-pair-lib.js');
    expect(pairLib).toContain('MINI_KEY_UNAVAILABLE');
    expect(pairLib).toContain('local_or_usb_url_bound_to_mini_key');
  });
});

