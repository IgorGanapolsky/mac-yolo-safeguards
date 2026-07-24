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
// Pair server fetch also needs a longer timeout on Tailscale routes — the 1.5s default
// in gatewayDiscovery is tuned for LAN sweeps, not a single targeted Tailscale probe.
const TAILSCALE_PAIR_SERVER_TIMEOUT_MS = 8_000;

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

  // On Tailscale, the pair server may need extra time to respond (VPN route wake-up).
  const isTailscale = isTailscaleGatewayUrl(gatewayUrl);
  if (isTailscale) {
    // Directly fetch pair.json with a longer timeout instead of relying on the 1.5s default.
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TAILSCALE_PAIR_SERVER_TIMEOUT_MS);
      const res = await fetch(
        `http://${host}:8765/pair.json`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (res.ok) {
        const body = await res.json() as { deepLink?: string };
        if (body.deepLink?.trim()) {
          const parsed = (await import('../utils/setupDeepLink')).parseSetupDeepLink(body.deepLink);
          if (parsed) {
            let apiKey = parsed.apiKey?.trim() || null;
            let computerName = displayComputerName(parsed.macName);
            if (parsed.pairingCode?.trim() && parsed.pairServerUrl?.trim()) {
              const exchanged = await dependencies.exchangePairingCode(
                parsed.pairServerUrl,
                parsed.pairingCode,
              );
              apiKey = exchanged?.apiKey?.trim() || apiKey;
              computerName = displayComputerName(exchanged?.macName) || computerName;
            }
            return { apiKey, computerName };
          }
        }
      }
    } catch {
      // Fall through to default resolve
    }
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
    // If we got an API key from the pair server, retry health with it.
    // Otherwise, the pair server wasn't reachable — give a actionable message.
    if (!candidateApiKey) {
      throw new Error(
        tailscaleAddress
          ? 'ThumbGate is reachable at this Tailscale address. Open ThumbGate on your Mac and tap the pair button to get a pairing code.'
          : 'ThumbGate is reachable but needs pairing. Open ThumbGate on your Mac and tap the pair button.',
      );
    }
    // Retry health with the pair-server API key
    const retry = await dependencies.fetchGatewayHealth(
      input.gatewayUrl,
      candidateApiKey,
      tailscaleAddress ? TAILSCALE_MANUAL_PROBE_TIMEOUT_MS : MANUAL_PROBE_TIMEOUT_MS,
    );
    if (retry.authMismatch) {
      throw new Error(
        'Pairing key mismatch. Open ThumbGate on your Mac to generate a new pairing code.',
      );
    }
    if (!retry.directGatewayReachable) {
      throw new Error(
        tailscaleAddress
          ? 'Couldn\u2019t reach ThumbGate at this Tailscale address.'
          : 'Couldn\u2019t reach ThumbGate at this address.',
      );
    }
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
