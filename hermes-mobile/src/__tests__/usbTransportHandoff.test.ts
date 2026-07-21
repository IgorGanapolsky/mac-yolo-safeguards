import type { GatewayProfile } from '../types/gatewayProfile';
import { USB_LOOPBACK_GATEWAY_URL } from '../utils/gatewayLoopbackFallback';
import {
  headerShowsUsbAfterHandoff,
  resolveUsbTransportHandoff,
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

  it('does not handoff on cellular (ghost reverse)', () => {
    expect(
      resolveUsbTransportHandoff({
        currentGatewayUrl: macBookTs.gatewayUrl,
        wifiConnected: false,
        liveUsbReachable: true,
        liveUsbHostname: 'Igors-MacBook-Pro.local',
        activeProfile: macBookTs,
      }).reason,
    ).toBe('cellular');
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
