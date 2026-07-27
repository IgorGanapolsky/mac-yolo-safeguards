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

export type FetchJsonImpl = (
  url: string,
  options?: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const defaultFetchJson: FetchJsonImpl = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, options);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json(),
  };
};

export const PAIR_EXCHANGE_TIMEOUT_MS = 5_000;

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
  timeoutMs = PAIR_EXCHANGE_TIMEOUT_MS,
): Promise<PairExchangePayload | null> {
  const base = pairServerUrl.trim().replace(/\/$/, '');
  const trimmedCode = code.trim();
  if (!base || !trimmedCode) {
    return null;
  }
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = `${base}/pair-exchange?code=${encodeURIComponent(trimmedCode)}`;
    const exchange = async (): Promise<PairExchangePayload | null> => {
      // Keep one-argument test/adapter implementations backward-compatible while
      // giving the production fetch a real abort signal.
      const response =
        fetchJsonImpl === defaultFetchJson
          ? await fetchJsonImpl(url, { signal: controller.signal })
          : await fetchJsonImpl(url);
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      return isPairExchangePayload(payload) ? payload : null;
    };
    const timeout = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, Math.max(1, timeoutMs));
    });
    return await Promise.race([exchange(), timeout]);
  } catch {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
