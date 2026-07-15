import {
  pairServerHostFromGatewayUrl,
  resolvePairServerSetupParams,
} from '../services/gatewayDiscovery';
import { secureCredentials } from '../services/secureCredentials';

export type ThumbgateKeyHydrationRefs = {
  thumbgateApiKeyRef: { current: string };
  setThumbgateApiKey: (key: string) => void;
};

/**
 * Ensures the in-memory ThumbGate API key ref is populated after pairing.
 * Relay-only users may never see `thumbgate=` in a deep link — fetch from secure
 * storage or the Mac pair server when a gateway URL is known.
 */
export async function hydrateThumbgateApiKeyFromPairing(
  gatewayUrl: string | undefined,
  refs: ThumbgateKeyHydrationRefs,
): Promise<string | null> {
  if (refs.thumbgateApiKeyRef.current?.trim()) {
    return refs.thumbgateApiKeyRef.current;
  }

  const stored = await secureCredentials.loadThumbgateApiKey();
  if (stored?.trim()) {
    refs.thumbgateApiKeyRef.current = stored;
    refs.setThumbgateApiKey(stored);
    return stored;
  }

  const host = gatewayUrl?.trim() ? pairServerHostFromGatewayUrl(gatewayUrl) : null;
  if (!host) {
    return null;
  }

  const setup = await resolvePairServerSetupParams(host).catch(() => null);
  const key = setup?.thumbgateApiKey?.trim();
  if (!key) {
    return null;
  }

  await secureCredentials.saveThumbgateApiKey(key);
  refs.thumbgateApiKeyRef.current = key;
  refs.setThumbgateApiKey(key);
  return key;
}
