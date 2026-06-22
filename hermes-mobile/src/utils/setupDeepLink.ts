/** Parse hermes://setup deep links from Mac pairing (QR or adb). */

export interface SetupDeepLinkParams {
  gatewayUrl?: string;
  apiKey?: string;
  /** Friendly Mac name from pairing page (hostname without .local). */
  macName?: string;
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
): string {
  const params = new URLSearchParams();
  params.set('url', gatewayUrl.trim());
  if (apiKey?.trim()) {
    params.set('key', apiKey.trim());
  }
  if (macName?.trim()) {
    params.set('name', macName.trim());
  }
  return `hermes://setup?${params.toString()}`;
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
  return { gatewayUrl, apiKey, macName };
}
