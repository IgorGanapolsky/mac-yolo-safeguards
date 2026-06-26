import { Platform } from 'react-native';
import {
  shouldSkipLanGatewayProbe,
  usbLoopbackFallbackUrls,
  USB_LOOPBACK_GATEWAY_URL,
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
});
