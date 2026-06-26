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
