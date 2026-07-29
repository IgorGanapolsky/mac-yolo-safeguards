import type { GatewayHealthSnapshot } from '../types/gateway';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import {
  EXPLICIT_PAIR_SETUP_TIMEOUT_MS,
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
  withFreshPairServerSetup,
} from './gatewayDiscovery';
import { fetchGatewayHealth } from './gatewayClient';
import { exchangePairingCode } from './pairingCodeExchange';
import { secureCredentials } from './secureCredentials';
import { isTailscaleGatewayUrl, normalizeTailnetProbeHost } from '../utils/tailscaleHosts';
import { tailnetProbeStorage } from './tailnetProbeStorage';

type PairExchangeResult = {
  apiKey?: string;
  macName?: string;
};

type PairingSetupAttempt = {
  complete: boolean;
  apiKey: string | null;
  computerName: string | null;
};

export type ManualGatewayConnectionDependencies = {
  loadApiKey: () => Promise<string | null>;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  resolvePairServerSetupParams: (host: string) => Promise<SetupDeepLinkParams | null>;
  withFreshPairServerSetup?: (
    host: string,
    consume: (setup: SetupDeepLinkParams) => Promise<PairingSetupAttempt>,
  ) => Promise<PairingSetupAttempt | null>;
  exchangePairingCode: (pairServerUrl: string, code: string) => Promise<PairExchangeResult | null>;
  fetchGatewayHealth: (
    gatewayUrl: string,
    apiKey?: string | null,
    timeoutMs?: number,
  ) => Promise<GatewayHealthSnapshot>;
  /**
   * Remember a Tailscale host that answered /health but failed auth, so Find
   * computers / the background Tailscale probe can rediscover it later instead
   * of forgetting the exact address the user just typed (Android exposes no
   * cross-app tailnet peer list — see docs/RESEARCH-TAILSCALE-ANDROID-DISCOVERY-JULY-2026.md).
   */
  rememberTailnetProbeHost: (gatewayUrl: string) => Promise<void>;
};

async function rememberTailnetProbeHost(gatewayUrl: string): Promise<void> {
  const host = normalizeTailnetProbeHost(gatewayUrl);
  if (!host) {
    return;
  }
  await tailnetProbeStorage.merge([host]);
}

const defaultDependencies: ManualGatewayConnectionDependencies = {
  loadApiKey: () => secureCredentials.loadApiKey(),
  saveApiKey: (apiKey) => secureCredentials.saveApiKey(apiKey),
  clearApiKey: () => secureCredentials.clearApiKey(),
  resolvePairServerSetupParams,
  withFreshPairServerSetup,
  // The one-time code exchange is part of the same explicit connect. Its 5s default
  // is a LAN budget: it cannot survive a single ~3.4s DERP round trip plus the pair
  // server's code lookup. Deep-link and background callers keep the short default.
  exchangePairingCode: (pairServerUrl, code) =>
    exchangePairingCode(pairServerUrl, code, undefined, EXPLICIT_PAIR_SETUP_TIMEOUT_MS),
  fetchGatewayHealth,
  rememberTailnetProbeHost,
};

// A user can submit while the bounded LAN sweep is still draining. Give LAN enough
// time for health plus the authenticated sessions probe under contention.
export const MANUAL_PROBE_TIMEOUT_MS = EXPLICIT_PAIR_SETUP_TIMEOUT_MS;

/**
 * Cellular Tailscale is a DERP-relayed link, not a direct one. Measured against the
 * phone's own tailnet peer:
 *
 *   $ tailscale ping <mac-tailnet-ip>
 *   pong from <mac> via DERP(iad) in 3.416s
 *   direct connection not established
 *
 * One relayed round trip is ~3.4s, and the first request on a fresh relayed socket
 * also pays the TCP handshake, so it costs about two round trips before the first
 * byte. `fetchGatewayHealth` spends ONE wall-clock budget across up to three
 * sequential requests (/health/detailed → /health → /api/sessions), i.e. roughly
 * four relay round trips ≈ 14s of pure transit. A 12s budget therefore aborted a
 * healthy Mac mid-verification and reported "Couldn't reach Hermes at this Tailscale
 * address." while curl on the Mac itself returned 200.
 *
 * This budget is for the EXPLICIT connect only — the user typed an address and is
 * watching a spinner. Background discovery keeps its short probes
 * (SUBNET_PROBE_TIMEOUT_MS = 400ms, PROBE_TIMEOUT_MS = 1.5s) so the LAN sweep and
 * health polling stay fast. The ceiling stays under the 30s explicit repair budget
 * (REPAIR_CONNECTION_TIMEOUT_MS) so Connect can never hang indefinitely.
 */
export const TAILSCALE_RELAY_ROUND_TRIP_MS = 3_500;
const TAILSCALE_HEALTH_RELAY_ROUND_TRIPS = 4;
/** DERP relay latency is not stable; leave headroom for a slow relay hop. */
const TAILSCALE_RELAY_JITTER_FACTOR = 1.5;
export const TAILSCALE_MANUAL_PROBE_TIMEOUT_MS =
  TAILSCALE_RELAY_ROUND_TRIP_MS *
  TAILSCALE_HEALTH_RELAY_ROUND_TRIPS *
  TAILSCALE_RELAY_JITTER_FACTOR;
const PAIRING_CODE_MAX_ATTEMPTS = 3;

function displayComputerName(value?: string | null): string | null {
  const cleaned = value?.trim().replace(/\.local$/i, '');
  return cleaned || null;
}

async function pairingCandidate(
  gatewayUrl: string,
  dependencies: ManualGatewayConnectionDependencies,
): Promise<{ apiKey: string | null; computerName: string | null }> {
  const host = pairServerHostFromGatewayUrl(gatewayUrl);
  if (!host) {
    return { apiKey: null, computerName: null };
  }

  let computerName: string | null = null;
  const consumeSetup = async (setup: SetupDeepLinkParams): Promise<PairingSetupAttempt> => {
    const setupApiKey = setup.apiKey?.trim() || null;
    const setupComputerName = displayComputerName(setup.macName);
    if (!setup.pairingCode?.trim() || !setup.pairServerUrl?.trim()) {
      return {
        complete: true,
        apiKey: setupApiKey,
        computerName: setupComputerName,
      };
    }
    const exchanged = await dependencies.exchangePairingCode(
      setup.pairServerUrl,
      setup.pairingCode,
    );
    const exchangedApiKey = exchanged?.apiKey?.trim() || null;
    return {
      complete: Boolean(exchangedApiKey || setupApiKey),
      apiKey: exchangedApiKey || setupApiKey,
      computerName:
        displayComputerName(exchanged?.macName) || setupComputerName,
    };
  };

  for (let attempt = 0; attempt < PAIRING_CODE_MAX_ATTEMPTS; attempt += 1) {
    const result = dependencies.withFreshPairServerSetup
      ? await dependencies.withFreshPairServerSetup(host, consumeSetup)
      : await dependencies.resolvePairServerSetupParams(host).then((setup) =>
          setup ? consumeSetup(setup) : null,
        );
    if (!result) {
      return { apiKey: null, computerName };
    }

    computerName = result.computerName || computerName;
    if (result.complete) {
      return { apiKey: result.apiKey, computerName };
    }
  }

  return { apiKey: null, computerName };
}

export type ConnectManualGatewayInput = {
  gatewayUrl: string;
  fallbackLabel: string;
  persistProfile: (
    label: string,
    gatewayUrl: string,
    verifiedApiKey: string | null,
  ) => Promise<void>;
};

/**
 * Prove that a manually entered address is an authenticated Hermes computer before
 * it is saved or selected. A failed probe leaves both profiles and credentials unchanged.
 */
export async function connectManualGatewayAddress(
  input: ConnectManualGatewayInput,
  dependencies: ManualGatewayConnectionDependencies = defaultDependencies,
): Promise<void> {
  const previousApiKey = (await dependencies.loadApiKey())?.trim() || null;
  const pair = await pairingCandidate(input.gatewayUrl, dependencies);
  const candidateApiKey = pair.apiKey || previousApiKey;
  const tailscaleAddress = isTailscaleGatewayUrl(input.gatewayUrl);
  const health = await dependencies.fetchGatewayHealth(
    input.gatewayUrl,
    candidateApiKey,
    tailscaleAddress ? TAILSCALE_MANUAL_PROBE_TIMEOUT_MS : MANUAL_PROBE_TIMEOUT_MS,
  );

  if (health.authMismatch) {
    if (tailscaleAddress) {
      // Proven reachable over Tailscale but wrong/missing key — keep the host so
      // Find computers and the background probe resurface it (re-pair CTA) on the
      // next cycle instead of "None found yet" for an address we already reached.
      try {
        await dependencies.rememberTailnetProbeHost(input.gatewayUrl);
      } catch {
        // Best-effort memory; never let storage failure mask the real pairing error.
      }
    }
    throw new Error('Hermes is reachable, but this phone still needs to pair.');
  }
  if (!health.directGatewayReachable) {
    throw new Error(
      tailscaleAddress
        ? 'Couldn’t reach Hermes at this Tailscale address.'
        : 'Couldn’t reach Hermes at this address.',
    );
  }

  const nextApiKey = pair.apiKey;
  const apiKeyChanged = Boolean(nextApiKey && nextApiKey !== previousApiKey);
  if (apiKeyChanged && nextApiKey) {
    await dependencies.saveApiKey(nextApiKey);
  }

  const label = displayComputerName(health.hostname) || pair.computerName || input.fallbackLabel;
  try {
    await input.persistProfile(label, input.gatewayUrl, candidateApiKey);
  } catch (error) {
    if (apiKeyChanged) {
      if (previousApiKey) {
        await dependencies.saveApiKey(previousApiKey);
      } else {
        await dependencies.clearApiKey();
      }
    }
    throw error;
  }
}
