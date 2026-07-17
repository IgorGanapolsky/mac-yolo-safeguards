import {
  authRepairTargetLabel,
  fetchGatewayHealth,
  gatewayAuthRepairBanner,
} from '../services/gatewayClient';
import {
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
} from '../services/gatewayDiscovery';
import type { GatewayHealthSnapshot } from '../types/gateway';
import { isGatewayHealthOk } from './gatewayConnection';
import { WRONG_KEY_PRIMARY_CTA } from './wrongKeyRecovery';

/** Tailscale + pair-server refresh needs headroom; keep bounded (no infinite spinner). */
export const REPAIR_CONNECTION_TIMEOUT_MS = 30_000;

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
  ) => Promise<GatewayHealthSnapshot>;
}): Promise<{ gatewayUrl: string; apiKey: string } | null> {
  const resolvePairSetup = input.resolvePairSetup ?? resolvePairServerSetupParams;
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
  const health = await probeHealth(nextUrl, freshKey);
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
    await refresh();
    if (timedOut()) {
      return {
        status: 'timed_out',
        gatewayUrl,
        message: repairTimeoutMessage(timeoutMs),
      };
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
    const url = gatewayUrl;
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
