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
import { parseSetupDeepLink } from '../utils/setupDeepLink';
import { profilesForSwitchComputerPicker } from '../utils/gatewayProfilePicker';
import { profilePickerLines } from '../utils/gatewayProfilePicker';
import { evaluatePairDeepLinkApply } from '../utils/pairDeepLinkApply';
import { isComposerSendDisabled, shouldSurfaceDeadRunEnded } from '../utils/deadRunDetection';

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

  it('keeps mega-session WARN at 100k and BLOCK at 500k (516k stall class)', () => {
    const guards = read('hermes-mobile/src/utils/sessionTokenGuards.ts');
    expect(guards).toContain('MEGA_SESSION_TOKEN_WARN = 100_000');
    expect(guards).toContain('MEGA_SESSION_TOKEN_BLOCK = 500_000');
    expect(guards).toContain('shouldSuggestFreshOnSessionSelect');
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

  it('requires USB pair to always reverse tcp:8765 for pair.json Mac-mini discovery', () => {
    const pairJs = read('tools/hermes-mobile-pair.js');
    const pairLib = read('tools/hermes-mobile-pair-lib.js');
    expect(pairLib).toContain('USB_ADB_REVERSE_PORTS');
    expect(pairLib).toContain('setupUsbAdbReverses');
    expect(pairLib).toContain('assertUsbAdbReverses');
    expect(pairJs).toContain('setupUsbAdbReverses(serial)');
    expect(pairJs).toContain('assertUsbAdbReverses(serial)');
    expect(pairJs).toContain('tcp:8765 missing');
    expect(pairJs).toContain('pair.json sweep');
    expect(pairJs).not.toContain('Only reverse pair page port when we will serve it');
  });

  it('Maestro chat composer inputText uses canonical device message only', () => {
    const canonical = 'make money today';
    const bannedProbes = [
      'typeableProbe',
      'e2e-chat-send-persist',
      'e2e-persist-probe',
      'smoke test message',
      'leProbeB',
      'crisis-ping',
      'draft-transfer',
      'unique-proof',
    ];
    const chatFlows = [
      'chat.yaml',
      'chat-send-persistence.yaml',
      'regression-composer-typeable.yaml',
      'regression-chat-send-visible.yaml',
    ];
    for (const flow of chatFlows) {
      const yaml = read(`hermes-mobile/.maestro/${flow}`);
      const inputs = [...yaml.matchAll(/- inputText:\s*"([^"]+)"/g)].map((m) => m[1]);
      expect(inputs.length).toBeGreaterThan(0);
      for (const text of inputs) {
        expect(text).toBe(canonical);
      }
      for (const banned of bannedProbes) {
        expect(yaml).not.toContain(banned);
      }
    }
    const agents = read('hermes-mobile/AGENTS.md');
    expect(agents).toContain('make money today');
    const testing = read('hermes-mobile/docs/TESTING.md');
    expect(testing).toContain('make money today');
  });
});

describe('tonight recurrence gates (2026-07-14 P0 class — S16-S23)', () => {
  it('S16: pair deep link contract uses pairCode= not code= for secretless exchange (#392)', () => {
    // The pair script must never regress to emitting the relay `code=` param name for the
    // secretless pairing exchange — that exact mismatch produced zero saved profiles + an
    // empty "Find computers" scan (T-333, PR #392).
    const pairJs = read('tools/hermes-mobile-pair.js');
    expect(pairJs).toContain("params.set('pairCode', code)");
    expect(pairJs).not.toMatch(/params\.set\('code',\s*code\)/);

    const correct = parseSetupDeepLink(
      'hermes://setup?pairCode=RMVAAKA2&pairServer=http://192.168.1.5:8765&name=Igors-MacBook-Pro',
    );
    expect(correct?.pairingCode).toBe('RMVAAKA2');
    expect(correct?.pairServerUrl).toBe('http://192.168.1.5:8765');

    // Legacy `code=` (no gatewayUrl) must still be accepted for backward compatibility, but
    // pairCode is always preferred when both are present.
    const legacy = parseSetupDeepLink(
      'hermes://setup?code=LEGACY01&pairServer=http://192.168.1.5:8765',
    );
    expect(legacy?.pairingCode).toBe('LEGACY01');
  });

  it('S17: --mini-tailscale never hijacks USB primary while cabled to a different Mac (#393)', () => {
    const pairJs = read('tools/hermes-mobile-pair.js');
    expect(pairJs).toContain('usbHijackGuardTripped');
    expect(pairJs).toContain('refusing to make mini the USB primary');
    expect(pairJs).toContain('--force-mini-usb-primary');
    // The guard must trip on the live cable fact (verified loopback auth), not merely on
    // whether --no-serve was also passed — that was the exact gap AGENTS.md's standing
    // `--mini-tailscale` command fell through.
    expect(pairJs).toMatch(/usbHijackGuardTripped\s*=\s*\n?\s*args\.has\('--mini-tailscale'\)/);
  });

  it('S18: Choose your computer picker renders every discovered machine, even before hostname resolves (#389)', () => {
    // Reproduces the exact P0 shape: "Find computers" reports foundCount=2, but the second
    // machine has no resolved hostname yet, is not the active profile, and was never
    // connected before — none of that is a reason to hide a real, reachable computer.
    const macBookUsb = {
      id: 'mac_book_usb',
      label: 'Igors-MacBook-Pro',
      gatewayUrl: 'http://127.0.0.1:8642',
      hostname: 'Igors-MacBook-Pro',
      addedAt: '2026-07-14T16:00:00Z',
    };
    const freshlyDiscoveredMini = {
      id: 'mac_100_94_135_78',
      label: 'Computer',
      gatewayUrl: 'http://100.94.135.78:8642',
      localIp: '100.94.135.78',
      addedAt: '2026-07-14T16:24:00Z',
    };
    const rows = profilesForSwitchComputerPicker([macBookUsb, freshlyDiscoveredMini], {
      activeProfileId: 'mac_book_usb',
      liveUsb: { reachable: true, hostname: 'Igors-MacBook-Pro.local' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id).sort()).toEqual(['mac_100_94_135_78', 'mac_book_usb']);
    // Only a phone-shaped hostname should ever be excluded as noise.
    const phoneRow = {
      id: 'phone_row',
      label: 'android-e2e',
      gatewayUrl: 'http://100.1.2.3:8642',
      addedAt: '2026-07-14T16:24:00Z',
    };
    const withPhoneNoise = profilesForSwitchComputerPicker(
      [macBookUsb, freshlyDiscoveredMini, phoneRow],
      { activeProfileId: 'mac_book_usb', liveUsb: { reachable: true, hostname: 'Igors-MacBook-Pro.local' } },
    );
    expect(withPhoneNoise.map((row) => row.id)).not.toContain('phone_row');
    expect(profilePickerLines(rows.find((r) => r.id === 'mac_100_94_135_78')!).title).toBe(
      'Tailscale 100.94.135.78',
    );
  });

  it('S19: Repair link is bounded to 12s and never leaves an infinite spinner (#392/#393)', () => {
    const opsSection = read('hermes-mobile/src/components/GatewayOpsSection.tsx');
    expect(opsSection).toContain('REPAIR_CONNECTION_TIMEOUT_MS = 12_000');
    expect(opsSection).toMatch(/withTimeout\(\s*\n?[\s\S]*?REPAIR_CONNECTION_TIMEOUT_MS/);
    const hub = read('hermes-mobile/src/components/ConnectionHealthHub.tsx');
    // The busy flag must clear on both success AND failure (finally), or a timeout would
    // leave "Repair link" spinning forever.
    expect(hub).toMatch(/finally\s*\{\s*\n?\s*setRepairBusy\(false\);/);
  });

  it('S20: dead-run send unlock clears every outbound gate, not just isSending (#384)', () => {
    // #375 cleared isSending and marked the run failed but left pinnedOutboundStatus
    // 'pending', so Send stayed grayed forever on a Scheduled job thread after OTA.
    expect(
      isComposerSendDisabled({
        isSending: false,
        queuedOutboundCount: 0,
        outboundStillPending: false,
      }),
    ).toBe(false);
    expect(
      isComposerSendDisabled({
        isSending: false,
        queuedOutboundCount: 0,
        outboundStillPending: true,
      }),
    ).toBe(true);
    // Global vault-wide agent activity must never gate this session's dead-run detection —
    // an unrelated scheduled job elsewhere on the Mac must not permanently block Send here.
    expect(
      shouldSurfaceDeadRunEnded({
        clientBusy: true,
        transcriptUnchangedMs: 4 * 60 * 1000,
        gatewayHasLiveRun: false,
      }),
    ).toBe(true);
    const chat = read('hermes-mobile/src/screens/ChatScreen.tsx');
    expect(chat).toContain("setPinnedOutboundStatus('failed')");
    expect(chat).toContain('setPinnedOutboundText(null)');
    expect(chat).toContain('setQueuedOutboundCount(0)');
    expect(chat).toContain('outboundQueueRef.current = []');
  });

  it('S21: adb reverse for both 8642 and 8765 self-heals via a USB watchdog, not just at pair time (#388)', () => {
    const pairLib = read('tools/hermes-mobile-pair-lib.js');
    expect(pairLib).toContain('USB_ADB_REVERSE_PORTS = [8642, 8765]');
    const watchdog = read('tools/hermes-usb-reverse-watchdog.js');
    expect(watchdog).toContain("require('./hermes-mobile-pair-lib')");
    expect(watchdog).toContain('healSerial');
    expect(watchdog).toContain('isPhysicalSerial');
    const launchAgentInstaller = read('scripts/install-agent-launchagents.sh');
    expect(launchAgentInstaller).toContain('hermes-usb-reverse-watchdog.plist');
  });

  it('S22: pair/relay failure keeps existing saved computers — never wipes profiles (#394)', () => {
    const kept = evaluatePairDeepLinkApply({
      params: { pairingCode: 'AB12CD34', pairServerUrl: 'http://192.168.1.5:8765' },
      relayPairAttempted: false,
      relayPairSucceeded: false,
    });
    expect(kept.shouldPersistProfiles).toBe(false);
    expect(kept.shouldPersistSettings).toBe(false);
    expect(kept.userError).toMatch(/saved computers were kept/i);

    const relayFailed = evaluatePairDeepLinkApply({
      params: {},
      relayPairAttempted: true,
      relayPairSucceeded: false,
    });
    expect(relayFailed.shouldPersistProfiles).toBe(false);
    expect(relayFailed.connectionMode).toBe('gateway');

    const success = evaluatePairDeepLinkApply({
      params: { gatewayUrl: 'http://127.0.0.1:8642' },
      relayPairAttempted: false,
      relayPairSucceeded: false,
    });
    expect(success.shouldPersistProfiles).toBe(true);
  });

  it('S23: extra-computer API keys are scoped per profile — the mini never inherits the MBP key (#118/#372)', () => {
    const sync = read('hermes-mobile/src/utils/gatewayProfileCredentialSync.ts');
    expect(sync).toContain('syncExtraProfileApiKeys');
    expect(sync).toContain('secureCredentials.saveProfileApiKey(profile.id, apiKey)');
    const deepLinks = read('hermes-mobile/src/hooks/useHermesDeepLinks.ts');
    expect(deepLinks).toContain('syncExtraProfileApiKeys');
    const pairLib = read('tools/hermes-mobile-pair-lib.js');
    // S9's fresh-install guard: never fall back to the laptop key when binding a mini URL.
    expect(pairLib).toContain('MINI_KEY_UNAVAILABLE');
    expect(pairLib).toContain('local_or_usb_url_bound_to_mini_key');
    const link = parseSetupDeepLink(
      'hermes://setup?url=http://127.0.0.1:8642&key=sk-mbp-key&name=Igors-MacBook-Pro&extraUrl=http://100.94.135.78:8642&extraName=Igors-Mac-mini&extraKey=sk-mini-key',
    );
    expect(link?.apiKey).toBe('sk-mbp-key');
    expect(link?.extraComputers).toEqual([
      { gatewayUrl: 'http://100.94.135.78:8642', macName: 'Igors-Mac-mini', apiKey: 'sk-mini-key' },
    ]);
    expect(link?.extraComputers?.[0].apiKey).not.toBe(link?.apiKey);
  });

  it('S24: Maestro tier-0 requires the new tonight-class regression flows', () => {
    const validator = read('hermes-mobile/scripts/validate-maestro-flows.js');
    for (const flow of ['tailscale-profile-disconnected-copy', 'picker-two-machines', 'pairCode-deep-link']) {
      expect(validator).toContain(`'${flow}'`);
      const yaml = read(`hermes-mobile/.maestro/${flow}.yaml`);
      expect(yaml).toContain('appId: com.iganapolsky.hermesmobile');
      expect(yaml).toMatch(/^---/m);
    }
  });

  it('S25: production OTA requires stranger CI proof; e2e=skipped alone is not pass (crisis amend)', () => {
    const pkg = read('hermes-mobile/package.json');
    expect(pkg).toContain('ota:gate');
    expect(pkg).toContain('e2e:fresh-user');
    expect(pkg).toContain('require-stranger-cold-start-proof.cjs --hard');
    expect(pkg).toContain('ota-publish-gated.sh');
    expect(read('hermes-mobile/.maestro/stranger-cold-start.yaml')).toContain('connect-mac-gate');
    const gate = read('hermes-mobile/scripts/require-fresh-user-ota-gate.sh');
    expect(gate).toContain('e2e=pass');
    expect(gate).toContain('e2e=skipped is NOT pass');
    expect(gate).toContain('require-stranger-cold-start-proof.cjs');
    expect(gate).toContain('HERMES_OTA_FORCE_UNSAFE');
    expect(gate).toMatch(/exit 1/);
    const workflow = read('.github/workflows/mobile-ota.yml');
    expect(workflow).toContain('require-stranger-cold-start-proof.cjs');
    expect(workflow).toContain("HERMES_OTA_REQUIRE_STRANGER_PROOF: '1'");
    expect(workflow).toContain('for CH in preview production');
    expect(workflow).toMatch(/permissions:/);
    const stranger = read('hermes-mobile/scripts/require-stranger-cold-start-proof.cjs');
    expect(stranger).toContain('proofCandidates');
    const pairJs = read('tools/hermes-mobile-pair.js');
    expect(pairJs).toContain('refreshPairAssetsFromLocalGateway');
    expect(pairJs).toContain('hostname mismatch');
    const requireDevice = read('tools/require-device-verified.js');
    expect(requireDevice).toContain('--allow-ota is disabled after 2026-07-15');
  });
});

