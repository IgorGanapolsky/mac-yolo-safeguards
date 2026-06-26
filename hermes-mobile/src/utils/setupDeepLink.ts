/** Parse hermes://setup deep links from Mac pairing (QR or adb). */

export interface SetupDeepLinkParams {
  gatewayUrl?: string;
  apiKey?: string;
  /** Friendly Mac name from pairing page (hostname without .local). */
  macName?: string;
  /** Hermes Relay pairing code (MOON-DUST) — completes cloud account link. */
  relayCode?: string;
  /** Tailscale / tailnet hosts to probe for other Hermes Macs (100.x or *.ts.net). */
  tailnetProbeHosts?: string[];
  /** Maestro / simulator flows when no live gateway is reachable. */
  demoMode?: boolean;
}

function parseQueryString(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part);
    const value = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '');
    if (key) out[key] = value;
  }
  return out;
}

export function buildSetupDeepLink(
  gatewayUrl: string,
  apiKey?: string,
  macName?: string,
  relayCode?: string,
  tailnetProbeHosts?: string[],
): string {
  const params = new URLSearchParams();
  params.set('url', gatewayUrl.trim());
  if (apiKey?.trim()) {
    params.set('key', apiKey.trim());
  }
  if (macName?.trim()) {
    params.set('name', macName.trim());
  }
  if (relayCode?.trim()) {
    params.set('relay', relayCode.trim().toUpperCase());
  }
  for (const host of tailnetProbeHosts ?? []) {
    const trimmed = host.trim();
    if (trimmed) {
      params.append('tailnet', trimmed);
    }
  }
  return `hermes://setup?${params.toString()}`;
}

export function buildRelayDeepLink(relayCode: string, cloudUrl?: string): string {
  const params = new URLSearchParams();
  params.set('relay', relayCode.trim().toUpperCase());
  if (cloudUrl?.trim()) {
    params.set('cloud', cloudUrl.trim());
  }
  return `hermes://relay?${params.toString()}`;
}

export function parseRelayDeepLink(url: string): Pick<SetupDeepLinkParams, 'relayCode'> | null {
  const lower = url.toLowerCase();
  if (!lower.startsWith('hermes://') || !lower.includes('relay')) {
    return null;
  }
  const queryStart = url.indexOf('?');
  if (queryStart < 0) {
    return null;
  }
  const params = parseQueryString(url.slice(queryStart + 1));
  const relayCode =
    params.relay?.trim() ||
    params.code?.trim() ||
    params.relayCode?.trim() ||
    params.pair?.trim();
  if (!relayCode) {
    return null;
  }
  return { relayCode: relayCode.toUpperCase() };
}

function parseRepeatedQueryValues(query: string, key: string): string[] {
  const prefix = `${key.toLowerCase()}=`;
  return query
    .split('&')
    .filter((part) => part.toLowerCase().startsWith(prefix))
    .map((part) => decodeURIComponent(part.slice(part.indexOf('=') + 1)).trim())
    .filter(Boolean);
}

export function parseSetupDeepLink(url: string): SetupDeepLinkParams | null {
  const lower = url.toLowerCase();
  if (!lower.startsWith('hermes://') || !lower.includes('setup')) {
    return null;
  }

  const queryStart = url.indexOf('?');
  if (queryStart < 0) {
    return null;
  }

  const query = url.slice(queryStart + 1);
  const params = parseQueryString(query);
  const gatewayUrl =
    params.url?.trim() || params.gateway?.trim() || params.gatewayUrl?.trim() || '';
  const demoMode =
    params.demo === '1' ||
    params.demo === 'true' ||
    params.demoMode === '1' ||
    params.demoMode === 'true';

  if (demoMode) {
    return {
      demoMode: true,
      gatewayUrl: gatewayUrl || undefined,
      apiKey: params.key?.trim() || params.apiKey?.trim() || undefined,
    };
  }

  if (!gatewayUrl) {
    return null;
  }

  const apiKey = params.key?.trim() || params.apiKey?.trim() || undefined;
  const macName =
    params.name?.trim() ||
    params.hostname?.trim() ||
    params.mac?.trim() ||
    params.macName?.trim() ||
    undefined;
  const relayCode =
    params.relay?.trim() ||
    params.relayCode?.trim() ||
    params.code?.trim() ||
    undefined;
  const tailnetProbeHosts = parseRepeatedQueryValues(query, 'tailnet');
  return {
    gatewayUrl,
    apiKey,
    macName,
    relayCode: relayCode ? relayCode.toUpperCase() : undefined,
    tailnetProbeHosts: tailnetProbeHosts.length > 0 ? tailnetProbeHosts : undefined,
  };
}
