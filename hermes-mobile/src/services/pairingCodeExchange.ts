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

/**
 * Why an exchange failed. The pair server (tools/hermes-mobile-pair.js) answers
 * `GET /pair-exchange?code=…` with 200 + credentials, 404 `{error:'not_found'}`, or
 * 410 `{error:'expired'|'already_consumed'}` — codes are single-use and TTL-bound.
 * Collapsing all of that into `null` is what made "Re-pair this Mac" look like a no-op:
 * the caller had nothing specific to tell the user. Never widen this back to a bare null.
 */
export type PairExchangeFailureReason =
  | 'invalid_request'
  | 'not_found'
  | 'expired'
  | 'already_consumed'
  | 'server_error'
  | 'timeout'
  | 'unreachable'
  | 'malformed';

export type PairExchangeOutcome =
  | { ok: true; payload: PairExchangePayload }
  | { ok: false; reason: PairExchangeFailureReason; status?: number };

/** Reasons that mean "this specific code is dead — the Mac must issue a new one". */
export function isDeadPairCodeReason(reason: PairExchangeFailureReason): boolean {
  return reason === 'expired' || reason === 'already_consumed' || reason === 'not_found';
}

function isPairExchangePayload(value: unknown): value is PairExchangePayload {
  return typeof value === 'object' && value !== null;
}

async function readErrorReason(
  response: { status: number; json: () => Promise<unknown> },
): Promise<PairExchangeFailureReason> {
  let serverError = '';
  try {
    const body = (await response.json()) as { error?: unknown } | null;
    serverError = typeof body?.error === 'string' ? body.error.trim() : '';
  } catch {
    serverError = '';
  }
  if (serverError === 'expired') return 'expired';
  if (serverError === 'already_consumed') return 'already_consumed';
  if (serverError === 'not_found') return 'not_found';
  if (response.status === 404) return 'not_found';
  // 410 Gone is the pair server's dead-code status (expired or already redeemed).
  if (response.status === 410) return 'expired';
  return 'server_error';
}

/**
 * Exchange a one-time pairing code for real credentials, reporting *why* it failed.
 * Never throws — the deep-link handler and the re-pair CTA both depend on that.
 */
export async function exchangePairingCodeDetailed(
  pairServerUrl: string,
  code: string,
  fetchJsonImpl: FetchJsonImpl = defaultFetchJson,
  timeoutMs = PAIR_EXCHANGE_TIMEOUT_MS,
): Promise<PairExchangeOutcome> {
  const base = pairServerUrl.trim().replace(/\/$/, '');
  const trimmedCode = code.trim();
  if (!base || !trimmedCode) {
    return { ok: false, reason: 'invalid_request' };
  }
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = `${base}/pair-exchange?code=${encodeURIComponent(trimmedCode)}`;
    const exchange = async (): Promise<PairExchangeOutcome> => {
      // Keep one-argument test/adapter implementations backward-compatible while
      // giving the production fetch a real abort signal.
      const response =
        fetchJsonImpl === defaultFetchJson
          ? await fetchJsonImpl(url, { signal: controller.signal })
          : await fetchJsonImpl(url);
      if (!response.ok) {
        return { ok: false, reason: await readErrorReason(response), status: response.status };
      }
      const payload = await response.json();
      if (!isPairExchangePayload(payload)) {
        return { ok: false, reason: 'malformed', status: response.status };
      }
      return { ok: true, payload };
    };
    const timeout = new Promise<PairExchangeOutcome>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, reason: 'timeout' });
      }, Math.max(1, timeoutMs));
    });
    return await Promise.race([exchange(), timeout]);
  } catch {
    // Network error, DNS failure, or an aborted request from an outer controller.
    return { ok: false, reason: 'unreachable' };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Exchange a one-time pairing code for real credentials. Returns null (never throws) when
 * the exchange fails — callers should fall back to asking the user to re-scan/re-pair
 * rather than crash the deep-link handler. Prefer `exchangePairingCodeDetailed` when the
 * caller can show the user a reason.
 */
export async function exchangePairingCode(
  pairServerUrl: string,
  code: string,
  fetchJsonImpl: FetchJsonImpl = defaultFetchJson,
  timeoutMs = PAIR_EXCHANGE_TIMEOUT_MS,
): Promise<PairExchangePayload | null> {
  const outcome = await exchangePairingCodeDetailed(pairServerUrl, code, fetchJsonImpl, timeoutMs);
  return outcome.ok ? outcome.payload : null;
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
