import { resolveSetupDeepLinkCredentials } from '../services/pairingCodeExchange';
import {
  pairServerHostFromGatewayUrl,
  withFreshPairServerSetup,
} from '../services/gatewayDiscovery';
import type { SetupDeepLinkParams } from './setupDeepLink';

export type DiscoveredPairingResolution =
  | { ok: true; apiKey: string; setup: SetupDeepLinkParams }
  | { ok: true; apiKey: null; setup: null }
  | { ok: false; error: string };

const PAIRING_CODE_MAX_ATTEMPTS = 3;

/**
 * Discovery rows are catalog entries until the user explicitly selects one.
 * Background reachability must not activate a row merely because a concurrent
 * scan has inserted it into the profile list.
 */
export function hasCommittedComputerSelection(input: {
  activeProfileId?: string | null;
  settingsGatewayUrl?: string | null;
}): boolean {
  return Boolean(
    input.activeProfileId?.trim() &&
      input.settingsGatewayUrl?.trim(),
  );
}

/**
 * A pair-server discovery is not an authenticated connection until its
 * one-time code has been exchanged. Fail closed so the UI never saves a
 * reachable URL with a missing or obsolete credential.
 */
export async function resolveDiscoveredPairingSelection(
  input: {
    gatewayUrl: string;
    setup?: SetupDeepLinkParams;
    hasSavedCredential?: boolean;
  },
): Promise<DiscoveredPairingResolution> {
  const pairHost = pairServerHostFromGatewayUrl(input.gatewayUrl);
  let sawPairingSetup = false;

  for (let attempt = 0; attempt < PAIRING_CODE_MAX_ATTEMPTS; attempt += 1) {
    // Fetch immediately before every bounded exchange attempt. Current pair
    // servers preserve multiple unconsumed codes; retry still supports older
    // single-code servers and handles an independently consumed/expired code.
    if (pairHost) {
      const fresh = await withFreshPairServerSetup(pairHost, async (setup) => {
        sawPairingSetup = true;
        const resolved = await resolveSetupDeepLinkCredentials(setup);
        return { setup, resolved };
      }).catch(() => null);
      const apiKey = fresh?.resolved.apiKey?.trim();
      if (apiKey && fresh) {
        return { ok: true, apiKey, setup: fresh.resolved };
      }
      continue;
    }

    const setup = attempt === 0 ? input.setup : undefined;
    if (!setup) {
      continue;
    }
    sawPairingSetup = true;
    const resolved = await resolveSetupDeepLinkCredentials(setup);
    const apiKey = resolved.apiKey?.trim();
    if (apiKey) {
      return { ok: true, apiKey, setup: resolved };
    }
  }

  // A previously paired Mac can remain usable while its pair server is down or
  // advertises an expired/consumed one-time code. First-time discoveries still
  // fail closed because they have no authenticated credential to fall back to.
  if (!sawPairingSetup || input.hasSavedCredential) {
    return { ok: true, apiKey: null, setup: null };
  }
  return {
    ok: false,
    error: 'Computer pairing expired. Find computers again to get a fresh link.',
  };
}
