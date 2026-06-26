import { Platform } from 'react-native';
import { isPrivateLanGatewayUrl } from './gatewayEndpoint';
import { isLoopbackGatewayUrl } from './gatewayUrlPolicy';

export const USB_LOOPBACK_GATEWAY_URL = 'http://127.0.0.1:8642';

/** Skip probing a LAN URL when the phone is off Wi‑Fi — try USB loopback instead. */
export function shouldSkipLanGatewayProbe(gatewayUrl: string, wifiConnected: boolean): boolean {
  if (wifiConnected || Platform.OS === 'web') {
    return false;
  }
  return isPrivateLanGatewayUrl(gatewayUrl) && !isLoopbackGatewayUrl(gatewayUrl);
}

/** Ordered fallback URLs after the active URL fails (native USB adb reverse). */
export function usbLoopbackFallbackUrls(primaryUrl: string): string[] {
  if (Platform.OS === 'web' || isLoopbackGatewayUrl(primaryUrl)) {
    return [];
  }
  return [USB_LOOPBACK_GATEWAY_URL];
}
