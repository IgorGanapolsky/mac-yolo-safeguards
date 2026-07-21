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
  try {
    const response = await fetchJsonImpl(`${base}/pair-exchange?code=${encodeURIComponent(trimmedCode)}`);
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    return isPairExchangePayload(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a parsed setup deep link: if it carries a secretless `pairingCode` +
 * `pairServerUrl`, exchange it for real credentials, and return a fully-populated
 * params object indistinguishable from the legacy embedded-key deep link. Credential
 * persistence belongs to applySetupDeepLink, where keys are scoped to the selected
 * computer profile. A failed secretless exchange returns null so callers never apply
 * an unresolved one-time code.
 */
export async function resolveSetupDeepLinkCredentials(
  setup: SetupDeepLinkParams,
  fetchJsonImpl: FetchJsonImpl = defaultFetchJson,
): Promise<SetupDeepLinkParams | null> {
  if (!setup.pairingCode || !setup.pairServerUrl) {
    return setup;
  }
  const payload = await exchangePairingCode(setup.pairServerUrl, setup.pairingCode, fetchJsonImpl);
  if (!payload) {
    return null;
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
  return resolved;
}

/**
 * Shared redeem pipeline for OS deep links and in-app QR scanners.
 * Always exchange a secretless pairing code before applySetupDeepLink — applying
 * unresolved pairCode params surfaces "Pairing code expired or invalid."
 */
export async function redeemAndApplySetupDeepLink(
  setup: SetupDeepLinkParams,
  applySetupDeepLink: (params: SetupDeepLinkParams) => Promise<void>,
  fetchJsonImpl: FetchJsonImpl = defaultFetchJson,
): Promise<SetupDeepLinkParams | null> {
  const resolved = await resolveSetupDeepLinkCredentials(setup, fetchJsonImpl);
  if (!resolved) {
    return null;
  }
  await applySetupDeepLink(resolved);
  return resolved;
}
