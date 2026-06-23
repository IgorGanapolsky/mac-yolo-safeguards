import { Platform } from 'react-native';
import { normalizeGatewayUrl } from '../services/gatewayClient';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function gatewayUrlHostname(gatewayUrl: string): string | undefined {
  try {
    return new URL(normalizeGatewayUrl(gatewayUrl).httpBase).hostname;
  } catch {
    return undefined;
  }
}

export function isLoopbackGatewayUrl(gatewayUrl: string): boolean {
  const host = gatewayUrlHostname(gatewayUrl);
  return host ? LOOPBACK_HOSTS.has(host) : false;
}

export function buildGatewayUrlFromLanIp(lanIp: string, port = 8642): string {
  const trimmed = lanIp.trim();
  return `http://${trimmed}:${port}`;
}

export function extractLanIpFromGatewayUrl(gatewayUrl: string): string | null {
  const host = gatewayUrlHostname(gatewayUrl);
  if (host && IPV4_RE.test(host)) {
    return host;
  }
  return null;
}

/** Prefer LAN URL on physical devices when settings still point at loopback. */
export function resolveDeviceGatewayUrl(
  configuredUrl: string,
  lastKnownLanIp?: string | null,
): string {
  if (Platform.OS === 'web' || !isLoopbackGatewayUrl(configuredUrl)) {
    return configuredUrl;
  }
  if (lastKnownLanIp?.trim()) {
    return buildGatewayUrlFromLanIp(lastKnownLanIp);
  }
  return configuredUrl;
}

export function describeGatewayFetchError(
  err: unknown,
  gatewayUrl: string,
): string {
  const baseMessage = err instanceof Error ? err.message : 'Request failed';

  if (baseMessage === 'Network request failed' || baseMessage.includes('Failed to fetch')) {
    if (isLoopbackGatewayUrl(gatewayUrl)) {
      return (
        'Cannot reach your computer at 127.0.0.1 from the phone — that address is the phone itself. ' +
        'Scan the QR on your computer pair page (same Wi‑Fi) to link automatically.'
      );
    }
    return (
      'Cannot reach the Hermes gateway. Confirm your phone is on the same Wi‑Fi as your computer and ' +
      'scan the computer pair QR, or pull down on Leash to retry.'
    );
  }

  return baseMessage;
}
