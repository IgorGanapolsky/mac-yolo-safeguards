import type { GatewayHealthSnapshot } from '../types/gateway';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import {
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
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

export type ManualGatewayConnectionDependencies = {
  loadApiKey: () => Promise<string | null>;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  resolvePairServerSetupParams: (
    host: string,
    options?: { timeoutMs?: number },
  ) => Promise<SetupDeepLinkParams | null>;
  exchangePairingCode: (pairServerUrl: string, code: string) => Promise<PairExchangeResult | null>;
  fetchGatewayHealth: (
    gatewayUrl: string,
    apiKey?: string | null,
    timeoutMs?: number,
  ) => Promise<GatewayHealthSnapshot>;
  /**
   * Remember a Tailscale host that answered /health but failed auth, so Find
   * computers / the background Tailscale probe can rediscover it later instead
   * of forgetting the exact address the user just typed.
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
  exchangePairingCode,
  fetchGatewayHealth,
  rememberTailnetProbeHost,
};

const MANUAL_PROBE_TIMEOUT_MS = 5000;
// Cellular VPN routes can take several seconds to wake after Android resumes Tailscale.
const TAILSCALE_MANUAL_PROBE_TIMEOUT_MS = 12_000;
// Play Store Connect path: pair.json + exchange must not abort at LAN-sweep 1.5s.
const TAILSCALE_PAIR_TIMEOUT_MS = 12_000;

function displayComputerName(value?: string | null): string | null {
  const cleaned = value?.trim().replace(/\.local$/i, '');
  return cleaned || null;
}

async function pairingCandidate(
  gatewayUrl: string,
  dependencies: ManualGatewayConnectionDependencies,
): Promise<{ apiKey: string | null; computerName: string | null; exchanged: boolean }> {
  const host = pairServerHostFromGatewayUrl(gatewayUrl);
  if (!host) {
    return { apiKey: null, computerName: null, exchanged: false };
  }

  const isTailscale = isTailscaleGatewayUrl(gatewayUrl);
  const setup = await dependencies.resolvePairServerSetupParams(
    host,
    isTailscale ? { timeoutMs: TAILSCALE_PAIR_TIMEOUT_MS } : { timeoutMs: 5_000 },
  );
  if (!setup) {
    return { apiKey: null, computerName: null, exchanged: false };
  }

  let apiKey = setup.apiKey?.trim() || null;
  let computerName = displayComputerName(setup.macName);
  let exchanged = false;
  if (setup.pairingCode?.trim() && setup.pairServerUrl?.trim()) {
    // One retry: remint races / single-use code already taken by background scan.
    for (let attempt = 0; attempt < 2 && !apiKey; attempt += 1) {
      const setupAttempt =
        attempt === 0
          ? setup
          : await dependencies.resolvePairServerSetupParams(host, {
              timeoutMs: isTailscale ? TAILSCALE_PAIR_TIMEOUT_MS : 5_000,
            });
      if (!setupAttempt?.pairingCode?.trim() || !setupAttempt.pairServerUrl?.trim()) {
        break;
      }
      const exchangedPayload = await dependencies.exchangePairingCode(
        setupAttempt.pairServerUrl,
        setupAttempt.pairingCode,
      );
      apiKey = exchangedPayload?.apiKey?.trim() || apiKey;
      computerName = displayComputerName(exchangedPayload?.macName) || computerName;
      if (apiKey) {
        exchanged = true;
      }
    }
  }

  return { apiKey, computerName, exchanged };
}

export type ConnectManualGatewayInput = {
  gatewayUrl: string;
  fallbackLabel: string;
  persistProfile: (label: string, gatewayUrl: string) => Promise<void>;
};

/**
 * Prove that a manually entered address is an authenticated Hermes computer before
 * it is saved or selected. A failed probe leaves both profiles and credentials unchanged
 * except remembering a Tailscale host that was proven reachable for Find computers.
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
      // Proven reachable — never leave Find computers saying "None found yet".
      try {
        await dependencies.rememberTailnetProbeHost(input.gatewayUrl);
      } catch {
        // Best-effort memory.
      }
    }
    if (!candidateApiKey) {
      throw new Error(
        tailscaleAddress
          ? 'Hermes is reachable at this IP, but pairing timed out. Tap Scan QR from your Mac (open the pair page on that computer), then scan.'
          : 'Hermes is reachable, but this phone still needs to pair. Scan the QR on your Mac.',
      );
    }
    throw new Error(
      'Hermes is reachable, but this phone still needs to pair. Scan QR from your Mac to finish.',
    );
  }
  if (!health.directGatewayReachable && !health.authMismatch) {
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
    await input.persistProfile(label, input.gatewayUrl);
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
