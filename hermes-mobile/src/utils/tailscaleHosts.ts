import { gatewayUrlHostname } from './gatewayUrlPolicy';

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Tailscale CGNAT range 100.64.0.0/10 */
export function isTailscaleIpv4(ip: string): boolean {
  const trimmed = ip.trim();
  if (!IPV4_RE.test(trimmed)) {
    return false;
  }
  const [a, b] = trimmed.split('.').map(Number);
  return a === 100 && b >= 64 && b <= 127;
}

export function isTailscaleGatewayHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  if (isTailscaleIpv4(trimmed)) {
    return true;
  }
  return trimmed.endsWith('.ts.net');
}

export function isTailscaleGatewayUrl(gatewayUrl: string): boolean {
  const host = gatewayUrlHostname(gatewayUrl);
  return host ? isTailscaleGatewayHost(host) : false;
}

/** True when a display string is a Tailscale route (MagicDNS / CGNAT), not a Mac name. */
export function isTailnetRouteLabel(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  const hostOnly = trimmed
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.split(':')[0]
    ?.trim();
  return hostOnly ? isTailscaleGatewayHost(hostOnly) : false;
}

/**
 * Extract the human device name from a Tailscale MagicDNS host, e.g.
 * `igors-s25-1.tail12aa33.ts.net:8642` -> `igors-s25-1`. Returns undefined for raw
 * CGNAT IPs (100.x, which carry no name) or non-Tailscale values. This is what lets the
 * computer picker show real machine names instead of a generic "Computer" for saved
 * profiles that only have a MagicDNS URL (no separately-stored hostname).
 */
export function magicDnsDeviceName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  const hostOnly = trimmed
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.split(':')[0]
    ?.trim();
  if (!hostOnly || !isTailscaleGatewayHost(hostOnly)) {
    return undefined;
  }
  const first = hostOnly.split('.')[0]?.trim();
  if (!first || /^\d+$/.test(first)) {
    return undefined;
  }
  return first;
}

export function buildTailscaleGatewayUrl(host: string, port = 8642): string {
  const trimmed = host.trim();
  const withPort = trimmed.includes(':') ? trimmed : `${trimmed}:${port}`;
  return `http://${withPort}`;
}

export function normalizeTailnetProbeHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const hostOnly = trimmed.replace(/^https?:\/\//i, '').split('/')[0]?.split(':')[0]?.trim();
  if (!hostOnly) {
    return null;
  }
  if (isTailscaleGatewayHost(hostOnly)) {
    return hostOnly;
  }
  return null;
}

export function mergeTailnetProbeHosts(...lists: string[][]): string[] {
  const merged = new Set<string>();
  for (const list of lists) {
    for (const raw of list) {
      const host = normalizeTailnetProbeHost(raw);
      if (host) {
        merged.add(host);
      }
    }
  }
  return Array.from(merged);
}
