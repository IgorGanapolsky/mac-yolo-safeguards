import type { GatewayHealthSnapshot } from '../types/gateway';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';
import {
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
} from './gatewayDiscovery';
import { fetchGatewayHealth } from './gatewayClient';
import { exchangePairingCode } from './pairingCodeExchange';
import { secureCredentials } from './secureCredentials';
import { isTailscaleGatewayUrl } from '../utils/tailscaleHosts';

type PairExchangeResult = {
  apiKey?: string;
  macName?: string;
};

export type ManualGatewayConnectionDependencies = {
  loadApiKey: () => Promise<string | null>;
  saveApiKey: (apiKey: string) => Promise<void>;
  clearApiKey: () => Promise<void>;
  resolvePairServerSetupParams: (host: string) => Promise<SetupDeepLinkParams | null>;
  exchangePairingCode: (pairServerUrl: string, code: string) => Promise<PairExchangeResult | null>;
  fetchGatewayHealth: (
    gatewayUrl: string,
    apiKey?: string | null,
    timeoutMs?: number,
  ) => Promise<GatewayHealthSnapshot>;
};

const defaultDependencies: ManualGatewayConnectionDependencies = {
  loadApiKey: () => secureCredentials.loadApiKey(),
  saveApiKey: (apiKey) => secureCredentials.saveApiKey(apiKey),
  clearApiKey: () => secureCredentials.clearApiKey(),
  resolvePairServerSetupParams,
  exchangePairingCode,
  fetchGatewayHealth,
};

const MANUAL_PROBE_TIMEOUT_MS = 5000;
// Cellular VPN routes can take several seconds to wake after Android resumes Tailscale.
// Match the established repair path instead of declaring a healthy 100.x endpoint dead.
const TAILSCALE_MANUAL_PROBE_TIMEOUT_MS = 12_000;

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

  const setup = await dependencies.resolvePairServerSetupParams(host);
  if (!setup) {
    return { apiKey: null, computerName: null };
  }

  let apiKey = setup.apiKey?.trim() || null;
  let computerName = displayComputerName(setup.macName);
  if (setup.pairingCode?.trim() && setup.pairServerUrl?.trim()) {
    const exchanged = await dependencies.exchangePairingCode(
      setup.pairServerUrl,
      setup.pairingCode,
    );
    apiKey = exchanged?.apiKey?.trim() || apiKey;
    computerName = displayComputerName(exchanged?.macName) || computerName;
  }

  return { apiKey, computerName };
}

export type ConnectManualGatewayInput = {
  gatewayUrl: string;
  fallbackLabel: string;
  persistProfile: (label: string, gatewayUrl: string) => Promise<void>;
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
    throw new Error('ThumbGate is reachable, but this phone still needs to pair.');
  }
  if (!health.directGatewayReachable) {
    throw new Error(
      tailscaleAddress
        ? 'Couldn’t reach ThumbGate at this Tailscale address.'
        : 'Couldn’t reach ThumbGate at this address.',
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
