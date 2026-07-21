import { normalizeGatewayUrl } from './gatewayUrlNormalize';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '0.0.0.0']);
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const EMULATOR_HOSTS = new Set(['10.0.2.2', '10.0.2.3', '10.0.0.2']);

export function isLoopbackHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  return LOOPBACK_HOSTS.has(trimmed) || trimmed === 'localhost';
}

export function isEmulatorHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  return EMULATOR_HOSTS.has(trimmed);
}

export function isPrivateLanIpv4(ip: string): boolean {
  const trimmed = ip.trim();
  if (!IPV4_RE.test(trimmed)) return false;
  const parts = trimmed.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function isTailscaleIpv4Local(ip: string): boolean {
  const trimmed = ip.trim();
  if (!IPV4_RE.test(trimmed)) return false;
  const [a, b] = trimmed.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function isAllowedCleartextHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return false;
  if (isLoopbackHost(trimmed)) return true;
  if (isEmulatorHost(trimmed)) return true;
  if (trimmed.endsWith('.local')) return true;
  if (IPV4_RE.test(trimmed)) {
    if (isPrivateLanIpv4(trimmed)) return true;
    if (isTailscaleIpv4Local(trimmed)) return true;
    // loopback already checked, but 127.x is loopback range - treat as allowed
    if (trimmed.startsWith('127.')) return true;
  }
  // MagicDNS *.ts.net is Tailscale - allowed cleartext for 100.x routing
  if (trimmed.endsWith('.ts.net')) return true;
  return false;
}

export function isPublicHttpUrl(gatewayUrl: string | undefined | null): boolean {
  const raw = gatewayUrl?.trim();
  if (!raw) return false;
  // Only http:// is considered public cleartext risk; https:// is allowed for public
  if (!/^http:\/\//i.test(raw)) return false;
  try {
    const normalized = normalizeGatewayUrl(raw);
    const host = new URL(normalized.httpBase).hostname?.trim().toLowerCase();
    if (!host || isLoopbackHost(host) || isEmulatorHost(host)) return false;
    // If host is allowed cleartext (private, tailscale, .local, loopback), not public
    if (isAllowedCleartextHost(host)) return false;
    // Anything else is public http -> should be blocked
    return true;
  } catch {
    // If parsing fails, be conservative - treat as not public http for validation elsewhere
    return false;
  }
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

const SCHEME_ONLY_HOSTS = new Set(['http', 'https']);

/** Hostnames that are not real machine addresses (partial paste / scheme-only URL). */
export function isSchemeOnlyGatewayHost(host: string | undefined | null): boolean {
  const trimmed = host?.trim().toLowerCase();
  return !trimmed || SCHEME_ONLY_HOSTS.has(trimmed);
}

export function gatewayUrlHostname(gatewayUrl: string): string | undefined {
  try {
    const host = new URL(normalizeGatewayUrl(gatewayUrl).httpBase).hostname?.trim();
    if (isSchemeOnlyGatewayHost(host)) {
      return undefined;
    }
    return host;
  } catch {
    return undefined;
  }
}

/** Reject URLs with no usable host (e.g. `http://`, `http`, `http://http:8642`). Also reject public http:// (G-02). */
export function isValidGatewayUrl(gatewayUrl: string | undefined | null): boolean {
  const trimmed = gatewayUrl?.trim();
  if (!trimmed) {
    return false;
  }
  if (isPublicHttpUrl(trimmed)) {
    return false;
  }
  try {
    const host = new URL(normalizeGatewayUrl(trimmed).httpBase).hostname?.trim();
    return Boolean(host && !isSchemeOnlyGatewayHost(host));
  } catch {
    return false;
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
        'USB link to your computer is down. Plug in via USB and run pairing on your computer ' +
        '(node tools/hermes-mobile-pair.js), or join the same Wi‑Fi and scan the local QR.'
      );
    }
    return (
      'Cannot reach the direct Hermes link. Use Hermes Relay in Settings, scan the local QR, or tap Refresh on Leash.'
    );
  }

  return baseMessage;
}

/** Format manual IP/URL entries into valid gateway URLs with protocol and default port. */
export function cleanManualGatewayUrl(input: string | undefined | null): string | null {
  let val = input?.trim();
  if (!val) {
    return null;
  }
  // Strip trailing slashes temporarily for easier port check
  let path = '';
  const slashIdx = val.indexOf('/', val.indexOf('://') !== -1 ? val.indexOf('://') + 3 : 0);
  if (slashIdx !== -1) {
    path = val.substring(slashIdx);
    val = val.substring(0, slashIdx);
  }
  
  if (!/^https?:\/\//i.test(val)) {
    val = `http://${val}`;
  }
  
  // If no port is specified, append :8642
  const hostPart = val.replace(/^https?:\/\//i, '');
  if (!hostPart.includes(':')) {
    val = `${val}:8642`;
  }
  
  return val + path;
}
