import {
  authRepairTargetLabel,
  fetchGatewayHealth,
  gatewayAuthRepairBanner,
} from '../services/gatewayClient';
import {
  PAIR_SERVER_PORT,
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
} from '../services/gatewayDiscovery';
import type { GatewayHealthSnapshot } from '../types/gateway';
import { parseSetupDeepLink } from './setupDeepLink';
import { isGatewayHealthOk } from './gatewayConnection';
import { isTailscaleGatewayHost, isTailscaleGatewayUrl } from './tailscaleHosts';
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
 * Fetch pair.json with a Tailscale-friendly timeout (discovery's 1.5s probe is too short).
 * Falls back to resolvePairServerSetupParams for non-Tailscale hosts.
 */
export async function resolvePairSetupForRepair(
  host: string,
  timeoutMs = PAIR_SERVER_REPAIR_TIMEOUT_MS,
): Promise<{ apiKey?: string | null; gatewayUrl?: string | null } | null> {
  const trimmed = host.trim();
  if (!trimmed) {
    return null;
  }
  if (!isTailscaleGatewayHost(trimmed)) {
    return resolvePairServerSetupParams(trimmed);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${trimmed}:${PAIR_SERVER_PORT}/pair.json`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return null;
    }
    const body = (await res.json()) as { deepLink?: string; gatewayUrl?: string };
    if (body.deepLink?.trim()) {
      return parseSetupDeepLink(body.deepLink);
    }
    if (body.gatewayUrl?.trim()) {
      return { gatewayUrl: body.gatewayUrl.trim() };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a fresh API key from the Mac :8765 pair server and verify chat auth.
 * Returns null when pair server is down / returns stale credentials.
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
  const resolvePairSetup = input.resolvePairSetup ?? resolvePairSetupForRepair;
  const probeHealth = input.probeHealth ?? fetchGatewayHealth;
  const pairHost = pairServerHostFromGatewayUrl(input.gatewayUrl);
  if (!pairHost) {
    return null;
  }
  const setup = await resolvePairSetup(pairHost);
  const freshKey = setup?.apiKey?.trim();
  if (!freshKey) {
    return null;
  }
  const nextUrl = setup?.gatewayUrl?.trim() || input.gatewayUrl;
  const healthTimeoutMs = isTailscaleGatewayUrl(nextUrl) ? 12_000 : 5_000;
  const health = await probeHealth(nextUrl, freshKey, healthTimeoutMs);
  if (health.authMismatch) {
    return null;
  }
  if (!isGatewayHealthOk(health) && health.directGatewayReachable !== true) {
    return null;
  }
  return { gatewayUrl: nextUrl, apiKey: freshKey };
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
