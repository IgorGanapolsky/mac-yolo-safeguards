import { Platform } from 'react-native';
import {
  cellularTailscaleFallbackUrls,
  shouldSkipLanGatewayProbe,
  usbLoopbackFallbackUrls,
  USB_LOOPBACK_GATEWAY_URL,
  wifiLanFallbackUrls,
} from '../utils/gatewayLoopbackFallback';

describe('gatewayLoopbackFallback', () => {
  it('skips LAN probe off Wi-Fi but not for loopback URLs', () => {
    expect(shouldSkipLanGatewayProbe('http://10.2.29.103:8642', false)).toBe(true);
    expect(shouldSkipLanGatewayProbe('http://10.2.29.103:8642', true)).toBe(false);
    expect(shouldSkipLanGatewayProbe(USB_LOOPBACK_GATEWAY_URL, false)).toBe(false);
  });

  it('offers USB loopback fallback for LAN URLs on native', () => {
    const fallbacks = usbLoopbackFallbackUrls('http://10.2.29.103:8642');
    if (Platform.OS === 'web') {
      expect(fallbacks).toEqual([]);
    } else {
      expect(fallbacks).toEqual([USB_LOOPBACK_GATEWAY_URL]);
    }
  });

  it('does not fallback loopback to itself', () => {
    expect(usbLoopbackFallbackUrls(USB_LOOPBACK_GATEWAY_URL)).toEqual([]);
  });

  it('offers LAN fallback when USB loopback fails on Wi‑Fi', () => {
    expect(
      wifiLanFallbackUrls({
        primaryUrl: USB_LOOPBACK_GATEWAY_URL,
        wifiConnected: true,
        lastLanIp: '192.168.68.68',
        profileLanIps: ['192.168.68.68', '10.0.0.5'],
      }),
    ).toEqual(['http://192.168.68.68:8642', 'http://10.0.0.5:8642']);
  });

  it('skips LAN fallback off Wi‑Fi or for non-loopback URLs', () => {
    expect(
      wifiLanFallbackUrls({
        primaryUrl: USB_LOOPBACK_GATEWAY_URL,
        wifiConnected: false,
        lastLanIp: '192.168.68.68',
      }),
    ).toEqual([]);
    expect(
      wifiLanFallbackUrls({
        primaryUrl: 'http://192.168.68.68:8642',
        wifiConnected: true,
        lastLanIp: '192.168.68.68',
      }),
    ).toEqual([]);
  });

  it('offers Tailscale fallback off Wi‑Fi', () => {
    expect(
      cellularTailscaleFallbackUrls({
        primaryUrl: 'http://192.168.68.68:8642',
        wifiConnected: false,
        profileUrls: ['http://100.94.135.78:8642', 'http://192.168.68.68:8642'],
        tailnetProbeHosts: ['igors-mac-mini.tail12aa33.ts.net'],
      }),
    ).toEqual([
      'http://100.94.135.78:8642',
      'http://igors-mac-mini.tail12aa33.ts.net:8642',
    ]);
  });

  it('skips Tailscale fallback on Wi‑Fi', () => {
    expect(
      cellularTailscaleFallbackUrls({
        primaryUrl: 'http://192.168.68.68:8642',
        wifiConnected: true,
        profileUrls: ['http://100.94.135.78:8642'],
      }),
    ).toEqual([]);
  });
});
