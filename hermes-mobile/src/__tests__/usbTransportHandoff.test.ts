import type { GatewayProfile } from '../types/gatewayProfile';
import { USB_LOOPBACK_GATEWAY_URL } from '../utils/gatewayLoopbackFallback';
import {
  headerShowsUsbAfterHandoff,
  resolveSameMachineRemoteUrl,
  resolveUsbToRemoteHandoff,
  resolveUsbTransportHandoff,
  shouldAllowUsbHandoffAttempt,
  USB_HANDOFF_MIN_INTERVAL_MS,
  usbHandoffPreservesConversation,
} from '../utils/usbTransportHandoff';

const macBookTs: GatewayProfile = {
  id: 'mac_book_ts',
  label: 'Igors-MacBook-Pro',
  hostname: 'Igors-MacBook-Pro',
  gatewayUrl: 'http://100.87.85.85:8642',
  localIp: '100.87.85.85',
  addedAt: '2026-07-20T12:00:00Z',
};

const macMiniTs: GatewayProfile = {
  id: 'mac_mini_ts',
  label: 'Igors-Mac-mini',
  hostname: 'Igors-Mac-mini',
  gatewayUrl: 'http://100.94.135.78:8642',
  localIp: '100.94.135.78',
  addedAt: '2026-07-20T12:00:01Z',
};

describe('resolveUsbTransportHandoff', () => {
  it('handoffs Tailscale → USB for the same selected Mac when reverse is healthy', () => {
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: macBookTs.gatewayUrl,
      wifiConnected: true,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro.local',
      activeProfile: macBookTs,
    });
    expect(decision).toEqual({
      shouldHandoff: true,
      usbGatewayUrl: USB_LOOPBACK_GATEWAY_URL,
      preserveActiveProfileId: 'mac_book_ts',
      reason: 'handoff',
    });
    expect(
      headerShowsUsbAfterHandoff({
        effectiveGatewayUrl: decision.usbGatewayUrl,
        wifiConnected: true,
        health: {
          level: 'green',
          checkedAt: '2026-07-21T13:00:00.000Z',
          hostname: 'Igors-MacBook-Pro.local',
        },
      }),
    ).toBe(true);
  });

  it('handoffs Tailscale → USB on cellular when live reverse proves the cable (5G + USB)', () => {
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: macBookTs.gatewayUrl,
      wifiConnected: false,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro.local',
      activeProfile: macBookTs,
    });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.reason).toBe('handoff');
    expect(
      headerShowsUsbAfterHandoff({
        effectiveGatewayUrl: decision.usbGatewayUrl,
        wifiConnected: false,
        health: {
          level: 'green',
          checkedAt: '2026-07-21T13:00:00.000Z',
          hostname: 'Igors-MacBook-Pro.local',
        },
      }),
    ).toBe(true);
  });

  it('never steals mini Tailscale when Pro USB answers', () => {
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: macMiniTs.gatewayUrl,
      wifiConnected: true,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro.local',
      activeProfile: macMiniTs,
    });
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toBe('foreign_usb_host');
    expect(decision.preserveActiveProfileId).toBe('mac_mini_ts');
  });

  it('rejects cellular ghost reverse without a live USB hostname', () => {
    expect(
      resolveUsbTransportHandoff({
        currentGatewayUrl: macBookTs.gatewayUrl,
        wifiConnected: false,
        liveUsbReachable: false,
        liveUsbHostname: null,
        activeProfile: macBookTs,
      }).reason,
    ).toBe('usb_unreachable');
  });

  it('requires a live USB hostname before switching', () => {
    expect(
      resolveUsbTransportHandoff({
        currentGatewayUrl: macBookTs.gatewayUrl,
        wifiConnected: true,
        liveUsbReachable: true,
        liveUsbHostname: null,
        activeProfile: macBookTs,
      }).reason,
    ).toBe('missing_usb_hostname');
  });

  it('skips when already on USB', () => {
    expect(
      resolveUsbTransportHandoff({
        currentGatewayUrl: USB_LOOPBACK_GATEWAY_URL,
        wifiConnected: true,
        liveUsbReachable: true,
        liveUsbHostname: 'Igors-MacBook-Pro.local',
        activeProfile: { ...macBookTs, gatewayUrl: USB_LOOPBACK_GATEWAY_URL },
      }).reason,
    ).toBe('already_usb');
  });

  it('handoffs Home Wi-Fi LAN → USB for the same Mac', () => {
    const lan: GatewayProfile = {
      ...macBookTs,
      id: 'mac_book_lan',
      gatewayUrl: 'http://192.168.68.71:8642',
      localIp: '192.168.68.71',
    };
    const decision = resolveUsbTransportHandoff({
      currentGatewayUrl: lan.gatewayUrl,
      wifiConnected: true,
      liveUsbReachable: true,
      liveUsbHostname: 'Igors-MacBook-Pro',
      activeProfile: lan,
    });
    expect(decision.shouldHandoff).toBe(true);
    expect(decision.preserveActiveProfileId).toBe('mac_book_lan');
  });
});

describe('resolveUsbToRemoteHandoff', () => {
  it('handoffs USB → Tailscale when reverse is gone for the same Mac', () => {
    const decision = resolveUsbToRemoteHandoff({
      currentGatewayUrl: USB_LOOPBACK_GATEWAY_URL,
      liveUsbReachable: false,
      activeProfile: macBookTs,
      remoteGatewayUrl: macBookTs.gatewayUrl,
    });
    expect(decision).toEqual({
      shouldHandoff: true,
      remoteGatewayUrl: macBookTs.gatewayUrl,
      preserveActiveProfileId: 'mac_book_ts',
      reason: 'handoff',
    });
  });

  it('stays on USB while reverse remains healthy', () => {
    expect(
      resolveUsbToRemoteHandoff({
        currentGatewayUrl: USB_LOOPBACK_GATEWAY_URL,
        liveUsbReachable: true,
        activeProfile: macBookTs,
        remoteGatewayUrl: macBookTs.gatewayUrl,
      }).reason,
    ).toBe('still_usb');
  });

  it('skips when not on USB', () => {
    expect(
      resolveUsbToRemoteHandoff({
        currentGatewayUrl: macBookTs.gatewayUrl,
        liveUsbReachable: false,
        activeProfile: macBookTs,
        remoteGatewayUrl: macBookTs.gatewayUrl,
      }).reason,
    ).toBe('not_on_usb');
  });
});

describe('resolveSameMachineRemoteUrl', () => {
  it('prefers the active profile Tailscale/LAN URL', () => {
    expect(
      resolveSameMachineRemoteUrl({
        activeProfile: macBookTs,
        candidateUrls: ['http://192.168.68.71:8642', macBookTs.gatewayUrl],
      }),
    ).toBe(macBookTs.gatewayUrl);
  });
});

describe('usbHandoffPreservesConversation', () => {
  it('keeps sessionId, project lane, and message history (no New chat)', () => {
    expect(
      usbHandoffPreservesConversation({
        beforeSessionId: 'sess_make_money',
        afterSessionId: 'sess_make_money',
        beforeProjectId: 'vault:mac-yolo-safeguards',
        afterProjectId: 'vault:mac-yolo-safeguards',
        beforeMessageCount: 4,
        afterMessageCount: 4,
      }),
    ).toBe(true);
  });

  it('rejects a New chat / context drop', () => {
    expect(
      usbHandoffPreservesConversation({
        beforeSessionId: 'sess_make_money',
        afterSessionId: 'sess_new_empty',
        beforeProjectId: 'vault:mac-yolo-safeguards',
        afterProjectId: 'vault:mac-yolo-safeguards',
        beforeMessageCount: 4,
        afterMessageCount: 0,
      }),
    ).toBe(false);
  });
});

describe('USB handoff thrash guard', () => {
  it('allows first handoff and blocks within min interval', () => {
    expect(shouldAllowUsbHandoffAttempt(null, 1_000_000)).toBe(true);
    expect(shouldAllowUsbHandoffAttempt(1_000_000, 1_000_000 + 1_000)).toBe(false);
    expect(
      shouldAllowUsbHandoffAttempt(1_000_000, 1_000_000 + USB_HANDOFF_MIN_INTERVAL_MS),
    ).toBe(true);
  });
});
