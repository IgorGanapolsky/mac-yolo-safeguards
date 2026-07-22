import type { NetInfoState } from '@react-native-community/netinfo';
import {
  isTailscaleVpnActive,
  isTailscaleVpnActiveFromNetInfo,
} from '../utils/tailscaleVpnDetect';

describe('tailscaleVpnDetect', () => {
  it('treats NetInfo type=vpn as active', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'vpn',
        isConnected: true,
      }),
    ).toBe(true);
  });

  it('does not treat cellular alone as Tailscale on', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'cellular',
        isConnected: true,
        ipAddress: '192.0.0.2',
      }),
    ).toBe(false);
  });

  it('treats CGNAT phone IP as Tailscale on even when type is cellular', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'cellular',
        isConnected: true,
        ipAddress: '100.70.124.54',
      }),
    ).toBe(true);
  });

  it('never infers VPN from probing alone — only from a completed reach hit', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'cellular',
        isConnected: true,
        ipAddress: '192.0.0.2',
        reachedTailscaleHost: false,
      }),
    ).toBe(false);
    expect(
      isTailscaleVpnActive({
        netInfoType: 'cellular',
        isConnected: true,
        ipAddress: '192.0.0.2',
        reachedTailscaleHost: true,
      }),
    ).toBe(true);
  });

  it('reads NetInfoState details.ipAddress for Samsung cellular+tun0 false negatives', () => {
    const state = {
      type: 'cellular',
      isConnected: true,
      isInternetReachable: true,
      details: { ipAddress: '100.64.1.10', cellularGeneration: null, carrier: null },
    } as unknown as NetInfoState;
    expect(isTailscaleVpnActiveFromNetInfo(state)).toBe(true);

    const cellularOnly = {
      type: 'cellular',
      isConnected: true,
      isInternetReachable: true,
      details: { ipAddress: '192.0.0.2', cellularGeneration: null, carrier: null },
    } as unknown as NetInfoState;
    expect(isTailscaleVpnActiveFromNetInfo(cellularOnly)).toBe(false);
  });
});
