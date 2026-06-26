import { normalizeGatewayUrl } from '../services/gatewayClient';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isLoopbackHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(trimmed) || trimmed === 'localhost';
}

/** Gateway /health may report 127.0.0.1 even when probed over LAN — never show that as the Mac IP. */
export function resolveDisplayLanIp(
  reportedIp: string | undefined | null,
  gatewayUrl: string,
): string | undefined {
  const reported = reportedIp?.trim();
  if (reported && !isLoopbackHost(reported)) {
    return reported;
  }
  const fromUrl = extractLanIpFromGatewayUrl(gatewayUrl);
  if (fromUrl && !isLoopbackHost(fromUrl)) {
    return fromUrl;
  }
  return undefined;
}

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

/** Keep stored URL as-is — USB adb reverse uses loopback; LAN discovery runs at runtime. */
export function resolveDeviceGatewayUrl(
  configuredUrl: string,
  _lastKnownLanIp?: string | null,
): string {
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
        'USB link to your Mac is down. Plug in via USB and run pairing on your Mac ' +
        '(node tools/hermes-mobile-pair.js), or join the same Wi‑Fi and scan the local QR.'
      );
    }
    return (
      'Cannot reach the direct Hermes link. Use Hermes Relay in Settings, scan the local QR, or tap Refresh on Leash.'
    );
  }

  return baseMessage;
}
