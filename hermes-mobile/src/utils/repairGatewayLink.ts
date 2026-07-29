import {
  authRepairTargetLabel,
  fetchGatewayHealth,
  gatewayAuthRepairBanner,
} from '../services/gatewayClient';
import { PAIR_SERVER_PORT, pairServerHostFromGatewayUrl } from '../services/gatewayDiscovery';
import { exchangePairingCodeDetailed, isDeadPairCodeReason } from '../services/pairingCodeExchange';
import type { GatewayHealthSnapshot } from '../types/gateway';
import { parseSetupDeepLink } from './setupDeepLink';
import { isGatewayHealthOk } from './gatewayConnection';
import { isTailscaleGatewayUrl } from './tailscaleHosts';
import { WRONG_KEY_PRIMARY_CTA } from './wrongKeyRecovery';

/** Tailscale + pair-server refresh needs headroom; keep bounded (no infinite spinner). */
export const REPAIR_CONNECTION_TIMEOUT_MS = 30_000;

/**
 * LAN discovery keeps a 1.5s pair.json probe for subnet sweep speed.
 * Repair on Tailscale/cellular needs a longer single-host fetch or refresh always returns null.
 */
export const PAIR_SERVER_REPAIR_TIMEOUT_MS = 12_000;

export type RepairGatewayLinkStatus =
  | 'healed'
  | 'auth_failed'
  | 'unreachable'
  | 'timed_out';

export type RepairGatewayLinkResult = {
  status: RepairGatewayLinkStatus;
  gatewayUrl: string;
  message: string;
  authMismatch?: boolean;
};

export function repairTimeoutMessage(timeoutMs = REPAIR_CONNECTION_TIMEOUT_MS): string {
  const seconds = Math.round(timeoutMs / 1000);
  return (
    `Repair link timed out after ${seconds}s. ` +
    `If you're on cellular, keep Tailscale on and tap ${WRONG_KEY_PRIMARY_CTA}, ` +
    `or Find computers on the same network as your Mac.`
  );
}

export function repairAuthFailedMessage(machineLabel?: string | null): string {
  return gatewayAuthRepairBanner(machineLabel);
}

export function repairUnreachableMessage(machineLabel?: string | null): string {
  const target = authRepairTargetLabel(machineLabel);
  return (
    `Can't reach ${target}. Keep Tailscale on (cellular), plug in USB, ` +
    `or tap Find computers, then try Repair link again.`
  );
}

/**
 * Why a pair-server credential refresh could not produce a working credential.
 * Every value maps to a specific, actionable user message — a re-pair tap must never
 * end in silence (see `pairRepairFailureMessage`).
 */
export type PairRepairFailureReason =
  | 'no_pair_host'
  | 'pair_server_unreachable'
  | 'pair_payload_unusable'
  /** 410 expired — the code aged out before it was redeemed. */
  | 'code_expired'
  /** 404 / already_consumed — codes are single-use and the Mac rotates instantly. */
  | 'code_already_used'
  | 'exchange_unreachable'
  | 'exchange_failed'
  | 'no_credential'
  | 'key_rejected';

export type PairSetupResolution =
  | { ok: true; apiKey?: string | null; gatewayUrl?: string | null }
  | { ok: false; reason: PairRepairFailureReason };

/**
 * Human copy for a failed re-pair. Consumer vocabulary only — no "API key", no Terminal.
 * Each message names the machine and the exact next step the user can take.
 */
export function pairRepairFailureMessage(
  reason: PairRepairFailureReason,
  machineLabel?: string | null,
): string {
  const target = authRepairTargetLabel(machineLabel);
  switch (reason) {
    case 'no_pair_host':
      return `Couldn't work out ${target}'s address. Tap Find computers to pick your computer again.`;
    case 'pair_server_unreachable':
      return (
        `Can't reach ${target} to pair again. Open Hermes on your computer and leave it running — ` +
        `keep Tailscale on if you're on cellular, or plug in USB — then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    case 'pair_payload_unusable':
      return (
        `${target} answered but isn't offering a pairing code right now. ` +
        `Open the Hermes pairing page on your computer, then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    case 'code_expired':
      return (
        `That pairing code expired. Open the Hermes pairing page on your computer to show a fresh one, ` +
        `then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    case 'code_already_used':
      return (
        `That pairing code was already used — each one works once. Open the Hermes pairing page on ` +
        `your computer to show a new one, then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    case 'exchange_unreachable':
      return (
        `Reached ${target} but pairing didn't finish. Keep Tailscale on (or plug in USB) and ` +
        `tap ${WRONG_KEY_PRIMARY_CTA} again.`
      );
    case 'exchange_failed':
      return (
        `${target} turned down the pairing request. Open the Hermes pairing page on your computer ` +
        `to show a fresh code, then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    case 'no_credential':
      return (
        `${target} paired but sent nothing to connect with. Open the Hermes pairing page on your ` +
        `computer, then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    case 'key_rejected':
      return (
        `${target} paired again but still won't let this phone in. Open the Hermes pairing page on ` +
        `your computer to show a fresh code, then tap ${WRONG_KEY_PRIMARY_CTA}.`
      );
    default:
      return repairUnreachableMessage(machineLabel);
  }
}

/** Paired successfully, but the gateway hasn't answered yet — honest, not a failure. */
export function pairRefreshUnverifiedMessage(machineLabel?: string | null): string {
  const target = authRepairTargetLabel(machineLabel);
  return `Paired with ${target} again, but it hasn't answered yet. Keep Tailscale on (cellular) or plug in USB.`;
}

/**
 * Fetch pair.json from the Mac's :8765 pair server and REDEEM the one-time pairing code it
 * advertises.
 *
 * pair.json never carries a credential — it carries a `deepLink` holding a single-use
 * `pairCode` plus the pair server base URL, and the credential only exists on the other
 * side of `GET /pair-exchange?code=…` (tools/hermes-mobile-pair.js). Reading pair.json and
 * hoping for an `apiKey` is what made "Re-pair this Mac" a permanent no-op.
 *
 * Codes are SINGLE-USE and the Mac rotates instantly: reproduced against the live pair
 * server, the first exchange returns 200 and the very next call with the same code returns
 * 404. So a code is NEVER cached or reused across attempts — every call re-reads pair.json
 * (which remints) and redeems the code it just received, in that order.
 *
 * Uses a Tailscale-friendly timeout (discovery's 1.5s sweep probe is far too short) for
 * every host class — LAN, Tailscale and USB loopback share this one path so all three
 * report the same honest failure reasons. The fetch and the redemption get SEPARATE
 * budgets: on a DERP-relayed tailnet one round trip alone is ~3.4s, and a shared budget
 * would make a healthy-but-slow Mac look like a failure.
 */
export async function resolvePairSetupForRepairDetailed(
  host: string,
  timeoutMs = PAIR_SERVER_REPAIR_TIMEOUT_MS,
): Promise<PairSetupResolution> {
  const trimmed = host.trim();
  if (!trimmed) {
    return { ok: false, reason: 'no_pair_host' };
  }

  // Step 1 — always re-read pair.json. This remints on the Mac, so the code below is fresh.
  const pairJsonController = new AbortController();
  const pairJsonTimer = setTimeout(() => pairJsonController.abort(), timeoutMs);
  let body: { deepLink?: string; gatewayUrl?: string };
  try {
    const res = await fetch(`http://${trimmed}:${PAIR_SERVER_PORT}/pair.json`, {
      signal: pairJsonController.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: 'pair_server_unreachable' };
    }
    body = (await res.json()) as { deepLink?: string; gatewayUrl?: string };
  } catch {
    return { ok: false, reason: 'pair_server_unreachable' };
  } finally {
    clearTimeout(pairJsonTimer);
  }

  const deepLink = body?.deepLink?.trim();
  const setup = deepLink ? parseSetupDeepLink(deepLink) : null;
  const embeddedKey = setup?.apiKey?.trim() || '';
  const fallbackGatewayUrl = setup?.gatewayUrl?.trim() || body?.gatewayUrl?.trim() || undefined;
  const freshCode = setup?.pairingCode?.trim();

  if (!freshCode) {
    if (embeddedKey || fallbackGatewayUrl) {
      return { ok: true, apiKey: embeddedKey || undefined, gatewayUrl: fallbackGatewayUrl };
    }
    return { ok: false, reason: 'pair_payload_unusable' };
  }

  // Step 2 — redeem the code we JUST received, on its own budget.
  const exchangeController = new AbortController();
  const exchangeTimer = setTimeout(() => exchangeController.abort(), timeoutMs);
  try {
    // Redeem through the host that just served pair.json. In particular, USB loopback may
    // advertise a LAN/Tailscale pairServer URL that this phone cannot reach.
    const sourcePairServerUrl = `http://${trimmed}:${PAIR_SERVER_PORT}`;
    const outcome = await exchangePairingCodeDetailed(
      sourcePairServerUrl,
      freshCode,
      async (url) => {
        const exchangeResponse = await fetch(url, { signal: exchangeController.signal });
        return {
          ok: exchangeResponse.ok,
          status: exchangeResponse.status,
          json: () => exchangeResponse.json(),
        };
      },
      timeoutMs,
    );
    if (outcome.ok) {
      const apiKey = outcome.payload.apiKey?.trim() || embeddedKey;
      if (!apiKey) {
        return { ok: false, reason: 'no_credential' };
      }
      return {
        ok: true,
        apiKey,
        gatewayUrl: outcome.payload.gatewayUrl?.trim() || fallbackGatewayUrl,
      };
    }
    // Legacy pair servers embed the key alongside the code — still usable.
    if (embeddedKey) {
      return { ok: true, apiKey: embeddedKey, gatewayUrl: fallbackGatewayUrl };
    }
    if (isDeadPairCodeReason(outcome.reason)) {
      // 404 not_found is the ROTATED/already-redeemed case, not an aged-out one.
      return {
        ok: false,
        reason: outcome.reason === 'expired' ? 'code_expired' : 'code_already_used',
      };
    }
    if (outcome.reason === 'timeout' || outcome.reason === 'unreachable') {
      return { ok: false, reason: 'exchange_unreachable' };
    }
    return { ok: false, reason: 'exchange_failed' };
  } finally {
    clearTimeout(exchangeTimer);
  }
}

/** @deprecated Prefer `resolvePairSetupForRepairDetailed` — null hides why re-pair failed. */
export async function resolvePairSetupForRepair(
  host: string,
  timeoutMs = PAIR_SERVER_REPAIR_TIMEOUT_MS,
): Promise<{ apiKey?: string | null; gatewayUrl?: string | null } | null> {
  const resolution = await resolvePairSetupForRepairDetailed(host, timeoutMs);
  return resolution.ok ? { apiKey: resolution.apiKey, gatewayUrl: resolution.gatewayUrl } : null;
}

export type PairCredentialRefreshResult =
  | {
      status: 'refreshed';
      gatewayUrl: string;
      apiKey: string;
      /** Gateway answered with the fresh credential. False = paired, but not yet proven live. */
      verified: boolean;
      message?: string;
    }
  | { status: 'failed'; reason: PairRepairFailureReason; message: string };

/**
 * Re-pair against the Mac's :8765 pair server: redeem a fresh one-time pairing code and
 * verify it. ALWAYS resolves to either a credential or a specific, actionable reason —
 * this is the contract that keeps "Re-pair this Mac" from being a silent no-op.
 */
export async function refreshMacPairCredentials(input: {
  gatewayUrl: string;
  machineLabel?: string | null;
  resolvePairSetup?: (host: string) => Promise<PairSetupResolution>;
  probeHealth?: (
    gatewayUrl: string,
    apiKey: string,
    timeoutMs?: number,
  ) => Promise<GatewayHealthSnapshot>;
}): Promise<PairCredentialRefreshResult> {
  const resolvePairSetup = input.resolvePairSetup ?? resolvePairSetupForRepairDetailed;
  const probeHealth = input.probeHealth ?? fetchGatewayHealth;
  const label = input.machineLabel;
  const fail = (reason: PairRepairFailureReason): PairCredentialRefreshResult => ({
    status: 'failed',
    reason,
    message: pairRepairFailureMessage(reason, label),
  });

  const pairHost = pairServerHostFromGatewayUrl(input.gatewayUrl);
  if (!pairHost) {
    return fail('no_pair_host');
  }
  const resolution = await resolvePairSetup(pairHost);
  if (!resolution.ok) {
    return fail(resolution.reason);
  }
  const freshKey = resolution.apiKey?.trim();
  if (!freshKey) {
    return fail('no_credential');
  }
  const nextUrl = resolution.gatewayUrl?.trim() || input.gatewayUrl;
  const healthTimeoutMs = isTailscaleGatewayUrl(nextUrl) ? 12_000 : 5_000;
  const health = await probeHealth(nextUrl, freshKey, healthTimeoutMs);
  if (health.authMismatch) {
    return fail('key_rejected');
  }
  // A credential redeemed from the Mac's own pair server is strictly fresher than the one
  // that is already 401ing, so keep it even when the health probe is inconclusive (asleep
  // Wi‑Fi, Tailscale still waking). Report that honestly instead of discarding it silently.
  const verified = isGatewayHealthOk(health) || health.directGatewayReachable === true;
  return {
    status: 'refreshed',
    gatewayUrl: nextUrl,
    apiKey: freshKey,
    verified,
    message: verified ? undefined : pairRefreshUnverifiedMessage(label),
  };
}

/**
 * Fetch a fresh API key from the Mac :8765 pair server and verify chat auth.
 * Returns null when pair server is down / returns stale credentials.
 *
 * @deprecated Prefer `refreshMacPairCredentials` — a bare null gives the UI nothing to say.
 */
export async function refreshCredentialsFromPairServer(input: {
  gatewayUrl: string;
  resolvePairSetup?: (host: string) => Promise<{
    apiKey?: string | null;
    gatewayUrl?: string | null;
  } | null>;
  probeHealth?: (
    gatewayUrl: string,
    apiKey: string,
    timeoutMs?: number,
  ) => Promise<GatewayHealthSnapshot>;
}): Promise<{ gatewayUrl: string; apiKey: string } | null> {
  const legacyResolve = input.resolvePairSetup;
  const result = await refreshMacPairCredentials({
    gatewayUrl: input.gatewayUrl,
    probeHealth: input.probeHealth,
    resolvePairSetup: legacyResolve
      ? async (host) => {
          const setup = await legacyResolve(host);
          return setup
            ? { ok: true, apiKey: setup.apiKey, gatewayUrl: setup.gatewayUrl }
            : { ok: false, reason: 'pair_server_unreachable' };
        }
      : undefined,
  });
  return result.status === 'refreshed' && result.verified
    ? { gatewayUrl: result.gatewayUrl, apiKey: result.apiKey }
    : null;
}

export type RepairGatewayLinkDeps = {
  gatewayUrl: string;
  machineLabel?: string | null;
  authMismatch?: boolean;
  ensureGatewayMode?: () => Promise<void>;
  refreshCredentials?: () => Promise<{ gatewayUrl: string; apiKey: string } | null>;
  reconnect: () => Promise<void>;
  readHealth: () => Promise<GatewayHealthSnapshot | null | undefined>;
  timeoutMs?: number;
  now?: () => number;
};

/**
 * Shared Tools + Chat repair path:
 * 1) optional pair-server credential refresh
 * 2) reconnect / health probe
 * 3) honest auth vs unreachable outcome (never a silent noop)
 */
export async function runRepairGatewayLink(
  deps: RepairGatewayLinkDeps,
): Promise<RepairGatewayLinkResult> {
  const timeoutMs = deps.timeoutMs ?? REPAIR_CONNECTION_TIMEOUT_MS;
  const started = (deps.now ?? Date.now)();
  const gatewayUrl = deps.gatewayUrl.trim();
  const label = deps.machineLabel;

  const timedOut = () => (deps.now ?? Date.now)() - started >= timeoutMs;

  try {
    await deps.ensureGatewayMode?.();
    if (timedOut()) {
      return {
        status: 'timed_out',
        gatewayUrl,
        message: repairTimeoutMessage(timeoutMs),
      };
    }

    const refresh =
      deps.refreshCredentials ??
      (() => refreshCredentialsFromPairServer({ gatewayUrl }));
    // Always attempt pair-server refresh on repair — covers wrong-key AND
    // stale empty-key after Auto Backup restore.
    const fresh = await refresh();
    if (timedOut()) {
      return {
        status: 'timed_out',
        gatewayUrl,
        message: repairTimeoutMessage(timeoutMs),
      };
    }

    // Prefer a bounded reconnect when credentials refreshed. When pair.json
    // could not refresh (offline Mac / Tailscale down), probe once and fail
    // honestly — do not burn the full timeout inside reconnect hang.
    if (!fresh) {
      const preHealth = await deps.readHealth();
      if (timedOut()) {
        return {
          status: 'timed_out',
          gatewayUrl,
          message: repairTimeoutMessage(timeoutMs),
        };
      }
      if (preHealth?.authMismatch || deps.authMismatch) {
        return {
          status: 'auth_failed',
          gatewayUrl,
          message: repairAuthFailedMessage(label),
          authMismatch: true,
        };
      }
      // Still try reconnect once — USB loopback / healed network may work
      // without a fresh pair.json. Cap via outer withTimeout.
    }

    await deps.reconnect();
    if (timedOut()) {
      return {
        status: 'timed_out',
        gatewayUrl,
        message: repairTimeoutMessage(timeoutMs),
      };
    }

    const health = await deps.readHealth();
    const url = fresh?.gatewayUrl?.trim() || gatewayUrl;
    if (health?.authMismatch || deps.authMismatch) {
      return {
        status: 'auth_failed',
        gatewayUrl: url,
        message: repairAuthFailedMessage(label),
        authMismatch: true,
      };
    }
    if (!isGatewayHealthOk(health ?? null) || health?.directGatewayReachable === false) {
      return {
        status: 'unreachable',
        gatewayUrl: url,
        message: repairUnreachableMessage(label),
      };
    }
    return {
      status: 'healed',
      gatewayUrl: url,
      message: 'Link repaired',
    };
  } catch (err) {
    if (timedOut()) {
      return {
        status: 'timed_out',
        gatewayUrl,
        message: repairTimeoutMessage(timeoutMs),
      };
    }
    const detail = err instanceof Error ? err.message : 'Repair failed';
    if (/outdated connection|wrong key|re-pair|401|unauthorized/i.test(detail)) {
      return {
        status: 'auth_failed',
        gatewayUrl,
        message: repairAuthFailedMessage(label),
        authMismatch: true,
      };
    }
    return {
      status: 'unreachable',
      gatewayUrl,
      message: detail || repairUnreachableMessage(label),
    };
  }
}

export function assertRepairSucceeded(result: RepairGatewayLinkResult): void {
  if (result.status === 'healed') {
    return;
  }
  throw new Error(result.message);
}
