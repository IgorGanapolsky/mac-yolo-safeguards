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

  it('2026-07-30 Samsung: wifi primary IP does not hide native tun0 CGNAT', () => {
    // Live dogfood: NetInfo type=wifi + 192.168.68.54 while tun0=100.70.124.54
    expect(
      isTailscaleVpnActive({
        netInfoType: 'wifi',
        isConnected: true,
        ipAddress: '192.168.68.54',
        cgnatInterfaceIp: '100.70.124.54',
      }),
    ).toBe(true);
  });

  it('2026-07-30 Samsung: wifi primary + TRANSPORT_VPN is active without CGNAT string', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'wifi',
        isConnected: true,
        ipAddress: '192.168.68.54',
        hasVpnTransport: true,
      }),
    ).toBe(true);
  });

  it('wifi alone without native VPN signals stays off', () => {
    expect(
      isTailscaleVpnActive({
        netInfoType: 'wifi',
        isConnected: true,
        ipAddress: '192.168.68.54',
        hasVpnTransport: false,
        cgnatInterfaceIp: null,
      }),
    ).toBe(false);
  });

  it('passes native signals through FromNetInfo helper', () => {
    const wifi = {
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
      details: { ipAddress: '192.168.68.54', ssid: null, bssid: null, strength: null, subnet: null, frequency: null, linkSpeed: null, rxLinkSpeed: null, txLinkSpeed: null },
    } as unknown as NetInfoState;
    expect(isTailscaleVpnActiveFromNetInfo(wifi, false)).toBe(false);
    expect(
      isTailscaleVpnActiveFromNetInfo(wifi, false, {
        hasVpnTransport: true,
        cgnatInterfaceIp: null,
      }),
    ).toBe(true);
    expect(
      isTailscaleVpnActiveFromNetInfo(wifi, false, {
        hasVpnTransport: false,
        cgnatInterfaceIp: '100.70.124.54',
      }),
    ).toBe(true);
  });
});
