/** Parse hermes://setup deep links from Mac pairing (QR or adb). */

export type SetupExtraComputer = {
  gatewayUrl: string;
  macName?: string;
  /** Per-machine API key when fleet Macs use different API_SERVER_KEY values. */
  apiKey?: string;
};

export interface SetupDeepLinkParams {
  gatewayUrl?: string;
  apiKey?: string;
  /** Friendly Mac name from pairing page (hostname without .local). */
  macName?: string;
  /** Hermes Relay pairing code (MOON-DUST) — completes cloud account link. */
  relayCode?: string;
  /** Tailscale / tailnet hosts to probe for other Hermes Macs (100.x or *.ts.net). */
  tailnetProbeHosts?: string[];
  /** Additional saved computers (e.g. Mac mini on Tailscale while USB-pairing MacBook). */
  extraComputers?: SetupExtraComputer[];
  /** Maestro / simulator flows when no live gateway is reachable. */
  demoMode?: boolean;
  /** ThumbGate API key from Mac pairing (hermes://setup?thumbgate=…). */
  thumbgateApiKey?: string;
  /**
   * Secretless one-time pairing code (T-330 priority 3): when present, `apiKey` and other
   * credential fields are NOT embedded in this deep link — the app must exchange `code`
   * against `pairServerUrl` (over the same trusted local connection) to retrieve them, then
   * store them via Android Keystore-backed secure storage. See pairingCodeExchange.ts.
   */
  pairingCode?: string;
  /** Local pair server base URL (e.g. http://192.168.1.5:8765) to exchange `pairingCode` against. */
  pairServerUrl?: string;
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
  extraComputers?: SetupExtraComputer[],
  thumbgateApiKey?: string,
): string {
  const params = new URLSearchParams();
  params.set('url', gatewayUrl.trim());
  if (apiKey?.trim()) {
    params.set('key', apiKey.trim());
  }
  if (thumbgateApiKey?.trim()) {
    params.set('thumbgate', thumbgateApiKey.trim());
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
  for (const extra of extraComputers ?? []) {
    const url = extra.gatewayUrl?.trim();
    if (url) {
      params.append('extraUrl', url);
    }
    const name = extra.macName?.trim();
    if (name) {
      params.append('extraName', name);
    }
    const extraKey = extra.apiKey?.trim();
    if (extraKey) {
      params.append('extraKey', extraKey);
    }
  }
  return `hermes://setup?${params.toString()}`;
}

function parseExtraComputers(query: string): SetupExtraComputer[] {
  const urls = parseRepeatedQueryValues(query, 'extraUrl');
  const names = parseRepeatedQueryValues(query, 'extraName');
  const keys = parseRepeatedQueryValues(query, 'extraKey');
  const extras: SetupExtraComputer[] = [];
  for (let i = 0; i < urls.length; i += 1) {
    extras.push({
      gatewayUrl: urls[i],
      macName: names[i] || undefined,
      apiKey: keys[i] || undefined,
    });
  }
  return extras;
}

export function buildRelayDeepLink(relayCode: string, cloudUrl?: string): string {
  const params = new URLSearchParams();
  params.set('relay', relayCode.trim().toUpperCase());
  if (cloudUrl?.trim()) {
    params.set('cloud', cloudUrl.trim());
  }
  return `hermes://relay?${params.toString()}`;
}

/**
 * True for agent/adb "Start fresh chat" deep links:
 * - hermes://chat?fresh=1 (also true/yes)
 * - hermes://new-chat
 * Same outcome as tapping Start fresh chat in the UI (empty session, keeps Mac connection).
 */
export function isStartFreshChatDeepLink(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.toLowerCase().startsWith('hermes://')) {
    return false;
  }
  if (/^hermes:\/\/new-chat([/?#]|$)/i.test(trimmed)) {
    return true;
  }
  if (!/^hermes:\/\/chat([/?#]|$)/i.test(trimmed)) {
    return false;
  }
  const queryStart = trimmed.indexOf('?');
  if (queryStart < 0) {
    return false;
  }
  const params = parseQueryString(trimmed.slice(queryStart + 1));
  const fresh = (params.fresh || params.startFresh || params.new || '').trim().toLowerCase();
  return fresh === '1' || fresh === 'true' || fresh === 'yes';
}

export function buildStartFreshChatDeepLink(): string {
  return 'hermes://chat?fresh=1';
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
  const pairServerUrl = params.pairServer?.trim() || params.pairserver?.trim() || undefined;
  const gatewayUrl =
    params.url?.trim() || params.gateway?.trim() || params.gatewayUrl?.trim() || '';
  // Distinct from relay `code`/`relay` — secretless pairing uses `pairCode`. Accept legacy
  // pair-script links that used `code` + `pairServer` without a gateway URL (T-330 regression).
  const pairingCode =
    params.pairCode?.trim() ||
    (pairServerUrl && !gatewayUrl ? params.code?.trim() : undefined) ||
    undefined;
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

  const tailnetProbeHosts = parseRepeatedQueryValues(query, 'tailnet');
  const extraComputers = parseExtraComputers(query);
  const relayCode =
    params.relay?.trim() ||
    params.relayCode?.trim() ||
    (pairingCode ? undefined : params.code?.trim()) ||
    undefined;

  if (!gatewayUrl && !(pairingCode && pairServerUrl)) {
    if (tailnetProbeHosts.length > 0 || extraComputers.length > 0 || relayCode) {
      return {
        tailnetProbeHosts: tailnetProbeHosts.length > 0 ? tailnetProbeHosts : undefined,
        extraComputers: extraComputers.length > 0 ? extraComputers : undefined,
        relayCode: relayCode ? relayCode.toUpperCase() : undefined,
      };
    }
    return null;
  }

  const apiKey = params.key?.trim() || params.apiKey?.trim() || undefined;
  const macName =
    params.name?.trim() ||
    params.hostname?.trim() ||
    params.mac?.trim() ||
    params.macName?.trim() ||
    undefined;
  const thumbgateApiKey =
    params.thumbgate?.trim() ||
    params.thumbgateKey?.trim() ||
    params.thumbgateApiKey?.trim() ||
    undefined;
  return {
    gatewayUrl: gatewayUrl || undefined,
    apiKey,
    macName,
    relayCode: relayCode ? relayCode.toUpperCase() : undefined,
    tailnetProbeHosts: tailnetProbeHosts.length > 0 ? tailnetProbeHosts : undefined,
    extraComputers: extraComputers.length > 0 ? extraComputers : undefined,
    pairingCode,
    pairServerUrl,
    thumbgateApiKey,
  };
}
