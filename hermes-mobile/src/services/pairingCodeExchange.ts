import { secureCredentials } from './secureCredentials';
import type { SetupDeepLinkParams, SetupExtraComputer } from '../utils/setupDeepLink';

/**
 * Secretless one-time pairing code exchange (T-330 priority 3).
 *
 * The deep link never carries the raw gateway API key — only an opaque, single-use `code`
 * plus the local pair server's base URL. The phone exchanges the code for real credentials
 * over the same trusted local connection (LAN or adb-reverse loopback) and immediately
 * persists them via `secureCredentials` (Android Keystore / iOS Keychain-backed
 * `expo-secure-store`) instead of ever holding them as a query-string argument that could
 * land in adb logs, shell history, or a screenshot of the raw deep link.
 */

export interface PairExchangePayload {
  gatewayUrl?: string;
  apiKey?: string;
  thumbgateApiKey?: string;
  macName?: string;
  relayCode?: string;
  tailnetProbeHosts?: string[];
  extraComputers?: SetupExtraComputer[];
}

export type FetchJsonImpl = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultFetchJson: FetchJsonImpl = async (url: string) => {
  const response = await fetch(url);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json(),
  };
};

function isPairExchangePayload(value: unknown): value is PairExchangePayload {
  return typeof value === 'object' && value !== null;
}

/**
 * Exchange a one-time pairing code for real credentials. Returns null (never throws) when
 * the exchange fails — callers should fall back to asking the user to re-scan/re-pair
 * rather than crash the deep-link handler.
 */
export async function exchangePairingCode(
  pairServerUrl: string,
  code: string,
  fetchJsonImpl: FetchJsonImpl = defaultFetchJson,
): Promise<PairExchangePayload | null> {
  const base = pairServerUrl.trim().replace(/\/$/, '');
  const trimmedCode = code.trim();
  if (!base || !trimmedCode) {
    return null;
  }

  const tryExchange = async (baseUrl: string): Promise<PairExchangePayload | null> => {
    try {
      const response = await fetchJsonImpl(`${baseUrl}/pair-exchange?code=${encodeURIComponent(trimmedCode)}`);
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      return isPairExchangePayload(payload) ? payload : null;
    } catch {
      return null;
    }
  };

  const primary = await tryExchange(base);
  if (primary) {
    return primary;
  }

  // Fallback: try loopback (USB adb reverse) when the primary URL is unreachable.
  // This handles the common case where the deep link carries a Tailscale pairServer URL
  // but the phone is paired via USB and doesn't have Tailscale VPN active.
  const portMatch = base.match(/:(\d+)$/);
  const isLoopback = /\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(base);
  if (portMatch && !isLoopback) {
    return tryExchange(`http://127.0.0.1:${portMatch[1]}`);
  }

  return null;
}

/**
 * Resolve a parsed setup deep link: if it carries a secretless `pairingCode` +
 * `pairServerUrl`, exchange it for real credentials, persist the API key(s) via
 * Android Keystore-backed secure storage, and return a fully-populated params object
 * indistinguishable from the legacy embedded-key deep link. When no code is present
 * (legacy deep link, or the exchange fails), the input is returned unchanged.
 */
export async function resolveSetupDeepLinkCredentials(
  setup: SetupDeepLinkParams,
  fetchJsonImpl: FetchJsonImpl = defaultFetchJson,
): Promise<SetupDeepLinkParams> {
  if (!setup.pairingCode || !setup.pairServerUrl) {
    return setup;
  }
  const payload = await exchangePairingCode(setup.pairServerUrl, setup.pairingCode, fetchJsonImpl);
  if (!payload) {
    return setup;
  }
  const resolved: SetupDeepLinkParams = {
    ...setup,
    gatewayUrl: payload.gatewayUrl || setup.gatewayUrl,
    apiKey: payload.apiKey || setup.apiKey,
    thumbgateApiKey: payload.thumbgateApiKey || setup.thumbgateApiKey,
    macName: payload.macName || setup.macName,
    relayCode: payload.relayCode || setup.relayCode,
    tailnetProbeHosts: payload.tailnetProbeHosts?.length ? payload.tailnetProbeHosts : setup.tailnetProbeHosts,
    extraComputers: payload.extraComputers?.length ? payload.extraComputers : setup.extraComputers,
  };
  if (resolved.apiKey) {
    await secureCredentials.saveApiKey(resolved.apiKey);
  }
  if (resolved.thumbgateApiKey) {
    await secureCredentials.saveThumbgateApiKey(resolved.thumbgateApiKey);
  }
  return resolved;
}
