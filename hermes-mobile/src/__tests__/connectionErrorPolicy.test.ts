import type { GatewayProfile } from '../types/gatewayProfile';
import {
  CONNECTION_HEAL_EXHAUSTED_AFTER,
  connectionHealSnapshot,
  hasAlternateHealRoutes,
  shouldDebounceConnectionError,
  shouldShowMacConnectionHelp,
  shouldShowMacRetryBanner,
  shouldShowPairRelayRouteStatus,
  shouldShowConnectivityRunBanner,
} from '../utils/connectionErrorPolicy';

const profiles: GatewayProfile[] = [
  {
    id: 'lan',
    label: 'Mac mini',
    gatewayUrl: 'http://192.168.68.56:8642',
    localIp: '192.168.68.56',
    addedAt: '2026-06-28T00:00:00Z',
  },
  {
    id: 'ts',
    label: 'Mac mini',
    gatewayUrl: 'http://100.94.135.78:8642',
    addedAt: '2026-06-28T00:00:01Z',
  },
];

describe('connectionErrorPolicy', () => {
  it('shows connection help immediately for fresh users with no saved Mac', () => {
    expect(
      shouldShowMacConnectionHelp({
        isDemo: false,
        macChatLive: false,
        healthProbePending: false,
        healthLevel: 'red',
        heal: connectionHealSnapshot(0, true),
        profiles: [],
      }),
    ).toBe(true);
  });

  it('suppresses loud UI while silent heal is in progress', () => {
    const healing = connectionHealSnapshot(2, true);
    const savedProfiles = [
      {
        id: 'mac',
        label: 'Mac mini',
        gatewayUrl: 'http://192.168.1.50:8642',
        addedAt: '2026-06-28T00:00:00Z',
      },
    ];
    expect(
      shouldShowMacRetryBanner({
        isDemo: false,
        macChatLive: false,
        healthProbePending: false,
        heal: healing,
      }),
    ).toBe(false);
    expect(
      shouldShowMacConnectionHelp({
        isDemo: false,
        macChatLive: false,
        healthProbePending: false,
        healthLevel: 'red',
        heal: healing,
        profiles: savedProfiles,
      }),
    ).toBe(false);
  });

  it('shows retry banner only after heal exhausted or user send failed', () => {
    const exhausted = connectionHealSnapshot(CONNECTION_HEAL_EXHAUSTED_AFTER, false);
    expect(
      shouldShowMacRetryBanner({
        isDemo: false,
        macChatLive: false,
        healthProbePending: false,
        heal: exhausted,
      }),
    ).toBe(true);
    expect(
      shouldShowMacRetryBanner({
        isDemo: false,
        macChatLive: false,
        healthProbePending: false,
        heal: connectionHealSnapshot(1, false),
        userSendFailed: true,
      }),
    ).toBe(true);
  });

  it('detects alternate heal routes including Tailscale profiles', () => {
    expect(
      hasAlternateHealRoutes({
        gatewayUrl: 'http://192.168.68.56:8642',
        profiles,
      }),
    ).toBe(true);
  });

  it('hides pair relay nag on Wi-Fi when LAN can still failover', () => {
    expect(
      shouldShowPairRelayRouteStatus({
        isPaired: false,
        wifiConnected: true,
        gatewayUrl: 'http://192.168.68.56:8642',
        hasAlternateRoutes: true,
        heal: connectionHealSnapshot(1, true),
        macHttpOk: false,
      }),
    ).toBe(false);
  });

  it('shows pair relay only when direct heal paths are exhausted on cellular', () => {
    expect(
      shouldShowPairRelayRouteStatus({
        isPaired: false,
        wifiConnected: false,
        gatewayUrl: 'http://192.168.68.56:8642',
        hasAlternateRoutes: false,
        heal: connectionHealSnapshot(CONNECTION_HEAL_EXHAUSTED_AFTER, false),
        macHttpOk: false,
      }),
    ).toBe(true);
  });

  it('debounces duplicate connection error surfaces', () => {
    const now = 1_000_000;
    expect(shouldDebounceConnectionError(now - 5_000, now)).toBe(true);
    expect(shouldDebounceConnectionError(now - 20_000, now)).toBe(false);
  });

  it('suppresses connectivity run banner during silent heal with alternate routes', () => {
    const healing = connectionHealSnapshot(2, true);
    expect(
      shouldShowConnectivityRunBanner({
        isDemo: false,
        connectivityFailure: true,
        heal: healing,
        hasAlternateRoutes: true,
      }),
    ).toBe(false);
    expect(
      shouldShowConnectivityRunBanner({
        isDemo: false,
        connectivityFailure: true,
        heal: connectionHealSnapshot(CONNECTION_HEAL_EXHAUSTED_AFTER, false),
        hasAlternateRoutes: true,
      }),
    ).toBe(true);
  });
});
