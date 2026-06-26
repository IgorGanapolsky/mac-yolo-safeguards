/** Parse hermes://setup deep links from Mac pairing (QR or adb). */

export interface SetupDeepLinkParams {
  gatewayUrl?: string;
  apiKey?: string;
  /** Friendly Mac name from pairing page (hostname without .local). */
  macName?: string;
  /** Hermes Relay pairing code (MOON-DUST) — completes cloud account link. */
  relayCode?: string;
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

export function parseSetupDeepLink(url: string): SetupDeepLinkParams | null {
  const lower = url.toLowerCase();
  if (!lower.startsWith('hermes://') || !lower.includes('setup')) {
    return null;
  }

  const queryStart = url.indexOf('?');
  if (queryStart < 0) {
    return null;
  }

  const params = parseQueryString(url.slice(queryStart + 1));
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
  return {
    gatewayUrl,
    apiKey,
    macName,
    relayCode: relayCode ? relayCode.toUpperCase() : undefined,
  };
}
