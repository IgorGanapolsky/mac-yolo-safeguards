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

  it('Samsung wifi+LAN NetInfo alone is not Tailscale-on (tun0 invisible to NetInfo)', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'wifi',
        isConnected: true,
        ipAddress: '192.168.68.120',
      }),
    ).toBe(false);
  });

  it('treats successful 100.x peer probe as Tailscale-on even when NetInfo says wifi+LAN', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'wifi',
        isConnected: true,
        ipAddress: '192.168.68.120',
        reachedTailscaleHost: true,
      }),
    ).toBe(true);
  });

  it('reads Samsung wifi+LAN NetInfoState with completed Tailscale reachability', () => {
    const samsungWifiLan = {
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
      details: {
        ipAddress: '192.168.68.120',
        subnet: '255.255.255.0',
        ssid: 'Home',
        bssid: null,
        frequency: 5200,
        strength: 99,
        isConnectionExpensive: false,
      },
    } as unknown as NetInfoState;

    expect(isTailscaleVpnActiveFromNetInfo(samsungWifiLan)).toBe(false);
    expect(isTailscaleVpnActiveFromNetInfo(samsungWifiLan, true)).toBe(true);
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

  it('clears completed-probe reachability when the next probe is empty', () => {
    const cellular = {
      type: 'cellular',
      isConnected: true,
      isInternetReachable: true,
      details: { ipAddress: '192.0.0.2', cellularGeneration: null, carrier: null },
    } as unknown as NetInfoState;

    expect(isTailscaleVpnActiveFromNetInfo(cellular, true)).toBe(true);
    expect(isTailscaleVpnActiveFromNetInfo(cellular, false)).toBe(false);
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
